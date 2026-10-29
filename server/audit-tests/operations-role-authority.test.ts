import { test, expect } from '@jest/globals';
import {
  assertOperationRequester,
  assertStoreOperationReferences,
  assertPublicationContext,
  operationalAcknowledgement,
  mutationPermission,
} from '../src/services/teamAgentBridge/employeeOperationAuthority';
import {
  fullStoreOperationsPermissions,
  agentSettingsSchema,
  defaultAgentSettings,
} from '../src/services/AgentSettingsService';
import { toolAudiencePermissions } from '../src/services/teamAgentBridge/employeeAccess';
const grant: any = { storeId: 'store' };
const scope: any = {
  requesterStaffId: 'employee',
  audienceStaffIds: ['owner', 'employee'],
  channelId: 'channel',
};
function dbFor(role = 'staff', permissions?: string[]) {
  return {
    staff: {
      findMany: async ({ where }: any) =>
        ['owner', 'employee']
          .filter((id) => !where.id || where.id.in.includes(id))
          .map((id) => ({
            id,
            user: { id, storeId: 'store', role: id === 'owner' ? 'admin' : role },
          })),
    },
    config: {
      findUnique: async ({ where }: any) =>
        where.storeId_key.key === 'staff.access.policy' && permissions
          ? {
              value: JSON.stringify({
                assignments: [{ staffId: 'employee', roleId: 'custom' }],
                roles: [{ id: 'custom', permissions }],
              }),
            }
          : null,
    },
  };
}
test('one audited profile covers existing modules without changing staff roles or default custom policy', () => {
  expect(defaultAgentSettings().operationProfile).toBe('custom');
  expect(
    agentSettingsSchema.parse({ ...defaultAgentSettings(), operationProfile: 'store_operations' })
      .operationProfile,
  ).toBe('store_operations');
  const permissions = fullStoreOperationsPermissions();
  expect(Object.keys(permissions)).toHaveLength(9);
  expect(Object.values(permissions).every((p) => p.read && p.write)).toBe(true);
});
test.each([
  ['employee_manage_staff', { action: 'set_schedule' }],
  ['employee_manage_marketing', { action: 'create_campaign' }],
  ['employee_manage_operations', { action: 'review_leave' }],
])('employee cannot borrow owner authority for %s', async (name, args) => {
  await expect(assertOperationRequester(dbFor(), grant, scope, name, args)).rejects.toThrow(
    'EMPLOYEE_OPERATION_REQUESTER_DENIED',
  );
  await expect(
    assertOperationRequester(dbFor(), grant, { ...scope, requesterStaffId: 'owner' }, name, args),
  ).resolves.toBeUndefined();
});
test('requester has to be the actual current participant; payload admin claim does nothing', async () => {
  await expect(
    assertOperationRequester(
      dbFor(),
      grant,
      { ...scope, requesterStaffId: 'outsider' },
      'employee_manage_staff',
      { action: 'set_schedule', role: 'admin' },
    ),
  ).rejects.toThrow('REQUESTER_REQUIRED');
});
test('normal stock-out follows employee account operation permission instead of manager-only inventory.write', async () => {
  expect(mutationPermission('employee_manage_inventory', { action: 'stock_out' })).toBe(
    'inventory.stockOut',
  );
  await expect(
    assertOperationRequester(dbFor(), grant, scope, 'employee_manage_inventory', {
      action: 'stock_out',
    }),
  ).resolves.toBeUndefined();
  await expect(
    assertOperationRequester(dbFor('staff', []), grant, scope, 'employee_manage_inventory', {
      action: 'stock_out',
    }),
  ).rejects.toThrow('REQUESTER_DENIED');
});
test('business write and secret read are distinct, and write acknowledgement excludes hidden fields and prose', () => {
  expect(toolAudiencePermissions('employee_manage_operations', { action: 'review_leave' })).toEqual(
    [],
  );
  expect(
    toolAudiencePermissions('employee_manage_operations', { action: 'list_pending_leaves' }),
  ).toContain('staff.private.read');
  const receipt = operationalAcknowledgement(
    'employee_manage_operations',
    { action: 'review_leave' },
    {
      success: true,
      leaveId: 'leave',
      status: 'approved',
      reason: 'private health',
      message: 'salary Rp 123',
      staffName: 'Private',
    },
  );
  expect(receipt).toEqual({ success: true, leaveId: 'leave', status: 'approved' });
});
test('owner-private internal context cannot publish data through a staff-facing surface', async () => {
  const ownerScope = { ...scope, requesterStaffId: 'owner', audienceStaffIds: ['owner'] };
  for (const [name, args] of [
    ['employee_manage_operations', { action: 'publish_announcement' }],
    ['employee_manage_training', { action: 'create_course' }],
    ['employee_manage_hygiene', { action: 'create_task', staffId: 'employee' }],
  ] as any[])
    await expect(assertPublicationContext(dbFor(), grant, ownerScope, name, args)).rejects.toThrow(
      'PUBLICATION_CONTEXT_REQUIRED',
    );
});
test('clean audience-scoped routine work can execute without additional per-task approval', async () => {
  const db = dbFor('staff', ['hygiene.write', 'hygiene.read']);
  await expect(
    assertOperationRequester(db, grant, scope, 'employee_manage_hygiene', {
      action: 'create_task',
      staffId: 'employee',
    }),
  ).resolves.toBeUndefined();
  await expect(
    assertPublicationContext(db, grant, scope, 'employee_manage_hygiene', {
      action: 'create_task',
      staffId: 'employee',
    }),
  ).resolves.toBeUndefined();
});
test('privileged mixed context cannot publish content even if it names all current recipients', async () => {
  await expect(
    assertPublicationContext(dbFor('manager'), grant, scope, 'employee_manage_operations', {
      action: 'publish_announcement',
    }),
  ).rejects.toThrow('PUBLICATION_CONTEXT_REQUIRED');
});

