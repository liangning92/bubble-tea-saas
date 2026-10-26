import type { ActivityPosterConfig, PosterElementKey, PosterElementStyle, PosterElements } from './activities';
export const POSTER_ELEMENT_KEYS: PosterElementKey[] = ['headline', 'subheadline', 'grid', 'card', 'image', 'logo', 'productName', 'productSubname', 'priceBox', 'originalPrice', 'specialPrice', 'savingAmount', 'dayBadge', 'discountTag', 'highlight', 'footer'];
export const CANVAS_ELEMENTS: PosterElementKey[] = ['headline', 'subheadline', 'grid', 'footer'];
export const REFERENCE_ELEMENTS: PosterElements = {
    headline: { x: 5, y: 5, width: 90, height: 10, fontSize: 92, fontWeight: 800, color: '#ff5d89', textAlign: 'center', lineHeight: 1.05 },
    subheadline: { x: 20, y: 15, width: 60, height: 7, fontSize: 52, fontWeight: 700, color: '#ff5d89', textAlign: 'center' },
    grid: { x: 1, y: 24.5, width: 98, height: 64 },
    card: { x: 0, y: 0, width: 100, height: 100, backgroundColor: '#121214', borderRadius: 14 },
    image: { x: 0, y: 0, width: 100, height: 88.5, borderRadius: 14, objectFit: 'cover', objectPositionX: 50, objectPositionY: 50, zIndex: 2 },
    logo: { x: 35, y: 40, width: 30, height: 18, visible: false, zIndex: 3 },
    productName: { x: 5, y: 5, width: 90, height: 22, fontSize: 34, fontWeight: 800, color: '#ff5d89', strokeColor: '#ffffff', strokeWidth: 4, textAlign: 'center', lineHeight: 1.2, zIndex: 4 },
    productSubname: { x: 5, y: 26, width: 90, height: 8, fontSize: 20, color: '#ffffff', textAlign: 'center', visible: false, zIndex: 4 },
    priceBox: { x: 0, y: 77, width: 100, height: 11.5, backgroundColor: 'transparent', zIndex: 3 },
    originalPrice: { x: 4, y: 78, width: 93, height: 3, fontSize: 17, fontWeight: 400, color: '#111111', strokeColor: '#ffffff', strokeWidth: 1, textAlign: 'left', zIndex: 4 },
    specialPrice: { x: 4, y: 81, width: 93, height: 3.5, fontSize: 22, fontWeight: 800, color: '#ff5d89', strokeColor: '#ffffff', strokeWidth: 2, textAlign: 'left', zIndex: 4 },
    savingAmount: { x: 4, y: 84, width: 93, height: 3.5, fontSize: 22, fontWeight: 800, color: '#ff5d89', strokeColor: '#ffffff', strokeWidth: 2, textAlign: 'left', zIndex: 4 },
    dayBadge: { x: 0, y: 88.5, width: 100, height: 11.5, fontSize: 54, fontWeight: 400, fontFamily: 'serif', color: '#ffffff', backgroundColor: '#a3a3a3', textAlign: 'center', zIndex: 4 },
    discountTag: { x: 72, y: 1, width: 26, height: 7, fontSize: 26, fontWeight: 800, color: '#ffffff', backgroundColor: '#ff5d89', textAlign: 'center', visible: false, zIndex: 5 },
    highlight: { x: -2, y: -1.5, width: 104, height: 104.5, borderWidth: 10, borderColor: '#ff5d89', backgroundColor: '#ff5d89', borderRadius: 18, zIndex: 1 },
    footer: { x: 1, y: 92, width: 98, height: 6, fontSize: 18, color: '#cbd5e1', textAlign: 'center', visible: false },
};
export interface PosterRect {
    x: number;
    y: number;
    width: number;
    height: number;
}
export interface PosterLayer {
    key: PosterElementKey;
    cardIndex?: number;
    rect: PosterRect;
    owner: PosterRect;
    style: PosterElementStyle;
}
export interface PosterImageVariant {
    url: string;
    width?: number;
    height?: number;
}
const bounded = (n: number | undefined, f: number, min = -100, max = 300) => Number.isFinite(n) ? Math.max(min, Math.min(max, n!)) : f;
export function posterElementStyle(cfg: ActivityPosterConfig, key: PosterElementKey, cardIndex?: number): PosterElementStyle {
    const card = cardIndex === undefined ? undefined : cfg.cardItems?.[cardIndex];
    return { ...REFERENCE_ELEMENTS[key], ...cfg.elements?.[key], ...card?.elements?.[key] };
}
export function posterLayout(cfg: ActivityPosterConfig, count: number, aspectRatio = 16 / 9): {
    width: number;
    height: number;
    layers: PosterLayer[];
    cards: PosterRect[];
} {
    const height = cfg.canvasHeight || 1080, width = cfg.canvasWidth || Math.round(height * aspectRatio), paddingX=bounded(cfg.designConfig?.containerPaddingX,0,0,200),paddingY=bounded(cfg.designConfig?.containerPaddingY,0,0,200),root = { x: paddingX, y: paddingY, width: Math.max(1,width-paddingX*2), height: Math.max(1,height-paddingY*2) };
    const rect = (owner: PosterRect, s: PosterElementStyle): PosterRect => ({ x: owner.x + owner.width * bounded(s.x, 0) / 100, y: owner.y + owner.height * bounded(s.y, 0) / 100, width: owner.width * bounded(s.width, 100, 0) / 100, height: owner.height * bounded(s.height, 100, 0) / 100 });
    const layers: PosterLayer[] = CANVAS_ELEMENTS.map(key => ({ key, owner: root, style: posterElementStyle(cfg, key), rect: rect(root, posterElementStyle(cfg, key)) }));
    const grid = layers.find(l => l.key === 'grid')!.rect, rows = Math.max(1, cfg.designConfig?.rows || cfg.rows || 1), columns = Math.max(1, Math.min(cfg.columns || 5, Math.ceil(Math.max(count, 1) / rows))), gapX = cfg.designConfig?.cardGapX ?? cfg.designConfig?.cardGap ?? 10, gapY = cfg.designConfig?.cardGapY ?? cfg.designConfig?.cardGap ?? 10;
    const gridPadding = bounded(posterElementStyle(cfg, 'grid').padding, 0, 0, 300), innerGrid = { x: grid.x + gridPadding, y: grid.y + gridPadding, width: Math.max(1, grid.width - 2 * gridPadding), height: Math.max(1, grid.height - 2 * gridPadding) };
    const cellWidth = Math.max(1, (innerGrid.width - gapX * (columns - 1)) / columns), cellHeight = Math.max(1, (innerGrid.height - gapY * (rows - 1)) / rows), cards: PosterRect[] = [];
    for (let i = 0; i < count; i++) {
        const cell = { x: innerGrid.x + (i % columns) * (cellWidth + gapX), y: innerGrid.y + Math.floor(i / columns) * (cellHeight + gapY), width: cellWidth, height: cellHeight }, style = posterElementStyle(cfg, 'card', i), card = rect(cell, style);
        cards.push(card);
        layers.push({ key: 'card', cardIndex: i, style, owner: cell, rect: card });
        const padding = bounded(style.padding, 0, 0, 300), content = { x: card.x + padding, y: card.y + padding, width: Math.max(1, card.width - padding * 2), height: Math.max(1, card.height - padding * 2) };
        for (const key of POSTER_ELEMENT_KEYS.filter(k => !CANVAS_ELEMENTS.includes(k) && k !== 'card')) {
            const style = posterElementStyle(cfg, key, i);
            layers.push({ key, cardIndex: i, style, owner: content, rect: rect(content, style) });
        }
    }
    return { width, height, layers, cards };
}
export function choosePosterImage(product: {
    image?: string;
    imageVariants?: PosterImageVariant[];
    image16x9?: string;
    image9x16?: string;
} | undefined, card: {
    imageUrl?: string;
    imageMode?: 'auto' | 'manual';
}, ratio: number): PosterImageVariant | undefined {
    const variants = (product?.imageVariants || []).filter(v => v.url), manual = card.imageMode === 'manual' || (!card.imageMode && card.imageUrl && card.imageUrl !== product?.image && !variants.some(v => v.url === card.imageUrl));
    if (manual && card.imageUrl)
        return { url: card.imageUrl };
    const measured = variants.filter(v => v.width && v.height);
    if (measured.length)
        return measured.slice().sort((a, b) => Math.abs(Math.log((a.width! / a.height!) / ratio)) - Math.abs(Math.log((b.width! / b.height!) / ratio)) || (b.width! * b.height!) - (a.width! * a.height!))[0];
    const url = ratio < .85 ? product?.image9x16 : ratio > 1.2 ? product?.image16x9 : undefined;
    return url ? { url } : { url: card.imageUrl || product?.image || variants[0]?.url || '' };
}
