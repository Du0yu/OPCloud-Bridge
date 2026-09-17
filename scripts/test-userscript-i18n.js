import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../opcloud-model-io.user.js', import.meta.url), 'utf8');
const translationsMatch = source.match(/const TRANSLATIONS = (\{[\s\S]*?\n  \});/);

assert.ok(translationsMatch, 'The userscript must define TRANSLATIONS.');
const translations = Function(`"use strict"; return (${translationsMatch[1]});`)();
const englishKeys = Object.keys(translations.en).sort();
const chineseKeys = Object.keys(translations.zh).sort();

assert.deepEqual(chineseKeys, englishKeys, 'English and Chinese must define the same translation keys.');
assert.match(source, /^\/\/ @name:en\s+/m);
assert.match(source, /^\/\/ @name:zh-CN\s+/m);
assert.match(source, /^\/\/ @description:en\s+/m);
assert.match(source, /^\/\/ @description:zh-CN\s+/m);

const usedKeys = [...source.matchAll(/\bt\('([^']+)'/g)].map((match) => match[1]);
for (const key of usedKeys) {
  assert.ok(key in translations.en, `Missing English translation key: ${key}`);
  assert.ok(key in translations.zh, `Missing Chinese translation key: ${key}`);
}

console.log(`Validated ${englishKeys.length} userscript translation keys in English and Chinese.`);
