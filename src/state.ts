import type { AppState } from './types';

export const state: AppState = {
  strokes: [],
  canvasBackground: '#fefcf7',
  activeBrush: 'medium',
  activeColor: '#1a1a1a',
  activeSize: 8,
  mode: 'paint',
  character: null,
};

type Listener = () => void;
const listeners: Listener[] = [];

export function subscribe(fn: Listener): () => void {
  listeners.push(fn);
  return () => {
    const i = listeners.indexOf(fn);
    if (i >= 0) listeners.splice(i, 1);
  };
}

export function setState(partial: Partial<AppState>): void {
  Object.assign(state, partial);
  for (const fn of listeners) fn();
}
