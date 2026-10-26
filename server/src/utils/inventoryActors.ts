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
  const agents=ids.filter(id=>/^agent:[a-f0-9-]{36}$/i.test(id));
  if(agents.length){
    const prefix='externalAgent.teamBridge.v1.grant.';
    const rows=await db.config.findMany({where:{storeId,key:{in:agents.map(id=>prefix+id.slice(6))}},select:{key:true,value:true}});
    for(const row of rows){try{const g=JSON.parse(row.value),id='agent:'+g.agentId;if(g.storeId===storeId&&row.key===prefix+g.agentId&&agents.includes(id)&&typeof g.displayName==='string'&&g.displayName.trim()&&g.displayName.length<=64)result.set(id,{id,name:g.displayName,employeeNumber:''})}catch{}}
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
