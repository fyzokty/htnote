export type ViewportBounds = { left: number; top: number; right: number; bottom: number };

// Kaydırma alanı başına yapışkan editör araç çubuğunun alt kenarı (kaydırma alanının üstüne göre).
// Değer VisualEditor'daki tek ResizeObserver ölçümünden gelir; burada DOM okunmaz.
const stickyInsets = new WeakMap<Element, number>();

export function setStickyToolbarInset(scroll: Element, inset: number) {
  stickyInsets.set(scroll, Math.max(0, inset));
}

export function stickyToolbarInset(scroll: Element) {
  return stickyInsets.get(scroll) ?? 0;
}

// Sabit editör katmanlarının görünür alanı: kaydırma alanı ve pencereyle kesişir, üst sınır
// yapışkan araç çubuğunun altıdır. Okuma aşamasında (RAF) çağrılmalıdır.
export function editorViewport(scroll: Element | null | undefined): ViewportBounds | undefined {
  if (!scroll) return undefined;
  const clip = scroll.getBoundingClientRect();
  const left = Math.max(0, clip.left), right = Math.min(window.innerWidth, clip.right);
  const bottom = Math.min(window.innerHeight, clip.bottom);
  const top = Math.min(bottom, Math.max(0, clip.top + stickyToolbarInset(scroll)));
  return { left, top, right, bottom };
}
