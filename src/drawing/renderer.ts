import { state } from '../state';
import { getBrush } from '../brushes/brushTypes';
import { drawCursor } from '../ui/cursor';
import { wobblePoints, wobble } from './wobble';
import { getFrequencyBars, isMicActive, getSpeechFeatures } from '../audio/mic';
import { getMouthFrames, selectMouthFrameIndex, FRAME_VIEWBOXES, HEIGHT_SCALE, type FrameIndex } from '../audio/mouthFrames';
import { syncFillCanvas, getFillCanvas } from './fillLayer';
import { getPuppetRawOffset } from '../ui/puppetCursor';
import type { Stroke, Character } from '../types';

let getActiveStroke: (() => Stroke | null) | null = null;

let smoothFrame = 0;

let blinkCountdown = 2000 + Math.random() * 3000;
let bp1 = 0, bp2 = 0;
type BlinkPhase = 'idle' | 'closing' | 'holding' | 'opening';
let bph1: BlinkPhase = 'idle', bph2: BlinkPhase = 'idle';
let bhold1 = 0, bhold2 = 0;
let eye2Pending = false;
let eye2Timer = 0;
let prevTime = 0;
let lastFaceShiftX = 0;
let lastFaceShiftY = 0;

export function getLastFaceShift(): { dx: number; dy: number } {
  return { dx: lastFaceShiftX, dy: lastFaceShiftY };
}

const BLINK_CLOSE_MS = 75;
const BLINK_HOLD_MS = 55;
const BLINK_OPEN_MS = 100;
const EYE2_DELAY_MS = 60;

const PUPPET_SCALE = 0.38;
// At max cursor offset: features compress by this fraction toward the cursor side.
// e.g. 0.20 → inter-eye distance becomes 80% of original at max offset.
const PERSPECTIVE_COMPRESS = 0.45;
// Body (face blob + fill) follows cursor at this fraction of feature speed — parallax feel.
const BODY_FOLLOW_SCALE = 0.28;
// When looking up past halfway, hair (rendered behind the face blob) slides down
// by up to this fraction of the upward travel — fakes the back of the head sinking
// behind the face for a stronger 3D tilt.
const HAIR_BEHIND_DROP_MAX = 0.4;

export function setActiveStrokeGetter(fn: () => Stroke | null): void {
  getActiveStroke = fn;
}

function renderWobbled(ctx: CanvasRenderingContext2D, stroke: Stroke, time: number): void {
  const wobbled: Stroke = { ...stroke, points: wobblePoints(stroke.points, time, stroke.wobbleSeed) };
  getBrush(stroke.brushId).render(ctx, wobbled);
}

// Returns the (dx, dy) to apply to a feature centered at (featX, featY).
// = base puppet offset + perspective compression toward cursor direction.
function perspOffset(
  featX: number, featY: number,
  faceCx: number, faceCy: number,
  pdx: number, pdy: number,
  xFactor: number, yFactor: number,
): { dx: number; dy: number } {
  return {
    dx: pdx + (featX - faceCx) * (xFactor - 1),
    // y-axis is inverted vs x: features below pivot are far when tilting up,
    // so the compression term must be negated to push them less, not more.
    dy: pdy - (featY - faceCy) * (yFactor - 1),
  };
}

function strokeCentroid(stroke: Stroke): { x: number; y: number } {
  const pts = stroke.points;
  if (pts.length === 0) return { x: 0, y: 0 };
  let sx = 0, sy = 0;
  for (const p of pts) { sx += p.x; sy += p.y; }
  return { x: sx / pts.length, y: sy / pts.length };
}

function strokeBbox(stroke: Stroke): { x: number; y: number; w: number; h: number } {
  const pts = stroke.points;
  if (pts.length === 0) return { x: 0, y: 0, w: 0, h: 0 };
  let mnX = pts[0].x, mxX = pts[0].x, mnY = pts[0].y, mxY = pts[0].y;
  for (const p of pts) {
    if (p.x < mnX) mnX = p.x; if (p.x > mxX) mxX = p.x;
    if (p.y < mnY) mnY = p.y; if (p.y > mxY) mxY = p.y;
  }
  const pad = stroke.size / 2;
  return { x: mnX - pad, y: mnY - pad, w: mxX - mnX + pad * 2, h: mxY - mnY + pad * 2 };
}

