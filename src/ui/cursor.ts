let cursorX = 0;
let cursorY = 0;
let cursorVisible = false;

export function updateCursor(x: number, y: number, visible: boolean): void {
  cursorX = x;
  cursorY = y;
  cursorVisible = visible;
}

export function drawCursor(
  ctx: CanvasRenderingContext2D,
  size: number,
  color: string,
): void {
  if (!cursorVisible) return;

  const r = Math.max(size / 2, 2);
  ctx.save();
  ctx.beginPath();
  ctx.arc(cursorX, cursorY, r, 0, Math.PI * 2);
  ctx.globalAlpha = 0.85;
  ctx.fillStyle = color;
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = '#1a1a1a';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();
}
