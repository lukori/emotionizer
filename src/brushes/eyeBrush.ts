import type { Stroke } from '../types';
import { registerBrush } from './brushTypes';

function render(ctx: CanvasRenderingContext2D, stroke: Stroke): void {
  const pts = stroke.points;
  if (pts.length === 0) return;

  ctx.save();
  ctx.fillStyle = stroke.color;
  ctx.strokeStyle = stroke.color;
  ctx.lineWidth = stroke.size;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  ctx.beginPath();
  if (pts.length === 1) {
    ctx.arc(pts[0].x, pts[0].y, stroke.size / 2, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.stroke();
  }
  ctx.restore();
}

registerBrush({
  id: 'eye',
  label: 'Eye',
  strokeType: 'eye',
  defaultSize: 24,
  defaultFilled: true,
  hasSizePicker: true,
  sizePicker: [8, 16, 24, 40],
  onEnd() {},
  render,
});
