// The active permission assignment is authoritative. Job titles and client
// headers never appoint a manager; administrators retain their existing access.
export function hasManagementAccess(systemRole: string, access: {version?: number; id?: string} | null | undefined): boolean {
  return systemRole === 'admin' || (access?.version === 2 ? access.id === 'manager' : systemRole === 'manager')
}
