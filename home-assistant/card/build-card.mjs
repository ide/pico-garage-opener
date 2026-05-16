#!/usr/bin/env node
// Build cover-card.generated.yaml by extracting the @begin-inline section of
// cover-card.js (appending `return api;` so it works as a Function body) and
// inlining it at the single /* @inline-helpers */ marker in
// cover-card.template.yaml.
//
// Run from this folder: `node build-card.mjs`.

import fs from 'node:fs';
import path from 'node:path';

const here = import.meta.dirname;

const jsSource = fs.readFileSync(path.join(here, 'cover-card.js'), 'utf8');
const template = fs.readFileSync(path.join(here, 'cover-card.template.yaml'), 'utf8');

const match = jsSource.match(/\/\/ @begin-inline\r?\n([\s\S]*?)\r?\n\/\/ @end-inline/);
if (!match) {
  console.error('cover-card.js is missing the // @begin-inline / // @end-inline markers');
  process.exit(1);
}
const helpersBody = `${match[1]}\n\nreturn api;`;

const markerCount = (template.match(/\/\* @inline-helpers \*\//g) ?? []).length;
if (markerCount !== 1) {
  console.error(`cover-card.template.yaml should have exactly one /* @inline-helpers */ marker; found ${markerCount}`);
  process.exit(1);
}

const output = template.replace(
  /^([ \t]*)\/\* @inline-helpers \*\/\r?\n/m,
  (_, indent) => helpersBody
    .split('\n')
    .map((line) => (line.length ? indent + line : line))
    .join('\n') + '\n',
);

const outputPath = path.join(here, 'cover-card.generated.yaml');
const header = '# GENERATED FILE - edit cover-card.js or cover-card.template.yaml and re-run build-card.mjs.\n';
fs.writeFileSync(outputPath, header + output);
console.log(`Wrote ${path.relative(process.cwd(), outputPath)}`);
