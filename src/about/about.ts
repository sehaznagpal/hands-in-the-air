import type { GuideCell } from '../guide/cell';
import { guideLoop } from '../guide/cell';
import type { SceneEntry } from '../scene';
import { drawSkeleton } from '../skeleton';
import hands from './sehaz-hands.json';
import { createPreviews } from './previews';

/** Where the photo sits inside its frame (the same as `object-position` in the stylesheet): centred. */
const PHOTO_FOCUS_Y = 0.5;

/**
 * The hand skeleton over the photo, drawn with the same function as the live camera preview. The landmarks were found
 * once by the hand landmarker on the photo itself (sehaz-hands.json) and are scaled with the photo's cover fit, so they
 * stay on the hands at every size.
 */
function startPhotoSkeleton(canvas: HTMLCanvasElement, img: HTMLImageElement) {
  const g = canvas.getContext('2d')!;
  const orange = getComputedStyle(document.documentElement).getPropertyValue('--orange').trim() || '#c54812';
  const draw = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h || !img.naturalWidth) return;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    // The same cover fit as the picture itself.
    const k = Math.max(w / img.naturalWidth, h / img.naturalHeight);
    const dw = img.naturalWidth * k;
    const dh = img.naturalHeight * k;
    const ox = (w - dw) / 2;
    const oy = (h - dh) * PHOTO_FOCUS_Y;
    for (const hand of hands) drawSkeleton(g, hand.map(([x, y]) => ({ x: ox + x * dw, y: oy + y * dh })), orange);
  };
  new ResizeObserver(draw).observe(canvas);
  img.addEventListener('load', draw);
  draw();
}

/** The About page: the text and one card per game, each with a looping preview. */
export class About {
  private el = document.getElementById('about')!;
  private list = document.getElementById('about-cards')!;
  private cards: { entry: SceneEntry; el: HTMLAnchorElement; cell?: GuideCell }[] = [];
  private visible = new Set<GuideCell>();
  private shown = false;

  /** The cards are real links in the page's HTML; this adds each one's looping preview. */
  constructor(entries: SceneEntry[]) {
    startPhotoSkeleton(document.getElementById('about-skeleton') as HTMLCanvasElement, document.getElementById('about-img') as HTMLImageElement);
    const previews = createPreviews();
    const links = this.list.querySelectorAll<HTMLAnchorElement>('a.about-card');
    for (const entry of entries) {
      const card = links[this.cards.length] as HTMLAnchorElement | undefined;
      if (!card || entry.soon) continue;
      const cell = previews[entry.id];
      if (cell) {
        cell.el.setAttribute('aria-hidden', 'true');
        card.prepend(cell.el);
      }
      this.cards.push({ entry, el: card, cell });
    }
    // Previews only play while their card is on screen.
    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver((records) => {
        for (const r of records) {
          const c = this.cards.find((x) => x.el === r.target);
          if (!c?.cell) continue;
          if (r.isIntersecting) this.visible.add(c.cell);
          else this.visible.delete(c.cell);
        }
        this.play();
      });
      this.cards.forEach((c) => io.observe(c.el));
    } else {
      this.cards.forEach((c) => c.cell && this.visible.add(c.cell));
    }
  }

  private play() {
    if (this.shown) guideLoop.activate([...this.visible]);
  }

  show() {
    this.shown = true;
    this.el.hidden = false;
    this.el.scrollTop = 0;
    this.play();
  }

  hide() {
    this.shown = false;
    guideLoop.deactivate();
    this.el.hidden = true;
  }
}
