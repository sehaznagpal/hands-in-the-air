import { GuideCell, guideLoop } from './guide/cell';
import { createCanvasCell } from './guide/canvascell';
import { createMeshCells } from './guide/meshcells';
import { blendPose, FIST, HAND_CENTER, OPEN_PALM, type Pose } from './guide/poses';
import { drawSkeleton } from './skeleton';

const css = (name: string, fallback: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;

/** ?guide=1: the guide cells large, plus the pose sheet with landmark numbers. No scene, no camera. */
export function showGuide() {
  const app = document.getElementById('app')!;
  app.replaceChildren();
  const page = document.createElement('div');
  page.className = 'guide-page';
  app.append(page);
  const cells: GuideCell[] = [];
  const orange = css('--orange', '#c54812');

  for (const c of createMeshCells()) {
    cells.push(c);
    page.append(c.el);
  }

  const canvasCell = createCanvasCell('Move your hands in front of the camera. Every fingertip draws a trail.');
  cells.push(canvasCell);
  page.append(canvasCell.el);

  // Pose sheet.
  const poses: [string, Pose][] = [
    ['OPEN_PALM', OPEN_PALM],
    ['FIST', FIST],
    ['blend 0.5', blendPose(OPEN_PALM, FIST, 0.5)],
  ];
  for (const [name, pose] of poses) {
    const c = new GuideCell({
      duration: 1,
      staticTime: 0,
      caption: name,
      render: (g, w, h) => {
        const S = h * 0.7;
        const pts = pose.map((p) => ({ x: w / 2 + (p.x - HAND_CENTER.x) * S, y: h / 2 + (p.y - HAND_CENTER.y) * S }));
        drawSkeleton(g, pts, orange);
        g.fillStyle = '#ffd24a';
        g.font = '11px ui-monospace, Menlo, monospace';
        pts.forEach((p, i) => g.fillText(String(i), p.x + 6, p.y - 6));
      },
    });
    cells.push(c);
    page.append(c.el);
  }
  guideLoop.activate(cells);
  // For checks from the console: window.__guideCells[i].draw(t).
  (window as unknown as { __guideCells: GuideCell[] }).__guideCells = cells;
}
