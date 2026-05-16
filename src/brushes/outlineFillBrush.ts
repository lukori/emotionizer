import type { Stroke } from '../types';
import { registerBrush } from './brushTypes';

registerBrush({
  id: 'outline-fill',
  label: 'Fill',
  strokeType: 'body',
  defaultSize: 4,
  defaultFilled: false,
  hasSizePicker: false,
  onEnd(_stroke: Stroke) {},
  render(_ctx: CanvasRenderingContext2D, _stroke: Stroke) {},
});
