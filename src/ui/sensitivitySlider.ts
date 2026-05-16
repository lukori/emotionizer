import { setNoiseFloor } from '../audio/mic';

export function createSensitivitySlider(container: HTMLElement): void {
  const wrap = document.createElement('div');
  wrap.className = 'sensitivity-slider';

  const track = document.createElement('div');
  track.className = 'sensitivity-track';

  const input = document.createElement('input');
  input.type = 'range';
  input.min = '0';
  input.max = '60';   // 0–60% noise floor covers quiet to loud rooms
  input.value = '8';  // default: quiet room
  input.className = 'sensitivity-range';
  input.title = 'Mic sensitivity — drag up for noisy rooms';

  input.addEventListener('input', () => {
    setNoiseFloor(parseInt(input.value) / 100);
  });
  input.addEventListener('pointerup', () => { input.blur(); });

  track.appendChild(input);
  wrap.appendChild(track);
  container.appendChild(wrap);
}
