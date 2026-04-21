import { deriveColor, deriveAccent } from './data/colorRules.js';

// ── Data ─────────────────────────────────────────────────────────────────────

let DB = [];  // populated on init

async function loadDB() {
  const res = await fetch('./data/emotions.json');
  const json = await res.json();
  DB = json.emotions;
}

// ── Lookup ────────────────────────────────────────────────────────────────────

function findByName(raw) {
  const q = raw.toLowerCase().trim();
  return DB.find(e =>
    e.name === q || (e.synonyms && e.synonyms.some(s => s === q))
  ) || null;
}

function nearestNeighbour(raw) {
  // Step 1: partial/prefix match
  const q = raw.toLowerCase().trim();
  const prefix = DB.find(e =>
    e.name.startsWith(q) ||
    (e.synonyms && e.synonyms.some(s => s.startsWith(q)))
  );
  if (prefix) return { entry: prefix, fuzzy: true };

  // Step 2: valence/arousal heuristic via a small built-in word list
  const vad = WORD_VAD[q];
  if (vad) {
    const [v, a] = vad;
    return { entry: closestByVA(v, a), fuzzy: true };
  }

  return null;
}

function closestByVA(v, a) {
  let best = DB[0], bestDist = Infinity;
  for (const e of DB) {
    const d = Math.hypot(e.valence - v, e.arousal - a);
    if (d < bestDist) { bestDist = d; best = e; }
  }
  return best;
}

// Small curated VAD table for words not in the main DB.
// format: word -> [valence, arousal]
const WORD_VAD = {
  // positive high
  elated:       [ 0.85,  0.70], happy:        [ 0.80,  0.60],
  overjoyed:    [ 0.85,  0.70], jubilant:     [ 0.85,  0.65],
  exhilarated:  [ 0.75,  0.80], giddy:        [ 0.70,  0.75],
  // positive low
  content:      [ 0.60, -0.40], satisfied:    [ 0.60, -0.35],
  relaxed:      [ 0.55, -0.60], cozy:         [ 0.55, -0.50],
  grateful:     [ 0.65, -0.20], appreciative: [ 0.60, -0.20],
  // mixed
  surprised:    [ 0.40,  0.80], awed:         [-0.10,  0.65],
  conflicted:   [ 0.00,  0.30], ambivalent:   [ 0.00,  0.10],
  // negative high
  outraged:     [-0.75,  0.80], livid:        [-0.80,  0.80],
  horrified:    [-0.80,  0.65], panicked:     [-0.75,  0.70],
  stressed:     [-0.45,  0.55], overwhelmed:  [-0.50,  0.60],
  // negative low
  dejected:     [-0.65, -0.40], gloomy:       [-0.60, -0.35],
  apathetic:    [-0.30, -0.65], numb:         [-0.40, -0.60],
  resigned:     [-0.45, -0.40], weary:        [-0.40, -0.40],
};

// ── Resolve: token → entry ────────────────────────────────────────────────────

function resolve(token) {
  const exact = findByName(token);
  if (exact) return { entry: exact, fuzzy: false };
  const nn = nearestNeighbour(token);
  return nn;  // null if nothing found
}

// ── Blend two or more entries ─────────────────────────────────────────────────

function dyadKey(a, b) {
  // canonical key = sorted names joined
  return [a, b].sort().join('+');
}

const DYAD_MAP = {};  // populated after DB loads

function buildDyadMap() {
  for (const e of DB) {
    if (e.family === 'dyad' && e.parents) {
      DYAD_MAP[dyadKey(e.parents[0], e.parents[1])] = e;
    }
  }
}

function resolveAlias(entry) {
  if (entry.family === 'extended' && entry.alias_of) {
    return DB.find(e => e.name === entry.alias_of) || entry;
  }
  return entry;
}

