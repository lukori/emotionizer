import { state, setState, subscribe } from '../state';
import { getAllBrushes } from '../brushes/brushTypes';
import type { BrushId } from '../types';
import { createPalette } from './palette';
import { createBgPicker } from './bgPicker';
import { detectCharacter } from '../character/detect';
import { startMic, stopMic } from '../audio/mic';
import { getLastFaceShift } from '../drawing/renderer';
import { shiftFillCanvas } from '../drawing/fillLayer';

function createBrushPicker(): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'brush-picker';

  const label = document.createElement('span');
  label.className = 'section-label';
  label.textContent = 'Brush';
  wrap.appendChild(label);

  const btnRow = document.createElement('div');
  btnRow.className = 'brush-btn-row';

  const buttons = new Map<BrushId, HTMLButtonElement>();

  getAllBrushes().forEach((brush) => {
    const btn = document.createElement('button');
    btn.className = 'brush-btn';
    btn.dataset['brushId'] = brush.id;
    btn.textContent = brush.label;
    btn.addEventListener('click', () => {
      setState({ activeBrush: brush.id, activeSize: brush.defaultSize });
    });
    buttons.set(brush.id, btn);
    btnRow.appendChild(btn);
  });

  wrap.appendChild(btnRow);

  const sizePicker = document.createElement('div');
  sizePicker.className = 'size-picker';
  const sizeButtons: HTMLButtonElement[] = [];

  function updateSizePicker(): void {
    const brush = getAllBrushes().find((b) => b.id === state.activeBrush);
    sizePicker.innerHTML = '';
    sizeButtons.length = 0;

    if (!brush?.hasSizePicker) { sizePicker.style.display = 'none'; return; }

    sizePicker.style.display = 'flex';
    brush.sizePicker!.forEach((sz) => {
      const btn = document.createElement('button');
      btn.className = 'size-btn';
      btn.textContent = `${sz}`;
      btn.dataset['size'] = String(sz);
      btn.classList.toggle('active', sz === state.activeSize);
      btn.addEventListener('click', () => setState({ activeSize: sz }));
      sizeButtons.push(btn);
      sizePicker.appendChild(btn);
    });
  }

  wrap.appendChild(sizePicker);

  function updateBrushButtons(): void {
    buttons.forEach((btn, id) => btn.classList.toggle('active', id === state.activeBrush));
    updateSizePicker();
    sizeButtons.forEach((btn) =>
      btn.classList.toggle('active', Number(btn.dataset['size']) === state.activeSize),
    );
  }

  subscribe(updateBrushButtons);
  updateBrushButtons();

  return wrap;
}

function showToast(app: HTMLElement, message: string): void {
  const existing = app.querySelector('.detect-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = 'detect-toast';
  toast.textContent = message;
  app.appendChild(toast);

  requestAnimationFrame(() => toast.classList.add('detect-toast--visible'));
  setTimeout(() => {
    toast.classList.remove('detect-toast--visible');
    setTimeout(() => toast.remove(), 400);
  }, 3000);
}

export function createToolbar(app: HTMLElement): HTMLElement {
  const toolbar = document.createElement('div');
  toolbar.className = 'toolbar';

  // ── Paint-mode section (brush, color, bg, undo, clear, animate) ──
  const paintSection = document.createElement('div');
  paintSection.className = 'paint-section';

  const brushPicker = createBrushPicker();
  const div1 = document.createElement('div'); div1.className = 'toolbar-divider';
  const colorLabel = document.createElement('span');
  colorLabel.className = 'section-label'; colorLabel.textContent = 'Color';
  const palette = createPalette();
  const div2 = document.createElement('div'); div2.className = 'toolbar-divider';
  const bgPicker = createBgPicker();
  const div3 = document.createElement('div'); div3.className = 'toolbar-divider';

  const undoBtn = document.createElement('button');
  undoBtn.className = 'undo-btn'; undoBtn.textContent = '↩'; undoBtn.title = 'Undo';
  undoBtn.addEventListener('click', () => setState({ strokes: state.strokes.slice(0, -1) }));

  const clearBtn = document.createElement('button');
  clearBtn.className = 'clear-btn'; clearBtn.textContent = '✕'; clearBtn.title = 'Clear';
  clearBtn.addEventListener('click', () => setState({ strokes: [] }));

  const animateBtn = document.createElement('button');
  animateBtn.className = 'animate-btn'; animateBtn.textContent = '▶'; animateBtn.title = 'Animate (A)';
  animateBtn.addEventListener('click', () => {
    const result = detectCharacter(state.strokes);
    if (result.success) {
      setState({ mode: 'animate', character: result.character });
      startMic().then((ok) => {
        if (!ok) showToast(app, 'Mic access denied — no sound detection');
      });
    } else {
      showToast(app, result.message);
    }
  });

  const actionRow = document.createElement('div');
  actionRow.className = 'action-row';
  actionRow.appendChild(undoBtn);
  actionRow.appendChild(clearBtn);

  const actionWrap = document.createElement('div');
  actionWrap.className = 'action-btns';
  actionWrap.appendChild(actionRow);
  actionWrap.appendChild(animateBtn);

  paintSection.appendChild(brushPicker);
  paintSection.appendChild(div1);
  paintSection.appendChild(colorLabel);
  paintSection.appendChild(palette);
  paintSection.appendChild(div2);
  paintSection.appendChild(bgPicker);
  paintSection.appendChild(div3);
  paintSection.appendChild(actionWrap);

  // ── Animate-mode section (stop only) ──
  const animateSection = document.createElement('div');
  animateSection.className = 'animate-section';

  const modeLabel = document.createElement('span');
  modeLabel.className = 'section-label'; modeLabel.textContent = 'Animating';
  const stopBtn = document.createElement('button');
  stopBtn.className = 'stop-btn'; stopBtn.textContent = '■ Stop';
  stopBtn.addEventListener('click', () => {
    const { dx, dy } = getLastFaceShift();
    stopMic();
    if (dx !== 0 || dy !== 0) {
      const shifted = state.strokes.map((s) => ({
        ...s,
        points: s.points.map((p) => ({ x: p.x + dx, y: p.y + dy })),
      }));
      shiftFillCanvas(dx, dy);
      setState({ mode: 'paint', character: null, strokes: shifted });
    } else {
      setState({ mode: 'paint', character: null });
    }
  });

  animateSection.appendChild(modeLabel);
  animateSection.appendChild(stopBtn);

  toolbar.appendChild(paintSection);
  toolbar.appendChild(animateSection);

  function syncMode(): void {
    const inAnim = state.mode === 'animate';
    paintSection.style.display = inAnim ? 'none' : 'flex';
    animateSection.style.display = inAnim ? 'flex' : 'none';
  }

  subscribe(syncMode);
  syncMode();

  return toolbar;
}
