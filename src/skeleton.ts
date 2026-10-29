import { FINGERTIP_INDEX, HAND_CONNECTIONS } from './types';

/** One hand skeleton, drawn the same way in the camera preview and in the help guides. */
export function drawSkeleton(g: CanvasRenderingContext2D, p: { x: number; y: number }[], tipColor: string) {
  g.lineCap = 'round';
  g.strokeStyle = 'rgba(255,255,255,0.85)';
  g.lineWidth = 2;
  g.beginPath();
  for (const [a, b] of HAND_CONNECTIONS) {
    g.moveTo(p[a].x, p[a].y);
    g.lineTo(p[b].x, p[b].y);
  }
  g.stroke();
  g.fillStyle = '#fff';
  for (const pt of p) {
    g.beginPath();
    g.arc(pt.x, pt.y, 2, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = tipColor;
  for (const li of FINGERTIP_INDEX) {
    g.beginPath();
    g.arc(p[li].x, p[li].y, 5, 0, Math.PI * 2);
    g.fill();
  }
}
