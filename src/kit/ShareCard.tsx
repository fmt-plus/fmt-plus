// A result card to share (pump.fun PnL cards, GMGN / Axiom share images): one huge number, a line under it, the
// mark and name, the URL. The card shows as HTML (it scales with its width); "Save image" draws the same card on an
// offscreen canvas in the brand's colours and fonts (core/share.ts renderCard, 1200×630) and downloads the PNG.
// "Post on X" opens an X post with `text` and the URL. No new dependencies.
import { useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { copy } from '../copy.ts';
import { brand } from '../brand.ts';
import { renderCard, saveBlob, xIntent } from '../core/share.ts';
import { IconDownload, IconX } from '../ui/Icons.tsx';

export interface ShareCardProps {
  /** the huge number or word */
  big: string;
  /** one line under it */
  label?: string;
  /** a small pill top right */
  eyebrow?: string;
  /** a pill bottom right, e.g. $TICKER */
  tag?: string;
  /** the link printed on the card and posted (default https://<brand domain>) */
  url?: string;
  /** the X post text (shows the Post on X button) */
  text?: string;
  /** the PNG's file name (default <slug>-card.png) */
  file?: string;
  name?: string;
  markUrl?: string;
  onSaved?: () => void;
  onFail?: () => void;
  /** more buttons next to Save image */
  children?: ReactNode;
  className?: string;
}

const host = (u: string) => u.replace(/^https?:\/\//, '').replace(/\/$/, '');

export function ShareCard({ big, label, eyebrow, tag, url, text, file, name = brand.name, markUrl = '/mark.svg', onSaved, onFail, children, className }: ShareCardProps) {
  const link = url ?? (brand.domain ? `https://${brand.domain}` : typeof window !== 'undefined' ? window.location.origin : '');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const blob = await renderCard({ name, markUrl, eyebrow, big, label, footer: host(link), tag });
      saveBlob(blob, file ?? `${brand.slug || 'card'}-card.png`);
      onSaved?.();
    } catch {
      onFail?.();
    } finally {
      setBusy(false);
    }
  };
  return (
    <figure className={'k-share' + (className ? ' ' + className : '')}>
      <div className="k-share-card" role="img" aria-label={[big, label, host(link)].filter(Boolean).join(' · ')}>
        <div className="k-share-top" aria-hidden="true">
          <img className="k-share-mark" src={markUrl} alt="" draggable={false} />
          <b>{name}</b>
          {eyebrow && <span className="k-share-pill">{eyebrow}</span>}
        </div>
        <div className="k-share-mid" aria-hidden="true">
          <span className="k-share-big" style={{ '--k-chars': Math.max(4, [...big].length) } as CSSProperties}>
            {big}
          </span>
          {label && <span className="k-share-label">{label}</span>}
        </div>
        <div className="k-share-foot" aria-hidden="true">
          <span>{host(link)}</span>
          {tag && <span className="k-share-tag">{tag}</span>}
        </div>
      </div>
      <div className="k-share-act">
        <button type="button" className="btn btn-soft btn-md" onClick={() => void save()} disabled={busy} aria-busy={busy}>
          <IconDownload size={18} />
          {copy.kit.share.save}
        </button>
        {text && (
          <a className="btn btn-primary btn-md" href={xIntent(text, link)} target="_blank" rel="noopener noreferrer">
            <IconX size={16} />
            {copy.kit.share.post}
          </a>
        )}
        {children}
      </div>
    </figure>
  );
}
