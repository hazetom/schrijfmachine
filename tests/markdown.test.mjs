// Fuzztest: blokken -> Markdown -> blokken moet exact gelijk blijven.
import { blocksToMd, mdToBlocks, normalizeRuns, mdToChapter, chapterToMd, countWords } from '../js/markdown.js';
import assert from 'node:assert/strict';

const alphabet = ['a', 'b', 'é', ' ', ' ', '*', '\\', '#', '-', '_', '.', '…', '“', '”', '1', ' ', 'ö', 'Ł', '>', '`'];
function rnd(n) { return Math.floor(Math.random() * n); }
function randRuns() {
  const runs = [];
  const n = 1 + rnd(6);
  for (let k = 0; k < n; k++) {
    let t = '';
    const len = 1 + rnd(8);
    for (let j = 0; j < len; j++) t += alphabet[rnd(alphabet.length)];
    runs.push({ t, b: Math.random() < 0.4, i: Math.random() < 0.4 });
  }
  return runs;
}
function canon(blocks) {
  return blocks
    .map((b) => (b.type === 'scene' ? b : { type: b.type, runs: normalizeRuns(b.runs) }))
    .filter((b) => b.type === 'scene' || b.runs.length);
}
let fails = 0;
for (let it = 0; it < 20000; it++) {
  const blocks = [];
  const n = 1 + rnd(5);
  for (let k = 0; k < n; k++) {
    const r = Math.random();
    if (r < 0.1) blocks.push({ type: 'scene' });
    else if (r < 0.25) blocks.push({ type: 'h', runs: randRuns() });
    else blocks.push({ type: 'p', runs: randRuns() });
  }
  const md = blocksToMd(blocks);
  const back = mdToBlocks(md);
  try {
    assert.deepEqual(back, canon(blocks));
    // tweede rondje moet identiek dezelfde tekst geven
    assert.equal(blocksToMd(back), md);
  } catch (e) {
    if (fails++ < 5) { console.log('FOUT', JSON.stringify(blocks), '\n', JSON.stringify(md), '\n', JSON.stringify(back)); }
  }
}
// hoofdstukbestand
const ch = mdToChapter(chapterToMd('De kelder', '## Twee uur\n\nHij **bleef** *staan*.\n'));
assert.equal(ch.titel, 'De kelder');
assert.equal(ch.body, '## Twee uur\n\nHij **bleef** *staan*.\n');
assert.equal(countWords('Hij **bleef** staan.\n\n* * *\n\n“72 jaar…”, zei hij.'), 7);
console.log(fails ? `${fails} fouten` : 'markdown: 20000 willekeurige rondjes zonder verschil');
process.exit(fails ? 1 : 0);
