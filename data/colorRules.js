// Color derivation from valence/arousal coordinates.
// Used for blended outputs (when two emotions don't resolve to a named dyad)
// and for extended/nearest-neighbour fallback renders.
// Named emotions have hard-coded color descriptors in emotions.json.

export function deriveColor(valence, arousal) {
  return {
    temperature: deriveTemperature(valence),
    saturation:  deriveSaturation(valence, arousal),
    brightness:  deriveBrightness(valence, arousal),
  };
}

function deriveTemperature(v) {
  if (v > 0.15)  return 'warm';
  if (v < -0.15) return 'cold';
  return 'neutral temperature';
}

function deriveSaturation(v, a) {
  // Positive + high arousal → vibrant; positive alone → saturated
  // Negative or low arousal → desaturated; very negative + low → very desaturated
  if (v > 0.3 && a > 0.4)   return 'highly saturated';
  if (v > 0.3)               return 'saturated';
  if (v > 0.1)               return 'desaturated';
  if (v < -0.5 && a < -0.3) return 'very desaturated';
  return 'desaturated';
}

function deriveBrightness(v, a) {
  // Valence is the dominant driver; arousal modulates the extremes
  if (v > 0.5 && a > 0.3)  return 'very bright';
  if (v > 0.5)              return 'bright';
  if (v > 0.1)              return 'medium brightness';
  if (v > -0.4)             return 'dark';
  if (v < -0.6 && a > 0.4) return 'very dark';
  return 'dark';
}

// Accent CSS hue/chroma/lightness shifts for the canvas background.
// Returns an oklch delta object {h, c, lAdjust} to apply on top of the base palette.
export function deriveAccent(temperature, saturation, brightness) {
  const hue = temperature === 'warm' ? 35
            : temperature === 'cold' ? 215
            : 45;

  const chroma = saturation === 'highly saturated' ? 0.09
               : saturation === 'saturated'         ? 0.055
               : saturation === 'desaturated'       ? 0.025
               : 0.012; // very desaturated

  const lAdjust = brightness === 'very bright' ?  0.06
                : brightness === 'bright'       ?  0.03
                : brightness === 'medium brightness' ? 0
                : brightness === 'dark'         ? -0.03
                : -0.06; // very dark

  return { hue, chroma, lAdjust };
}
