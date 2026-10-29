// Sheets (one at a time) and toasts.
import { createStore } from '../core/store.ts';

export type SheetName = 'connect' | 'wallet' | 'share' | null;
export interface Toast {
  id: number;
  text: string;
  kind: 'ok' | 'warn';
}

export const ui = createStore<{ sheet: SheetName; toasts: Toast[] }>({ sheet: null, toasts: [] });

export const openSheet = (sheet: SheetName) => ui.set({ sheet });
export const closeSheet = () => ui.set({ sheet: null });

let n = 0;
export function toast(text: string, kind: Toast['kind'] = 'ok', ms = 2200): void {
  const id = ++n;
  ui.set((s) => ({ toasts: [...s.toasts.slice(-2), { id, text, kind }] }));
  window.setTimeout(() => ui.set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), ms);
}
