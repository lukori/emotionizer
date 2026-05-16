let entryX: number | null = null;
let entryY: number | null = null;
let rawDx = 0;
let rawDy = 0;

function onMove(e: PointerEvent): void {
  if (entryX === null) {
    entryX = e.clientX;
    entryY = e.clientY;
    return;
  }
  rawDx = e.clientX - entryX;
  rawDy = (e.clientY - entryY!);
}

export function getPuppetRawOffset(): { dx: number; dy: number } {
  return { dx: rawDx, dy: rawDy };
}

export function startPuppetTracking(): void {
  entryX = null;
  entryY = null;
  rawDx = 0;
  rawDy = 0;
  window.addEventListener('pointermove', onMove);
}

export function stopPuppetTracking(): void {
  window.removeEventListener('pointermove', onMove);
  entryX = null;
  entryY = null;
  rawDx = 0;
  rawDy = 0;
}
