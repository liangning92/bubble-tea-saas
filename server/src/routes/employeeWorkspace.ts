import { listSalaryAdjustments, voucherStatuses } from "../services/SalaryAdjustmentService";
import {
  pushKeys,
  validPushEndpoint,
} from "../services/EmployeeReminderService";
import { Router } from "express";
import { z } from "zod";
import multer from "multer";
import path from "path";
import fs from "fs/promises";
import { randomUUID, createHash } from "crypto";
import prisma from "../config/database";
import { inspectionReminderRelevant } from '../services/PackagingInspectionGuard';
import { isTeamAttachment, teamCommunication, TeamActor, TeamError } from "../services/TeamCommunicationService";
import { authenticate, AuthRequest } from "../middlewares/auth";
import {
  readWork,
  writeWork,
  listWork,
  workLock,
} from "../services/EmployeeWorkspaceStore";
import {
  LateRule,
  wibDate,
  reconcileLate,
  penaltyAmount,
} from "../services/EmployeeAttendanceService";
const router = Router();
router.use(authenticate);
const privateRoot = path.resolve(
  process.env.UPLOADS_PATH || path.resolve(__dirname, "../../uploads"),
  ".employee-private",
);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 1 },
});
const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const requestId = z.string().uuid();
const body = z.object({
  requestId,
  reason: z.string().trim().min(1).max(4000),
  files: z.array(z.string().uuid()).min(1).max(5),
});
const handle =
  (fn: (req: AuthRequest, res: any) => Promise<any>) =>
  async (req: AuthRequest, res: any) => {
    try {
      await fn(req, res);
    } catch (e: any) {
      const code =
        e instanceof TeamError ? e.status : e instanceof z.ZodError
          ? 400
          : e.message?.includes("NOT_FOUND")
            ? 404
            : e.message?.includes("FORBIDDEN")
              ? 403
              : 409;
      res.status(code).json({
        code,
        message:
          e instanceof z.ZodError
            ? "INVALID_INPUT"
            : e.message || "WORKFLOW_FAILED",
      });
    }
  };
