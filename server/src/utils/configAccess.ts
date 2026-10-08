// Internal receipts and job state must never be editable through generic settings.
export const INTERNAL_CONFIG_PREFIXES = ['staff.access.', 'receipts.pos.', 'member.balance.', 'import.', 'queue.', 'expenses.recurring', 'expenses.generated.']
export const internalConfigWhere = { AND: INTERNAL_CONFIG_PREFIXES.map(prefix => ({key:{not:{startsWith:prefix}}})) }
export const isInternalConfig = (key:unknown):boolean => typeof key === 'string' && INTERNAL_CONFIG_PREFIXES.some(prefix=>key.startsWith(prefix))
export const isSecretConfig = (key:unknown):boolean => typeof key === 'string' && (key === 'apiSettings' || key === 'api.apiSettings' || key.startsWith('integration.') || key.startsWith('xendit.'))
