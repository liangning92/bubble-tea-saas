import { chatReminderRelevant } from './TeamChatReminderService';
import { trainingUpdateRelevant } from './TrainingLibraryStore';
import { collectApprovalNotices, approvalNoticeRelevant } from './NotificationApprovalService';
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

/** Coalesce post-commit wakes in this API process; no polling or payroll work. */
export function notificationDeliveryWake(deliverStore: (storeId: string) => Promise<void>, delayMs = 25) {
  const scheduled = new Map<string, NodeJS.Timeout>(), active = new Map<string, Promise<void>>(), again = new Set<string>();
  let closed = false;
  const wake = (storeId: string, waitMs = delayMs) => {
    if (closed || !storeId) return;
    if (active.has(storeId)) { again.add(storeId); return; }
    if (scheduled.has(storeId)) return;
    const handle = setTimeout(() => {
      scheduled.delete(storeId);
      let failed = false;
      const task = Promise.resolve().then(() => deliverStore(storeId)).catch(() => {
        failed = true;
        console.error('[EmployeeReminders] post-commit delivery failed');
      }).finally(() => {
        active.delete(storeId);
        const pending = again.delete(storeId);
        if (failed || pending) wake(storeId, failed ? Math.max(delayMs, 500) : delayMs);
      });
      active.set(storeId, task);
    }, waitMs);
    handle.unref();
    scheduled.set(storeId, handle);
  };
  return { wake, async close() {
    closed = true;
    for (const handle of scheduled.values()) clearTimeout(handle);
    scheduled.clear(); again.clear(); await Promise.all(active.values());
  } };
}
const immediateDelivery = notificationDeliveryWake(storeId => deliver(storeId));

/** The durable outbox is also the cross-process signal. Scan only committed
 * pending chat deliveries, without collecting business work or running payroll. */