test('owner uses deterministic existing hygiene/SOP routines after private analysis, without copying private prose or asking again', async () => {
  const { executeStandardRoutine, isStandardRoutine } = await import(
    '../src/services/teamAgentBridge/employeeStandardRoutine'
  );
  const { getTrainingLibrary } = await import('../src/services/TrainingLibraryService');
  const rows = new Map<string, any>(),
    tasks: any[] = [],
    trainings: any[] = [];
  const db: any = {
    config: {
      findUnique: async ({ where }: any) => rows.get(where.storeId_key.key) || null,
      upsert: async ({ where, create, update }: any) => {
        const r = rows.get(where.storeId_key.key);
        const next = r ? { ...r, ...update } : create;
        rows.set(where.storeId_key.key, next);
        return next;
      },
    },
    staff: {
      findFirst: async ({ where }: any) =>
        where.id === 'employee' && where.storeId === 'store' ? { id: 'employee' } : null,
    },
    hygieneArea: {
      findFirst: async ({ where }: any) =>
        where.code === 'bar' && where.storeId === 'store' ? { code: 'bar', name: 'Bar' } : null,
    },
    hygieneTask: {
      create: async ({ data }: any) => {
        tasks.push(data);
        return { id: 'cleaning', ...data };
      },
    },
    hygieneTaskLog: { create: async () => ({}) },
    training: {
      create: async ({ data }: any) => {
        trainings.push(data);
        return { id: 'learning', ...data };
      },
    },
    financeAuditLog: { create: async () => ({}) },
  };
  const g: any = { ...grant, agentId: 'hermes', actions: ['hygiene.write', 'training.write'] };
  const args = {
    action: 'assign_standard',
    staffId: 'employee',
    date: '2026-10-28',
    areaCode: 'bar',
  };
  expect(isStandardRoutine('employee_manage_hygiene', args)).toBe(true);
  await expect(
    assertPublicationContext(
      db,
      g,
      { ...scope, requesterStaffId: 'owner', audienceStaffIds: ['owner'] },
      'employee_manage_hygiene',
      args,
    ),
  ).resolves.toBeUndefined();
  const clean = await executeStandardRoutine(
    db,
    g,
    'employee_manage_hygiene',
    args,
    'operation-one',
  );
  expect(clean.physicalCompletion).toBe(false);
  expect(tasks[0].status).toBe('pending');
  expect(
    (await executeStandardRoutine(db, g, 'employee_manage_hygiene', args, 'operation-one'))
      .alreadyRecorded,
  ).toBe(true);
  expect(tasks).toHaveLength(1);
  await expect(
    executeStandardRoutine(
      db,
      g,
      'employee_manage_hygiene',
      { ...args, note: 'private owner salary Rp123' },
      'bad',
    ),
  ).rejects.toThrow();
  expect(isStandardRoutine('employee_manage_hygiene', { ...args, note: 'private' })).toBe(false);
  const course = getTrainingLibrary().modules[0];
  const training = await executeStandardRoutine(
    db,
    g,
    'employee_manage_training',
    {
      action: 'assign_published_course',
      staffId: 'employee',
      date: '2026-10-28',
      courseKey: course.key,
    },
    'operation-two',
  );
  expect(training.source.kind).toBe('published_training_module');
  expect(training.status).toBe('scheduled');
  expect(training.physicalCompletion).toBe(false);
  expect(trainings).toHaveLength(1);
  expect(trainings[0].title).toBe(course.title.id || course.title.en || course.title.zh);
  expect(trainings[0].notes).not.toContain('salary');
  await expect(
    executeStandardRoutine(
      db,
      g,
      'employee_manage_training',
      {
        action: 'assign_published_course',
        staffId: 'employee',
        date: '2026-10-28',
        courseKey: 'unpublished-secret',
      },
      'missing',
    ),
  ).rejects.toThrow('PUBLISHED_COURSE_NOT_FOUND');
  expect(trainings).toHaveLength(1);
  await expect(
    assertOperationRequester(dbFor(), g, scope, 'employee_manage_training', {
      action: 'assign_published_course',
      staffId: 'employee',
      date: '2026-10-28',
      courseKey: course.key,
    }),
  ).rejects.toThrow('REQUESTER_DENIED');
});

