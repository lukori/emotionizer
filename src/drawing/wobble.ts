import { createNoise3D } from 'simplex-noise';
import type { Point } from '../types';

const noise3D = createNoise3D();

export function wobble(point: Point, time: number, seed: number): Point {
  const t = time * 0.0018;
  return {
    x: point.x + noise3D(point.x * 0.006, point.y * 0.006, t + seed) * 3.5,
    y: point.y + noise3D(point.x * 0.006 + 100, point.y * 0.006 + 100, t + seed) * 3.5,
  };
}

export function wobblePoints(points: Point[], time: number, seed: number): Point[] {
  return points.map((pt) => wobble(pt, time, seed));
}
