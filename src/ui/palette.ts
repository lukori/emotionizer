import { state, setState, subscribe } from '../state';

const SWATCHES = [
  '#1a1a1a',
  '#ffffff',
  '#e23838',
  '#2a8cd9',
  '#7fbf4a',
  '#f7c52d',
  '#ef8b3a',
  '#8e54c6',
  '#ec6ba9',
];

export function createPalette(): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'palette';

  const swatchRow = document.createElement('div');
  swatchRow.className = 'swatch-row';

  const buttons: HTMLButtonElement[] = [];

  function updateActive(): void {
    buttons.forEach((btn) => {
      btn.classList.toggle('active', btn.dataset['color'] === state.activeColor);
    });
  }

  SWATCHES.forEach((color) => {
    const btn = document.createElement('button');
    btn.className = 'swatch';
    btn.dataset['color'] = color;
    btn.style.background = color;
    btn.title = color;
    if (color === '#ffffff') btn.style.border = '1.5px solid #ccc';
    btn.addEventListener('click', () => setState({ activeColor: color }));
    buttons.push(btn);
    swatchRow.appendChild(btn);
  });

  // Custom color picker
  const customInput = document.createElement('input');
  customInput.type = 'color';
  customInput.className = 'color-input-hidden';
  customInput.value = state.activeColor;

  const customBtn = document.createElement('button');
  customBtn.className = 'swatch swatch-custom';
  customBtn.textContent = '+';
  customBtn.title = 'Custom color';
  customBtn.addEventListener('click', () => customInput.click());

  customInput.addEventListener('input', () => {
    setState({ activeColor: customInput.value });
  });

  swatchRow.appendChild(customInput);
  swatchRow.appendChild(customBtn);
  wrap.appendChild(swatchRow);

  subscribe(updateActive);
  updateActive();

  return wrap;
}
