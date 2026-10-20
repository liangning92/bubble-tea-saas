import { chatReminderRelevant } from './TeamChatReminderService';
import { assignedStaffAccess } from "./StaffPermissionService";
import webpush from "web-push";
import { createHash } from "crypto";
import prisma from "../config/database";
import {
  readWork,
  writeWork,
  listWork,
  workLock,
} from "./EmployeeWorkspaceStore";
import { processLatePayroll, wibDate } from "./EmployeeAttendanceService";
let timer: NodeJS.Timeout | undefined,
  running = false;
export async function pushKeys(storeId: string) {
  return prisma.$transaction(async (db) => {
    await workLock(storeId, "push-keys", db);
    const keys = await readWork(storeId, "push-keys", db);
    return (
      keys || writeWork(storeId, "push-keys", webpush.generateVAPIDKeys(), db)
    );
  });
}
export function validPushEndpoint(endpoint: string) {
  try {
    const url = new URL(endpoint);
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      (!url.port || url.port === "443") &&
      (/(^|\.)push\.services\.mozilla\.com$/.test(url.hostname) ||
        url.hostname === "fcm.googleapis.com" ||
        url.hostname === "updates.push.services.mozilla.com" ||
        /(^|\.)push\.apple\.com$/.test(url.hostname))
    );
  } catch {
    return false;
  }
}
export async function enqueueReminder(
  storeId: string,
  staffId: string,
  event: string,
  title: string,
  url: string,
  expiresAt?: string,
) {
  const id = createHash("sha256").update(`${staffId}:${event}`).digest("hex"),
    key = `reminder.${staffId}.${id}`;
  await prisma.$transaction(async (db) => {
    await workLock(storeId, key, db);
    if (await readWork(storeId, key, db)) return;
    await writeWork(
      storeId,
      key,
      {
        id,
        staffId,
        event,
        title,
        url,
        createdAt: new Date().toISOString(),
        expiresAt,
        read: false,
        status: "pending",
      },
      db,
    );
  });
}
export async function collectReminders(storeId: string, now = new Date()) {
  let baseline = await readWork(storeId, "reminder-baseline");
  if (!baseline) {
    baseline = { at: now.toISOString() };
    await writeWork(storeId, "reminder-baseline", baseline);
  }
  const staff = await prisma.staff.findMany({
    where: { storeId, status: "active" },
    include: { user: true },
  });
  const day = wibDate(now),
    from = new Date(day + "T00:00:00+07:00"),
    until = new Date(from.getTime() + 2 * 86400000);
  const schedules = await prisma.schedule.findMany({
    where: {
      staffId: { in: staff.map((s) => s.id) },
      date: { gte: from, lt: until },
    },
  });
  const shifts = await prisma.shift.findMany({ where: { storeId } });
  const tasks = await prisma.hygieneTask.findMany({
    where: {
      storeId,
      OR: [{ date: day }, { updatedAt: { gte: new Date(baseline.at) } }],
    },
  });
  const onDuty = await prisma.attendance.findMany({
    where: {
      staffId: { in: staff.map((s) => s.id) },
      checkOutTime: null,
      checkInTime: { gte: new Date(now.getTime() - 24 * 3600000), lte: now },
    },
  });
  const profiles = await listWork(storeId, "profile."),
    appeals = await listWork(storeId, "appeal.");
  const trainings = await prisma.training.findMany({
    where: { storeId, status: { in: ["scheduled", "in_progress"] } },
  });
  const validScheduleEvents = new Set<string>();
  for (const s of schedules) {
    const shift = shifts.find((t) => [t.id, t.key, t.name].includes(s.shift));
    if (!shift || s.shift === "off") continue;
    const start = new Date(`${wibDate(s.date)}T${shift.startTime}:00+07:00`),
      event = `shift:${s.id}:${shift.startTime}:${wibDate(s.date)}`;
    validScheduleEvents.add(event);
    if (now.getTime() >= start.getTime() - 30 * 60000 && now < start)
      await enqueueReminder(
        storeId,
        s.staffId,
        event,
        "Shift segera dimulai / 班次即将开始",
        "/schedule",
        start.toISOString(),
      );
  }
  for (const task of tasks) {
    let recipients = task.staffId
      ? [task.staffId]
      : onDuty.map((a) => a.staffId);
    for (const id of new Set(recipients)) {
      const employee = staff.find((s) => s.id === id);
      if (!employee) continue;
      // Respect custom role assignments, including personal.tasks restrictions.
      const access = await assignedStaffAccess({
        role: employee.user.role,
        storeId,
        staffId: id,
      });
      if (access && !access.permissions.includes("personal.tasks")) continue;
      if (
        ["pending", "in_progress", "overdue"].includes(task.status) &&
        task.dueTime &&
        now.getTime() >= task.dueTime.getTime() - 15 * 60000 &&
        now < task.dueTime
      )
        await enqueueReminder(
          storeId,
          id,
          `hygiene-due:${task.id}:${task.dueTime.toISOString()}`,
          "Tugas kebersihan segera jatuh tempo / 卫生任务即将到期",
          "/hygiene",
          task.dueTime.toISOString(),
        );
      if (
        task.createdAt.toISOString() >= baseline.at &&
        ["pending", "in_progress"].includes(task.status)
      )
        await enqueueReminder(
          storeId,
          id,
          `hygiene-assigned:${task.id}`,
          "Tugas kebersihan baru / 新卫生任务",
          "/hygiene",
        );
      if (
        task.staffId &&
        ["approved", "rejected"].includes(task.status) &&
        task.updatedAt.toISOString() >= baseline.at
      )
        await enqueueReminder(
          storeId,
          id,
          `hygiene-review:${task.id}:${task.updatedAt.toISOString()}`,
          "Hasil pemeriksaan tugas / 任务审核结果",
          "/hygiene",
        );
    }
  }
  for (const r of [...profiles, ...appeals])
    if (r.reviewedAt >= baseline.at)
      await enqueueReminder(
        storeId,
        r.staffId,
        `review:${r.id}:${r.reviewedAt}`,
        "Hasil pengajuan tersedia / 申请审核结果已更新",
        r.attendanceId ? "/attendance/appeals" : "/profile/documents",
      );
  for (const t of trainings)
    if (t.createdAt.toISOString() >= baseline.at)
      await enqueueReminder(
        storeId,
        t.staffId,
        `training:${t.id}`,
        "Pelatihan baru / 新培训任务",
        "/training",
      );
  for (const [model, url] of [
    ["leave", "/leave"],
    ["reimbursement", "/reimbursement"],
    ["overtimeRequest", "/overtime"],
    ["shiftSwap", "/shift-swap"],
    ["attendanceCorrection", "/attendance/correction"],
  ] as const) {
    const records = await (prisma[model] as any).findMany({
      where: { storeId, updatedAt: { gte: new Date(baseline.at) } },
    });
    for (const r of records) {
      if (["approved", "rejected"].includes(r.status))
        await enqueueReminder(
          storeId,
          r.staffId,
          `${model}-review:${r.id}:${r.updatedAt.toISOString()}`,
          "Hasil pengajuan tersedia / 申请审核结果已更新",
          url,
        );
      if (model === "shiftSwap" && r.targetStaffId) {
        if (["approved", "rejected", "peer_rejected", "cancelled"].includes(r.status))
          for (const staffId of [r.staffId, r.targetStaffId])
            await enqueueReminder(storeId, staffId, `swap-result:${r.id}:${r.updatedAt.toISOString()}`, "Status tukar shift diperbarui / 调班流程已更新", url);
        if (r.status === "pending" && r.targetConfirmed)
          await enqueueReminder(storeId, r.staffId, `swap-agreed:${r.id}:${r.updatedAt.toISOString()}`, "Rekan setuju, menunggu admin / 对方已同意，等待审批", url);
      }
      if (
        model === "shiftSwap" &&
        r.status === "pending" &&
        r.targetStaffId &&
        !r.targetConfirmed
      )
        await enqueueReminder(
          storeId,
          r.targetStaffId,
          `swap-confirm:${r.id}:${r.updatedAt.toISOString()}`,
          "Konfirmasi pertukaran shift / 请确认换班",
          "/shift-swap",
        );
    }
  }
  const reminders = await listWork(storeId, "reminder.");
  for (const reminder of reminders)
    if (
      reminder &&
      reminder.status !== "cancelled" &&
      ((reminder.expiresAt && new Date(reminder.expiresAt) <= now) ||
        (reminder.event.startsWith("shift:") &&
          !validScheduleEvents.has(reminder.event)) ||
        !(await reminderStillRelevant(storeId, reminder, now)))
    ) {
      await writeWork(storeId, `reminder.${reminder.staffId}.${reminder.id}`, {
        ...reminder,
        status: "cancelled",
      });
    }
}
export async function reminderStillRelevant(
  storeId: string,
  r: any,
  now = new Date(),
  db: any = prisma,
) {
  if (r.expiresAt && new Date(r.expiresAt) <= now) return false;
  if (r.event?.startsWith('team-chat:')) return chatReminderRelevant(db, storeId, r);
  const [kind, id] = r.event.split(":");
  if (kind.startsWith("hygiene-")) {
    const task = await db.hygieneTask.findFirst({ where: { id, storeId } });
    if (!task || (task.staffId && task.staffId !== r.staffId)) return false;
    if (kind === "hygiene-review")
      return ["approved", "rejected"].includes(task.status);
    if (!["pending", "in_progress", "overdue"].includes(task.status))
      return false;
    if (!task.staffId) {
      const active = await db.attendance.findFirst({
        where: {
          staffId: r.staffId,
          checkOutTime: null,
          checkInTime: {
            gte: new Date(now.getTime() - 24 * 3600000),
            lte: now,
          },
        },
      });
      if (!active) return false;
    }
    if (kind === "hygiene-due")
      return !!task.dueTime && r.event.endsWith(task.dueTime.toISOString());
  }
  if (kind === "training") {
    const item = await db.training.findFirst({
      where: { id, storeId, staffId: r.staffId },
    });
    return !!item && ["scheduled", "in_progress"].includes(item.status);
  }
  if (kind === "swap-confirm") {
    const item = await db.shiftSwap.findFirst({
      where: { id, storeId, targetStaffId: r.staffId },
    });
    return !!item && item.status === "pending" && !item.targetConfirmed;
  }
  return true;
}
export async function deliver(storeId: string, db: any = prisma, push: typeof webpush = webpush) {
  const reminders = (await listWork(storeId, "reminder.", db)).filter(
      (r) => r && r.status === "pending",
    ),
    subscriptions = (await listWork(storeId, "subscription.", db)).filter(
      (s) => s.active,
    );
  const keys = await readWork(storeId, "push-keys", db); // Existing keys only; delivery never creates credentials.
  for (const r of reminders) {
    const employee = await db.staff.findFirst({
      where: { id: r.staffId, storeId, status: "active" },
    });
    if (!employee) { await writeWork(storeId, `reminder.${r.staffId}.${r.id}`, { ...r, status: 'cancelled' }, db); continue; }
    if (!(await reminderStillRelevant(storeId, r, new Date(), db))) {
      await writeWork(storeId, `reminder.${r.staffId}.${r.id}`, {
        ...r,
        status: "cancelled",
      }, db);
      continue;
    }
    const activeSubscriptions = subscriptions.filter(
      (s) => s.staffId === r.staffId,
    );
    if (!activeSubscriptions.length || !keys) {
      await writeWork(storeId, `reminder.${r.staffId}.${r.id}`, {
        ...r,
        status: "in_app",
      }, db);
      continue;
    }
    for (const sub of activeSubscriptions) {
      const user = await db.user.findUnique({
        where: { id: employee.userId },
      });
      if (
        !user ||
        sub.userId !== user.id ||
        sub.issuedAtMs < user.updatedAt.getTime()
      ) {
        await writeWork(storeId, `subscription.${sub.id}`, {
          ...sub,
          active: false,
        }, db);
        continue;
      }
      const key = `delivery.${r.id}.${sub.id}`;
      const claimed = await db.$transaction(async (db) => {
        await workLock(storeId, key, db);
        let attempt = (await readWork(storeId, key, db)) || {
          attempts: 0,
          status: "pending",
        };
        if (
          attempt.status === "sent" ||
          attempt.attempts >= 3 ||
          (attempt.nextAttemptAt &&
            new Date(attempt.nextAttemptAt) > new Date())
        )
          return false;
        // lease survives worker restarts; do not let two API instances deliver together
        if (attempt.leaseUntil && new Date(attempt.leaseUntil) > new Date())
          return false;
        await writeWork(
          storeId,
          key,
          {
            ...attempt,
            leaseUntil: new Date(Date.now() + 60000).toISOString(),
          },
          db,
        );
        return true;
      });
      if (!claimed) continue;
      {
        const attempt = await readWork(storeId, key, db);
        if (
          attempt?.status === "sent" ||
          attempt?.attempts >= 3 ||
          (attempt?.nextAttemptAt &&
            new Date(attempt.nextAttemptAt) > new Date())
        )
          continue;
        // Send ownership is finalized below with a delivery lock; subscriptions never expose secrets to clients.
        try {
          if (!validPushEndpoint(sub.subscription.endpoint))
            throw new Error("INVALID_PUSH_ENDPOINT");
          const latest = await readWork(storeId, `reminder.${r.staffId}.${r.id}`, db);
          if (latest?.status === 'cancelled' || !await reminderStillRelevant(storeId, r, new Date(), db)) {
            await writeWork(storeId, `reminder.${r.staffId}.${r.id}`, { ...r, status: 'cancelled' }, db);
            continue;
          }
          await push.sendNotification(
            sub.subscription,
            JSON.stringify({ title: r.title, url: r.url, id: r.id }),
            {
              TTL: 300,
              timeout: 10000,
              vapidDetails: {
                subject:
                  process.env.WEB_PUSH_SUBJECT || "mailto:admin@aicube.online",
                ...keys,
              },
            },
          );
          await writeWork(storeId, key, {
            status: "sent",
            attempts: attempt.attempts + 1,
            sentAt: new Date().toISOString(),
          }, db);
        } catch (e: any) {
          await writeWork(storeId, key, {
            status: "failed",
            attempts: attempt.attempts + 1,
            nextAttemptAt: new Date(
              Date.now() + 60000 * 2 ** attempt.attempts,
            ).toISOString(),
            error: e.statusCode ? String(e.statusCode) : "PUSH_DELIVERY_FAILED",
          }, db);
          if ([404, 410].includes(e.statusCode))
            await writeWork(storeId, `subscription.${sub.id}`, {
              ...sub,
              active: false,
            }, db);
        }
      }
    }
    const deliveryStates = await Promise.all(
      activeSubscriptions.map((sub) =>
        readWork(storeId, `delivery.${r.id}.${sub.id}`, db),
      ),
    );
    if (
      deliveryStates.every(
        (state) => state?.status === "sent" || state?.attempts >= 3,
      )
    )
      await writeWork(storeId, `reminder.${r.staffId}.${r.id}`, {
        ...r,
        status: "sent",
      }, db);
  }
}
export function startEmployeeWorker() {
  if (timer) return;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      try {
        await processLatePayroll();
      } catch (e) {
        console.error("[EmployeePayroll] processing failed");
      }
      const stores = await prisma.store.findMany({ select: { id: true } });
      for (const store of stores)
        try {
          await collectReminders(store.id);
          await deliver(store.id);
        } catch (e) {
          console.error(
            "[EmployeeReminders] store processing failed",
            store.id,
          );
        }
    } catch (e) {
      console.error("[EmployeeWorker] processing failed");
    } finally {
      running = false;
    }
  };
  void run();
  timer = setInterval(run, 60000);
  timer.unref();
}
