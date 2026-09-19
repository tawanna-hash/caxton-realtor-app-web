#!/usr/bin/env node
// Guards the single locked `input[type='date']` styling rule in
// app/globals.css from silently drifting again.
//
// Why this exists: date field height/padding/border-radius/icon were fixed
// and broken repeatedly (Sept 2026) because individual components carried
// their own conflicting height/padding classes (min-h-10, h-[46px],
// min-h-[42px]/[44px], custom px-*, rounded-*) right next to
// `type="date"`, which fought the global rule field by field. This script
// blocks a push that reintroduces that pattern, and blocks a push that
// weakens the lock rule itself in app/globals.css.
//
// Run manually:   node scripts/check-date-field-lock.mjs
// Run in pre-push: wired into .husky/pre-push
//
// Escape hatch: `git push --no-verify` skips all hooks including this one.
// If you deliberately need to change date field styling, edit the single
// rule block in app/globals.css (search "One locked date control") instead
// of adding per-field overrides, then update this script's expectations.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

const ROOT = process.cwd();
const SOURCE_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx']);
const SKIP_DIRS = new Set(['node_modules', '.next', '.git', 'android', 'ios', 'scripts']);

// Class fragments that conflict with the locked box model when placed on
// (or near) a `type="date"` input. Matches Tailwind's arbitrary-value and
// scale utilities for height/min-height/max-height/padding/rounded.
const CONFLICTING_CLASS_PATTERN =
  /\b(?:min-h|max-h|h)-(?:\[[^\]]+\]|px|full|screen|\d+(?:\.\d+)?)\b|\bpx-(?:\[[^\]]+\]|\d+(?:\.\d+)?)\b|\bpy-(?:\[[^\]]+\]|\d+(?:\.\d+)?)\b|\brounded(?:-[a-z]+)?(?:-\[[^\]]+\])?\b/;

function walk(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    const stats = statSync(full);
    if (stats.isDirectory()) {
      walk(full, files);
    } else if (SOURCE_EXTS.has(extname(entry))) {
      files.push(full);
    }
  }
  return files;
}

const INPUT_TAG_PATTERN = /<input\b.*?\/?>/gs;
const CLASSNAME_ATTR_PATTERN = /className=(\{[^}]*\}|"[^"]*"|'[^']*')/s;

function lineNumberAt(text, index) {
  return text.slice(0, index).split('\n').length;
}

function findDateInputViolations() {
  const violations = [];
  for (const file of walk(ROOT)) {
    const text = readFileSync(file, 'utf8');
    if (!text.includes('type="date"') && !text.includes("type='date'")) continue;

    // Parse each actual <input .../> tag (may span multiple lines) and only
    // inspect the className attribute that belongs to that same tag — not
    // sibling <select>/<button>/<div> elements nearby, which legitimately
    // carry their own height/padding/rounded classes.
    for (const match of text.matchAll(INPUT_TAG_PATTERN)) {
      const tag = match[0];
      if (!tag.includes('type="date"') && !tag.includes("type='date'")) continue;
      const classMatch = tag.match(CLASSNAME_ATTR_PATTERN);
      if (!classMatch) continue;
      const classNameChunk = classMatch[1];
      if (CONFLICTING_CLASS_PATTERN.test(classNameChunk)) {
        violations.push({
          file: file.replace(ROOT + '/', ''),
          line: lineNumberAt(text, match.index),
          snippet: classNameChunk.trim(),
        });
      }
    }
  }
  return violations;
}

function checkGlobalsLockIntact() {
  const cssPath = join(ROOT, 'app', 'globals.css');
  const css = readFileSync(cssPath, 'utf8');
  const problems = [];

  if (!css.includes("One locked date control across the app")) {
    problems.push('The lock comment/rule block for input[type=\'date\'] is missing from app/globals.css.');
  }
  if (!/input\[type=['"]?date['"]?\]\s*\{[^}]*height:\s*46px\s*!important/.test(css)) {
    problems.push("input[type='date'] no longer enforces height: 46px !important in app/globals.css.");
  }
  if (!css.includes('background-image: url("data:image/svg+xml')) {
    problems.push('The custom calendar icon (background-image data URI) is missing from the input[type=\'date\'] rule.');
  }
  if (!css.includes('::-webkit-calendar-picker-indicator')) {
    problems.push('The transparent native picker-indicator override is missing — the click target may break on iOS/Safari.');
  }
  return problems;
}

const classViolations = findDateInputViolations();
const lockProblems = checkGlobalsLockIntact();

if (classViolations.length === 0 && lockProblems.length === 0) {
  console.log('✓ Date field styling lock intact — no conflicting per-field overrides found.');
  process.exit(0);
}

console.error('✗ Date field styling lock check failed.\n');

if (lockProblems.length > 0) {
  console.error('app/globals.css no longer matches the locked date field rule:');
  for (const p of lockProblems) console.error('  - ' + p);
  console.error('');
}

if (classViolations.length > 0) {
  console.error(
    'Found className values with height/padding/rounded utilities on a type="date" input.\n' +
    'These fight the global lock rule in app/globals.css and are exactly the pattern that\n' +
    'caused the field-by-field inconsistency fixed in Sept 2026. Remove them — the global\n' +
    'rule already sets height, padding, border, and border-radius for every date field.\n'
  );
  for (const v of classViolations) {
    console.error(`  ${v.file}:${v.line}  ${v.snippet}`);
  }
  console.error('');
}

console.error('To intentionally change date field styling, edit the single rule block in');
console.error('app/globals.css (search "One locked date control") instead of adding per-field');
console.error('overrides, then adjust this script\'s expectations if needed.');
console.error('Escape hatch (not recommended): git push --no-verify');
process.exit(1);
