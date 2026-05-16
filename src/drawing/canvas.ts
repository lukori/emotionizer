import { state, setState, subscribe } from '../state';
import { getBrush } from '../brushes/brushTypes';
import { createStroke, appendPoint, smoothPoints } from './stroke';
import { setActiveStrokeGetter, render } from './renderer';
import { updateCursor } from '../ui/cursor';
import { doFill } from './fillLayer';
import { startPuppetTracking, stopPuppetTracking } from '../ui/puppetCursor';
import type { Point, Stroke } from '../types';

let canvas: HTMLCanvasElement;
let ctx: CanvasRenderingContext2D;
let activeStroke: Stroke | null = null;
let rafId = 0;
// Separate overlay div for the fill cursor — drawing on the main canvas would
// corrupt the pixel data that doFill reads to detect the target color.
let fillCursorDiv: HTMLDivElement;

function getPoint(e: PointerEvent): Point {
  const rect = canvas.getBoundingClientRect();
  return {
    x: e.clientX - rect.left,
    y: e.clientY - rect.top,
  };
}

function applyDpr(): void {
  const dpr = window.devicePixelRatio || 1;
  const w = window.innerWidth;
  const h = window.innerHeight;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function syncFillCursor(x: number, y: number, visible: boolean): void {
  if (!visible || state.activeBrush !== 'outline-fill') {
    fillCursorDiv.style.display = 'none';
    return;
  }
  const sz = Math.max(state.activeSize, 4);
  fillCursorDiv.style.display = 'block';
  fillCursorDiv.style.left = `${x}px`;
  fillCursorDiv.style.top = `${y}px`;
  fillCursorDiv.style.width = `${sz}px`;
  fillCursorDiv.style.height = `${sz}px`;
  fillCursorDiv.style.background = state.activeColor;
}

function onPointerDown(e: PointerEvent): void {
  if (e.button !== 0 || activeStroke !== null) return;
  canvas.setPointerCapture(e.pointerId);

  const pt = getPoint(e);
  const brush = getBrush(state.activeBrush);

  if (brush.id === 'outline-fill') {
    doFill(ctx, pt.x, pt.y, state.activeColor);
    return;
  }

  activeStroke = createStroke(
    brush.id,
    brush.strokeType,
    state.activeColor,
    state.activeSize,
    brush.defaultFilled,
    pt,
  );
}

function onPointerMove(e: PointerEvent): void {
  const pt = getPoint(e);
  updateCursor(pt.x, pt.y, true);
  syncFillCursor(pt.x, pt.y, true);

  if (activeStroke === null) return;
  appendPoint(activeStroke, pt);
}

function onPointerUp(e: PointerEvent): void {
  if (activeStroke === null) return;

  const brush = getBrush(activeStroke.brushId);
  brush.onEnd(activeStroke);

  // Smooth points after the brush's onEnd so the final path is clean
  activeStroke = { ...activeStroke, points: smoothPoints(activeStroke.points) };

  setState({ strokes: [...state.strokes, activeStroke] });
  activeStroke = null;

  const pt = getPoint(e);
  updateCursor(pt.x, pt.y, true);
}

function onPointerLeave(): void {
  updateCursor(0, 0, false);
  fillCursorDiv.style.display = 'none';
}

function onPointerEnter(): void {
  updateCursor(0, 0, true);
}

function loop(time: number): void {
  render(ctx, time);
  rafId = requestAnimationFrame(loop);
}

export function initCanvas(container: HTMLElement): HTMLCanvasElement {
  canvas = document.createElement('canvas');
  canvas.style.display = 'block';
  canvas.style.cursor = 'none';
  canvas.style.touchAction = 'none';
  container.appendChild(canvas);

  // Overlay div cursor for fill brush — must not be on the main canvas
  fillCursorDiv = document.createElement('div');
  fillCursorDiv.style.cssText =
    'position:absolute;pointer-events:none;z-index:5;border-radius:50%;' +
    'transform:translate(-50%,-50%);opacity:0.85;display:none;border:1.5px solid #1a1a1a;';
  container.appendChild(fillCursorDiv);

  const ctxOrNull = canvas.getContext('2d');
  if (!ctxOrNull) throw new Error('Could not get 2d context');
  ctx = ctxOrNull;

  setActiveStrokeGetter(() => activeStroke);

  applyDpr();
  window.addEventListener('resize', applyDpr);

  subscribe(() => {
    if (state.mode === 'animate') {
      canvas.style.pointerEvents = 'none';
      fillCursorDiv.style.display = 'none';
      startPuppetTracking();
    } else {
      canvas.style.pointerEvents = 'auto';
      stopPuppetTracking();
    }
    // Hide fill cursor if brush switched away from fill
    if (state.activeBrush !== 'outline-fill') fillCursorDiv.style.display = 'none';
  });

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointerleave', onPointerLeave);
  canvas.addEventListener('pointerenter', onPointerEnter);

  rafId = requestAnimationFrame(loop);

  return canvas;
}

export function stopCanvas(): void {
  cancelAnimationFrame(rafId);
}
