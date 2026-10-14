import { useTranslation } from 'react-i18next';
export type InventoryActor = { id: string; name: string; employeeNumber?: string };
export function actorText(actor: InventoryActor | null | undefined, id: string | null | undefined, t: (key: string) => string) {
  return actor?.name ? actor.name + (actor.employeeNumber ? ` (${actor.employeeNumber})` : '') : t(id ? 'inventoryActors.unknown' : 'inventoryActors.unrecorded');
}
export function ActorName({actor, id}: {actor?: InventoryActor | null; id?: string | null}) {
  const {t} = useTranslation(); return <span className="break-words">{actorText(actor, id, t)}</span>;
}
