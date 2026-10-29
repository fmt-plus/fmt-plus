// A dialog: centered on desktop, a bottom sheet on phones. Escape or the backdrop closes it.
import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { copy } from '../copy.ts';
import { closeSheet } from '../state/ui.ts';
import { IconClose } from './Icons.tsx';

export function Sheet({ title, children, onClose = closeSheet }: { title: string; children: ReactNode; onClose?: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    box.current?.focus();
    return () => {
      window.removeEventListener('keydown', onKey);
      prev?.focus?.();
    };
  }, [onClose]);
  return (
    <div className="sheet-wrap">
      <div className="sheet-bg" onClick={onClose} aria-hidden="true" />
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} ref={box} tabIndex={-1}>
        <div className="sheet-hd">
          <h2>{title}</h2>
          <button type="button" className="btn-icon" onClick={onClose} aria-label={copy.close}>
            <IconClose size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