function bboxesOverlap(
  ax: number, ay: number, aw: number, ah: number,
  bx: number, by: number, bw: number, bh: number,
): boolean {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

export function render(ctx: CanvasRenderingContext2D, time: number): void {
  const dpr = window.devicePixelRatio || 1;
  const cssW = ctx.canvas.width / dpr;
  const cssH = ctx.canvas.height / dpr;

  ctx.clearRect(0, 0, cssW, cssH);
  ctx.fillStyle = state.canvasBackground;
  ctx.fillRect(0, 0, cssW, cssH);

  syncFillCanvas(ctx.canvas.width, ctx.canvas.height);
  const fillLayer = getFillCanvas();

  const inAnimate = state.mode === 'animate';

  // Puppet state — computed once per frame
  let pdx = 0, pdy = 0, pmaxOffset = 60;
  let faceCx = 0, faceCy = 0;
  let xFactor = 1, yFactor = 1;
  let faceShiftX = 0, faceShiftY = 0; // extra slide when features hit the wall
  let bodyShiftX = 0, bodyShiftY = 0; // body follow (slow) + wall slide
  let hairBehindDropY = 0; // extra downward shift for hair-behind-face past halfway-up
  let faceBounds: { x: number; y: number; w: number; h: number } | null = null;
  // outer stroke id → { inner stroke, eye radius, eye center }
  const puppetOuterMap = new Map<string, { inner: Stroke | null; radius: number; center: { x: number; y: number } }>();
  const puppetInnerIds = new Set<string>(); // inner stroke ids — skip in main loop
  const backgroundStrokeIds = new Set<string>(); // strokes not touching the face — static, rendered first

  if (inAnimate && state.character) {
    const char = state.character;

    for (const eye of char.eyes) {
      puppetOuterMap.set(eye.outer.id, { inner: eye.inner, radius: eye.radius, center: eye.center });
      if (eye.inner) puppetInnerIds.add(eye.inner.id);
    }

    // Face center = midpoint of eye pair (pivot for perspective compression)
    faceCx = (char.eyes[0].center.x + char.eyes[1].center.x) / 2;
    faceCy = (char.eyes[0].center.y + char.eyes[1].center.y) / 2;

    const fb = faceBlobBounds(char);
    faceBounds = fb ?? char.bounds;

    // Flood-fill: seed with strokes touching the face, grow to anything touching those.
    // This handles chains like legs→torso→face — all move with the body.
    const nonFeatureStrokes = state.strokes.filter(
      (s) => s.type !== 'eye' && s.type !== 'nose' && s.type !== 'mouth' && s.type !== 'hands',
    );
    const bboxCache = new Map<string, ReturnType<typeof strokeBbox>>();
    for (const s of nonFeatureStrokes) bboxCache.set(s.id, strokeBbox(s));

    const bodyIds = new Set<string>();
    const pendingIds = new Set<string>();
    for (const s of nonFeatureStrokes) {
      const sb = bboxCache.get(s.id)!;
      if (bboxesOverlap(sb.x, sb.y, sb.w, sb.h, faceBounds.x, faceBounds.y, faceBounds.w, faceBounds.h)) {
        bodyIds.add(s.id);
      } else {
        pendingIds.add(s.id);
      }
    }
    let changed = true;
    while (changed) {
      changed = false;
      for (const id of [...pendingIds]) {
        const sb = bboxCache.get(id)!;
        for (const bodyId of bodyIds) {
          const bb = bboxCache.get(bodyId)!;
          if (bboxesOverlap(sb.x, sb.y, sb.w, sb.h, bb.x, bb.y, bb.w, bb.h)) {
            bodyIds.add(id);
            pendingIds.delete(id);
            changed = true;
            break;
          }
        }
      }
    }
    for (const id of pendingIds) backgroundStrokeIds.add(id);

    const bx = fb ? fb.x : char.bounds.x;
    const by = fb ? fb.y : char.bounds.y;
    const bw = fb ? fb.w : char.bounds.w;
    const bh = fb ? fb.h : char.bounds.h;
    const avgR = (char.eyes[0].radius + char.eyes[1].radius) / 2;

    // Half inter-eye distances — the far eye gets this much extra travel from perspective.
    // Reduce the global limit by that margin so the far eye never leaves the face blob.
    const halfEyeX = Math.abs(char.eyes[0].center.x - char.eyes[1].center.x) / 2;
    const halfEyeY = Math.abs(char.eyes[0].center.y - char.eyes[1].center.y) / 2;
    const marginX = halfEyeX * PERSPECTIVE_COMPRESS;
    const marginY = halfEyeY * PERSPECTIVE_COMPRESS;

    const mL = Math.max(8, (faceCx - bx - avgR) - marginX);
    const mR = Math.max(8, (bx + bw - faceCx - avgR) - marginX);
    const mU = Math.max(8, (faceCy - by - avgR) - marginY);
    const mD = Math.max(8, (by + bh - faceCy - avgR) - marginY);
    const { dx: rx, dy: ry } = getPuppetRawOffset();
    const sx = rx * PUPPET_SCALE;
    const sy = ry * PUPPET_SCALE;
    pdx = sx < 0 ? Math.max(-mL, sx) : Math.min(mR, sx);
    pdy = sy < 0 ? Math.max(-mU, sy) : Math.min(mD, sy);

    // When features hit the face-blob wall, slide the whole face in that direction (max 100 px).
    const FACE_SHIFT_MAX = 100;
    if (sx > mR)       faceShiftX = Math.min(sx - mR, FACE_SHIFT_MAX);
    else if (sx < -mL) faceShiftX = Math.max(sx + mL, -FACE_SHIFT_MAX);
    else               faceShiftX = 0;
    if (sy > mD)       faceShiftY = Math.min(sy - mD, FACE_SHIFT_MAX);
    else if (sy < -mU) faceShiftY = Math.max(sy + mU, -FACE_SHIFT_MAX);
    else               faceShiftY = 0;

    lastFaceShiftX = faceShiftX;
    lastFaceShiftY = faceShiftY;
    bodyShiftX = pdx * BODY_FOLLOW_SCALE + faceShiftX;
    bodyShiftY = pdy * BODY_FOLLOW_SCALE + faceShiftY;

    // Past halfway-up, drop hair down (it's already drawn behind the face blob in pass 1b)
    // so the back of the head visually sinks behind — enhances the 3D tilt-back illusion.
    const halfU = mU / 2;
    if (pdy < -halfU) {
      const t = Math.min(1, (-pdy - halfU) / halfU);
      hairBehindDropY = t * mU * HAIR_BEHIND_DROP_MAX;
    } else {
      hairBehindDropY = 0;
    }

    // Normalize each axis by its own directional limit so compression always
    // reaches PERSPECTIVE_COMPRESS at the face-blob edge regardless of face shape.
    // Cap at 150 px so the effect is strong on large canvases too.
    const xNorm = Math.min(150, Math.max(1, pdx >= 0 ? mR : mL));
    const yNorm = Math.min(150, Math.max(1, pdy >= 0 ? mD : mU));
    xFactor = 1 - (Math.abs(pdx) / xNorm) * PERSPECTIVE_COMPRESS;
    yFactor = 1 - (Math.abs(pdy) / yNorm) * PERSPECTIVE_COMPRESS;
    pmaxOffset = xNorm; // used for mouth width compression
  }

  // Pass 1 (animate only): background strokes — static, drawn behind everything
  if (inAnimate && backgroundStrokeIds.size > 0) {
    for (const stroke of state.strokes) {
      if (backgroundStrokeIds.has(stroke.id)) renderWobbled(ctx, stroke, time);
    }
  }

  // Pass 1b (animate + cursor up): hair behind face — render hair before the face blob
  // so the face blob naturally covers the hair, giving a 3D "looking up" illusion.
  if (inAnimate && pdy < 0) {
    for (const stroke of state.strokes) {
      if (stroke.type !== 'hair') continue;
      if (backgroundStrokeIds.has(stroke.id)) continue;
      ctx.save();
      ctx.translate(bodyShiftX, bodyShiftY + hairBehindDropY);
      renderWobbled(ctx, stroke, time);
      ctx.restore();
    }
  }

  if (fillLayer) {
    if (bodyShiftX !== 0 || bodyShiftY !== 0) {
      ctx.save();
      ctx.translate(bodyShiftX, bodyShiftY);
      ctx.drawImage(fillLayer, 0, 0, cssW, cssH);
      ctx.restore();
    } else {
      ctx.drawImage(fillLayer, 0, 0, cssW, cssH);
    }
  }

  for (const stroke of state.strokes) {
    if (inAnimate && stroke.type === 'mouth') continue;
    if (inAnimate && stroke.type === 'nose') continue; // drawn after mouth frame
    if (inAnimate && stroke.type === 'hands') continue; // drawn after nose
    if (inAnimate && stroke.type === 'hair' && pdy < 0) continue; // drawn behind face in pass 1b

    if (inAnimate && stroke.type === 'eye') {
      if (puppetInnerIds.has(stroke.id)) continue; // rendered clipped inside its outer

      const { x: scx, y: scy } = strokeCentroid(stroke);
      const { dx: offDx, dy: offDy } = perspOffset(scx, scy, faceCx, faceCy, pdx, pdy, xFactor, yFactor);

      ctx.save();
      ctx.translate(offDx + bodyShiftX, offDy + bodyShiftY);
      renderWobbled(ctx, stroke, time);
      ctx.restore();

      // Render pupil clipped to this eye circle so it can never escape the outer blob
      const eyeData = puppetOuterMap.get(stroke.id);
      if (eyeData?.inner) {
        const { inner, radius: eyeR, center: eyeC } = eyeData;
        const len = Math.sqrt(pdx * pdx + pdy * pdy);
        let extraX = 0, extraY = 0;
        if (len > 0.5) {
          extraX = (pdx / len) * eyeR * 0.35;
          extraY = (pdy / len) * eyeR * 0.35;
        }
        const wobbledC = wobble(eyeC, time, stroke.wobbleSeed);
        ctx.save();
        ctx.beginPath();
        ctx.arc(wobbledC.x + offDx + bodyShiftX, wobbledC.y + offDy + bodyShiftY, eyeR, 0, Math.PI * 2);
        ctx.clip();
        ctx.translate(offDx + extraX + bodyShiftX, offDy + extraY + bodyShiftY);
        renderWobbled(ctx, inner, time);
        ctx.restore();
      }

    } else {
      if (inAnimate && backgroundStrokeIds.has(stroke.id)) continue; // already rendered in pass 1
      if (inAnimate && (bodyShiftX !== 0 || bodyShiftY !== 0)) {
        ctx.save();
        ctx.translate(bodyShiftX, bodyShiftY);
        renderWobbled(ctx, stroke, time);
        ctx.restore();
      } else {
        renderWobbled(ctx, stroke, time);
      }
    }
  }

  const active = getActiveStroke?.() ?? null;
  if (active) renderWobbled(ctx, active, time);

  if (state.mode === 'paint' && state.activeBrush !== 'outline-fill') {
    drawCursor(ctx, state.activeSize, state.activeColor);
  }

  if (inAnimate && state.character) {
    const dt = prevTime > 0 ? time - prevTime : 0;
    if (bph1 === 'idle') {
      blinkCountdown -= dt;
      if (blinkCountdown <= 0) { bph1 = 'closing'; eye2Pending = true; eye2Timer = EYE2_DELAY_MS; }
    }
    if (eye2Pending) { eye2Timer -= dt; if (eye2Timer <= 0) { bph2 = 'closing'; eye2Pending = false; } }
    if (bph1 === 'closing') {
      bp1 = Math.min(1, bp1 + dt / BLINK_CLOSE_MS);
      if (bp1 >= 1) { bph1 = 'holding'; bhold1 = BLINK_HOLD_MS; }
    } else if (bph1 === 'holding') {
      bhold1 -= dt; if (bhold1 <= 0) bph1 = 'opening';
    } else if (bph1 === 'opening') {
      bp1 = Math.max(0, bp1 - dt / BLINK_OPEN_MS);
      if (bp1 <= 0) { bph1 = 'idle'; blinkCountdown = 2000 + Math.random() * 3000; }
    }
    if (bph2 === 'closing') {
      bp2 = Math.min(1, bp2 + dt / BLINK_CLOSE_MS);
      if (bp2 >= 1) { bph2 = 'holding'; bhold2 = BLINK_HOLD_MS; }
    } else if (bph2 === 'holding') {
      bhold2 -= dt; if (bhold2 <= 0) bph2 = 'opening';
    } else if (bph2 === 'opening') {
      bp2 = Math.max(0, bp2 - dt / BLINK_OPEN_MS);
      if (bp2 <= 0) bph2 = 'idle';
    }

    const { rms, tilt } = getSpeechFeatures();
    const targetFrame = selectMouthFrameIndex(rms, tilt);
    smoothFrame = smoothFrame * 0.55 + targetFrame * 0.45;
    const frameIndex = Math.round(smoothFrame) as FrameIndex;

    drawMouthFrame(ctx, state.character, frameIndex, pdx, pdy, faceCx, faceCy, xFactor, yFactor, pmaxOffset, bodyShiftX, bodyShiftY, faceBounds);

    // Nose always on top of mouth
    for (const stroke of state.strokes) {
      if (stroke.type !== 'nose') continue;
      const { x: scx, y: scy } = strokeCentroid(stroke);
      let { dx: offDx, dy: offDy } = perspOffset(scx, scy, faceCx, faceCy, pdx, pdy, xFactor, yFactor);
      if (faceBounds) {
        offDx = Math.max(faceBounds.x - scx, Math.min(faceBounds.x + faceBounds.w - scx, offDx));
        offDy = Math.max(faceBounds.y - scy, Math.min(faceBounds.y + faceBounds.h - scy, offDy));
      }
      ctx.save();
      ctx.translate(offDx + bodyShiftX, offDy + bodyShiftY);
      renderWobbled(ctx, stroke, time);
      ctx.restore();
    }

    // Hands gesture pass — after nose, move with body; morph shape when speaking
    const { rms: handsRms } = getSpeechFeatures();
    const isSpeaking = handsRms > 0.04;
    for (const stroke of state.strokes) {
      if (stroke.type !== 'hands') continue;
      ctx.save();
      ctx.translate(bodyShiftX, bodyShiftY);
      let renderStroke = stroke;
      if (isSpeaking && stroke.points.length >= 2) {
        const phase = stroke.wobbleSeed;
        // bendAmount oscillates + / 0 / − → curves up, straight, curves down
        const bendAmount = Math.sin(time * 0.006 + phase) * Math.min(handsRms * 90, 45);
        const pts = stroke.points;
        const dx = pts[pts.length - 1].x - pts[0].x;
        const dy = pts[pts.length - 1].y - pts[0].y;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len > 0) {
          const perpX = -dy / len;
          const perpY = dx / len;
          renderStroke = {
            ...stroke,
            points: pts.map((p, i) => {
              const t = i / Math.max(pts.length - 1, 1);
              const bow = Math.sin(Math.PI * t) * bendAmount;
              return { x: p.x + perpX * bow, y: p.y + perpY * bow };
            }),
          };
        }
      }
      renderWobbled(ctx, renderStroke, time);
      ctx.restore();
    }

    drawEqualizer(ctx, cssW, cssH);

    if (bp1 > 0 || bp2 > 0) {
      drawBlinkCovers(ctx, state.character, bp1, bp2, time, pdx, pdy, faceCx, faceCy, xFactor, yFactor, bodyShiftX, bodyShiftY);
    }
  }

  prevTime = time;
}

