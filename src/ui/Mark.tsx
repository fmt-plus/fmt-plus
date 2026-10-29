// The product mark: public/mark.svg (written by scripts/brand.mjs from brand.json.mark, colours baked in; a plain
// placeholder until the real mark is drawn). `plate`: on a rounded tile (token card). Size: the --mark CSS variable.
import type { CSSProperties } from 'react';

export function Mark({ size = 36, plate = false }: { size?: number; plate?: boolean }) {
  const style = { '--mark': `${size}px` } as CSSProperties;
  const img = <img className="mark" src="/mark.svg" style={plate ? undefined : style} alt="" draggable={false} />;
  return plate ? (
    <span className="mark-plate" style={style} aria-hidden="true">
      {img}
    </span>
  ) : (
    img
  );
}
