import mouth01Raw from '../assets/mouth01.svg?raw';
import mouth02Raw from '../assets/mouth02.svg?raw';
import mouth03Raw from '../assets/mouth03.svg?raw';
import mouth04Raw from '../assets/mouth04.svg?raw';
import mouth05Raw from '../assets/mouth05.svg?raw';
import mouth06Raw from '../assets/mouth06.svg?raw';

// Natural aspect ratios [vbW, vbH] from each SVG's viewBox
export const FRAME_VIEWBOXES: [number, number][] = [
  [200.15, 7.49],  // 01 closed
  [200,    45],    // 02 slight open
  [148,    59],    // 03 medium open
  [37.81,  47.41], // 04 O sound
  [221,    42],    // 05 EE sound
  [155,    43],    // 06 AH sound
];

// All frames scale so mouth04 (O) renders at 18% of the drawn mouth width
// (= the previous 30% target × 60% as requested).
export const HEIGHT_SCALE = 0.30 * (37.81 / 47.41) * 0.60;

// Outer boundary path (first M…Z subpath of the main dark <path>) in SVG coords.
// Injected as an SVG-level <clipPath> so the browser clips internally —
// white teeth inside the boundary stay white; white bg-mask rectangles outside disappear.
// null = no background-mask paths in this SVG, no clipping needed.
const CLIP_DS: (string | null)[] = [
  null,
  // mouth02
  'M200,.98v3.91c-1.61.06-4.04,2-5.15,3.8-13.68,7.94-27.29,14.8-41.72,21.57-16.33,7-32.72,12.02-49.65,14.74l-31.68-.49C45.85,41.78,20.12,28.91,4.58,7.21c-1.26-.48-3.78-1.56-3.7-2.69S2.39.33,3.44.8l3.97,1.79,17.11.8,24.69,1.07,35.85.93c16.67.43,33.15.68,49.76.05l23.35-.9,11.03-.67,30.82-2.89Z',
  // mouth03
  'M75.49,59h-24.83c-12.85-3.5-23.64-11.63-34.28-20.08-7.06-5.61-11.7-12.79-14.05-21.61L0,9.83V1.97l16.49.44,17.73,1.05,23.87,1c13.03.55,26.04.89,39.32.17l17.85-.96,10.88-.93,9.85-1.07c3.97-.43,7.73-1.08,11.88.05-10.99,15.16-23.36,26.63-35.75,39.46-10.22,10.58-22.05,16.32-36.64,17.83Z',
  null,
  // mouth05
  'M21.9,0l4,1.05c5.69.72,11.09.65,16.92.94l11.99.6,25.41.85c26.19.88,52.29,1.25,78.47.03l22.2-1.04,13.02-.93,10.3-.67,2.84-.84h8.96c6.49,6.06,5.49,18.65-1.83,23.71s-31.56,14.99-39.06,15.11l-41.23.67-13.96,1.07c-35.2,2.7-70.23-2.51-104.57-10.48-6.51-1.51-11.85-4.92-15.38-9.58v-8.79C3.9,3.5,10.96,2.97,18.91,0h2.99Z',
  // mouth06
  'M152.02,0c3.91,5.1,1.63,12.78.06,20.17-1.73,8.16-5.57,13.16-13.66,15.57-8.77,2.62-17.85,5.47-27.46,5.92-14.68.68-29.24.52-43.88-.07l-22.3-.9c-3.49-.14-7.36-.66-10.97-.56-16.25.46-28.82-4.06-33.8-18.63V2.93l8.9.68,18.87,1.01,16.26.87,31.4.72c4.24.1,7.85.09,12.09,0l27.66-.63,10.02-.77,19.95-1.85c.65-.06,2.76.05,2.81-.54l.09-2.41h3.97Z',
];

// Inject an SVG-level <clipPath> and apply it to the outermost <g>
function addSvgClip(svg: string, clipD: string): string {
  const def = `<clipPath id="mc"><path d="${clipD}"/></clipPath>`;
  return svg
    .replace('<defs>', `<defs>${def}`)
    .replace('<g id=', '<g clip-path="url(#mc)" id=');
}

const SVG_STRINGS = [mouth01Raw, mouth02Raw, mouth03Raw, mouth04Raw, mouth05Raw, mouth06Raw].map(
  (svg, i) => {
    const clipD = CLIP_DS[i];
    return clipD ? addSvgClip(svg, clipD) : svg;
  },
);

let frames: HTMLImageElement[] | null = null;

export async function preloadMouthFrames(): Promise<void> {
  frames = await Promise.all(
    SVG_STRINGS.map(
      (svg) =>
        new Promise<HTMLImageElement>((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = reject;
          img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
        }),
    ),
  );
}

export function getMouthFrames(): HTMLImageElement[] | null {
  return frames;
}

export type FrameIndex = 0 | 1 | 2 | 3 | 4 | 5;

/**
 * rms   — overall amplitude (0–1)
 * tilt  — ratio of upper-mid (F2 ~1.4–3kHz) to mid (F1 ~500–1.2kHz) energy,
 *          from getSpeechFeatures(). High tilt = bright/EE; low tilt = round/O.
 *
 *   0  silence       → 01 closed
 *   1  light speech  → 02
 *   2  medium speech → 03
 *   3  O sound       → 04 (dark, low tilt)
 *   4  EE sound      → 05 (bright, high tilt)
 *   5  AH sound      → 06 (loud, mid tilt)
 */
export function selectMouthFrameIndex(rms: number, tilt: number): FrameIndex {
  if (rms < 0.04) return 0;

  if (rms > 0.18) {
    if (tilt < 0.5)  return 3; // O — round, dark
    if (tilt > 1.3)  return 4; // EE — bright, wide
    return 5;                   // AH — general loud
  }

  if (rms > 0.10) {
    if (tilt < 0.4)  return 3; // O
    if (tilt > 1.2)  return 4; // EE
    return 2;                   // medium open
  }

  return 1; // light speech
}
