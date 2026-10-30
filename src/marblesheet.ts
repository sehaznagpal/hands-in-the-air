import { STYLES, renderMarble } from './shared/marbles';

/** All 12 marble styles at large size, 4 by 3, labelled 0 to 11, on the page background. */
export function showSheet() {
  document.getElementById('app')?.replaceChildren();
  const app = document.getElementById('app')!;
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%';
  app.append(canvas);
  const draw = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = window.innerWidth;
    const H = window.innerHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    const g = canvas.getContext('2d')!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || '#dad1ca';
    g.fillRect(0, 0, W, H);
    const cols = 4;
    const rows = 3;
    const cw = W / cols;
    const ch = H / rows;
    const d = Math.min(cw, ch) * 0.66;
    g.textAlign = 'center';
    g.fillStyle = '#121212';
    g.font = '16px "Clash Grotesk", sans-serif';
    STYLES.forEach((st, i) => {
      const cx = (i % cols) * cw + cw / 2;
      const cy = Math.floor(i / cols) * ch + ch / 2 - 8;
      const layers = renderMarble(i, Math.min(384, Math.round(d * dpr)));
      g.drawImage(layers.pattern, cx - d / 2, cy - d / 2, d, d);
      g.drawImage(layers.gloss, cx - d / 2, cy - d / 2, d, d);
      g.fillText(`${i}  ${st.name}`, cx, cy + d / 2 + 22);
    });
  };
  draw();
  document.fonts?.ready.then(draw);
  window.addEventListener('resize', draw);
}
