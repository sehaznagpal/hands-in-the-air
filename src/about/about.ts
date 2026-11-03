import type { GuideCell } from '../guide/cell';
import { guideLoop } from '../guide/cell';
import type { SceneEntry } from '../scene';
import { createPreviews } from './previews';

/** Card titles always sit on two lines; this is where each one breaks. */
const TITLE_LINES: Record<string, [string, string]> = {
  canvas: ['Warm Up:', 'Canvas'],
  window: ['Foggy', 'Window'],
  sort: ['Sorting', 'Game'],
  flowers: ['Blooming', 'Flowers'],
  eyes: ['My Eyes', 'Follow You'],
  mesh: ['Mesh Bag', 'Marbles'],
};

/** Closed buds for the game that is coming later. */
function budsPreview(): HTMLElement {
  const frame = document.createElement('div');
  frame.className = 'guide-frame buds';
  frame.setAttribute('aria-hidden', 'true');
  const c = document.createElement('canvas');
  frame.append(c);
  const draw = () => {
    const w = (c.width = frame.clientWidth || 1);
    const h = (c.height = frame.clientHeight || 1);
    const g = c.getContext('2d')!;
    g.clearRect(0, 0, w, h);
    const cs = getComputedStyle(document.documentElement);
    const blue = cs.getPropertyValue('--blue').trim() || '#0a3699';
    [[0.25, 0.62, 0.26], [0.5, 0.5, 0.34], [0.75, 0.66, 0.22]].forEach(([x, y, s]) => {
      const px = x * w;
      const py = y * h;
      const r = s * h * 0.42;
      g.strokeStyle = '#7a8a5c';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(px, h + 2);
      g.quadraticCurveTo(px + r * 0.5, (py + h) / 2, px, py + r * 0.9);
      g.stroke();
      g.fillStyle = '#c9a3b4';
      g.beginPath();
      g.ellipse(px, py, r * 0.62, r, 0, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = blue;
      g.globalAlpha = 0.35;
      g.lineWidth = 1.5;
      g.stroke();
      g.globalAlpha = 1;
    });
  };
  new ResizeObserver(draw).observe(frame);
  return frame;
}

/** The About page: the text and one card per game, each with a looping preview. */
export class About {
  private el = document.getElementById('about')!;
  private list = document.getElementById('about-cards')!;
  private cards: { entry: SceneEntry; el: HTMLButtonElement; cell?: GuideCell }[] = [];
  private visible = new Set<GuideCell>();
  private shown = false;

  constructor(
    entries: SceneEntry[],
    private onPick: (entry: SceneEntry) => void,
  ) {
    const previews = createPreviews();
    for (const entry of entries) {
      const li = document.createElement('li');
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'about-card' + (entry.soon ? ' soon' : '');
      card.setAttribute('aria-label', entry.name + (entry.soon ? ' (coming soon)' : ''));
      const cell = previews[entry.id];
      if (cell) {
        cell.el.setAttribute('aria-hidden', 'true');
        card.append(cell.el);
      } else if (entry.soon) {
        card.append(budsPreview());
      }
      const [a, b] = TITLE_LINES[entry.id] ?? [entry.name, ''];
      const title = document.createElement('h2');
      title.setAttribute('aria-hidden', 'true');
      title.append(a, document.createElement('br'), b);
      card.append(title);
      if (entry.soon) {
        const tag = document.createElement('span');
        tag.className = 'soon-tag';
        tag.textContent = 'coming soon';
        tag.setAttribute('aria-hidden', 'true');
        card.append(tag);
        card.setAttribute('aria-disabled', 'true');
        card.tabIndex = -1;
      }
      card.addEventListener('click', () => {
        if (!entry.soon) this.onPick(entry);
      });
      li.append(card);
      this.list.append(li);
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
