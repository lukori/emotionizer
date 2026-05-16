export type Point = { x: number; y: number };
export type StrokeType = 'body' | 'eye' | 'mouth' | 'nose' | 'hair' | 'hands';
export type BrushId =
  | 'thin'
  | 'medium'
  | 'thick'
  | 'chunky'
  | 'outline-fill'
  | 'hair'
  | 'eye'
  | 'mouth'
  | 'nose'
  | 'hands';

export interface Stroke {
  id: string;
  type: StrokeType;
  brushId: BrushId;
  points: Point[];
  color: string;
  size: number;
  filled: boolean;
  wobbleSeed: number;
}

export interface EyeUnit {
  outer: Stroke;
  inner: Stroke | null;
  center: Point;
  radius: number;
}

export interface MouthUnit {
  strokes: Stroke[];
  baseline: Point;
}

export interface NoseUnit {
  strokes: Stroke[];
  center: Point;
}

export interface CharacterAnimState {
  blinkPhase: number;
  blinkTimer: number;
  mouthOpenness: number;
}

export interface Character {
  eyes: [EyeUnit, EyeUnit];
  mouth: MouthUnit;
  nose: NoseUnit | null;
  body: Stroke[];
  bounds: { x: number; y: number; w: number; h: number };
  animState: CharacterAnimState;
}

export interface AppState {
  strokes: Stroke[];
  canvasBackground: string;
  activeBrush: BrushId;
  activeColor: string;
  activeSize: number;
  mode: 'paint' | 'animate';
  character: Character | null;
}
