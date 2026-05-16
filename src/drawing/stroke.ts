import type { BrushId, Point, Stroke, StrokeType } from '../types';

export function createStroke(
  brushId: BrushId,
  type: StrokeType,
  color: string,
  size: number,
  filled: boolean,
  startPoint: Point,
): Stroke {
  return {
    id: crypto.randomUUID(),
    type,
    brushId,
    points: [startPoint],
    color,
    size,
    filled,
    wobbleSeed: Math.random() * 1000,
  };
}

export function appendPoint(stroke: Stroke, point: Point): void {
  stroke.points.push(point);
}

export function dist(a: Point, b: Point): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

function ptLineDist(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len === 0) return Math.sqrt((p.x - a.x) ** 2 + (p.y - a.y) ** 2);
  return Math.abs(dx * (a.y - p.y) - (a.x - p.x) * dy) / len;
}

function rdp(pts: Point[], epsilon: number): Point[] {
  if (pts.length <= 2) return pts;
  let maxDist = 0, maxIdx = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = ptLineDist(pts[i], pts[0], pts[pts.length - 1]);
    if (d > maxDist) { maxDist = d; maxIdx = i; }
  }
  if (maxDist > epsilon) {
    const left = rdp(pts.slice(0, maxIdx + 1), epsilon);
    const right = rdp(pts.slice(maxIdx), epsilon);
    return [...left.slice(0, -1), ...right];
  }
  return [pts[0], pts[pts.length - 1]];
}

function chaikin(pts: Point[], passes = 3): Point[] {
  let cur = pts;
  for (let p = 0; p < passes; p++) {
    if (cur.length <= 2) break;
    const next: Point[] = [cur[0]];
    for (let i = 0; i < cur.length - 1; i++) {
      const a = cur[i], b = cur[i + 1];
      next.push({ x: 0.75 * a.x + 0.25 * b.x, y: 0.75 * a.y + 0.25 * b.y });
      next.push({ x: 0.25 * a.x + 0.75 * b.x, y: 0.25 * a.y + 0.75 * b.y });
    }
    next.push(cur[cur.length - 1]);
    cur = next;
  }
  return cur;
}

export function smoothPoints(pts: Point[]): Point[] {
  if (pts.length <= 3) return pts;
  return chaikin(rdp(pts, 8)); // RDP strips hand-tremor jitter, Chaikin re-curves
}