test('read and pure expense evidence bookkeeping stay autonomous, but cash drawer effects require approval', async () => {
  const ownerScope = { ...scope, requesterStaffId: 'owner', audienceStaffIds: ['owner'] },
    db = dbFor();
  await expect(
    assertOperationRequester(db, grant, ownerScope, 'employee_manage_finance', {
      action: 'query_revenue_summary',
    }),
  ).resolves.toBeUndefined();
  await expect(
    assertOperationRequester(db, grant, ownerScope, 'employee_manage_finance', {
      action: 'record_expense',
      paymentSource: 'owner_transfer',
      amount: 1000,
    }),
  ).resolves.toBeUndefined();
  for (const args of [
    { action: 'record_expense', amount: 1000 },
    { action: 'record_expense', paymentSource: 'drawer_cash', amount: 1000 },
  ])
    await expect(
      assertOperationRequester(db, grant, ownerScope, 'employee_manage_finance', args),
    ).rejects.toThrow('APPROVAL_REQUIRED');
  await expect(
    assertOperationRequester(db, grant, scope, 'employee_manage_finance', {
      action: 'record_expense',
      type: 'salary',
      paymentSource: 'personal',
    }),
  ).rejects.toThrow('REQUESTER_DENIED');
});

test('expense money units are explicit and revenue arithmetic uses matching rupiah units', async () => {
  const { expenseIdrToCents, expenseCentsToIdr } = await import(
    '../src/services/teamAgentBridge/employeeExpenseEvidence'
  );
  expect(expenseIdrToCents(15000, 'IDR')).toBe(1500000);
  expect(expenseCentsToIdr(1500000)).toBe(15000);
  expect(60000 - expenseCentsToIdr(1500000)).toBe(45000);
  for (const [amount, unit] of [
    [15000, undefined],
    [15000, 'cents'],
    [-1, 'IDR'],
    [Infinity, 'IDR'],
    [999999999999, 'IDR'],
  ] as any[])
    expect(() => expenseIdrToCents(amount, unit)).toThrow('AMOUNT_OR_UNIT_REQUIRED');
});

test('normal owner instructions in the current employee audience still execute standard routines, while private free-text cannot escape via notes or refusal reasons', async () => {
  const db = dbFor(),
    ownerInEmployeeChannel = { ...scope, requesterStaffId: 'owner' };
  const standard = {
    action: 'assign_standard',
    staffId: 'employee',
    date: '2026-10-28',
    areaCode: 'bar',
  };
  await expect(
    assertOperationRequester(
      db,
      grant,
      ownerInEmployeeChannel,
      'employee_manage_hygiene',
      standard,
    ),
  ).resolves.toBeUndefined();
  await expect(
    assertPublicationContext(
      db,
      grant,
      ownerInEmployeeChannel,
      'employee_manage_hygiene',
      standard,
    ),
  ).resolves.toBeUndefined();
  const ownerPrivate = { ...scope, requesterStaffId: 'owner', audienceStaffIds: ['owner'] };
  for (const [name, args] of [
    ['employee_manage_inventory', { action: 'stock_out', note: 'private owner salary Rp123' }],
    [
      'employee_manage_operations',
      { action: 'review_leave', rejectionReason: 'private owner cost' },
    ],
  ] as any[])
    await expect(assertPublicationContext(db, grant, ownerPrivate, name, args)).rejects.toThrow(
      'PUBLICATION_CONTEXT_REQUIRED',
    );
  await expect(
    assertPublicationContext(db, grant, ownerPrivate, 'employee_manage_inventory', {
      action: 'stock_out',
    }),
  ).resolves.toBeUndefined();
});

