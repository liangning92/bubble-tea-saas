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

/** A count can be shared by several employees; show every recorded counter once. */
export function CountOperators({items}: {items: Array<{countedBy?: string | null; countedByActor?: InventoryActor | null}>}) {
  const {t}=useTranslation();
  const people=[...new Map(items.filter(item=>item.countedBy).map(item=>[item.countedByActor?.id || item.countedBy!,item])).values()];
  return <p className="text-sm text-gray-500 break-words">{t('inventoryActors.counter')}: {people.length?people.map((person,index)=><span key={person.countedByActor?.id || person.countedBy}>{index>0?' · ':''}<ActorName actor={person.countedByActor} id={person.countedBy}/></span>):t('inventoryActors.unrecorded')}</p>;
}
