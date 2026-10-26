import {createPortal} from 'react-dom';
import { useRef, useState, type PointerEvent } from 'react';
import type { ActivityPosterConfig, PosterElementStyle } from '../../../../shared/utils/activities';
import { posterLayout, CANVAS_ELEMENTS } from '../../../../shared/utils/posterLayout';
import type { PosterSelection } from './PosterElementInspector';
export function PosterCanvasEditor({ html, value, selection, onSelect, onBegin, onDirectChange, aspectRatio, title, language = 0, page = 0 }: {
    html: string;
    value: ActivityPosterConfig;
    selection: PosterSelection;
    onSelect: (s: PosterSelection) => void;
    onBegin: () => void;
    onDirectChange: (v: ActivityPosterConfig) => void;
    aspectRatio: string;
    title: string;
    language?: number;
    page?: number;
}) {
    const [expanded,setExpanded]=useState(false);
    const [editing, setEditing] = useState(false), drag = useRef<any>(null), layout = posterLayout(value, Math.min(value.cardItems?.length || 0, (value.columns || 5) * (value.designConfig?.rows || value.rows || 1))), selected = layout.layers.find(l => l.key === selection.key && l.cardIndex === (CANVAS_ELEMENTS.includes(selection.key) ? undefined : selection.cardIndex ?? 0));
    const begin = (e: PointerEvent<SVGElement>, resize = false) => { if (!selected)
        return; e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); onBegin(); const svg = e.currentTarget.ownerSVGElement!, box = svg.getBoundingClientRect(); drag.current = { x: e.clientX, y: e.clientY, box, layout, value, selected, selection, resize }; };
    const move = (e: PointerEvent<SVGElement>) => { const d = drag.current; if (!d)
        return; const dx = (e.clientX - d.x) / d.box.width * d.layout.width / d.selected.owner.width * 100, dy = (e.clientY - d.y) / d.box.height * d.layout.height / d.selected.owner.height * 100, original = d.selected.style, round = (n: number) => Math.round(n * 100) / 100, patch: PosterElementStyle = d.resize ? { width: round(Math.max(1, Math.min(300, (original.width ?? 100) + dx))), height: round(Math.max(1, Math.min(300, (original.height ?? 100) + dy))) } : { x: round(Math.max(-100, Math.min(200, (original.x ?? 0) + dx))), y: round(Math.max(-100, Math.min(200, (original.y ?? 0) + dy))) }; if (d.selection.cardIndex === undefined || CANVAS_ELEMENTS.includes(d.selection.key))
        onDirectChange({ ...d.value, elements: { ...d.value.elements, [d.selection.key]: { ...d.value.elements?.[d.selection.key], ...patch } } });
    else
        onDirectChange({ ...d.value, cardItems: d.value.cardItems?.map((c: any, i: number) => i === d.selection.cardIndex ? { ...c, elements: { ...c.elements, [d.selection.key]: { ...c.elements?.[d.selection.key], ...patch } } } : c) }); };
    const ratio = Number(aspectRatio.split('/')[0]) / Number(aspectRatio.split('/')[1]), width = ratio < 1.2 ? `min(100%, ${75 * ratio}vh)` : '100%';
    return <div className="space-y-2"><button type="button" className="btn-secondary text-xs" onClick={()=>setExpanded(true)}>{["放大预览","Expand preview","Perbesar pratinjau"][language]}</button>{expanded&&createPortal(<div role="dialog" aria-modal="true" aria-label={title} className="fixed inset-0 z-[100] bg-slate-950 flex flex-col p-4 gap-3" onKeyDown={e=>{if(e.key==='Escape')setExpanded(false)}}><button type="button" autoFocus className="self-end rounded-lg bg-white px-4 py-2 text-sm" onClick={()=>setExpanded(false)}>{["关闭预览","Close preview","Tutup pratinjau"][language]}</button><iframe title={title+" · full"} sandbox="" className="w-full flex-1 min-h-0 border-0" srcDoc={html}/></div>,document.body)}{value.freeform && page === 0 && <label className="flex gap-2 items-center text-xs text-gray-600"><input type="checkbox" checked={editing} onChange={e => setEditing(e.target.checked)}/>{['画布选择 / 拖动 / 缩放', 'Select / drag / resize', 'Pilih / geser / ubah ukuran'][language]}</label>}<div className="relative mx-auto rounded-xl shadow-lg overflow-hidden bg-slate-950" style={{ width, aspectRatio }}><iframe title={title} sandbox="" className="block w-full h-full border-0" srcDoc={html}/>{editing && value.freeform && page === 0 && <svg className="absolute inset-0 w-full h-full touch-none" viewBox={`0 0 ${layout.width} ${layout.height}`} preserveAspectRatio="xMidYMid meet" aria-label="Poster canvas editor">
 {layout.layers.filter(l => !['grid', 'card', 'highlight', 'priceBox'].includes(l.key) && l.style.visible !== false).sort((a, b) => (a.style.zIndex || 0) - (b.style.zIndex || 0)).map((layer, i) => <rect key={i} x={layer.rect.x} y={layer.rect.y} width={layer.rect.width} height={layer.rect.height} fill="transparent" onPointerDown={e => { e.preventDefault(); onSelect({ key: layer.key, cardIndex: layer.cardIndex }); }}/>)}
 {selected && <><rect x={selected.rect.x} y={selected.rect.y} width={selected.rect.width} height={selected.rect.height} fill="transparent" stroke="#38bdf8" strokeWidth={3} vectorEffect="non-scaling-stroke" onPointerDown={e => begin(e)} onPointerMove={move} onPointerCancel={() => { drag.current = null; }} onPointerUp={() => { drag.current = null; }}/><rect role="button" aria-label="Resize selected element" x={selected.rect.x + selected.rect.width - 12} y={selected.rect.y + selected.rect.height - 12} width={24} height={24} fill="#38bdf8" stroke="white" strokeWidth={2} onPointerDown={e => begin(e, true)} onPointerMove={move} onPointerCancel={() => { drag.current = null; }} onPointerUp={() => { drag.current = null; }}/></>}
 </svg>}</div></div>;
}
