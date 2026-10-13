// These self-service capabilities belong to every authenticated employee.
// They never grant access to another employee or to store management.
export const STAFF_BASIC_PERMISSIONS = [
  'personal.profile', 'personal.attendance', 'personal.schedule',
  'personal.salary', 'personal.leave', 'personal.training',
  'personal.rewards', 'personal.tasks', 'personal.messages',
] as const

export function isStaffBasicPermission(key: string): boolean {
  return (STAFF_BASIC_PERMISSIONS as readonly string[]).includes(key)
}

export function canUseStaffPermission(key: string, ready: boolean, role: any, request = false): boolean {
  if (isStaffBasicPermission(key)) return true
  if (!ready) return false
  if (!role) return true
  return role.version === 2
    ? role.modes?.[key] === 'allow' || request && role.modes?.[key] === 'approval'
    : role.permissions?.includes(key) === true
}
