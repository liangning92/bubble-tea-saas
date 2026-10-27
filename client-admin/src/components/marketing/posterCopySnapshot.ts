import { renderActivityPoster, type PosterInput } from '../../../../shared/utils/activityPoster';
import type { ActivityPosterConfig, PosterElementKey } from '../../../../shared/utils/activities';

export const isPriceCopy = (key: PosterElementKey) => ['originalPrice', 'specialPrice', 'savingAmount'].includes(key);
export interface PosterCopySnapshot { text: string; amount: string }
// Read exactly the same resolved copy as the preview, including inherited labels,
// product/spec fallback, activity conditions, weekdays, formatting and zero prices.
export function posterCopySnapshot(activity: PosterInput, config: ActivityPosterConfig, key: PosterElementKey, cardIndex: number | undefined, language: number): PosterCopySnapshot {
    const index = cardIndex ?? 0, capacity = (config.columns || 5) * (config.designConfig?.rows || config.rows || 1);
    const read = (replaceText: boolean, text?: string) => {
        const style = { visible: true, ...(replaceText ? { text } : {}) };
        const cfg: ActivityPosterConfig = { ...config, freeform: true,
            showFields: { ...config.showFields, originalPrice: true, specialPrice: true, savingAmount: true, productName: true, productSubname: true, dayBadge: true, discountTag: true },
            elements: { ...config.elements, [key]: { ...config.elements?.[key], ...style } },
            cardItems: config.cardItems?.map((c, i) => i === index ? { ...c, elements: { ...c.elements, [key]: { ...c.elements?.[key], ...style } } } : c) };
        const html = renderActivityPoster({ ...activity, posterConfig: cfg }, { language, page: Math.floor(index / capacity), day: 1 });
        // Text inspection must not load poster images from a detached document.
        const doc = new DOMParser().parseFromString(html.replace(/<img\b[^>]*>/gi, ''), 'text/html');
        const selector = `[data-element-key="${key}"]${['headline','subheadline','footer'].includes(key) ? '' : `[data-card-index="${index}"]`}`;
        return doc.querySelector(selector)?.textContent || '';
    };
    return { text: read(false), amount: isPriceCopy(key) ? read(true, '{amount}') : '' };
}

export function splitPriceCopy(text: string, amount: string) {
    const at = amount ? text.lastIndexOf(amount) : -1;
    return at < 0 ? { before: text, after: '', hasAmount: false } : { before: text.slice(0, at), after: text.slice(at + amount.length), hasAmount: true };
}

// Amount chips serialize to the existing internal format. Never serialize a price
// shown by the editor as a fixed number, even after select-all, deletion or paste.
export function readPosterCopy(root: Node, withBindings = true): string {
    let copy = '';
    root.childNodes.forEach((node, i) => {
        if (node.nodeType === 3) copy += node.textContent || '';
        else if (node.nodeType === 1) {
            const el = node as HTMLElement;
            if (el.hasAttribute('data-auto-amount')) copy += withBindings ? '{amount}' : el.textContent || '';
            else if (el.tagName === 'BR') copy += '\n';
            else {
                if (i && ['DIV','P'].includes(el.tagName) && !copy.endsWith('\n')) copy += '\n';
                copy += readPosterCopy(el, withBindings);
            }
        }
    });
    return copy;
}
