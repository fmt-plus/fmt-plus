// Share: an X post intent (prefilled text + link) and a result card PNG drawn on a canvas in the brand's own
// colors and fonts (read from the CSS tokens), saved by the user.

/** https://x.com/intent/post?text=…&url=… */
export function xIntent(text: string, url?: string): string {
  const q = new URLSearchParams({ text });
  if (url) q.set('url', url);
  return `https://x.com/intent/post?${q.toString()}`;
}

export interface CardSpec {
  /** Small line at the top (the product name is drawn next to the mark). */
  eyebrow?: string;
  /** The big number or word. */
  big: string;
  /** One line under the big number. */
  label?: string;
  /** Bottom-left line (e.g. the domain). */
  footer?: string;
  /** Bottom-right pill (e.g. $TICKER). */
  tag?: string;
  /** Product name next to the mark. */
  name: string;
  /** The mark image URL (svg/png, colours baked in: public/mark.svg). */
  markUrl?: string;
  width?: number;
  height?: number;
}

function css(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function fitFont(g: CanvasRenderingContext2D, text: string, weight: number, family: string, start: number, maxW: number): number {
  let size = start;
  for (; size > 24; size -= 4) {
    g.font = `${weight} ${size}px ${family}`;
    if (g.measureText(text).width <= maxW) break;
  }
  return size;
}

/** Draws the card; resolves to a PNG blob. */
export async function renderCard(spec: CardSpec): Promise<Blob> {
  const W = spec.width ?? 1200;
  const H = spec.height ?? 630;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  if (!g) throw new Error('canvas');
  const display = css('--font-display') || 'system-ui, sans-serif';
  const body = css('--font-body') || 'system-ui, sans-serif';
  const bg = css('--bg') || '#0b0b0c';
  const ink = css('--ink') || '#f5f5f5';
  const mute = css('--mute') || '#9a9a9a';
  const accent = css('--accent') || '#7ee28c';
  const surface = css('--surface') || '#151515';
  try {
    await Promise.all([document.fonts.load(`700 120px ${display}`), document.fonts.load(`500 32px ${body}`)]);
  } catch {
    // system fonts then
  }

  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);
  const glow = g.createRadialGradient(W * 0.92, -H * 0.05, 0, W * 0.92, -H * 0.05, W * 0.75);
  glow.addColorStop(0, accent + '4d');
  glow.addColorStop(1, accent + '00');
  g.fillStyle = glow;
  g.fillRect(0, 0, W, H);
  const glow2 = g.createRadialGradient(0, H, 0, 0, H, W * 0.5);
  glow2.addColorStop(0, accent + '1a');
  glow2.addColorStop(1, accent + '00');
  g.fillStyle = glow2;
  g.fillRect(0, 0, W, H);

  const P = Math.round(W * 0.064);
  // mark + name
  const M = Math.round(H * 0.11);
  const mark = spec.markUrl ? await loadImage(spec.markUrl) : null;
  const nameX = mark ? P + M + M * 0.32 : P;
  if (mark) g.drawImage(mark, P, P, M, M);
  g.textAlign = 'left';
  g.textBaseline = 'middle';
  g.fillStyle = ink;
  g.font = `760 ${Math.round(M * 0.62)}px ${display}`;
  g.fillText(spec.name, nameX, P + M / 2 + 2);
  if (spec.eyebrow) {
    g.font = `600 ${Math.round(H * 0.042)}px ${body}`;
    const tw = g.measureText(spec.eyebrow).width;
    const ph = H * 0.075;
    const px = W - P - tw - ph * 1.4;
    g.fillStyle = surface;
    roundRect(g, px, P + M / 2 - ph / 2, tw + ph * 1.4, ph, ph / 2);
    g.fill();
    g.fillStyle = mute;
    g.fillText(spec.eyebrow, px + ph * 0.7, P + M / 2 + 1);
  }

  // the big number, then its line
  g.textBaseline = 'alphabetic';
  const size = fitFont(g, spec.big, 760, display, Math.round(H * 0.4), W - P * 2);
  g.fillStyle = ink;
  g.font = `760 ${size}px ${display}`;
  const baseY = H * 0.66;
  g.fillText(spec.big, P - size * 0.04, baseY);
  if (spec.label) {
    g.fillStyle = accent;
    g.font = `650 ${Math.round(H * 0.06)}px ${body}`;
    g.fillText(spec.label, P, baseY + H * 0.1);
  }

  // footer
  g.textBaseline = 'middle';
  const fy = H - P * 0.95;
  if (spec.footer) {
    g.fillStyle = mute;
    g.font = `600 ${Math.round(H * 0.045)}px ${body}`;
    g.fillText(spec.footer, P, fy);
  }
  if (spec.tag) {
    g.font = `760 ${Math.round(H * 0.048)}px ${display}`;
    const tw = g.measureText(spec.tag).width;
    const ph = H * 0.085;
    const px = W - P - tw - ph * 1.2;
    g.fillStyle = accent + '26';
    roundRect(g, px, fy - ph / 2, tw + ph * 1.2, ph, ph / 2);
    g.fill();
    g.fillStyle = accent;
    g.fillText(spec.tag, px + ph * 0.6, fy + 1);
  }
  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('png'))), 'image/png'));
}

/** Saves a blob as a file (a download on desktop, the share sheet or a new tab on phones). */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30000);
}
