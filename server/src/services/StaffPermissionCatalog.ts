export type StaffBaseRole = 'manager' | 'cashier' | 'staff'
const all: StaffBaseRole[] = ['manager', 'cashier', 'staff']
const pos: StaffBaseRole[] = ['manager', 'cashier']
const management: StaffBaseRole[] = ['manager']
export const STAFF_PERMISSION_CATALOG = [
  {key:'dashboard.read',group:'dashboard',roles:management},
  {key:'products.read',group:'products',roles:all},
  {key:'products.write',group:'products',roles:management},
  {key:'prices.write',group:'products',roles:management},
  {key:'inventory.read',group:'inventory',roles:all},
  {key:'inventory.write',group:'inventory',roles:management},
  {key:'inventory.count',group:'inventory',roles:all},
  {key:'inventory.stockIn',group:'inventory',roles:all},
  {key:'inventory.stockOut',group:'inventory',roles:all},
  {key:'purchases.read',group:'inventory',roles:management},
  {key:'purchases.write',group:'inventory',roles:management},
  {key:'orders.read',group:'pos',roles:pos},
  {key:'orders.create',group:'pos',roles:pos},
  {key:'orders.refund',group:'pos',roles:management},
  {key:'orders.cancel',group:'pos',roles:pos},
  {key:'orders.status',group:'pos',roles:pos},
  {key:'pos.shift',group:'pos',roles:pos},
  {key:'pos.cash',group:'pos',roles:pos},
  {key:'pos.expense',group:'pos',roles:pos},
  {key:'members.read',group:'members',roles:pos},
  {key:'members.write',group:'members',roles:pos},
  {key:'marketing.read',group:'members',roles:management},
  {key:'marketing.write',group:'members',roles:management},
  {key:'finance.read',group:'finance',roles:management},
  {key:'finance.write',group:'finance',roles:management},
  {key:'staff.read',group:'staff',roles:management},
  {key:'staff.write',group:'staff',roles:management},
  {key:'attendance.read',group:'staff',roles:management},
  {key:'attendance.write',group:'staff',roles:management},
  {key:'schedules.read',group:'staff',roles:management},
  {key:'schedules.write',group:'staff',roles:management},
  {key:'salary.read',group:'staff',roles:management},
  {key:'salary.write',group:'staff',roles:management},
  {key:'deposits.read',group:'staff',roles:management},
  {key:'deposits.write',group:'staff',roles:management},
  {key:'rewards.read',group:'staff',roles:management},
  {key:'rewards.write',group:'staff',roles:management},
  {key:'training.read',group:'staff',roles:management},
  {key:'training.write',group:'staff',roles:management},
  {key:'hygiene.read',group:'hygiene',roles:management},
  {key:'hygiene.write',group:'hygiene',roles:management},
  {key:'channels.read',group:'channels',roles:management},
  {key:'channels.write',group:'channels',roles:management},
  {key:'notifications.read',group:'other',roles:management},
  {key:'notifications.write',group:'other',roles:management},
  {key:'personal.profile',group:'personal',roles:all},
  {key:'personal.attendance',group:'personal',roles:all},
  {key:'personal.schedule',group:'personal',roles:all},
  {key:'personal.salary',group:'personal',roles:all},
  {key:'personal.leave',group:'personal',roles:all},
  {key:'personal.training',group:'personal',roles:all},
  {key:'personal.rewards',group:'personal',roles:all},
  {key:'personal.tasks',group:'personal',roles:all},
  {key:'personal.messages',group:'personal',roles:all}
] as const
export function defaultStaffPermissions(baseRole: StaffBaseRole): string[] {
  return STAFF_PERMISSION_CATALOG.filter(p => (p.roles as readonly string[]).includes(baseRole)).map(p => p.key)
}

