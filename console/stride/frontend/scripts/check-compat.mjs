#!/usr/bin/env node
/* Fails the build if the output uses something the Gen 6 console's Chromium 83
   WebView (2020) does not have.

   The bundler lowers *syntax* to chrome83, but it cannot polyfill an API or
   rewrite CSS that has no older equivalent, and a dependency upgrade can bring
   either in silently. A blank screen on a treadmill is found by somebody
   standing on it, so this is checked on every build instead. */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const OUT = fileURLToPath(new URL('../../app/src/main/assets/ui/original.html', import.meta.url));
const html = readFileSync(OUT, 'utf8');

const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n');
const styles = [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n');

/** [pattern, what it is, first Chromium with it] */
const JS = [
  [/\.at\(\s*-?\d/, 'Array/String.prototype.at', 92],
  [/\.replaceAll\(/, 'String.prototype.replaceAll', 85],
  [/Object\.hasOwn\(/, 'Object.hasOwn', 93],
  [/structuredClone\(/, 'structuredClone', 98],
  [/\.findLast(Index)?\(/, 'Array.prototype.findLast', 97],
  [/\.toSorted\(|\.toReversed\(|\.toSpliced\(/, 'change-array-by-copy', 110],
  [/Promise\.any\(/, 'Promise.any', 85],
  [/\bWeakRef\b|FinalizationRegistry/, 'WeakRef', 84],
  [/\?\?=|\|\|=|&&=/, 'logical assignment', 85],
  [/\bstatic\s*\{/, 'class static block', 94],
];

const CSS = [
  [/(^|[;{\s])inset\s*:/, 'inset', 87],
  [/(^|[;{\s])(row-|column-)?gap\s*:/, 'flexbox gap', 84],
  [/aspect-ratio\s*:/, 'aspect-ratio', 88],
  [/:(is|where|has)\(/, ':is/:where/:has', 88],
  [/@container\b/, 'container queries', 105],
  [/\boklch\(|\boklab\(|color-mix\(/, 'modern colour functions', 111],
];

const found = [];
for (const [re, what, since] of JS) if (re.test(scripts)) found.push(`JS  ${what} (Chromium ${since})`);
for (const [re, what, since] of CSS) if (re.test(styles)) found.push(`CSS ${what} (Chromium ${since})`);

if (found.length) {
  console.error('\noriginal.html uses features the Chromium 83 WebView lacks:\n  ' + found.join('\n  ') + '\n');
  process.exit(1);
}
const kb = (Buffer.byteLength(html) / 1024).toFixed(0);
console.log(`check-compat: original.html (${kb} KB) is Chromium 83 safe.`);