function identity(req: AuthRequest) {
  if (!req.user?.staffId) throw new Error("STAFF_IDENTITY_REQUIRED");
  return req.user;
}
function admin(req: AuthRequest) {
  if (req.user?.role !== "admin") throw new Error("FORBIDDEN");
  return req.user;
}
async function ownedFiles(user: any, files: string[], db: any = prisma) {
  for (const id of files) {
    const file = await readWork(user.storeId, `file.${id}`, db);
    if (!file || file.staffId !== user.staffId || await isTeamAttachment(db, user.storeId, id, file))
      throw new Error("FILE_FORBIDDEN");
  }
}
router.post(
  "/my/files",
  upload.single("file"),
  handle(async (req, res) => {
    const user = identity(req),
      file = req.file;
    const purpose = z.enum(['employee', 'team']).default('employee').parse(req.body?.purpose);
    if (!file) throw new Error("FILE_REQUIRED");
    const data = file.buffer as Buffer;
    const jpeg = data[0] === 255 && data[1] === 216 && data[2] === 255,
      png = data
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
      pdf = data.subarray(0, 5).toString() === "%PDF-";
    if (!jpeg && !png && !pdf) throw new Error("ONLY_JPEG_PNG_PDF");
    const uploadRequestId = z.string().max(80).optional().parse(req.body?.uploadRequestId);
    if (uploadRequestId !== undefined) {
      if (purpose !== 'team') throw new TeamError(400, 'TEAM_UPLOAD_PURPOSE_REQUIRED');
      const parts = uploadRequestId.split(':');
      z.tuple([z.string().uuid(), z.enum(['0', '1', '2', '3', '4'])]).parse(parts);
      // Stable per message/file slot, scoped to the current owner and store.
      const hex = createHash('sha256').update(JSON.stringify([user.storeId, user.staffId, uploadRequestId])).digest('hex');
      const id = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
      const sha256 = createHash('sha256').update(data).digest('hex');
      const type = jpeg ? 'image/jpeg' : png ? 'image/png' : 'application/pdf';
      await prisma.$transaction(async db => {
        await workLock(user.storeId, `file-upload.${id}`, db);
        const existing = await readWork(user.storeId, `file.${id}`, db);
        if (existing) {
          if (existing.staffId !== user.staffId || existing.purpose !== purpose || existing.sha256 !== sha256 || existing.type !== type)
            throw new TeamError(409, 'TEAM_UPLOAD_REQUEST_CONFLICT');
          return;
        }
        await fs.mkdir(privateRoot, { recursive: true, mode: 0o700 });
        try {
          await fs.writeFile(path.join(privateRoot, id), data, { mode: 0o600, flag: 'wx' });
        } catch (error: any) {
          if (error.code !== 'EEXIST') throw error;
          // A transaction/connection loss can leave its private file behind.
          const storedHash = createHash('sha256').update(await fs.readFile(path.join(privateRoot, id))).digest('hex');
          if (storedHash !== sha256) throw new TeamError(409, 'TEAM_UPLOAD_REQUEST_CONFLICT');
        }
        await writeWork(user.storeId, `file.${id}`, { id, staffId: user.staffId, purpose, type, sha256, createdAt: new Date().toISOString() }, db);
      });
      res.status(201).json({ code: 201, data: { id } });
      return;
    }
    const id = randomUUID();
    await fs.mkdir(privateRoot, { recursive: true, mode: 0o700 });
    await fs.writeFile(path.join(privateRoot, id), data, { mode: 0o600 });
    try {
      await writeWork(user.storeId, `file.${id}`, {
        id,
        staffId: user.staffId,
        purpose,
        type: jpeg ? "image/jpeg" : png ? "image/png" : "application/pdf",
        createdAt: new Date().toISOString(),
      });
    } catch (e) {
      await fs.unlink(path.join(privateRoot, id));
      throw e;
    }
    res.status(201).json({ code: 201, data: { id } });
  }),
);
router.get(
  "/files/:id",
  handle(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id),
      user = req.user!,
      stored = await readWork(user.storeId, `file.${id}`);
    let file = stored;
    if (stored && await isTeamAttachment(prisma, user.storeId, id, stored)) {
      if (req.query.channelId === undefined) throw new TeamError(403, 'TEAM_CHANNEL_REQUIRED');
      const channelId = z.string().uuid().parse(req.query.channelId);
      const auditReason = req.query.auditReason === undefined ? undefined : z.string().min(5).max(500).parse(req.query.auditReason);
      file = await teamCommunication().attachment(user as TeamActor, channelId, id, auditReason);
    } else if (!stored || (user.role !== "admin" && stored.staffId !== user.staffId)) {
      throw new Error("FILE_FORBIDDEN");
    }
    res.set({
      "Cache-Control": "private, no-store",
      "Content-Type": file.type,
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": 'attachment; filename="document"',
    });
    res.sendFile(path.join(privateRoot, id));
  }),
);
router.get(
  "/my/compensation",
  handle(async (req, res) => {
    const u = identity(req);
    res.json({
      code: 200,
      data: await voucherStatuses(u.storeId,(await listSalaryAdjustments(u.storeId)).filter(
        (r) => r.staffId === u.staffId,
      )),
    });
  }),
);
router.get(
  "/my/late-rule",
  handle(async (req, res) => {
    const u = identity(req);
    const rule = await readWork<LateRule>(
      u.storeId,
      `rule.${wibDate(new Date()).slice(0, 7)}`,
    );
    res.json({
      code: 200,
      data: rule
        ? {
            month: rule.month,
            enabled: rule.enabled,
            mode: rule.mode,
            tiers: rule.tiers,
            intervalMinutes: rule.intervalMinutes,
            intervalAmount: rule.intervalAmount,
          }
        : null,
    });
  }),
);
router.get(
  "/my/attendance",
  handle(async (req, res) => {
    const u = identity(req);
    res.json({
      code: 200,
      data: {
        records: await listWork(u.storeId, `attendance.${u.staffId}.`),
        payrollIssues: (
          await listWork(u.storeId, `payroll-issue.${u.staffId}.`)
        ).filter(Boolean),
        appeals: (await listWork(u.storeId, "appeal.")).filter(
          (a) => a.staffId === u.staffId,
        ),
      },
    });
  }),
);
router.post(
  "/my/appeals",
  handle(async (req, res) => {
    const u = identity(req),
      input = body.extend({ attendanceId: z.string() }).parse(req.body);
    const result = await prisma.$transaction(async (db) => {
      await workLock(u.storeId, `appeal.${u.staffId}`, db);
      const replay = await readWork(u.storeId, `appeal.${input.requestId}`, db);
      if (replay) {
        if (
          replay.staffId !== u.staffId ||
          replay.attendanceId !== input.attendanceId ||
          replay.reason !== input.reason ||
          JSON.stringify(replay.files) !== JSON.stringify(input.files)
        )
          throw new Error("REQUEST_ID_CONFLICT");
        return replay;
      }
      const snapshot = await readWork(
        u.storeId,
        `attendance.${u.staffId}.${input.attendanceId}`,
        db,
      );
      if (!snapshot || snapshot.minutes === 0 || snapshot.exempt)
        throw new Error("LATE_RECORD_NOT_FOUND");
      if (
        (await listWork(u.storeId, "appeal.", db)).some(
          (a) =>
            a.staffId === u.staffId &&
            a.attendanceId === input.attendanceId &&
            a.status === "pending",
        )
      )
        throw new Error("APPEAL_ALREADY_PENDING");
      await ownedFiles(u, input.files, db);
      return writeWork(
        u.storeId,
        `appeal.${input.requestId}`,
        {
          ...input,
          id: input.requestId,
          staffId: u.staffId,
          month: snapshot.businessDate.slice(0, 7),
          status: "pending",
          createdAt: new Date().toISOString(),
        },
        db,
      );
    });
    res.status(201).json({ code: 201, data: result });
  }),
);
router.get(
  "/my/profile-submissions",
  handle(async (req, res) => {
    const u = identity(req);
    res.json({
      code: 200,
      data: {
        submissions: (await listWork(u.storeId, "profile.")).filter(
          (r) => r.staffId === u.staffId,
        ),
        official: await readWork(u.storeId, `official.${u.staffId}`),
      },
    });
  }),
);
router.post(
  "/my/profile-submissions",
  handle(async (req, res) => {
    const u = identity(req),
      input = z
        .object({
          requestId,
          kind: z.enum(["ktp", "bank", "personal"]),
          files: z.array(z.string().uuid()).max(5),
          data: z.object({
            number: z.string().max(100).optional(),
            bankName: z.string().max(100).optional(),
            bankAccount: z.string().max(100).optional(),
            email: z.string().email().optional(),
            address: z.string().max(1000).optional(),
            emergencyContact: z.string().max(100).optional(),
            emergencyPhone: z.string().max(50).optional(),
          }),
        })
        .parse(req.body);
    if (input.kind === "ktp" && (!input.files.length || !input.data.number))
      throw new Error("KTP_NUMBER_AND_FILE_REQUIRED");
    if (
      input.kind === "bank" &&
      (!input.data.bankName || !input.data.bankAccount)
    )
      throw new Error("BANK_DETAILS_REQUIRED");
    const result = await prisma.$transaction(async (db) => {
      await workLock(u.storeId, `profile.${u.staffId}`, db);
      const old = await readWork(u.storeId, `profile.${input.requestId}`, db);
      if (old) {
        if (
          old.staffId !== u.staffId ||
          JSON.stringify(old.input) !== JSON.stringify(input)
        )
          throw new Error("REQUEST_ID_CONFLICT");
        return old;
      }
      if (
        (await listWork(u.storeId, "profile.", db)).some(
          (r) =>
            r.staffId === u.staffId &&
            r.kind === input.kind &&
            r.status === "pending",
        )
      )
        throw new Error("PROFILE_ALREADY_PENDING");
      await ownedFiles(u, input.files, db);
      return writeWork(
        u.storeId,
        `profile.${input.requestId}`,
        {
          ...input,
          input,
          id: input.requestId,
          staffId: u.staffId,
          status: "pending",
          createdAt: new Date().toISOString(),
        },
        db,
      );
    });
    res.status(201).json({ code: 201, data: result });
  }),
);
router.get(
  "/my/learning",
  handle(async (req, res) => {
    const u = identity(req);
    res.json({
      code: 200,
      data: await listWork(u.storeId, `learning.${u.staffId}.`),
    });
  }),
);
router.put(
  "/my/learning",
  handle(async (req, res) => {
    const u = identity(req),
      input = z
        .object({
          course: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/),
          version: z.string().max(80).min(1),
          completed: z.boolean(),
          source: z
            .enum(["self_reported", "legacy_import"])
            .default("self_reported"),
        })
        .parse(req.body);
    const key = `learning.${u.staffId}.${input.course}.${input.version}`;
    const saved = await prisma.$transaction(async (db) => {
      await workLock(u.storeId, key, db);
      const old = await readWork(u.storeId, key, db);
      return writeWork(
        u.storeId,
        key,
        {
          ...input,
          staffId: u.staffId,
          completed: old?.completed || input.completed,
          source: old?.source || input.source,
          updatedAt: new Date().toISOString(),
          assessmentPassed: false,
        },
        db,
      );
    });
    res.json({ code: 200, data: saved });
  }),
);
router.get(
  "/my/checklist",
  handle(async (req, res) => {
    const u = identity(req);
    res.json({
      code: 200,
      data:
        (await readWork(
          u.storeId,
          `checklist.${u.staffId}.${wibDate(new Date())}`,
        )) || {},
    });
  }),
);
router.put(
  "/my/checklist",
  handle(async (req, res) => {
    const u = identity(req),
      data = z.record(z.boolean()).parse(req.body);
    if (Object.keys(data).length > 200) throw new Error("TOO_MANY_ITEMS");
    res.json({
      code: 200,
      data: await writeWork(
        u.storeId,
        `checklist.${u.staffId}.${wibDate(new Date())}`,
        data,
      ),
    });
  }),
);
router.get(
  "/admin",
  handle(async (req, res) => {
    const u = admin(req);
    const names = await prisma.staff.findMany({
      where: { storeId: u.storeId },
      select: { id: true, name: true },
    });
    const named = (records: any[]) =>
      records.map((r) => ({
        ...r,
        staffName: names.find((n) => n.id === r.staffId)?.name,
      }));
    res.json({
      code: 200,
      data: {
        appeals: named(await listWork(u.storeId, "appeal.")),
        profiles: named(await listWork(u.storeId, "profile.")),
        rules: await listWork(u.storeId, "rule."),
        learning: await listWork(u.storeId, "learning."),
        payrollIssues: named(
          (await listWork(u.storeId, "payroll-issue.")).filter(Boolean),
        ),
      },
    });
  }),
);
router.put(
  "/admin/:kind/:id/review",
  handle(async (req, res) => {
    const u = admin(req),
      kind = z.enum(["appeal", "profile"]).parse(req.params.kind),
      id = z.string().uuid().parse(req.params.id),
      input = z
        .object({
          approved: z.boolean(),
          note: z.string().trim().min(1).max(4000),
        })
        .parse(req.body);
    const result = await prisma.$transaction(async (db) => {
      await workLock(u.storeId, `${kind}.${id}`, db);
      const record = await readWork(u.storeId, `${kind}.${id}`, db);
      if (!record) throw new Error("RECORD_NOT_FOUND");
      if (record.status !== "pending") throw new Error("ALREADY_REVIEWED");
      if (input.approved && kind === "appeal") {
        const key = `attendance.${record.staffId}.${record.attendanceId}`,
          snapshot = await readWork(u.storeId, key, db);
        if (!snapshot) throw new Error("RECORD_NOT_FOUND");
        await writeWork(
          u.storeId,
          key,
          { ...snapshot, exempt: true, appealId: id },
          db,
        );
      }
      if (input.approved && kind === "profile") {
        const staff = await db.staff.findFirst({
          where: { id: record.staffId, storeId: u.storeId },
        });
        if (!staff) throw new Error("STAFF_NOT_FOUND");
        const old =
          (await readWork(u.storeId, `official.${record.staffId}`, db)) || {};
        await writeWork(
          u.storeId,
          `official.${record.staffId}`,
          {
            ...old,
            [record.kind]: {
              data: record.data,
              files: record.files,
              submissionId: id,
            },
          },
          db,
        );
        const allowed =
          record.kind === "bank"
            ? ["bankName", "bankAccount"]
            : record.kind === "personal"
              ? ["email", "address", "emergencyContact", "emergencyPhone"]
              : [];
        const data = Object.fromEntries(
          Object.entries(record.data).filter(([k]) => allowed.includes(k)),
        );
        if (Object.keys(data).length)
          await db.staff.update({ where: { id: staff.id }, data });
      }
      return writeWork(
        u.storeId,
        `${kind}.${id}`,
        {
          ...record,
          status: input.approved ? "approved" : "rejected",
          reviewNote: input.note,
          reviewedBy: u.id,
          reviewedAt: new Date().toISOString(),
        },
        db,
      );
    });
    if (kind === "appeal" && input.approved) {
      try {
        await prisma.$transaction((db) =>
          reconcileLate(u.storeId, result.staffId, result.month, db),
        );
        await writeWork(
          u.storeId,
          `payroll-issue.${result.staffId}.${result.month}`,
          null,
        );
      } catch (e: any) {
        await writeWork(
          u.storeId,
          `payroll-issue.${result.staffId}.${result.month}`,
          {
            staffId: result.staffId,
            month: result.month,
            appealId: id,
            status: "pending_review",
            message: e.message,
          },
        );
        result.payrollStatus = "pending_review";
      }
    }
    res.json({ code: 200, data: result });
  }),
);
router.put(
  "/admin/payroll-retry",
  handle(async (req, res) => {
    const u = admin(req),
      input = z
        .object({
          staffId: z.string().min(1),
          month,
          refundMonth: month.optional(),
          note: z.string().trim().min(1).max(4000),
        })
        .parse(req.body);
    const employee = await prisma.staff.findFirst({
      where: { id: input.staffId, storeId: u.storeId },
    });
    if (!employee) throw new Error("STAFF_NOT_FOUND");
    await prisma.$transaction(async (db) => {
      await workLock(
        u.storeId,
        `refund-target.${input.staffId}.${input.month}`,
        db,
      );
      if (input.refundMonth) {
        if (input.refundMonth <= input.month)
          throw new Error("REFUND_MONTH_MUST_FOLLOW_SOURCE");
        await writeWork(
          u.storeId,
          `refund-target.${input.staffId}.${input.month}`,
          {
            month: input.refundMonth,
            reviewedBy: u.id,
            note: input.note,
            reviewedAt: new Date().toISOString(),
          },
          db,
        );
      }
      await reconcileLate(u.storeId, input.staffId, input.month, db);
      await writeWork(
        u.storeId,
        `payroll-issue.${input.staffId}.${input.month}`,
        null,
        db,
      );
      await writeWork(
        u.storeId,
        `payroll-review.${randomUUID()}`,
        { ...input, reviewedBy: u.id, reviewedAt: new Date().toISOString() },
        db,
      );
    });
    res.json({ code: 200 });
  }),
);
const ruleInput = z.object({
  month,
  enabled: z.boolean(),
  mode: z.enum(["tiers", "interval"]),
  tiers: z
    .array(
      z.object({
        minutes: z.number().int().positive().max(50000),
        amount: z.number().int().nonnegative().max(100000000),
      }),
    )
    .max(30),
  intervalMinutes: z.number().int().positive().max(50000),
  intervalAmount: z.number().int().nonnegative().max(100000000),
  expectedVersion: z.string().nullable(),
  confirmRecalculate: z.boolean(),
  previewToken: z.string().optional(),
});
async function rulePreview(storeId: string, input: any, db: any = prisma) {
  const current = await readWork<LateRule>(storeId, `rule.${input.month}`, db),
    all = await listWork(storeId, "attendance.", db);
  const records = all.filter(
    (r) =>
      r.businessDate.slice(0, 7) === input.month &&
      r.recordedAt >=
        (current?.activationAt ||
          (current?.enabled ? current.effectiveAt : new Date().toISOString())),
  );
  const changes = [];
  for (const staffId of new Set<string>(records.map((r) => r.staffId))) {
    const rows = records.filter((r) => r.staffId === staffId),
      minutes = rows.reduce((s, r) => s + (r.exempt ? 0 : r.minutes), 0),
      previous = await readWork(
        storeId,
        `late-summary.${staffId}.${input.month}`,
        db,
      ),
      staff = await db.staff.findUnique({ where: { id: staffId } }),
      salary = await db.salary.findFirst({
        where: { staffId, month: input.month },
      });
    changes.push({
      staffId,
      staffName: staff?.name,
      minutes,
      previousAmount: previous?.amount || 0,
      amount: penaltyAmount(minutes, input),
      payrollStatus: salary?.status || "not_created",
    });
  }
  changes.sort((a, b) => a.staffId.localeCompare(b.staffId));
  const policy = {
    month: input.month,
    enabled: input.enabled,
    mode: input.mode,
    tiers: input.tiers,
    intervalMinutes: input.intervalMinutes,
    intervalAmount: input.intervalAmount,
  };
  return {
    current,
    changes,
    employees: new Set(
      all
        .filter((r) => r.businessDate.slice(0, 7) === input.month)
        .map((r) => r.staffId),
    ).size,
    previewToken: createHash("sha256")
      .update(JSON.stringify([current?.version || null, policy, changes]))
      .digest("hex"),
  };
}
router.post(
  "/admin/rule-preview",
  handle(async (req, res) => {
    const u = admin(req),
      input = ruleInput.parse(req.body);
    res.json({ code: 200, data: await rulePreview(u.storeId, input) });
  }),
);
router.put(
  "/admin/rule",
  handle(async (req, res) => {
    const u = admin(req),
      input = ruleInput.parse(req.body),
      sorted = [...input.tiers].sort((a, b) => a.minutes - b.minutes);
    if (
      input.mode === "tiers" &&
      (!sorted.length ||
        sorted.some(
          (t, i) =>
            i > 0 &&
            (t.minutes === sorted[i - 1].minutes ||
              t.amount < sorted[i - 1].amount),
        ))
    )
      throw new Error("INVALID_TIERS");
    const result = await prisma.$transaction(async (db) => {
      await workLock(u.storeId, `rule.${input.month}`, db);
      const preview = await rulePreview(u.storeId, input, db);
      if (input.previewToken !== preview.previewToken)
        throw new Error("PREVIEW_CHANGED_RELOAD");
      const old = await readWork<LateRule>(
        u.storeId,
        `rule.${input.month}`,
        db,
      );
      if ((old?.version || null) !== input.expectedVersion)
        throw new Error("RULE_CHANGED");
      if (old && !input.confirmRecalculate)
        throw new Error("RECALC_CONFIRMATION_REQUIRED");
      const rule = {
        ...input,
        tiers: sorted,
        version: randomUUID(),
        effectiveAt:
          old?.activationAt ||
          (old?.enabled ? old.effectiveAt : new Date().toISOString()),
        activationAt:
          old?.activationAt ||
          (old?.enabled
            ? old.effectiveAt
            : input.enabled
              ? new Date().toISOString()
              : null),
        createdBy: u.id,
        updatedAt: new Date().toISOString(),
      };
      await writeWork(u.storeId, `rule-history.${rule.version}`, rule, db);
      await writeWork(u.storeId, `rule.${input.month}`, rule, db);
      const records = (await listWork(u.storeId, "attendance.", db)).filter(
        (r) =>
          r.businessDate.slice(0, 7) === input.month &&
          r.recordedAt >= rule.effectiveAt,
      );
      for (const staffId of new Set<string>(records.map((r) => r.staffId)))
        await reconcileLate(u.storeId, staffId, input.month, db);
      return rule;
    });
    res.json({ code: 200, data: result });
  }),
);
router.get(
  "/my/push-key",
  handle(async (req, res) => {
    const u = identity(req);
    res.json({
      code: 200,
      data: { publicKey: (await pushKeys(u.storeId)).publicKey },
    });
  }),
);
router.put(
  "/my/subscription",
  handle(async (req, res) => {
    const u = identity(req),
      subscription = z
        .object({
          endpoint: z.string().url().max(2048),
          keys: z.object({
            p256dh: z.string().max(256),
            auth: z.string().max(128),
          }),
        })
        .parse(req.body);
    if (!validPushEndpoint(subscription.endpoint))
      throw new Error("PUSH_ENDPOINT_FORBIDDEN");
    const { createHash } = await import("crypto");
    const id = createHash("sha256").update(subscription.endpoint).digest("hex");
    const previous = await prisma.config.findMany({
      where: {
        key: "employee.workspace.subscription." + id,
        storeId: { not: u.storeId },
      },
    });
    for (const row of previous) {
      const old = JSON.parse(row.value);
      await writeWork(row.storeId, `subscription.${id}`, {
        ...old,
        active: false,
      });
    }
    await writeWork(u.storeId, `subscription.${id}`, {
      id,
      staffId: u.staffId,
      userId: u.id,
      issuedAtMs: u.issuedAtMs,
      subscription,
      active: true,
      updatedAt: new Date().toISOString(),
    });
    res.json({ code: 200, data: { id } });
  }),
);
router.delete(
  "/my/subscription",
  handle(async (req, res) => {
    const u = identity(req);
    for (const s of await listWork(u.storeId, "subscription."))
      if (s.staffId === u.staffId && (!req.body?.id || req.body.id === s.id))
        await writeWork(u.storeId, `subscription.${s.id}`, {
          ...s,
          active: false,
        });
    res.json({ code: 200 });
  }),
);
router.get(
  "/my/dashboard",
  handle(async (req, res) => {
    const u = identity(req),
      now = new Date(),
      currentMonth = wibDate(now).slice(0, 7),
      snapshots = await listWork(u.storeId, `attendance.${u.staffId}.`);
    const records = snapshots.filter(
      (s) => s.businessDate.slice(0, 7) === currentMonth,
    );
    const rawAttendances = await prisma.attendance.findMany({
      where: {
        staffId: u.staffId,
        checkInTime: {
          gte: new Date(currentMonth + "-01T00:00:00+07:00"),
          lte: now,
        },
      },
    });
    const businessDays = new Set(
      rawAttendances
        .map(
          (a) =>
            snapshots.find((s) => s.attendanceId === a.id)?.businessDate ||
            wibDate(a.checkInTime),
        )
        .filter((d) => d.slice(0, 7) === currentMonth),
    );
    const results = await Promise.allSettled([
      prisma.hygieneTask.findMany({
        where: {
          storeId: u.storeId,
          OR: [{ staffId: u.staffId }, { staffId: null }],
          status: {
            in: [
              "pending",
              "in_progress",
              "overdue",
              "pending_approval",
              "rejected",
            ],
          },
        },
      }),
      prisma.training.findMany({
        where: {
          staffId: u.staffId,
          storeId: u.storeId,
          status: { in: ["scheduled", "in_progress"] },
        },
      }),
      prisma.shiftSwap.findMany({
        where: {
          storeId: u.storeId,
          targetStaffId: u.staffId,
          status: "pending",
          targetConfirmed: false,
        },
      }),
      listWork(u.storeId, `reminder.${u.staffId}.`),
    ]);
    const compensation = (await listSalaryAdjustments(u.storeId)).filter(
      (r) =>
        r.staffId === u.staffId &&
        r.month === currentMonth &&
        r.status === "active",
    );
    const value = (i: number) =>
      results[i].status === "fulfilled"
        ? (results[i] as PromiseFulfilledResult<any>).value
        : [];
    const inspectionReminders = new Set<string>();
    for (const reminder of value(3)) {
      if (reminder.event?.startsWith('packaging-inspection:') &&
          !await inspectionReminderRelevant(prisma, u.storeId, reminder, now)) inspectionReminders.add(reminder.id);
    }
    res.json({
      code: 200,
      data: {
        rewardsCount: compensation.filter((r) => r.type === "reward").length,
        penaltiesCount: compensation.filter((r) => r.type === "penalty").length,
        lateMinutes: records.reduce(
          (n, r) => n + (r.exempt ? 0 : r.minutes),
          0,
        ),
        workDays: businessDays.size,
        hygiene: {
          todo: value(0).filter((t: any) =>
            ["pending", "in_progress", "overdue", "rejected"].includes(
              t.status,
            ),
          ).length,
          pendingReview: value(0).filter(
            (t: any) => t.status === "pending_approval",
          ).length,
        },
        training: value(1).length,
        swap: value(2).length,
        reminders: value(3).filter(
          (r: any) =>
            r.status !== "cancelled" &&
            !inspectionReminders.has(r.id) &&
            (!r.expiresAt || new Date(r.expiresAt) > now),
        ),
        failedModules: results.flatMap((r, i) =>
          r.status === "rejected"
            ? [["hygiene", "training", "swap", "reminders"][i]]
            : [],
        ),
      },
    });
  }),
);
export { router as employeeWorkspaceRouter };
