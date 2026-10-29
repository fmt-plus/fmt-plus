// A row of big live numbers with tiny unit labels (Hyperliquid / pump.fun stat bars, flipfee's ticker). Digits roll
// on change with the brand's motion signature (ui/Roll.tsx); `face="flap"` dithers changed characters in instead
// (Flap.tsx). A stat whose value is null is left out, and the strip is gone when none is left: an empty or zero row
// reads as a dead product, so pass only numbers the product really has.
import { memo } from 'react';
import { Roll } from '../ui/Roll.tsx';
import { Flap } from './Flap.tsx';

export interface Stat {
  key: string;
  /** the number as shown ($187, 12.4, 1.2K); null leaves the stat out */
  value: string | null | undefined;
  /** a tiny unit after the number (SOL, /min, %) */
  unit?: string;
  label: string;
  tone?: 'ink' | 'accent' | 'up' | 'down';
}

export interface StatStripProps {
  stats: Stat[];
  /** 'lg': hero numbers · 'md': a header row */
  size?: 'md' | 'lg';
  face?: 'roll' | 'flap';
  /** the first stat is the headline number; the rest are smaller */
  lead?: boolean;
  label?: string;
  className?: string;
}

export const StatStrip = memo(function StatStrip({ stats, size = 'lg', face = 'roll', lead = false, label, className }: StatStripProps) {
  const shown = stats.filter((s) => s.value !== null && s.value !== undefined && s.value !== '');
  if (!shown.length) return null;
  return (
    <dl className={'k-stats is-' + size + (lead ? ' is-lead' : '') + (className ? ' ' + className : '')} aria-label={label}>
      {shown.map((s) => (
        <div key={s.key} className={'k-stat is-' + (s.tone ?? 'ink')} data-stat={s.key}>
          <dt className="k-stat-l">{s.label}</dt>
          <dd className="k-stat-v">
            {face === 'flap' ? <Flap text={s.value as string} className="k-stat-n" /> : <Roll text={s.value as string} className="k-stat-n" />}
            {s.unit && <span className="k-stat-u">{s.unit}</span>}
          </dd>
        </div>
      ))}
    </dl>
  );
});
