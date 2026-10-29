// Share: a result card PNG (drawn on a canvas in the brand's look) to save, an X post with text and link, a link copy.
import { useEffect, useState } from 'react';
import { copy } from '../copy.ts';
import { brand } from '../brand.ts';
import { fill } from '../core/format.ts';
import { renderCard, saveBlob, xIntent } from '../core/share.ts';
import { copyText } from '../core/clipboard.ts';
import { useStore } from '../lib/react.ts';
import { live } from '../state/live.ts';
import { toast } from '../state/ui.ts';
import { Sheet } from '../ui/Sheet.tsx';
import { IconDownload, IconLink, IconX } from '../ui/Icons.tsx';

const siteUrl = () => (brand.domain ? `https://${brand.domain}` : window.location.origin);

export function ShareSheet() {
  const perMin = useStore(live, (s) => s.events.length || null);
  const [card, setCard] = useState<{ blob: Blob; url: string } | null>(null);
  const big = perMin !== null ? String(perMin) : null;

  useEffect(() => {
    let url = '';
    let gone = false;
    void renderCard({
      name: brand.name,
      markUrl: '/mark.svg',
      eyebrow: copy.share.eyebrow,
      big: big ?? (brand.ticker ? '$' + brand.ticker : brand.name),
      label: big ? copy.share.label : brand.tagline,
      footer: brand.domain || window.location.host,
      tag: brand.ticker ? '$' + brand.ticker : undefined,
    }).then((blob) => {
      if (gone) return;
      url = URL.createObjectURL(blob);
      setCard({ blob, url });
    });
    return () => {
      gone = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, []); // drawn once per opening

  const text = big ? fill(copy.share.text, { n: big, name: brand.name }) : fill(copy.share.textPlain, { name: brand.name });
  return (
    <Sheet title={copy.share.title}>
      <div className="sheet-body">
        <div className="card-prev">{card ? <img src={card.url} alt="" width={1200} height={630} /> : <i className="card-sk" />}</div>
        <a className="btn btn-primary btn-lg btn-block" data-qa="share-x" href={xIntent(text, siteUrl())} target="_blank" rel="noopener noreferrer">
          <IconX size={18} />
          {copy.share.post}
        </a>
        <div className="row2">
          <button
            type="button"
            className="btn btn-soft btn-lg"
            disabled={!card}
            onClick={() => {
              if (!card) return;
              saveBlob(card.blob, fill(copy.share.file, { name: brand.slug }));
              toast(copy.toast.saved);
            }}
          >
            <IconDownload size={18} />
            {copy.share.save}
          </button>
          <button type="button" className="btn btn-soft btn-lg" onClick={() => void copyText(siteUrl()).then((ok) => ok && toast(copy.toast.linkCopied))}>
            <IconLink size={18} />
            {copy.share.copyLink}
          </button>
        </div>
      </div>
    </Sheet>
  );
}