function drawMouthFrame(
  ctx: CanvasRenderingContext2D,
  character: Character,
  frameIndex: FrameIndex,
  pdx: number,
  pdy: number,
  faceCx: number,
  faceCy: number,
  xFactor: number,
  yFactor: number,
  pmaxOffset: number,
  faceShiftX: number,
  faceShiftY: number,
  fb: { x: number; y: number; w: number; h: number } | null,
): void {
  const frames = getMouthFrames();
  if (!frames) return;

  const allPts = character.mouth.strokes.flatMap((s) => s.points);
  if (allPts.length === 0) return;

  let minX = allPts[0].x, maxX = allPts[0].x;
  let minY = allPts[0].y, maxY = allPts[0].y;
  for (const p of allPts) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }

  const pad = Math.max(...character.mouth.strokes.map((s) => s.size / 2));
  minX -= pad; maxX += pad;
  minY -= pad; maxY += pad;

  const mouthW = maxX - minX;
  const mouthH = maxY - minY;
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;

  const [vbW, vbH] = FRAME_VIEWBOXES[frameIndex];
  const naturalDrawH = mouthW * (vbH / vbW) * HEIGHT_SCALE;
  const drawH = Math.max(mouthH, naturalDrawH);

  // Perspective offset for mouth center
  const { dx: offDx, dy: offDy } = perspOffset(cx, cy, faceCx, faceCy, pdx, pdy, xFactor, yFactor);

  // 3D width compression when looking sideways
  const normalizedDx = pmaxOffset > 0 ? pdx / pmaxOffset : 0;
  const widthScale = Math.max(0.7, 1 - Math.abs(normalizedDx) * 0.3);
  const drawW = mouthW * widthScale;

  ctx.save();
  if (fb) {
    ctx.beginPath();
    ctx.ellipse(
      fb.x + fb.w / 2 + faceShiftX,
      fb.y + fb.h / 2 + faceShiftY,
      fb.w / 2, fb.h / 2,
      0, 0, Math.PI * 2,
    );
    ctx.clip();
  }
  ctx.drawImage(frames[frameIndex], cx + offDx + faceShiftX - drawW / 2, cy + offDy + faceShiftY - drawH / 2, drawW, drawH);
  ctx.restore();
}

