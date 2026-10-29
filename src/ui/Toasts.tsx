import { useStore } from '../lib/react.ts';
import { ui } from '../state/ui.ts';
import { IconCheck } from './Icons.tsx';

export function Toasts() {
  const toasts = useStore(ui, (s) => s.toasts);
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.kind}`} data-toast="">
          {t.kind === 'ok' && <IconCheck size={16} />}
          {t.text}
        </div>
      ))}
    </div>
  );
}
