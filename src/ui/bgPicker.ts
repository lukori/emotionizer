import { state, setState, subscribe } from '../state';

const BG_PRESETS = [
  '#fefcf7',
  '#2a8cd9',
  '#7fbf4a',
  '#ec6ba9',
  '#f7c52d',
  '#1a1a2e',
];

export function createBgPicker(): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'bg-picker';

  const label = document.createElement('span');
  label.className = 'section-label';
  label.textContent = 'Canvas';
  wrap.appendChild(label);

  const swatchRow = document.createElement('div');
  swatchRow.className = 'swatch-row';

  const buttons: HTMLButtonElement[] = [];

  function updateActive(): void {
    buttons.forEach((btn) => {
      btn.classList.toggle('active', btn.dataset['bg'] === state.canvasBackground);
    });
  }

  BG_PRESETS.forEach((color) => {
    const btn = document.createElement('button');
    btn.className = 'swatch swatch-bg';
    btn.dataset['bg'] = color;
    btn.style.background = color;
    btn.title = color;
    if (color === '#fefcf7') {
      btn.style.border = '1.5px solid #ccc';
    }
    btn.addEventListener('click', () => setState({ canvasBackground: color }));
    buttons.push(btn);
    swatchRow.appendChild(btn);
  });

  // Custom bg picker
  const customInput = document.createElement('input');
  customInput.type = 'color';
  customInput.className = 'color-input-hidden';
  customInput.value = state.canvasBackground;

  const customBtn = document.createElement('button');
  customBtn.className = 'swatch swatch-custom swatch-bg';
  customBtn.textContent = '+';
  customBtn.title = 'Custom background';
  customBtn.addEventListener('click', () => customInput.click());

  customInput.addEventListener('input', () => {
    setState({ canvasBackground: customInput.value });
  });

  swatchRow.appendChild(customInput);
  swatchRow.appendChild(customBtn);
  wrap.appendChild(swatchRow);

  subscribe(updateActive);
  updateActive();

  return wrap;
}