function faceBlobBounds(character: Character): { x: number; y: number; w: number; h: number } | null {
  if (character.body.length === 0) return null;
  let best = character.body[0];
  let bestArea = 0;
  for (const s of character.body) {
    const pts = s.points;
    if (pts.length === 0) continue;
    let mnX = pts[0].x, mxX = pts[0].x, mnY = pts[0].y, mxY = pts[0].y;
    for (const p of pts) {
      if (p.x < mnX) mnX = p.x; if (p.x > mxX) mxX = p.x;
      if (p.y < mnY) mnY = p.y; if (p.y > mxY) mxY = p.y;
    }
    const area = (mxX - mnX + s.size) * (mxY - mnY + s.size);
    if (area > bestArea) { bestArea = area; best = s; }
  }
  const pts = best.points;
  if (pts.length === 0) return null;
  let mnX = pts[0].x, mxX = pts[0].x, mnY = pts[0].y, mxY = pts[0].y;
  for (const p of pts) {
    if (p.x < mnX) mnX = p.x; if (p.x > mxX) mxX = p.x;
    if (p.y < mnY) mnY = p.y; if (p.y > mxY) mxY = p.y;
  }
  const pad = best.size / 2;
  return { x: mnX - pad, y: mnY - pad, w: mxX - mnX + pad * 2, h: mxY - mnY + pad * 2 };
}

