import { randomUUID } from "crypto";
import prisma from "../config/database";
import {
  readWork,
  writeWork,
  listWork,
  workLock,
  WorkDB,
} from "./EmployeeWorkspaceStore";
import {
  periodLock,
  adjustmentPlan,
  savedAdjustmentPlan,
  saveAdjustmentPlan,
} from "./SalaryAdjustmentService";
export type LateRule = {
  month: string;
  enabled: boolean;
  mode: "tiers" | "interval";
  tiers: { minutes: number; amount: number }[];
  intervalMinutes: number;
  intervalAmount: number;
  version: string;
  effectiveAt: string;
  activationAt?: string | null;
};
export const wibDate = (d: Date) =>
  new Date(d.getTime() + 7 * 3600000).toISOString().slice(0, 10);
export function lateMinutes(start: Date, actual: Date) {
  return Math.max(0, Math.floor((actual.getTime() - start.getTime()) / 60000));
}
export function penaltyAmount(minutes: number, rule: LateRule) {
  if (!rule.enabled) return 0;
  if (rule.mode === "interval")
    return Math.floor(minutes / rule.intervalMinutes) * rule.intervalAmount;
  return rule.tiers
    .filter((t) => minutes >= t.minutes)
    .reduce((v, t) => Math.max(v, t.amount), 0);
}
export async function resolveShift(
  staffId: string,
  storeId: string,
  at: Date,
  db: WorkDB = prisma,
) {
  const day = wibDate(at),
    previous = wibDate(new Date(at.getTime() - 86400000));
  const schedules = await db.schedule.findMany({
    where: {
      staffId,
      date: {
        gte: new Date(previous + "T00:00:00+07:00"),
        lt: new Date(day + "T23:59:59.999+07:00"),
      },
    },
    orderBy: { date: "desc" },
  });
  const shifts = await db.shift.findMany({ where: { storeId } });
  const candidates = schedules
    .map((s) => {
      const shift = shifts.find((t) => [t.id, t.key, t.name].includes(s.shift));
      if (!shift || s.shift === "off") return null;
      const businessDate = wibDate(s.date),
        start = new Date(`${businessDate}T${shift.startTime}:00+07:00`);
      let end = new Date(`${businessDate}T${shift.endTime}:00+07:00`);
      if (end <= start) end = new Date(end.getTime() + 86400000);
      return {
        scheduleId: s.id,
        businessDate,
        start,
        end,
        shiftKey: shift.key,
        shiftName: shift.name,
      };
    })
    .filter(Boolean);
  return (
    candidates.find((s) => at >= s!.start && at < s!.end) ||
    candidates.find((s) => s!.businessDate === day && at < s!.end) ||
    null
  );
}
export async function reconcileLate(
  storeId: string,
  staffId: string,
  month: string,
  db: WorkDB,
) {
  await periodLock(db, storeId, staffId, month);
  const rule = await readWork<LateRule>(storeId, `rule.${month}`, db);
  if (!rule) return null;
  const snapshots = (
    await listWork(storeId, `attendance.${staffId}.`, db)
  ).filter(
    (s) =>
      s.businessDate?.slice(0, 7) === month &&
      s.start &&
      s.recordedAt >= rule.effectiveAt,
  );
  const minutes = snapshots.reduce(
      (sum, s) => sum + (s.exempt ? 0 : s.minutes),
      0,
    ),
    amount = penaltyAmount(minutes, rule);
  if (!Number.isSafeInteger(amount) || amount > 2000000000)
    throw new Error("PAYROLL_AMOUNT_REQUIRES_REVIEW");
  const key = `late-${staffId}-${month}`,
    salary = await db.salary.findFirst({ where: { staffId, month } });
  const existingRow = await db.config.findUnique({
    where: { storeId_key: { storeId, key: `staff.compensation.${key}` } },
  });
  const existing = existingRow ? JSON.parse(existingRow.value) : null;
  const previousSummary = await readWork(
    storeId,
    `late-summary.${staffId}.${month}`,
    db,
  );
  const previousAmount =
    salary?.status === "paid" && previousSummary
      ? previousSummary.amount
      : existing?.status === "active"
        ? existing.amount
        : 0;
  if (salary?.status === "paid") {
    const nextMonth = new Date(`${month}-01T00:00:00Z`);
    nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
    const override = await readWork(
      storeId,
      `refund-target.${staffId}.${month}`,
      db,
    );
    const targetMonth = override?.month || nextMonth.toISOString().slice(0, 7);
    const delta = previousAmount - amount;
    const refundKey = override
        ? `late-refund-${staffId}-${month}-${targetMonth}`
        : `late-refund-${staffId}-${month}`,
      oldRefund = await db.config.findUnique({
        where: {
          storeId_key: { storeId, key: `staff.compensation.${refundKey}` },
        },
      });
    const old = oldRefund ? JSON.parse(oldRefund.value) : null;
    if (delta !== 0) {
      const total = (old?.amount || 0) + delta;
      if (total < 0) throw new Error("PAID_PAYROLL_REQUIRES_MANUAL_REVIEW");
      await periodLock(db, storeId, staffId, targetMonth);
      const target = await db.salary.findFirst({
        where: { staffId, month: targetMonth },
      });
      if (target && target.status !== "pending")
        throw new Error("REFUND_PAYROLL_LOCKED");
      await saveCompensation(
        storeId,
        refundKey,
        {
          id: refundKey,
          staffId,
          month: targetMonth,
          type: "reward",
          amount: total,
          reason: `Late appeal refund ${month}`,
          status: total ? "active" : "cancelled",
          createdBy: "system",
          createdAt: old?.createdAt || new Date().toISOString(),
          sourceMonth: month,
        },
        db,
      );
      await updatePendingSalary(storeId, staffId, targetMonth, db);
    }
  } else if (salary && salary.status !== "pending")
    throw new Error("PAYROLL_LOCKED");
  if (salary?.status !== "paid")
    await saveCompensation(
      storeId,
      key,
      {
        id: key,
        staffId,
        month,
        type: "penalty",
        amount,
        reason: `Monthly lateness ${minutes} min`,
        status: amount ? "active" : "cancelled",
        createdBy: "system",
        createdAt: existing?.createdAt || new Date().toISOString(),
        source: "monthly-lateness",
        ruleVersion: rule.version,
      },
      db,
    );
  if (salary?.status !== "paid")
    await updatePendingSalary(storeId, staffId, month, db);
  return writeWork(
    storeId,
    `late-summary.${staffId}.${month}`,
    {
      staffId,
      month,
      minutes,
      amount,
      ruleVersion: rule.version,
      updatedAt: new Date().toISOString(),
    },
    db,
  );
}
async function saveCompensation(
  storeId: string,
  key: string,
  item: any,
  db: WorkDB,
) {
  await db.config.upsert({
    where: { storeId_key: { storeId, key: `staff.compensation.${key}` } },
    create: {
      storeId,
      key: `staff.compensation.${key}`,
      category: "staff",
      value: JSON.stringify(item),
    },
    update: { value: JSON.stringify(item) },
  });
}
async function updatePendingSalary(
  storeId: string,
  staffId: string,
  month: string,
  db: WorkDB,
) {
  const salary = await db.salary.findFirst({ where: { staffId, month } });
  if (!salary) return;
  if (salary.status !== "pending") throw new Error("PAYROLL_LOCKED");
  const old = await savedAdjustmentPlan(storeId, salary.id, db),
    next = await adjustmentPlan(storeId, staffId, month, db);
  const bonus = salary.bonus - old.rewards + next.rewards,
    deduction = salary.deduction - old.penalties + next.penalties,
    finalAmount =
      salary.baseSalary +
      salary.overtime +
      salary.commission +
      bonus -
      deduction;
  if (bonus < 0 || deduction < 0 || finalAmount < 0 || finalAmount > 2000000000)
    throw new Error("PAYROLL_AMOUNT_REQUIRES_REVIEW");
  const changed = await db.salary.updateMany({
    where: { id: salary.id, status: "pending" },
    data: { bonus, deduction, finalAmount },
  });
  if (changed.count !== 1) throw new Error("PAYROLL_CHANGED");
  await saveAdjustmentPlan(db, storeId, salary.id, next);
}
export async function snapshotAttendance(
  attendance: any,
  storeId: string,
  db: WorkDB,
) {
  const key = `attendance.${attendance.staffId}.${attendance.id}`,
    old = await readWork(storeId, key, db),
    shift = old?.start
      ? old
      : await resolveShift(
          attendance.staffId,
          storeId,
          attendance.checkInTime,
          db,
        );
  const start = shift?.start ? new Date(shift.start) : null,
    minutes = start ? lateMinutes(start, attendance.checkInTime) : 0;
  const snapshot = {
    ...old,
    attendanceId: attendance.id,
    staffId: attendance.staffId,
    businessDate: shift?.businessDate || wibDate(attendance.checkInTime),
    start: start?.toISOString() || null,
    end: shift?.end ? new Date(shift.end).toISOString() : null,
    shiftName: shift?.shiftName || null,
    rawCheckIn: old?.rawCheckIn || attendance.checkInTime.toISOString(),
    effectiveCheckIn: attendance.checkInTime.toISOString(),
    minutes,
    exempt: old?.exempt || false,
    needsReview: !start,
    recordedAt: old?.recordedAt || new Date().toISOString(),
  };
  await writeWork(storeId, key, snapshot, db);
  await db.attendance.update({
    where: { id: attendance.id },
    data: { status: start ? (minutes ? "late" : "normal") : "pending_review" },
  });
  // Payroll issues must not prevent an employee from clocking in.
  return snapshot;
}
export async function createEmployeeAttendance(data: any, storeId: string) {
  return prisma.$transaction(async (db) => {
    await workLock(storeId, `check-in.${data.staffId}`, db);
    const shift = await resolveShift(
        data.staffId,
        storeId,
        data.checkInTime,
        db,
      ),
      day = shift?.businessDate || wibDate(data.checkInTime);
    const existingSnapshots = await listWork(
      storeId,
      `attendance.${data.staffId}.`,
      db,
    );
    const duplicate = existingSnapshots.find(
      (s) =>
        s.businessDate === day &&
        (!shift || s.start === shift.start.toISOString()),
    );
    if (duplicate)
      return db.attendance.findUniqueOrThrow({
        where: { id: duplicate.attendanceId },
      });
    const attendance = await db.attendance.create({ data });
    await snapshotAttendance(attendance, storeId, db);
    if (shift)
      await db.schedule.update({
        where: { id: shift.scheduleId },
        data: { status: "completed" },
      });
    return db.attendance.findUniqueOrThrow({ where: { id: attendance.id } });
  });
}
export async function processLatePayroll() {
  const rows = await prisma.config.findMany({
    where: { key: { startsWith: "employee.workspace.attendance." } },
  });
  const periods = new Map<
    string,
    { storeId: string; staffId: string; month: string }
  >();
  for (const row of rows) {
    const s = JSON.parse(row.value);
    periods.set(`${row.storeId}.${s.staffId}.${s.businessDate.slice(0, 7)}`, {
      storeId: row.storeId,
      staffId: s.staffId,
      month: s.businessDate.slice(0, 7),
    });
  }
  for (const p of periods.values())
    try {
      await prisma.$transaction((db) =>
        reconcileLate(p.storeId, p.staffId, p.month, db),
      );
      await writeWork(p.storeId, `payroll-issue.${p.staffId}.${p.month}`, null);
    } catch (e: any) {
      await writeWork(p.storeId, `payroll-issue.${p.staffId}.${p.month}`, {
        ...p,
        status: "pending_review",
        message: e.message,
      });
    }
}
