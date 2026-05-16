import type { Stroke } from '../types';
import { registerBrush } from './brushTypes';

function renderLine(ctx: CanvasRenderingContext2D, stroke: Stroke): void {
  const pts = stroke.points;
  if (pts.length === 0) return;

  ctx.save();
  ctx.strokeStyle = stroke.color;
  ctx.fillStyle = stroke.color;
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
  id: 'thin',
  label: 'Thin',
  strokeType: 'body',
  defaultSize: 3,
  defaultFilled: false,
  hasSizePicker: false,
  onEnd() {},
  render: renderLine,
});

registerBrush({
  id: 'medium',
  label: 'Medium',
  strokeType: 'body',
  defaultSize: 8,
  defaultFilled: false,
  hasSizePicker: false,
  onEnd() {},
  render: renderLine,
});

registerBrush({
  id: 'thick',
  label: 'Thick',
  strokeType: 'body',
  defaultSize: 20,
  defaultFilled: false,
  hasSizePicker: false,
  onEnd() {},
  render: renderLine,
});

registerBrush({
  id: 'chunky',
  label: 'Chunky',
  strokeType: 'body',
  defaultSize: 40,
  defaultFilled: false,
  hasSizePicker: false,
  onEnd() {},
  render: renderLine,
});
