import type { GuideCell } from '../guide/cell';
import { guideLoop } from '../guide/cell';
import type { SceneEntry } from '../scene';
import { createPreviews } from './previews';

const NOTES: Record<string, string> = { canvas: '*Recommended first to warm up' };

/** The homepage: headline, camera button and one card per scene, each with a looping preview. */
export class Home {
  private el = document.getElementById('home')!;
  private start = document.getElementById('start') as HTMLButtonElement;
  private list = document.getElementById('home-cards')!;
  private cards: { entry: SceneEntry; el: HTMLButtonElement; cell: GuideCell; index: number }[] = [];
  private visible = new Set<GuideCell>();
  private io: IntersectionObserver | null = null;
  private unlocked = false;
  private shown = true;

  constructor(
    entries: SceneEntry[],
    private onPick: (index: number) => void,
    private onLockedClick: () => void,
  ) {
    const previews = createPreviews();
    entries.forEach((entry, index) => {
      const li = document.createElement('li');
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'home-card' + (entry.soon ? ' soon' : '');
      const head = document.createElement('div');
      head.className = 'card-head';
      const title = document.createElement('h2');
      title.textContent = entry.name;
      head.append(title);
      if (entry.soon) {
        const tag = document.createElement('span');
        tag.className = 'soon-tag';
        tag.textContent = 'coming soon';
        head.append(tag);
      }
      card.append(head);
      const cell = previews[entry.id];
      if (cell) card.append(cell.el);
      cell?.el.setAttribute('aria-hidden', 'true');
      card.addEventListener('click', () => this.click(index));
      li.append(card);
      if (NOTES[entry.id]) {
        const note = document.createElement('p');
        note.className = 'home-note';
        note.textContent = NOTES[entry.id];
        li.append(note);
      }
      this.list.append(li);
      this.cards.push({ entry, el: card, cell, index });
    });
    this.syncCards();
    // Previews only play while their card is on screen.
    if ('IntersectionObserver' in window) {
      this.io = new IntersectionObserver((records) => {
        for (const r of records) {
          const c = this.cards.find((x) => x.el === r.target);
          if (!c?.cell) continue;
          if (r.isIntersecting) this.visible.add(c.cell);
          else this.visible.delete(c.cell);
        }
        this.play();
      });
      this.cards.forEach((c) => this.io!.observe(c.el));
    } else {
      this.cards.forEach((c) => c.cell && this.visible.add(c.cell));
    }
  }

  private click(index: number) {
    const c = this.cards[index];
    if (c.entry.soon) return;
    if (!this.unlocked) this.onLockedClick();
    else this.onPick(index);
  }

  private syncCards() {
    for (const c of this.cards) {
      const off = !this.unlocked || !!c.entry.soon;
      c.el.setAttribute('aria-disabled', String(off));
      c.el.title = c.entry.soon ? 'Coming soon' : this.unlocked ? '' : 'Turn on the camera first';
    }
  }

  private play() {
    if (this.shown) guideLoop.activate([...this.visible]);
  }

  setUnlocked(unlocked: boolean) {
    this.unlocked = unlocked;
    this.syncCards();
  }

  /** Reflect the camera on the main button. */
  setCamera(on: boolean) {
    this.start.classList.toggle('on', on);
    this.start.disabled = on;
    this.start.textContent = on ? 'Camera is on' : 'Turn on camera to start';
  }

  setBusy(busy: boolean) {
    this.start.classList.toggle('starting', busy);
    this.start.disabled = busy;
    if (busy) this.start.textContent = 'Starting…';
  }

  /** A locked card was pressed: gently point at the camera button. */
  pulse() {
    this.start.classList.remove('pulse');
    void this.start.offsetWidth;
    this.start.classList.add('pulse');
    window.setTimeout(() => this.start.classList.remove('pulse'), 800);
  }

  show() {
    this.shown = true;
    this.el.hidden = false;
    this.el.classList.remove('leaving');
    this.play();
  }

  hide(instant = false) {
    this.shown = false;
    guideLoop.deactivate();
    this.el.classList.add('leaving');
    window.setTimeout(() => {
      if (!this.shown) this.el.hidden = true;
    }, instant ? 0 : 400);
  }
}
