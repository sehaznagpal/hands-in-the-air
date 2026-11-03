import type { GuideCell } from '../guide/cell';
import { guideLoop } from '../guide/cell';
import type { SceneEntry } from '../scene';
import { createPreviews } from './previews';

/** Card titles always sit on two lines; this is where each one breaks. */
const TITLE_LINES: Record<string, [string, string]> = {
  canvas: ['Warm Up:', 'Canvas'],
  window: ['Foggy', 'Window'],
  sort: ['Sorting', 'Game'],
  bloom: ['Blooming', 'Flowers'],
  eyes: ['My Eyes', 'Follow You'],
  mesh: ['Mesh Bag', 'Marbles'],
};

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