// Return one permission per protected business request. Unclassified requests
// fail closed for custom roles; existing unassigned system roles stay unchanged.
export function staffPermissionForRequest(method: string, originalUrl: string, user?: {role:string;staffId:string;accessRole?:{permissions:string[]}|null}): string | null {
  const path = originalUrl.split('?')[0].replace(/^\/api(?=\/|$)/,'')
  const read = ['GET','HEAD','OPTIONS'].includes(method)
  if (/^\/staff-permissions\/me$/.test(path) || /^\/auth(?:\/|$)/.test(path)) return null
  // Configuration and hardware lists bootstrap POS; existing role checks and
  // secret filtering remain authoritative. Writes are not exempt.
  if (read && /^\/(config|receipt-templates|hardware|shifts)(?:\/|$)/.test(path)) return null
  if (/^\/staff\/?$/.test(path) && method==='POST') return '__administrator_only__'
  if (/^\/staff\/[^/]+\/(role|reset-password)$/.test(path)) return '__administrator_only__'
  // Durable paid receipts must remain ingestible after a role is restricted;
  // their dedicated routes preserve/audit receipts before validating the sale.
  if (method==='POST' && /^\/orders\/received-receipts$/.test(path)) return null
  if (/^\/sync\/order$/.test(path)) return 'orders.create'
  if (/^\/queue(?:\/|$)/.test(path)) return read ? 'orders.read' : 'orders.status'
  if (/^\/upload(?:\/|$)/.test(path)) return null
  if (/^\/inventory\/stock-in(?:\/|$)/.test(path) && !read) return 'inventory.stockIn'
  if (/^\/inventory\/stock-out(?:\/|$)/.test(path) && !read) return 'inventory.stockOut'
  if (/^\/product-price(?:\/|$)/.test(path)) return 'prices.write'
  if (/^\/expenses\/?$/.test(path) && user?.role === 'cashier') return 'pos.expense'
  if (/^\/staff\/attendance$/.test(path) && method==='POST') return 'personal.attendance'
  if (/^\/staff\/attendance\/(today|history)$/.test(path)) return 'personal.attendance'
  if (/^\/attendance-qr\/verify$/.test(path)) return 'personal.attendance'
  if (/^\/attendance-rules$/.test(path) && read) return 'personal.attendance'
  if (/^\/overtime\/(apply|cancel)(?:\/|$)/.test(path)) return 'personal.attendance'
  if (/^\/shift-swap\/(request|apply|respond|cancel)(?:\/|$)/.test(path)) return 'personal.schedule'
  if (/^\/leave-types$/.test(path) && read) return 'personal.leave'
  if (/^\/leave\/(apply|balance|cancel)(?:\/|$)/.test(path) && !/^\/leave\/balance\/[^/]+/.test(path)) return 'personal.leave'
  if (/^\/reimbursement-types$/.test(path) && read) return 'personal.profile'
  if (/^\/reimbursement\/(apply|upload|cancel)(?:\/|$)/.test(path)) return 'personal.profile'
  if (/^\/staff-correction$/.test(path) && method==='POST') return 'personal.attendance'
  if (/^\/training\/categories$/.test(path) && read) return 'personal.training'
  if (/^\/staff-points\/(rewards\/available|rules|redemption|redeem)$/.test(path) && (read || !/\/rules$/.test(path))) return read && user?.accessRole?.permissions.includes('rewards.read') ? 'rewards.read' : 'personal.rewards'
  if (user?.staffId && ['/staff-points/balance/','/staff-points/history/'].some(prefix=>path===prefix+user.staffId)) return 'personal.rewards'
  if (read && user?.accessRole?.permissions.includes('hygiene.read') && /^\/hygiene\/tasks\/[^/]+(?:\/logs)?$/.test(path)) return 'hygiene.read'
  if (/^\/hygiene\/tasks\/[^/]+(?:\/(start|complete|skip|issue|logs))?$/.test(path) && !/\/(pending|overdue|generate|temporary|my)$/.test(path)) return 'personal.tasks'
  if (method==='POST' && /^\/overtime\/?$/.test(path)) return 'personal.attendance'
  if (method==='POST' && /^\/shift-swap\/?$/.test(path)) return 'personal.schedule'
  if (read && /^\/deposit\/rules$/.test(path)) return 'personal.salary'
  if (read && /^\/staff-management\/training\/[^/]+$/.test(path) && path.endsWith('/'+user?.staffId)) return 'personal.training'
  if ((read && /^\/notifications\/?$/.test(path)) || /^\/notifications\/[^/]+\/read$/.test(path) || /^\/notifications\/mark-all-read$/.test(path)) return user?.accessRole?.permissions.includes('notifications.read') ? 'notifications.read' : 'personal.messages'
  if (read && /^\/announcement(?:\/list)?$/.test(path)) return user?.accessRole?.permissions.includes('notifications.read') ? 'notifications.read' : 'personal.messages'
  if (/^\/staff\/(profile|me)(?:\/|$)/.test(path)) return 'personal.profile'
  if (/^\/staff\/salary\/my(?:\/|$)/.test(path)) return 'personal.salary'
  if (/^\/staff\/attendance\/(my|today|check-in|check-out)(?:\/|$)/.test(path)) return 'personal.attendance'
  if (/^\/staff\/schedule\/my(?:\/|$)/.test(path)) return 'personal.schedule'
  if (/\/(my|mine)(?:\/|$)/.test(path)) {
    const personal = [['salary','salary'],['deposit','salary'],['attendance','attendance'],['overtime','attendance'],['correction','attendance'],['schedule','schedule'],['shift-swap','schedule'],['leave','leave'],['training','training'],['point','rewards'],['reward','rewards'],['hygiene','tasks'],['notification','messages'],['announcement','messages'],['reimbursement','profile']] as const
    for (const [prefix,key] of personal) if (path.includes(prefix)) return 'personal.'+key
  }
  if (/^\/training\/library(?:\/documents\/[^/]+)?$/.test(path) && read) return user?.accessRole?.permissions.includes('training.read') ? 'training.read' : 'personal.training'
  if (path === '/marketing/activity-prices' && read) return 'products.read'
  if (path === '/marketing/tv-screen/trigger-lottery' && method === 'POST') return 'orders.create'
  if (/^\/expenses\/categories$/.test(path) && read) return null
  if (/^\/expenses\/pos(?:\/|$)/.test(path)) return 'pos.expense'
  if (/^\/pos-cash\/shifts(?:\/|$)/.test(path)) return 'pos.shift'
  if (/^\/pos-cash(?:\/|$)/.test(path)) return 'pos.cash'
  if (/^\/(orders|payments)(?:\/|$)/.test(path)) {
    if (/refund/.test(path)) return 'orders.refund'
    if (read) return 'orders.read'
    if (/refund/.test(path)) return 'orders.refund'
    if (/cancel|delete/.test(path) || method==='DELETE') return 'orders.cancel'
    if (/status|pickup|complete|receive/.test(path)) return 'orders.status'
    return 'orders.create'
  }
  const resources: Array<[RegExp,string]> = [
    [/^\/(revenue|reports|product-analysis)(?:\/|$)/,'dashboard'],
    [/^\/(product-price)(?:\/|$)/,'prices'],
    [/^\/(products|categories|addons)(?:\/|$)/,'products'],
    [/^\/inventory-counts(?:\/|$)/,read?'inventory':'inventory.count'],
    [/^\/(inventory|bom|material|process-recipes)(?:\/|$)/,'inventory'],
    [/^\/(purchase-orders|suppliers)(?:\/|$)/,'purchases'],
    [/^\/members(?:\/|$)/,'members'],
    [/^\/(marketing|points-rules|rewards)(?:\/|$)/,'marketing'],
    [/^\/(finance|expenses|reimbursement|reimbursement-types)(?:\/|$)/,'finance'],
    [/^\/staff\/attendance(?:\/|$)/,'attendance'],
    [/^\/staff\/schedule(?:\/|$)/,'schedules'],
    [/^\/(attendance-rules|attendance-qr|staff-correction|overtime)(?:\/|$)/,'attendance'],
    [/^\/(shift-swap|shifts)(?:\/|$)/,'schedules'],
    [/^\/(leave|leave-types)(?:\/|$)/,'attendance'],
    [/^\/salaries\/adjustments(?:\/|$)/,'rewards'],
    [/^\/(salaries|staff-salary)(?:\/|$)/,'salary'],
    [/^\/deposit(?:\/|$)/,'deposits'],
    [/^\/staff-points(?:\/|$)/,'rewards'],
    [/^\/training(?:\/|$)/,'training'],
    [/^\/(staff|staff-management)(?:\/|$)/,'staff'],
    [/^\/hygiene(?:\/|$)/,'hygiene'],
    [/^\/(channels|delivery)(?:\/|$)/,'channels'],
    [/^\/(notifications|messages|announcement)(?:\/|$)/,'notifications']
  ]
  for (const [pattern,key] of resources) if(pattern.test(path)) return key==='inventory.count' ? key : key+'.'+(read?'read':'write')
  return '__unclassified__'
}
