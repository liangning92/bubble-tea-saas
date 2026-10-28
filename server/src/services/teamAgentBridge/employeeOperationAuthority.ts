import { isStandardRoutine } from './employeeStandardRoutine';
import { TeamError } from '../TeamCommunicationService';
import { audienceAllows } from './employeeAccess';
import type { BridgeGrant, CommunicationScope } from './contract';

/** Authority to ask for a mutation is independent of who may see its result.
 * The requester comes from the server-verified conversation source, never tool args.
 * Owner-only internal work uses the same Hermes runtime, with its real owner actor.
 */
export function mutationPermission(name: string, args: any): string | null {
  const action = args?.action;
  if (name === 'employee_manage_membership') return action === 'apply' ? 'members.write' : null;
  if (name === 'employee_manage_inventory')
    return action === 'stock_in'
      ? 'inventory.stockIn'
      : action === 'stock_out'
        ? 'inventory.stockOut'
        : null;
  if (name === 'employee_manage_staff') return action === 'set_schedule' ? 'schedules.write' : null;
  if (name === 'employee_manage_hygiene')
    return ['create_task', 'assign_task', 'assign_standard'].includes(action)
      ? 'hygiene.write'
      : null;
  if (name === 'employee_manage_marketing')
    return ['create_discount_rule', 'create_campaign', 'cancel_campaign'].includes(action)
      ? 'marketing.write'
      : null;
  if (name === 'employee_manage_procurement')
    return ['create_purchase_order', 'cancel_order'].includes(action) ? 'purchases.write' : null;
  if (name === 'employee_manage_finance')
    return action === 'record_expense'
      ? args?.type === 'salary' || args?.category === '工资'
        ? 'salary.write'
        : 'finance.write'
      : null;
  if (name === 'employee_manage_operations')
    return action === 'publish_announcement'
      ? 'notifications.write'
      : action === 'review_leave'
        ? 'staff.write'
        : null;
  if (name === 'employee_manage_product')
    return action === 'list_products' ? null : 'products.write';
  if (name === 'employee_manage_training')
    return [
      'create_course',
      'create_checklist',
      'assign_training',
      'assign_published_course',
      'record_result',
    ].includes(action)
      ? 'training.write'
      : null;
  // These are bound to the actual requesting employee by the native handler.
  if (name === 'employee_submit_request')
    return action === 'submit_leave'
      ? 'personal.leave'
      : action === 'report_waste'
        ? 'inventory.stockOut'
        : 'personal.tasks';
  return null;
}

export async function assertOperationRequester(
  db: any,
  grant: BridgeGrant,
  scope: CommunicationScope,
  name: string,
  args: any,
) {
  const permission = mutationPermission(name, args);
  if (!permission) return;
  if (!scope.requesterStaffId || !scope.audienceStaffIds.includes(scope.requesterStaffId))
    throw new TeamError(403, 'EMPLOYEE_OPERATION_REQUESTER_REQUIRED');
  const requester = { ...scope, audienceStaffIds: [scope.requesterStaffId] };
  if (!(await audienceAllows(db, grant, requester, permission)))
    throw new TeamError(403, 'EMPLOYEE_OPERATION_REQUESTER_DENIED');
  if (
    name === 'employee_manage_membership' &&
    args?.action === 'apply' &&
    !(await audienceAllows(db, grant, requester, 'marketing.write'))
  )
    throw new TeamError(403, 'EMPLOYEE_OPERATION_REQUESTER_DENIED');
  if (
    name === 'employee_manage_finance' &&
    args?.action === 'record_expense' &&
    (!args?.paymentSource || args.paymentSource === 'drawer_cash')
  )
    throw new TeamError(403, 'EMPLOYEE_OPERATION_APPROVAL_REQUIRED');
}

/** All referenced records in a write must belong to this store. This is checked
 * after requester authority and before any native side effect, even when an
 * existing handler previously accepted a globally unique record ID.
 */
