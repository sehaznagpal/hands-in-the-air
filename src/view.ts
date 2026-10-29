/** Where the (mirrored) camera image sits inside a w x h canvas, "cover" fit. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function coverRect(w: number, h: number, aspect: number): Rect {
  if (w / h > aspect) {
    const rh = w / aspect;
    return { x: 0, y: (h - rh) / 2, w, h: rh };
  }
  const rw = h * aspect;
  return { x: (w - rw) / 2, y: 0, w: rw, h };
}

export function containRect(w: number, h: number, aspect: number): Rect {
  if (w / h > aspect) {
    const rw = h * aspect;
    return { x: (w - rw) / 2, y: 0, w: rw, h };
  }
  const rh = w / aspect;
  return { x: 0, y: (h - rh) / 2, w, h: rh };
}
