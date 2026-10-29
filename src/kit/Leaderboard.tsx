// A leaderboard (pump.fun, Hyperliquid, game boards; after flipfee's ranked list): rank · avatar · name · score, the
// top three ranks in the accent. The viewer's own row is marked; while it is out of sight (scrolled away, or ranked
// below the shown rows: pass `meRow`), a copy stays pinned at the bottom of the board so the viewer always sees
// where they stand.
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { copy } from '../copy.ts';
import { fill } from '../core/format.ts';
import { DitherImg } from './render/Dither.tsx';

export interface LeaderRow {
  id: string;
  name: string;
  /** the score as shown (a PnL, points, a time) */
  score: string;
  image?: string | null;
  /** a second line under the name */
  sub?: string;
  /** the rank when it is known (else the position in `rows`) */
  rank?: number;
  /** a tone for the score: up / down */
  tone?: 'up' | 'down';
}

export interface LeaderboardProps {
  rows: LeaderRow[];
  /** the viewer's row id */
  me?: string | null;
  /** the viewer's row when it is outside `rows` (rank required) */
  meRow?: (LeaderRow & { rank: number }) | null;
  label: string;
  /** a head row: [name column, score column] */
  head?: [string, string];
  empty?: ReactNode;
  className?: string;
}

function Cells({ r, rank, me }: { r: LeaderRow; rank: number; me: boolean }) {
  return (
    <>
      <span className="k-lb-rank mono" aria-hidden="true">
        {rank}
      </span>
      <DitherImg src={r.image} label={r.name} seed={r.id} size={36} round />
      <span className="k-lb-name" aria-hidden="true">
        <b>{r.name}</b>
        {me ? <em className="k-lb-you">{copy.kit.board.you}</em> : null}
        {r.sub && <span>{r.sub}</span>}
      </span>
      <span className={'k-lb-score mono' + (r.tone ? ' ' + r.tone : '')} aria-hidden="true">
        {r.score}
      </span>
    </>
  );
}

const rowCls = (rank: number, me: boolean) => 'k-lb-row' + (me ? ' is-me' : '') + (rank <= 3 ? ' is-top' : '');
const rowName = (r: LeaderRow, rank: number) => fill(copy.kit.board.rank, { n: rank }) + ` · ${r.name} · ${r.score}`;

export function Leaderboard({ rows, me = null, meRow = null, label, head, empty, className }: LeaderboardProps) {
  const mine = useRef<HTMLLIElement>(null);
  const at = me ? rows.findIndex((r) => r.id === me) : -1;
  const [away, setAway] = useState(false);
  useEffect(() => {
    const el = mine.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setAway(false);
      return;
    }
    const io = new IntersectionObserver(([e]) => setAway(!e?.isIntersecting), { threshold: 0.75 });
    io.observe(el);
    return () => io.disconnect();
  }, [at, rows.length]);
  const pinned = at >= 0 ? { r: rows[at], rank: rows[at].rank ?? at + 1, show: away } : meRow ? { r: meRow, rank: meRow.rank, show: true } : null;
  return (
    <section className={'k-lb' + (className ? ' ' + className : '')} aria-label={label}>
      {head && rows.length > 0 && (
        <div className="k-lb-row k-lb-head" aria-hidden="true">
          <span>#</span>
          <span />
          <span>{head[0]}</span>
          <span>{head[1]}</span>
        </div>
      )}
      {rows.length ? (
        <ol className="k-lb-list">
          {rows.map((r, i) => {
            const rank = r.rank ?? i + 1;
            return (
              <li key={r.id} ref={i === at ? mine : undefined} className={rowCls(rank, i === at)} aria-label={rowName(r, rank)}>
                <Cells r={r} rank={rank} me={i === at} />
              </li>
            );
          })}
        </ol>
      ) : (
        <div className="k-empty">{empty}</div>
      )}
      {pinned?.show && (
        <div className="k-lb-pin" role="group" aria-label={rowName(pinned.r, pinned.rank)}>
          <div className={rowCls(pinned.rank, true) + ' is-pin'}>
            <Cells r={pinned.r} rank={pinned.rank} me />
          </div>
        </div>
      )}
    </section>
  );
}
