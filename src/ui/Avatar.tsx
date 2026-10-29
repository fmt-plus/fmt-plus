// A coin avatar drawn from its mint: one of six brand tints and the ticker's first letter.
const hash = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
};

export function Avatar({ seed, label, size = 44 }: { seed: string; label: string; size?: number }) {
  const t = hash(seed) % 6;
  const ch = (label.replace(/[^\p{L}\p{N}]/gu, '')[0] ?? '•').toUpperCase();
  return (
    <span className={`av av-t${t}`} style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }} aria-hidden="true">
      {ch}
    </span>
  );
}