export function notificationQueueScanner(db: any, wake: (storeId: string) => void, pollMs = 500) {
  let closed = false, started = false, failures = 0, handle: NodeJS.Timeout | undefined, active: Promise<void> | undefined;
  const seen = new Map<string, string>();
  const scanOnce = (): Promise<void> => {
    if (closed) return Promise.resolve();
    if (active) return active;
    active = Promise.resolve().then(async () => {
      const stores = await db.store.findMany({ select: { id: true } });
      if (!stores.length || closed) return;
      // Exact storeId/key lookups use the existing unique index instead of
      // repeatedly scanning all historical messages or reminder JSON bodies.
      const signals = await db.config.findMany({ where: {
        storeId: { in: stores.map((store: any) => store.id) }, key: 'employee.workspace.notification.chat.pending',
      }, select: { storeId: true, value: true } });
      if (!closed) for (const signal of signals) {
        if (seen.get(signal.storeId) === signal.value) continue;
        wake(signal.storeId);
        seen.set(signal.storeId, signal.value);
      }
    }).finally(() => { active = undefined; });
    return active;
  };
  const tick = async () => {
    if (closed) return;
    try { await scanOnce(); failures = 0; }
    catch { failures++; console.error('[EmployeeReminders] pending chat scan failed'); }
    if (!closed) {
      handle = setTimeout(() => void tick(), Math.min(5000, pollMs * 2 ** Math.min(failures, 4)));
      handle.unref();
    }
  };
  return { scanOnce, start() { if (!started && !closed) { started = true; void tick(); } }, async close() {
    closed = true; if (handle) clearTimeout(handle); await active?.catch(() => {});
  } };
}
const pendingChatScan = notificationQueueScanner(prisma, storeId => immediateDelivery.wake(storeId));
export function wakeEmployeeDelivery(storeId: string) {
  // Reuse only the existing API worker. Tests and standalone tools do not
  // enable a background sender merely by importing routes or this module.
  if (timer) immediateDelivery.wake(storeId);
}
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
    }
  }
  for (const t of trainings)
    if (t.createdAt.toISOString() >= baseline.at)
      await enqueueReminder(
        storeId,
        t.staffId,
        `training:${t.id}`,
        "Pelatihan baru / 新培训任务",
        "/training",
      );
  // Approval node/result events replace the old per-model notifications. Reads
  // remain separate from the business pending state, and historic results do not replay.
  await collectApprovalNotices(prisma, storeId);
  const agreed = await prisma.shiftSwap.findMany({ where: { storeId, status: 'pending', targetConfirmed: true,
    updatedAt: { gte: new Date(baseline.at) } } });
  for (const r of agreed) await enqueueReminder(storeId, r.staffId, `swap-agreed:${r.id}:${r.updatedAt.toISOString()}`,
    "Rekan setuju, menunggu admin / 对方已同意，等待审批", '/shift-swap');
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
  if (r.event?.startsWith('training-content:')) return trainingUpdateRelevant(db, storeId, r, r.staffId);
  if (r.event?.startsWith('approval-notice:')) return approvalNoticeRelevant(db, storeId, r, r.staffId);
  if (/^(?:hygiene-review:|review:|leave-review:|reimbursement-review:|overtimeRequest-review:|shiftSwap-review:|attendanceCorrection-review:|swap-confirm:|swap-result:)/.test(r.event)) return false;
  const [kind, id] = r.event.split(":");
  if (kind === 'swap-agreed') {
    const item = await db.shiftSwap.findFirst({ where: { id, storeId, staffId: r.staffId, status: 'pending', targetConfirmed: true } });
    return !!item && r.event === `swap-agreed:${id}:${item.updatedAt.toISOString()}`;
  }
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
// Serialize reminder status changes with personal read acknowledgements. A
// delivery snapshot must never restore an earlier unread value.
async function updateReminder(storeId: string, reminder: any, patch: any, db: any, userId?: string) {
  const key = `reminder.${reminder.staffId}.${reminder.id}`;
  await db.$transaction(async (tx: any) => {
    await workLock(storeId, key, tx);
    const current = await readWork(storeId, key, tx);
    if (!current) return;
    const person = current.userId || userId;
    const receipt = person && await readWork(storeId, `inbox.read.${person}.${current.id}`, tx);
    const read = current.read === true || patch.read === true || !!receipt;
    const status = current.status === 'cancelled' || patch.status === 'cancelled' ? 'cancelled'
      : read ? 'in_app' : patch.status;
    await writeWork(storeId, key, { ...current, ...patch, read, status }, tx);
  });
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
    if (!employee) { await updateReminder(storeId, r, { status: 'cancelled' }, db); continue; }
    if (!(await reminderStillRelevant(storeId, r, new Date(), db))) {
      await updateReminder(storeId, r, { status: 'cancelled' }, db, employee.userId);
      continue;
    }
    const readReceipt = await readWork(storeId, `inbox.read.${r.userId || employee.userId}.${r.id}`, db);
    if (r.read || readReceipt) {
      await updateReminder(storeId, r, { read: true, status: 'in_app' }, db, employee.userId);
      continue;
    }
    const activeSubscriptions = subscriptions.filter(
      (s) => s.staffId === r.staffId,
    );
    if (!activeSubscriptions.length || !keys) {
      await updateReminder(storeId, r, { status: 'in_app' }, db, employee.userId);
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
          if (!latest || latest.status === 'cancelled' || !await reminderStillRelevant(storeId, latest, new Date(), db)) {
            await updateReminder(storeId, r, { status: 'cancelled' }, db, employee.userId);
            continue;
          }
          // A read may commit while this worker is waiting for its delivery
          // lease or relevance queries. Recheck immediately before transport.
          const [beforeSend, receipt, liveSubscription, liveStaff, liveUser] = await Promise.all([
            readWork(storeId, `reminder.${r.staffId}.${r.id}`, db),
            readWork(storeId, `inbox.read.${r.userId || employee.userId}.${r.id}`, db),
            readWork(storeId, `subscription.${sub.id}`, db),
            db.staff.findFirst({ where: { id: r.staffId, storeId, status: 'active' } }),
            db.user.findUnique({ where: { id: employee.userId } }),
          ]);
          if (!beforeSend || beforeSend.status === 'cancelled') continue;
          if (!liveStaff || liveStaff.userId !== employee.userId || !liveUser ||
              liveUser.storeId && liveUser.storeId !== storeId || !liveSubscription?.active ||
              liveSubscription.staffId !== r.staffId || liveSubscription.userId !== employee.userId ||
              liveSubscription.issuedAtMs < liveUser.updatedAt.getTime()) {
            if (liveSubscription?.userId === employee.userId)
              await writeWork(storeId, `subscription.${sub.id}`, { ...liveSubscription, active: false }, db);
            await writeWork(storeId, key, { ...attempt, status: 'skipped_subscription', leaseUntil: undefined }, db);
            continue;
          }
          if (beforeSend.read === true || receipt) {
            await updateReminder(storeId, r, { read: true, status: 'in_app' }, db, employee.userId);
            await writeWork(storeId, key, { ...attempt, status: 'skipped_read', leaseUntil: undefined }, db);
            continue;
          }
          if (!validPushEndpoint(liveSubscription.subscription?.endpoint)) throw new Error('INVALID_PUSH_ENDPOINT');
          await push.sendNotification(
            liveSubscription.subscription,
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
      await updateReminder(storeId, r, {
        status: deliveryStates.every(state => state?.status === 'sent') ? 'sent'
          : deliveryStates.some(state => state?.status === 'sent') ? 'partially_sent' : 'delivery_failed',
      }, db, employee.userId);
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
  pendingChatScan.start();
}