export async function assertStoreOperationReferences(
  db: any,
  grant: BridgeGrant,
  name: string,
  args: any,
) {
  if (!mutationPermission(name, args)) return;
  const storeId = grant.storeId;
  const requireRecord = async (model: string, where: any) => {
    if (
      !db[model]?.findFirst ||
      !(await db[model].findFirst({ where: { ...where, storeId }, select: { id: true } }))
    )
      throw new TeamError(403, 'EMPLOYEE_OPERATION_REFERENCE_NOT_IN_STORE');
  };
  if (typeof args?.staffId === 'string')
    await requireRecord('staff', { id: args.staffId, status: 'active' });
  if (name === 'employee_manage_product' || name === 'employee_manage_marketing') {
    const ids = [
      ...(typeof args?.productId === 'string' ? [args.productId] : []),
      ...(Array.isArray(args?.productIds) ? args.productIds : []),
    ];
    for (const id of new Set(ids))
      if (typeof id === 'string') await requireRecord('product', { id, deletedAt: null });
    if (typeof args?.mediaAssetId === 'string')
      await requireRecord('mediaAsset', { id: args.mediaAssetId });
  }
  if (name === 'employee_manage_inventory' && typeof args?.inventoryId === 'string')
    await requireRecord('inventory', { id: args.inventoryId });
  if (name === 'employee_manage_hygiene') {
    if (typeof args?.taskId === 'string') await requireRecord('hygieneTask', { id: args.taskId });
    if (typeof args?.areaCode === 'string')
      await requireRecord('hygieneArea', { code: args.areaCode });
  }
  if (name === 'employee_manage_staff' && typeof args?.shift === 'string')
    await requireRecord('shift', { key: args.shift });
  if (name === 'employee_manage_training' && typeof args?.trainingId === 'string')
    await requireRecord('training', { id: args.trainingId });
  if (name === 'employee_manage_operations' && typeof args?.leaveId === 'string')
    await requireRecord('leave', { id: args.leaveId });
  if (name === 'employee_manage_procurement') {
    if (typeof args?.supplierId === 'string')
      await requireRecord('supplier', { id: args.supplierId, isActive: true });
    if (typeof args?.orderId === 'string')
      await requireRecord('purchaseOrder', {
        OR: [{ id: args.orderId }, { orderNumber: args.orderId }],
      });
    for (const item of Array.isArray(args?.items) ? args.items : [])
      if (typeof item?.inventoryId === 'string')
        await requireRecord('inventory', { id: item.inventoryId });
  }
}

/** Write receipts released to an employee context contain no hidden business facts.
 * Read tools retain their existing audience checks. This runs before evidence,
 * model inputs and learned experiences, not as a final-text masking step.
 */
export function operationalAcknowledgement(name: string, args: any, result: any) {
  if (!mutationPermission(name, args)) return result;
  const allowed = [
    'ok',
    'success',
    'code',
    'error',
    'operationRecorded',
    'alreadyRecorded',
    'operationId',
    'orderId',
    'orderNumber',
    'expenseId',
    'leaveId',
    'announcementId',
    'trainingId',
    'courseId',
    'checklistId',
    'productId',
    'status',
    'affectedOrders',
    'draftOnly',
    'approvalRequiredForPlacementOrPayment',
  ];
  return Object.fromEntries(Object.entries(result || {}).filter(([key]) => allowed.includes(key)));
}

/** Content cannot leave a privileged internal context by writing another surface.
 * A fresh employee-facing context must have all actual recipients and no private
 * cost/payroll/HR facts. A private owner loop must hand off, not mask final text.
 */
export async function assertPublicationContext(
  db: any,
  grant: BridgeGrant,
  scope: CommunicationScope,
  name: string,
  args: any,
) {
  if (isStandardRoutine(name, args)) return;
  const storeWide =
    (name === 'employee_manage_operations' && args?.action === 'publish_announcement') ||
    (name === 'employee_manage_training' &&
      ['create_course', 'create_checklist'].includes(args?.action)) ||
    (name === 'employee_manage_marketing' &&
      ['create_discount_rule', 'create_campaign'].includes(args?.action)) ||
    (name === 'employee_manage_product' &&
      (['set_product_image', 'auto_link_media_images'].includes(args?.action) ||
        (args?.action === 'update_product' && !!args?.description)));
  const targeted =
    (name === 'employee_manage_hygiene' &&
      (args?.action === 'create_task' || (args?.action === 'assign_task' && !!args?.note))) ||
    (name === 'employee_manage_training' &&
      ['assign_training', 'record_result'].includes(args?.action));
  const persistentPrivateText =
    (name === 'employee_manage_inventory' &&
      ['stock_in', 'stock_out'].includes(args?.action) &&
      !!args?.note) ||
    (name === 'employee_manage_operations' &&
      args?.action === 'review_leave' &&
      !!args?.rejectionReason);
  const sharedHandover = name === 'employee_submit_request' && args?.action === 'leave_shift_note';
  if (!storeWide && !targeted && !sharedHandover && !persistentPrivateText) return;
  if (targeted && (!args?.staffId || !scope.audienceStaffIds.includes(args.staffId)))
    throw new TeamError(403, 'EMPLOYEE_PUBLICATION_CONTEXT_REQUIRED');
  if (storeWide) {
    const recipients = await db.staff.findMany({
      where: { storeId: grant.storeId, status: 'active' },
      select: { id: true },
    });
    if (!recipients.length || recipients.some((r: any) => !scope.audienceStaffIds.includes(r.id)))
      throw new TeamError(403, 'EMPLOYEE_PUBLICATION_CONTEXT_REQUIRED');
  }
  for (const permission of ['cost.read', 'profit.read', 'salary.read', 'staff.private.read'])
    if (await audienceAllows(db, grant, scope, permission))
      throw new TeamError(403, 'EMPLOYEE_PUBLICATION_CONTEXT_REQUIRED');
}