test('sensitive numeric summaries are projected before model access, not left in harmless-looking keys', async () => {
  const { visibleBusinessData } = await import('../src/services/teamAgentBridge/employeeAccess');
  const visible = await visibleBusinessData(dbFor(), grant, scope, {
    totalRevenue: 60000,
    totalExpenses: 15000,
    netIncome: 45000,
    costPrice: 100,
    salary: 1,
    expenseId: 'receipt',
  });
  expect(visible).toEqual({ totalRevenue: 60000, expenseId: 'receipt' });
});

test('full operations grant does not turn personal training into colleagues assessment access', async () => {
  const { visibleTrainingStaff } = await import('../src/services/teamAgentBridge/employeeAccess');
  expect(await visibleTrainingStaff(dbFor(), grant, scope)).toEqual(['employee']);
  expect(
    await visibleTrainingStaff(dbFor(), grant, {
      ...scope,
      audienceStaffIds: ['owner'],
      requesterStaffId: 'owner',
    }),
  ).toBeUndefined();
  const mixed = { ...scope, audienceStaffIds: ['employee', 'other'], requesterStaffId: 'employee' };
  const db: any = dbFor();
  db.staff.findMany = async ({ where }: any) =>
    where.id.in.map((id: string) => ({ id, user: { id, storeId: 'store', role: 'staff' } }));
  expect(await visibleTrainingStaff(db, grant, mixed)).toEqual([]);
});

test('ordinary typed status changes and existing-task assignments do not become artificial publication approvals', async () => {
  const ownerPrivate = { ...scope, requesterStaffId: 'owner', audienceStaffIds: ['owner'] };
  await expect(
    assertPublicationContext(dbFor(), grant, ownerPrivate, 'employee_manage_product', {
      action: 'update_product',
      productId: 'product',
      status: 'inactive',
    }),
  ).resolves.toBeUndefined();
  await expect(
    assertPublicationContext(dbFor(), grant, ownerPrivate, 'employee_manage_hygiene', {
      action: 'assign_task',
      taskId: 'task',
      staffId: 'employee',
    }),
  ).resolves.toBeUndefined();
  await expect(
    assertPublicationContext(dbFor(), grant, ownerPrivate, 'employee_manage_hygiene', {
      action: 'assign_task',
      taskId: 'task',
      staffId: 'employee',
      note: 'private owner financial note',
    }),
  ).rejects.toThrow('PUBLICATION_CONTEXT_REQUIRED');
});

test.each([
  ['employee_manage_product', { action: 'update_product', productId: 'foreign' }, 'product'],
  ['employee_manage_inventory', { action: 'stock_in', inventoryId: 'foreign' }, 'inventory'],
  ['employee_manage_training', { action: 'record_result', trainingId: 'foreign' }, 'training'],
  ['employee_manage_operations', { action: 'review_leave', leaveId: 'foreign' }, 'leave'],
  [
    'employee_manage_procurement',
    { action: 'create_purchase_order', items: [{ inventoryId: 'foreign' }] },
    'inventory',
  ],
])(
  'mutating %s checks every referenced record against the actual store before a write',
  async (name, args, model) => {
    const seen: any[] = [];
    const db: any = {
      [model]: {
        findFirst: async ({ where }: any) => {
          seen.push(where);
          return where.storeId === 'store' && where.id === 'local' ? { id: 'local' } : null;
        },
      },
    };
    await expect(assertStoreOperationReferences(db, grant, name, args)).rejects.toThrow(
      'REFERENCE_NOT_IN_STORE',
    );
    expect(seen[0].storeId).toBe('store');
    if ('productId' in args)
      await expect(
        assertStoreOperationReferences(db, grant, name, { ...args, productId: 'local' }),
      ).resolves.toBeUndefined();
  },
);

test('membership operation IDs bind one execution and tool call without customer or credential data', async () => {
  const { membershipOperationId } = await import(
    '../src/services/teamAgentBridge/employeeMembershipTools'
  );
  const id = membershipOperationId('execution-one', 'call-one');
  expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  expect(membershipOperationId('execution-one', 'call-one')).toBe(id);
  expect(membershipOperationId('execution-two', 'call-one')).not.toBe(id);
  expect(mutationPermission('employee_manage_membership', { action: 'apply' })).toBe(
    'members.write',
  );
});
