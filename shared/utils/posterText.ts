import type { PosterElementStyle } from './activities';

export const PRICE_TEXT_KEYS = ['originalPrice', 'specialPrice', 'savingAmount'] as const;
export function posterPriceLabels(language = 2) {
    return [
        { originalPrice: '原价', specialPrice: '活动价', savingAmount: '节省' },
        { originalPrice: 'Normal price', specialPrice: 'Special price', savingAmount: 'Save' },
        { originalPrice: 'Harga Normal', specialPrice: 'Harga Spesial', savingAmount: 'Hemat' },
    ][language] || { originalPrice: 'Harga Normal', specialPrice: 'Harga Spesial', savingAmount: 'Hemat' };
}
// Replace once, before HTML escaping. User text is never interpreted as markup or code.
export function posterTextContent(style: PosterElementStyle, value: string, amount = '', label = '') {
    return style.text === undefined ? value : style.text.replace(/\{(value|amount|label)\}/g, (_, key: string) => ({ value, amount, label }[key] || ''));
}
// Script-free TV/preview documents cannot measure DOM text. Conservative glyph advances
// provide a shared fit on the server, React and offline player, including CJK and wide letters.
// Newlines are explicit; automatic price wrapping must never spill into the next price row.
export function fitPosterPriceText(text: string, style: PosterElementStyle, width: number, height: number): number {
    const size = Math.max(0, style.fontSize ?? 22), padding = Math.max(0, style.padding || 0), stroke = Math.max(0, style.strokeWidth || 0), border = Math.max(0, style.borderWidth || 0);
    const lines = text.split(/\r?\n/), tracking = Math.max(0, style.letterSpacing || 0);
    const widths = lines.map(line => {
        const chars = Array.from(style.textTransform === 'uppercase' ? line.toUpperCase() : style.textTransform === 'lowercase' ? line.toLowerCase() : line);
        const em = chars.reduce((sum, c) => sum + (style.fontFamily === 'mono' && c.codePointAt(0)! < 256 ? .65 : /[MWmw@%&]/.test(c) ? 1.1 : /[A-Z]/.test(c) ? .85 : /[0-9]/.test(c) ? .72 : /[a-z]/.test(c) ? .72 : /\s/.test(c) ? .4 : /[.,:;!'|]/.test(c) ? .4 : 1.2), 0);
        return { em, spacing: Math.max(0, chars.length - 1) * tracking };
    });
    const innerWidth = Math.max(0, width - 2 * (padding + stroke + border) - (style.italic ? size * .25 : 0));
    const maxWidthSize = Math.min(...widths.map(w => w.em ? Math.max(0, innerWidth - w.spacing) / w.em : size));
    const maxHeightSize = Math.max(0, height - 2 * (padding + stroke + border)) / (lines.length * Math.max(1.2, style.lineHeight || 1.2));
    return Math.max(0, Math.min(size, maxWidthSize, maxHeightSize));
}
