import type { GuideCell } from './cell';
import { createCanvasCell } from './canvascell';
import { createMeshCells } from './meshcells';
import { createWindowCells } from './windowcells';

export interface HelpCard {
  el: HTMLElement;
  cells: GuideCell[];
}

const MESH_SR =
  'To add balls, raise your open hand. To remove balls, lower it. Make a fist to grab and carry the mesh. Swipe sideways for a gust of wind. ' +
  'No camera? Drag the mesh with your mouse and use the arrow keys for the number.';

function srOnly(text: string) {
  const p = document.createElement('p');
  p.className = 'sr-only';
  p.textContent = text;
  return p;
}

/** Help card content for a scene id, built once. Cells only play while the card is open. */
export function buildHelpCard(sceneId: string, fallback: string): HelpCard {
  const el = document.createElement('div');
  el.className = 'help-content';
  if (sceneId === 'mesh') {
    const cells = createMeshCells();
    const grid = document.createElement('div');
    grid.className = 'guide-grid';
    grid.append(...cells.map((c) => c.el));
    const note = document.createElement('p');
    note.className = 'guide-note';
    note.textContent = 'No camera? Drag the mesh with your mouse and use the arrow keys for the number.';
    note.setAttribute('aria-hidden', 'true');
    el.append(srOnly(MESH_SR), grid, note);
    return { el, cells };
  }
  if (sceneId === 'window') {
    const cells = createWindowCells();
    const grid = document.createElement('div');
    grid.className = 'guide-grid three';
    grid.append(...cells.map((c) => c.el));
    const note = document.createElement('p');
    note.className = 'guide-note';
    note.textContent = 'No camera? Drag with your mouse to wipe.';
    note.setAttribute('aria-hidden', 'true');
    el.append(
      srOnly('Wipe the glass with your open palm. Draw on the window with one finger. Leave it and it fogs up again. No camera? Drag with your mouse to wipe.'),
      grid,
      note,
    );
    return { el, cells };
  }
  if (sceneId === 'canvas') {
    const cell = createCanvasCell(fallback);
    cell.el.classList.add('guide-wide');
    el.append(cell.el);
    return { el, cells: [cell] };
  }
  const p = document.createElement('p');
  p.textContent = fallback;
  el.append(p);
  return { el, cells: [] };
}
