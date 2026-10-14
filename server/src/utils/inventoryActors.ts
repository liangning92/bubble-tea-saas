/** Resolve only staff belonging to the record's store; never return contact/account data. */
export async function loadInventoryActors(db: any, storeId: string | undefined, actorIds: Array<string | null | undefined>) {
  const ids = [...new Set(actorIds.filter((id): id is string => typeof id === 'string' && !!id))];
  const result = new Map<string, { id: string; name: string; employeeNumber: string }>();
  if (!storeId || !ids.length) return result;
  const staff = await db.staff.findMany({ where: { storeId, OR: [{ id: { in: ids } }, { userId: { in: ids } }] }, select: { id: true, userId: true, name: true, employeeNumber: true } });
  for (const person of staff) {
    const actor = { id: person.id, name: person.name, employeeNumber: person.employeeNumber };
    result.set(person.id, actor); result.set(person.userId, actor);
  }
  return result;
}
export function inventoryLogActorId(log: { staffId?: string | null; reason?: string; note?: string | null }) {
  if (log.staffId) return log.staffId;
  if (log.reason === 'count_adjustment') {
    try { const note = JSON.parse(log.note || ''); return typeof note.actor === 'string' ? note.actor : null; } catch { return null; }
  }
  return null;
}