function faceColor(character: Character): string {
  if (character.body.length === 0) return state.canvasBackground;
  let best = character.body[0];
  let bestArea = 0;
  for (const s of character.body) {
    const pts = s.points;
    if (pts.length === 0) continue;
    let minX = pts[0].x, maxX = pts[0].x, minY = pts[0].y, maxY = pts[0].y;
    for (const p of pts) {
      if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
    }
    const area = (maxX - minX + s.size) * (maxY - minY + s.size);
    if (area > bestArea) { bestArea = area; best = s; }
  }
  return best.color;
}

function drawBlinkCovers(
  ctx: CanvasRenderingContext2D,
  character: Character,
  progress1: number,
  progress2: number,
  time: number,
  pdx: number,
  pdy: number,
  faceCx: number,
  faceCy: number,
  xFactor: number,
  yFactor: number,
  faceShiftX: number,
  faceShiftY: number,
): void {
  const lidColor = faceColor(character);
  const progresses: [number, number] = [progress1, progress2];

  character.eyes.forEach((eye, i) => {
    const progress = progresses[i];
    if (progress <= 0) return;

    const center = wobble(eye.center, time, eye.outer.wobbleSeed);
    const { dx: offDx, dy: offDy } = perspOffset(eye.center.x, eye.center.y, faceCx, faceCy, pdx, pdy, xFactor, yFactor);
    const cx = center.x + offDx + faceShiftX;
    const cy = center.y + offDy + faceShiftY;
    const r = eye.radius;

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r * 1.05, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = lidColor;
    ctx.fillRect(cx - r * 1.05, cy - r * 1.05, r * 2.1, r * progress);
    ctx.fillRect(cx - r * 1.05, cy + r * 1.05 - r * progress, r * 2.1, r * progress);
    ctx.restore();
  });
}

