/**
 * Fails the build if any domain colour token drops below the WCAG AA
 * contrast ratio against its own theme background.
 *
 * Token values are parsed straight out of globals.css rather than
 * duplicated here, so the check cannot drift away from the stylesheet.
 *
 *   node scripts/check-contrast.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const AA_NORMAL_TEXT = 4.5;
const CSS_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../src/app/globals.css',
);

/** Pull the declarations out of a top-level `selector { ... }` block. */
function readBlock(css, selector) {
  const start = css.indexOf(`${selector} {`);
  if (start === -1) throw new Error(`No "${selector}" block in globals.css`);
  const open = css.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === '{') depth++;
    else if (css[i] === '}' && --depth === 0) {
      return css.slice(open + 1, i);
    }
  }
  throw new Error(`Unterminated "${selector}" block`);
}

function parseDeclarations(block) {
  const out = {};
  for (const [, name, value] of block.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    out[name] = value.trim();
  }
  return out;
}

/** Follow `var(--x)` aliases until we reach a literal colour. */
function resolveValue(value, declarations, seen = new Set()) {
  const alias = /^var\((--[\w-]+)\)$/.exec(value);
  if (!alias) return value;
  const next = alias[1];
  if (seen.has(next)) throw new Error(`Circular token alias at ${next}`);
  seen.add(next);
  const target = declarations[next];
  if (!target) throw new Error(`Token ${next} is referenced but never defined`);
  return resolveValue(target, declarations, seen);
}

function parseOklch(value) {
  const m = /^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)/.exec(value);
  if (!m) return null; // e.g. `oklch(1 0 0 / 10%)` alpha forms — not text colours
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

/** oklch -> oklab -> linear sRGB (gamut-clipped). */
function toLinearRgb([L, C, H]) {
  const h = (H * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map((v) => Math.min(1, Math.max(0, v)));
}

const luminance = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

function contrastRatio(fg, bg) {
  const [hi, lo] = [luminance(fg), luminance(bg)].sort((a, b) => b - a);
  return (hi + 0.05) / (lo + 0.05);
}

const css = readFileSync(CSS_PATH, 'utf8');
const themes = [
  ['light', parseDeclarations(readBlock(css, ':root'))],
  ['dark', parseDeclarations(readBlock(css, '.dark'))],
];

let failures = 0;
let checked = 0;

for (const [theme, declarations] of themes) {
  const background = parseOklch(
    resolveValue(declarations['--background'], declarations),
  );
  if (!background) throw new Error(`Cannot parse --background for ${theme}`);
  const bg = toLinearRgb(background);

  console.log(`\n${theme}`);
  for (const [name, raw] of Object.entries(declarations)) {
    if (!/^--(status|confidence)-/.test(name)) continue;
    const colour = parseOklch(resolveValue(raw, declarations));
    if (!colour) continue;

    const ratio = contrastRatio(toLinearRgb(colour), bg);
    const passed = ratio >= AA_NORMAL_TEXT;
    checked++;
    if (!passed) failures++;
    console.log(
      `  ${passed ? 'pass' : 'FAIL'}  ${ratio.toFixed(2).padStart(5)}:1  ${name}`,
    );
  }
}

console.log(
  `\n${checked} token/theme pairs checked against ${AA_NORMAL_TEXT}:1 — ${failures} failing`,
);
process.exit(failures > 0 ? 1 : 0);