function blend(entries) {
  // Resolve aliases first
  const resolved = entries.map(resolveAlias);

  // 1 emotion — direct
  if (resolved.length === 1) {
    return { result: resolved[0], via: null };
  }

  // 2 emotions — check named dyad
  if (resolved.length === 2) {
    const key = dyadKey(resolved[0].name, resolved[1].name);
    const dyad = DYAD_MAP[key];
    if (dyad) return { result: dyad, via: `${titleCase(resolved[0].name)} + ${titleCase(resolved[1].name)} → ${titleCase(dyad.name)}` };
  }

  // 2–3 emotions — compute blended v/a and derive descriptors
  const avgV = resolved.reduce((s, e) => s + e.valence, 0) / resolved.length;
  const avgA = resolved.reduce((s, e) => s + e.arousal, 0) / resolved.length;

  const descriptors = blendDescriptors(resolved, avgV, avgA);
  const via = resolved.map(e => titleCase(e.name)).join(' + ');

  return {
    result: {
      name: via,
      valence: avgV,
      arousal: avgA,
      descriptors,
    },
    via,
  };
}

function blendDescriptors(entries, avgV, avgA) {
  // Paper (p.75): specific attributes are weighted toward dominant emotion quadrant.
  // Simplified: categorise each parent into its quadrant and pick the dominant form attributes.
  const quadrant = q => {
    const v = q.valence > 0 ? 'pos' : 'neg';
    const a = q.arousal > 0 ? 'high' : 'low';
    return `${v}-${a}`;
  };

  const quads = entries.map(quadrant);
  const hasPosHigh = quads.includes('pos-high');
  const hasPosLow  = quads.includes('pos-low');
  const hasNegHigh = quads.includes('neg-high');
  const hasNegLow  = quads.includes('neg-low');

  // Form (surface smoothness): smooth for pos, angular for neg; high-energy neg wins.
  let surface;
  if (hasNegHigh && hasPosHigh)   surface = 'smooth with sharp edges';
  else if (hasNegHigh)            surface = 'angular';
  else if (hasPosHigh && hasPosLow) surface = 'smooth with slight edges';
  else                            surface = 'smooth';

  // Direction (lean): weighted toward neg-low (sadness pulls backward) or neg-high (fear/anger push forward)
  let lean;
  if (hasNegHigh && hasNegLow)    lean = 'leaning backward';
  else if (hasNegHigh)            lean = 'leaning forward';
  else if (hasNegLow)             lean = 'slightly leaning backward';
  else if (hasPosHigh)            lean = 'slightly leaning forward';
  else                            lean = 'straight-standing';

  // Rhythm (curves): pos-high = small/medium, neg-high = irregular, pos-low = big, neg-low = big
  let curves;
  if (hasNegHigh && hasNegLow)    curves = 'irregular medium curves';
  else if (hasNegHigh)            curves = 'medium curves with irregular edges';
  else if (hasPosHigh && hasPosLow) curves = 'medium curves';
  else if (hasPosLow)             curves = 'big curves';
  else                            curves = 'medium curves';

  // Weight: pos-high weights middle, pos-low weights top, neg-high weights bottom-or-top
  let weight;
  if (hasNegHigh && hasNegLow)    weight = 'top-heavy, slightly unbalanced';
  else if (hasPosHigh && hasPosLow) weight = 'top-heavy';
  else if (hasNegHigh)            weight = 'bottom-heavy';
  else                            weight = 'middle-heavy';

  // Proportions: from dominant quadrant's parent
  const dominant = entries.reduce((a, b) =>
    Math.abs(a.valence) + Math.abs(a.arousal) > Math.abs(b.valence) + Math.abs(b.arousal) ? a : b
  );
  const proportions = dominant.descriptors?.proportions || 'round';

  // Complexity: avg arousal drives it
  const complexity = Math.abs(avgA) > 0.4 ? 'high geometric complexity'
                   : Math.abs(avgA) > 0.1 ? 'medium geometric complexity'
                   : 'low geometric complexity';

  // Color: derived from averaged v/a
  const { temperature, saturation, brightness } = deriveColor(avgV, avgA);

  return { surface, lean, curves, weight, proportions, complexity, temperature, saturation, brightness };
}

