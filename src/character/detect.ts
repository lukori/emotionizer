import type { Stroke, Point, EyeUnit, MouthUnit, NoseUnit, Character } from '../types';

interface StrokeMeta {
  stroke: Stroke;
  cx: number;
  cy: number;
  r: number;
  area: number;
}

function measureStroke(s: Stroke): StrokeMeta {
  const pts = s.points;
  if (pts.length === 0) return { stroke: s, cx: 0, cy: 0, r: s.size / 2, area: 0 };

  let minX = pts[0].x, maxX = pts[0].x;
  let minY = pts[0].y, maxY = pts[0].y;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }

  const pad = s.size / 2;
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const halfW = (maxX - minX) / 2 + pad;
  const halfH = (maxY - minY) / 2 + pad;
  const r = Math.max(Math.sqrt(halfW * halfW + halfH * halfH), pad);
  return { stroke: s, cx, cy, r, area: Math.PI * r * r };
}

function centroid(pts: Point[]): Point {
  if (pts.length === 0) return { x: 0, y: 0 };
  let sx = 0, sy = 0;
  for (const p of pts) { sx += p.x; sy += p.y; }
  return { x: sx / pts.length, y: sy / pts.length };
}

function pairEyes(eyeStrokes: Stroke[]): EyeUnit[] {
  const annotated = eyeStrokes.map(measureStroke);
  annotated.sort((a, b) => b.r - a.r);

  const used = new Set<number>();
  const units: EyeUnit[] = [];

  for (let i = 0; i < annotated.length; i++) {
    if (used.has(i)) continue;
    const outer = annotated[i];
    let innerIdx = -1;

    for (let j = i + 1; j < annotated.length; j++) {
      if (used.has(j)) continue;
      const inner = annotated[j];
      if (inner.area >= outer.area * 0.5) continue;
      const d = Math.sqrt((inner.cx - outer.cx) ** 2 + (inner.cy - outer.cy) ** 2);
      if (d < outer.r) { innerIdx = j; break; }
    }

    used.add(i);
    if (innerIdx >= 0) used.add(innerIdx);

    units.push({
      outer: outer.stroke,
      inner: innerIdx >= 0 ? annotated[innerIdx].stroke : null,
      center: { x: outer.cx, y: outer.cy },
      radius: outer.r,
    });
  }

  return units;
}

function findEyePair(units: EyeUnit[]): [EyeUnit, EyeUnit] | null {
  if (units.length < 2) return null;
  if (units.length === 2) return [units[0], units[1]];

  let best: [EyeUnit, EyeUnit] | null = null;
  let bestScore = Infinity;

  for (let i = 0; i < units.length; i++) {
    for (let j = i + 1; j < units.length; j++) {
      const dx = Math.abs(units[i].center.x - units[j].center.x);
      const dy = Math.abs(units[i].center.y - units[j].center.y);
      if (dx < 10) continue;
      const score = dy / dx;
      if (score < bestScore) { bestScore = score; best = [units[i], units[j]]; }
    }
  }

  return best;
}

function findNose(
  strokes: Stroke[],
  eyePair: [EyeUnit, EyeUnit],
  mouth: MouthUnit,
): NoseUnit | null {
  const noseStrokes = strokes.filter((s) => s.type === 'nose');
  if (noseStrokes.length === 0) return null;

  const avgEyeY = (eyePair[0].center.y + eyePair[1].center.y) / 2;
  const mouthY = mouth.baseline.y;

  const valid = noseStrokes.filter((s) => {
    if (s.points.length === 0) return false;
    const c = centroid(s.points);
    return c.y > avgEyeY && c.y < mouthY;
  });

  if (valid.length === 0) return null;

  const allPts = valid.flatMap((s) => s.points);
  return { strokes: valid, center: centroid(allPts) };
}

function findMouth(strokes: Stroke[], eyePair: [EyeUnit, EyeUnit]): MouthUnit | null {
  const mouthStrokes = strokes.filter(s => s.type === 'mouth');
  if (mouthStrokes.length === 0) return null;

  const avgEyeY = (eyePair[0].center.y + eyePair[1].center.y) / 2;
  const allPts = mouthStrokes.flatMap(s => s.points);
  if (allPts.length === 0) return null;

  const base = centroid(allPts);
  if (base.y <= avgEyeY) return null;

  return { strokes: mouthStrokes, baseline: base };
}

function computeBounds(
  eyePair: [EyeUnit, EyeUnit],
  mouth: MouthUnit,
): Character['bounds'] {
  const xs: number[] = [];
  const ys: number[] = [];

  for (const eye of eyePair) {
    xs.push(eye.center.x - eye.radius, eye.center.x + eye.radius);
    ys.push(eye.center.y - eye.radius, eye.center.y + eye.radius);
  }

  for (const s of mouth.strokes) {
    for (const p of s.points) { xs.push(p.x); ys.push(p.y); }
  }

  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const w = maxX - minX, h = maxY - minY;
  const margin = Math.max(w, h) * 0.4;

  return { x: minX - margin, y: minY - margin, w: w + margin * 2, h: h + margin * 2 };
}

export type DetectionResult =
  | { success: true; character: Character }
  | { success: false; message: string };

export function detectCharacter(strokes: Stroke[]): DetectionResult {
  const eyeUnits = pairEyes(strokes.filter(s => s.type === 'eye'));
  const eyePair = findEyePair(eyeUnits);

  if (!eyePair) {
    const n = eyeUnits.length;
    return {
      success: false,
      message: n === 0
        ? 'No eyes found — paint 2 blobs with the Eye brush!'
        : n === 1
        ? 'Found 1 eye but need 2 — paint another eye blob!'
        : 'Could not find 2 aligned eyes — make sure they\'re roughly side by side.',
    };
  }

  const mouth = findMouth(strokes, eyePair);
  if (!mouth) {
    return {
      success: false,
      message: 'No mouth found below the eyes — add one with the Mouth brush!',
    };
  }

  const nose = findNose(strokes, eyePair, mouth);
  const bounds = computeBounds(eyePair, mouth);
  const body = strokes.filter((s) => {
    if (s.type !== 'body') return false;
    const c = centroid(s.points);
    return c.x >= bounds.x && c.x <= bounds.x + bounds.w
        && c.y >= bounds.y && c.y <= bounds.y + bounds.h;
  });

  return {
    success: true,
    character: {
      eyes: eyePair,
      mouth,
      nose,
      body,
      bounds,
      animState: { blinkPhase: 0, blinkTimer: 0, mouthOpenness: 0 },
    },
  };
}
