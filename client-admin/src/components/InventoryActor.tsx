import { useTranslation } from 'react-i18next';
export type InventoryActor = { id: string; name: string; employeeNumber?: string };
export function actorText(actor: InventoryActor | null | undefined, id: string | null | undefined, t: (key: string) => string) {
  return actor?.name ? actor.name + (actor.employeeNumber ? ` (${actor.employeeNumber})` : '') : t(id ? 'inventoryActors.unknown' : 'inventoryActors.unrecorded');
}
export function ActorName({actor, id}: {actor?: InventoryActor | null; id?: string | null}) {
  const {t} = useTranslation();
  const words=actor?.name?.trim().split(/\s+/),shortName=words?.[words.length-1];
  const compact=shortName?shortName+(actor?.employeeNumber?` (${actor.employeeNumber})`:''):actorText(actor,id,t);
  return <span className="break-words" title={actorText(actor,id,t)} aria-label={actorText(actor,id,t)}>{compact}</span>;
}
