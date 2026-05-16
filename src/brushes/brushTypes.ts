import type { BrushId, Stroke, StrokeType } from '../types';

export interface Brush {
  id: BrushId;
  label: string;
  strokeType: StrokeType;
  defaultSize: number;
  defaultFilled: boolean;
  hasSizePicker: boolean;
  sizePicker?: number[];
  onEnd(stroke: Stroke): void;
  render(ctx: CanvasRenderingContext2D, stroke: Stroke): void;
}

const registry = new Map<BrushId, Brush>();

export function registerBrush(brush: Brush): void {
  registry.set(brush.id, brush);
}

export function getBrush(id: BrushId): Brush {
  const b = registry.get(id);
  if (!b) throw new Error(`Unknown brush: ${id}`);
  return b;
}

export function getAllBrushes(): Brush[] {
  return Array.from(registry.values());
}