// ── Format output ─────────────────────────────────────────────────────────────

const SLOT_ORDER = ['surface','lean','curves','weight','proportions','complexity','temperature','saturation','brightness'];

function formatOutput(descriptors) {
  return SLOT_ORDER
    .map(k => descriptors[k])
    .filter(Boolean)
    .join(', ');
}

// ── Public API (used by UI and console verification) ─────────────────────────

export function generate(tokens) {
  const resolved = [];
  const unmatched = [];

  for (const t of tokens) {
    const r = resolve(t);
    if (r) resolved.push({ ...r });
    else   unmatched.push(t);
  }

  if (!resolved.length) return { output: '', attribution: '', unmatched };

  const entries = resolved.map(r => r.entry);
  const anyFuzzy = resolved.some(r => r.fuzzy);

  const { result, via } = blend(entries.slice(0, 3));

  const output = formatOutput(result.descriptors);

  let attribution = '';
  if (via) attribution = via;
  else if (anyFuzzy) {
    attribution = `~ matched to ${resolved.map(r => titleCase(r.entry.name)).join(', ')}`;
  }

  return { output, attribution, unmatched, result };
}

function titleCase(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ── Canvas accent ─────────────────────────────────────────────────────────────

export function getAccent(descriptors) {
  if (!descriptors) return null;
  return deriveAccent(
    descriptors.temperature || 'neutral temperature',
    descriptors.saturation  || 'desaturated',
    descriptors.brightness  || 'medium brightness'
  );
}

// ── Autocomplete ──────────────────────────────────────────────────────────────

export function autocomplete(prefix) {
  if (!prefix || prefix.length < 2) return [];
  const q = prefix.toLowerCase();
  const results = [];
  const seen = new Set();

  for (const e of DB) {
    if (seen.has(e.name)) continue;
    if (e.name.startsWith(q)) { results.push(e.name); seen.add(e.name); }
    else if (e.synonyms) {
      for (const s of e.synonyms) {
        if (s.startsWith(q) && !seen.has(e.name)) {
          results.push(e.name); seen.add(e.name); break;
        }
      }
    }
    if (results.length >= 6) break;
  }
  return results;
}

// ── Init ──────────────────────────────────────────────────────────────────────

export async function init() {
  await loadDB();
  buildDyadMap();
}

// ── Console verification helper ───────────────────────────────────────────────

// Call window.test() in the browser console to run spot-checks.
window.test = function() {
  const cases = [
    { input: ['joy'],           expect: ['smooth', 'medium curves', 'warm', 'highly saturated', 'very bright'] },
    { input: ['trust'],         expect: ['smooth', 'big curves', 'warm', 'desaturated', 'medium brightness'] },
    { input: ['sadness'],       expect: ['smooth', 'heavily leaning backward', 'cold', 'desaturated', 'dark'] },
    { input: ['fear'],          expect: ['angular', 'small curves', 'cold', 'desaturated', 'very dark'] },
    { input: ['anger'],         expect: ['angular', 'cold', 'desaturated', 'dark'] },
    { input: ['surprise'],      expect: ['smooth', 'high geometric complexity', 'highly saturated', 'bright'] },
    { input: ['joy', 'trust'],  expect: ['smooth', 'warm'] },  // → love
    { input: ['anger','sadness'], expect: ['angular', 'cold'] }, // → envy
  ];

  let pass = 0;
  for (const c of cases) {
    const { output, attribution } = generate(c.input);
    const ok = c.expect.every(e => output.includes(e));
    console.log(ok ? '✓' : '✗', c.input.join('+'), '→', output, attribution ? `[${attribution}]` : '');
    if (ok) pass++;
  }
  console.log(`\n${pass}/${cases.length} passed`);
};