function drawEqualizer(ctx: CanvasRenderingContext2D, cssW: number, cssH: number): void {
  const BAR_COUNT = 7;
  const barW = 9;
  const gap = 4;
  const maxH = 44;
  const totalW = BAR_COUNT * (barW + gap) - gap;
  const x0 = cssW / 2 - totalW / 2;
  const baseY = cssH - 18;

  ctx.save();

  const bars = getFrequencyBars(BAR_COUNT);
  const active = isMicActive();

  ctx.font = "13px 'Patrick Hand', cursive";
  ctx.textAlign = 'center';
  ctx.fillStyle = active ? 'rgba(80,80,80,0.55)' : 'rgba(180,80,80,0.7)';
  ctx.fillText(active ? 'hearing you…' : 'mic off', cssW / 2, cssH - 72);

  bars.forEach((v, i) => {
    const h = Math.max(3, v * maxH);
    const x = x0 + i * (barW + gap);
    const hue = 120 - v * 50;
    ctx.fillStyle = active ? `hsla(${hue}, 65%, 48%, 0.8)` : 'rgba(200,200,200,0.4)';
    ctx.beginPath();
    ctx.roundRect(x, baseY - h, barW, h, 3);
    ctx.fill();
    ctx.strokeStyle = 'rgba(26,26,26,0.25)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  });

  ctx.restore();
}
