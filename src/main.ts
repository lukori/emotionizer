import './styles.css';

// Register all brushes before anything else — order determines toolbar button order
import './brushes/bodyBrush';
import './brushes/hairBrush';
import './brushes/outlineFillBrush';
import './brushes/eyeBrush';
import './brushes/noseBrush';
import './brushes/mouthBrush';
import './brushes/handsBrush';

import { initCanvas } from './drawing/canvas';
import { createToolbar } from './ui/toolbar';
import { createSensitivitySlider } from './ui/sensitivitySlider';
import { state, setState } from './state';
import { preloadMouthFrames } from './audio/mouthFrames';
import { detectCharacter } from './character/detect';
import { startMic, stopMic } from './audio/mic';
import { getLastFaceShift } from './drawing/renderer';
import { shiftFillCanvas } from './drawing/fillLayer';

preloadMouthFrames();

const app = document.getElementById('app')!;

initCanvas(app);

const toolbar = createToolbar(app);
app.appendChild(toolbar);

createSensitivitySlider(app);

const logo = document.createElement('img');
logo.src = `${import.meta.env.BASE_URL}sulamstar.svg`;
logo.style.cssText = 'position:absolute;right:26px;width:52px;height:auto;z-index:100;pointer-events:none;filter:brightness(0);opacity:0.82;';
app.appendChild(logo);

const alignLogo = () => {
  logo.style.top = `${toolbar.getBoundingClientRect().top}px`;
};
alignLogo();
window.addEventListener('resize', alignLogo);

document.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement) return;
  if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
    e.preventDefault();
    setState({ strokes: state.strokes.slice(0, -1) });
    return;
  }
  if ((e.key === 'a' || e.key === 'A') && !e.metaKey && !e.ctrlKey && !e.altKey) {
    if (e.repeat || state.mode === 'animate') return;
    const result = detectCharacter(state.strokes);
    if (result.success) {
      setState({ mode: 'animate', character: result.character });
      startMic();
    }
  }
});

document.addEventListener('keyup', (e) => {
  if (e.key === 'a' || e.key === 'A') {
    if (state.mode === 'animate') {
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
    }
  }
});
