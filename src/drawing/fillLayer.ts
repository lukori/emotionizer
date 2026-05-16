let fillCanvas: OffscreenCanvas | null = null;

export function getFillCanvas(): OffscreenCanvas | null {
  return fillCanvas;
}

// Call each render frame — creates a fresh canvas only on resize (clearing fills).
export function syncFillCanvas(physW: number, physH: number): void {
  if (fillCanvas && fillCanvas.width === physW && fillCanvas.height === physH) return;
  fillCanvas = new OffscreenCanvas(physW, physH);
}

export function shiftFillCanvas(cssDx: number, cssDy: number): void {
  if (!fillCanvas || (cssDx === 0 && cssDy === 0)) return;
  const dpr = window.devicePixelRatio || 1;
  const w = fillCanvas.width;
  const h = fillCanvas.height;
  const shifted = new OffscreenCanvas(w, h);
  shifted.getContext('2d')!.drawImage(fillCanvas, cssDx * dpr, cssDy * dpr);
  fillCanvas = shifted;
}

export function doFill(
  mainCtx: CanvasRenderingContext2D,
  cssX: number,
  cssY: number,
  color: string,
): void {
  const dpr = window.devicePixelRatio || 1;
  const pW = mainCtx.canvas.width;
  const pH = mainCtx.canvas.height;

  syncFillCanvas(pW, pH);

  const px = Math.round(cssX * dpr);
  const py = Math.round(cssY * dpr);
  if (px < 0 || px >= pW || py < 0 || py >= pH) return;

  const imgData = mainCtx.getImageData(0, 0, pW, pH);
  const src = imgData.data;

  const ti = (py * pW + px) * 4;
  const tr = src[ti], tg = src[ti + 1], tb = src[ti + 2];

  const [fr, fg, fb] = hexToRgb(color);
  if (tr === fr && tg === fg && tb === fb) return;

  const dst = new Uint8ClampedArray(pW * pH * 4); // all transparent
  scanlineFill(src, dst, pW, pH, px, py, tr, tg, tb, fr, fg, fb);

  // Dilate 10 px: covers anti-aliased stroke edges + wobble shift (≤3.5 px amplitude).
  for (let pass = 0; pass < 10; pass++) {
    const toFill: number[] = [];
    for (let pos = 0; pos < pW * pH; pos++) {
      if (dst[pos * 4 + 3] !== 255) continue;
      const x = pos % pW, y = (pos / pW) | 0;
      if (x > 0    && dst[(pos - 1) * 4 + 3] !== 255) toFill.push(pos - 1);
      if (x < pW-1 && dst[(pos + 1) * 4 + 3] !== 255) toFill.push(pos + 1);
      if (y > 0    && dst[(pos - pW) * 4 + 3] !== 255) toFill.push(pos - pW);
      if (y < pH-1 && dst[(pos + pW) * 4 + 3] !== 255) toFill.push(pos + pW);
    }
    for (const p of toFill) {
      dst[p * 4] = fr; dst[p * 4 + 1] = fg; dst[p * 4 + 2] = fb; dst[p * 4 + 3] = 255;
    }
  }

  const temp = new OffscreenCanvas(pW, pH);
  const tempCtx = temp.getContext('2d')!;
  tempCtx.putImageData(new ImageData(dst, pW, pH), 0, 0);

  const fc = fillCanvas!.getContext('2d')!;
  fc.drawImage(temp, 0, 0);
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const TOL = 18; // tolerance for anti-aliased stroke edges

function scanlineFill(
  src: Uint8ClampedArray,
  dst: Uint8ClampedArray,
  w: number,
  h: number,
  sx: number,
  sy: number,
  tr: number, tg: number, tb: number,
  fr: number, fg: number, fb: number,
): void {
  const matches = (pi: number) =>
    Math.abs(src[pi] - tr) <= TOL &&
    Math.abs(src[pi + 1] - tg) <= TOL &&
    Math.abs(src[pi + 2] - tb) <= TOL;

  const isFilled = (pos: number) => dst[pos * 4 + 3] === 255;

  const fill = (pos: number) => {
    const pi = pos * 4;
    dst[pi] = fr; dst[pi + 1] = fg; dst[pi + 2] = fb; dst[pi + 3] = 255;
  };

  const stack: [number, number][] = [[sx, sy]];

  while (stack.length > 0) {
    const [x, y] = stack.pop()!;
    if (x < 0 || x >= w || y < 0 || y >= h) continue;
    if (isFilled(y * w + x) || !matches((y * w + x) * 4)) continue;

    // Find left extent of this run
    let lx = x;
    while (lx > 0 && !isFilled(y * w + lx - 1) && matches((y * w + lx - 1) * 4)) lx--;

    // Scan right, fill row, queue rows above/below
    let rx = lx;
    let queuedAbove = false;
    let queuedBelow = false;

    while (rx < w) {
      const pos = y * w + rx;
      if (isFilled(pos) || !matches(pos * 4)) break;
      fill(pos);

      if (y > 0) {
        const apos = (y - 1) * w + rx;
        if (!isFilled(apos) && matches(apos * 4)) {
          if (!queuedAbove) { stack.push([rx, y - 1]); queuedAbove = true; }
        } else {
          queuedAbove = false;
        }
      }

      if (y < h - 1) {
        const bpos = (y + 1) * w + rx;
        if (!isFilled(bpos) && matches(bpos * 4)) {
          if (!queuedBelow) { stack.push([rx, y + 1]); queuedBelow = true; }
        } else {
          queuedBelow = false;
        }
      }

      rx++;
    }
  }
}
