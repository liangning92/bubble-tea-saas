type ApprovalActor = { id: string; staffId?: string | null; role: string }

// Only the authenticated system admin role can approve its own refund.
// Employee role names and approval permissions do not grant this exception.
export function blocksSelfApproval(actor: ApprovalActor, applicantId: string, action: string): boolean {
  const own = applicantId === actor.id || (!!actor.staffId && applicantId === actor.staffId)
  return own && !(actor.role === 'admin' && action === 'orders.refund')
}
