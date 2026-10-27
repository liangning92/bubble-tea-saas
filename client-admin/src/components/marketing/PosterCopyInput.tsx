import { useLayoutEffect, useRef } from 'react';
import { readPosterCopy, splitPriceCopy, type PosterCopySnapshot } from './posterCopySnapshot';

export function PosterCopyInput({ snapshot, label, amountLabel, onChange }: {
    snapshot: PosterCopySnapshot; label: string; amountLabel: string; onChange: (text: string) => void;
}) {
    const root = useRef<HTMLDivElement>(null);
    const { text, amount } = snapshot;
    const parts = splitPriceCopy(text, amount);
    const chip = () => {
        const span = document.createElement('span');
        span.contentEditable = 'false'; span.dataset.autoAmount = 'true'; span.draggable = false;
        span.className = 'rounded bg-pink-100 px-1 text-gray-900'; span.title = amountLabel;
        span.setAttribute('aria-label', `${amountLabel}: ${amount}`); span.textContent = amount;
        return span;
    };
    useLayoutEffect(() => {
        const el = root.current;
        if (!el) return;
        const chips = el.querySelectorAll('[data-auto-amount]');
        if (readPosterCopy(el, false) === text && chips.length === (parts.hasAmount ? 1 : 0) && (!chips.length || chips[0].textContent === amount)) return;
        el.replaceChildren(document.createTextNode(parts.before), ...(parts.hasAmount ? [chip(), document.createTextNode(parts.after)] : []));
    }, [text, amount, amountLabel]);
    const input = () => {
        const el = root.current;
        if (!el) return;
        if (!el.querySelector('[data-auto-amount]')) {
            const plain = readPosterCopy(el, false), pasted = splitPriceCopy(plain, amount);
            if (pasted.hasAmount) {
                el.replaceChildren(document.createTextNode(pasted.before), chip(), document.createTextNode(pasted.after));
                const selection = window.getSelection(), range = document.createRange();
                range.selectNodeContents(el); range.collapse(false); selection?.removeAllRanges(); selection?.addRange(range);
            } else {
                if (el.textContent && !/\s$/.test(el.textContent)) el.appendChild(document.createTextNode(' '));
                el.appendChild(chip());
            }
        }
        let next = readPosterCopy(el);
        if (next.length > 1000) {
            // Preserve the binding when limiting a large paste.
            const before = readPosterCopy(el, false).replace(amount, '').slice(0, 980);
            el.replaceChildren(document.createTextNode(before), chip()); next = before + '{amount}';
        }
        onChange(next);
    };
    if (!amount) return <textarea aria-label={label} className="input w-full" rows={3} maxLength={1000} value={text} onChange={e => onChange(e.target.value)}/>;
    return <div className="space-y-1">
      <div ref={root} role="textbox" aria-label={label} aria-multiline="true" contentEditable="plaintext-only" suppressContentEditableWarning
        spellCheck={false} className="input w-full min-h-[90px] whitespace-pre-wrap break-words" onInput={input}
        onPaste={e => {
            e.preventDefault();
            const el = root.current, selection = window.getSelection();
            if (!el || !selection?.rangeCount) return;
            const range = selection.getRangeAt(0);
            if (!el.contains(range.commonAncestorContainer)) return;
            range.deleteContents(); const node = document.createTextNode(e.clipboardData.getData('text/plain').slice(0, 980));
            range.insertNode(node); range.setStartAfter(node); range.collapse(true); selection.removeAllRanges(); selection.addRange(range); input();
        }}/>
      {!parts.hasAmount && <p className="text-xs text-gray-500">{amountLabel}: <span className="font-semibold">{amount}</span></p>}
    </div>;
}
