import prisma from '../config/database'
import { readPolicyV2 } from './StaffPermissionV2Service'
import { effectiveAccess } from './StaffPermissionV2Core'
import { readStaffAccess } from './StaffPermissionService'

// Read only: never copy historical job titles into authorization policy.
export async function staffProfileRoles(staff: { id: string; storeId: string; user: { role: string } }, db: any = prisma) {
  if (staff.user.role === 'admin') return { accessRole: null, accessRoles: [], accessRoleSelection: '__account__' }
  const policy = await readPolicyV2(staff.storeId, db)
  if (policy?.active) {
    const access = effectiveAccess(policy, staff.id)
    const accessRole = { id: access.id, name: access.name, revision: access.revision }
    // The empty selection is the unassigned fallback, distinct from an
    // explicit basic template (which can be renamed or reconfigured).
    const accessRoleSelection = policy.assignments.find(a => a.staffId === staff.id)?.roleId || ''
    const accessRoles = [{ id: '', name: '普通员工' }, ...policy.roles.map(({ id, name }) => ({ id, name }))]
    return { accessRole, accessRoles, accessRoleSelection }
  }
  const legacy = await readStaffAccess(staff.storeId, db)
  const binding = legacy.assignments.find(a => a.staffId === staff.id)
  const role = legacy.roles.find(r => r.id === binding?.roleId)
  if (binding && (!role || role.baseRole !== staff.user.role)) throw new Error('STAFF_ACCESS_CONFIGURATION_INVALID')
  return {
    accessRoleSelection: role?.id || '__account__',
    accessRole: role ? { id: role.id, name: role.name, revision: legacy.revision } : null,
    accessRoles: legacy.roles.map(({ id, name }) => ({ id, name }))
  }
}
