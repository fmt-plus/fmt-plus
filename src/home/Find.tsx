// Paste any wallet → /w/<addr>.
import { useState } from 'react';
import { copy } from '../copy.ts';
import { navigate } from '../lib/router.ts';
import { toast } from '../state/ui.ts';

const ADDR = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
export function Find() {
  const [q, setQ] = useState('');
  const go = () => {
    const a = q.trim();
    if (!ADDR.test(a)) return toast(copy.home.bad, 'warn');
    navigate(`/w/${a}`);
  };
  return (
    <form
      className="g-find"
      onSubmit={(e) => {
        e.preventDefault();
        go();
      }}
    >
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={copy.home.find} aria-label={copy.home.find} spellCheck={false} />
      <button type="submit">{copy.home.go}</button>
    </form>
  );
}
