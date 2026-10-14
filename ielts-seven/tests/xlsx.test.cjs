const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../dist/engine.js');
const X = require('../dist/export-xlsx.js');

function unzipStored(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), entries = {};
  let offset = 0;
  while (view.getUint32(offset, true) === 0x04034b50) {
    assert.equal(view.getUint16(offset + 8, true), 0, 'ZIP entries use the standard store method');
    assert.equal(view.getUint16(offset + 6, true), 0x800, 'UTF-8 filenames flag is set');
    const size = view.getUint32(offset + 18, true), nameSize = view.getUint16(offset + 26, true), extraSize = view.getUint16(offset + 28, true);
    const start = offset + 30 + nameSize + extraSize;
    const name = new TextDecoder().decode(bytes.slice(offset + 30, offset + 30 + nameSize));
    const data = bytes.slice(start, start + size);
    let crc = 0xffffffff;
    for (const byte of data) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    }
    assert.equal((crc ^ 0xffffffff) >>> 0, view.getUint32(offset + 14, true), name + ' checksum is valid');
    entries[name] = new TextDecoder().decode(data);
    offset = start + size;
  }
  assert.equal(view.getUint32(offset, true), 0x02014b50, 'central directory follows data');
  const end = bytes.length - 22;
  assert.equal(view.getUint32(end, true), 0x06054b50);
  assert.equal(view.getUint16(end + 10, true), Object.keys(entries).length);
  assert.equal(view.getUint32(end + 16, true), offset);
  return entries;
}

test('export is an OOXML workbook with valid ZIP entries and A/B sheets', () => {
  const records = E.seed([
    {word: 'integrity', level: 'A', firstSeen: '2026-09-24', ipa: '/ɪnˈteɡrəti/', meaning: '完整性',
      pos: 'n.', collocations: [{en: 'ecological integrity', zh: '生态完整性'}],
      example: {en: 'A & B are <important>.', zh: '完整性很重要。'},
      origins: [{date: '2026-09-24', batch: '环境批次', original: 'Integrity'}]},
    {word: 'stratosphenic', level: 'B', firstSeen: '2026-09-24'},
    {word: 'ignored', level: 'C', firstSeen: '2026-09-24'}
  ]);
  const entries = unzipStored(X.buildVocabularyXlsx(records));
  assert.equal(Object.keys(entries).length, 7);
  assert.match(entries['[Content_Types].xml'], /spreadsheetml.sheet.main\+xml/);
  assert.match(entries['xl/workbook.xml'], /name="A重点掌握"/);
  assert.match(entries['xl/workbook.xml'], /name="B认读即可"/);
  assert.match(entries['xl/worksheets/sheet1.xml'], /生态完整性/);
  assert.match(entries['xl/worksheets/sheet1.xml'], /A &amp; B are &lt;important&gt;/);
  assert.match(entries['xl/worksheets/sheet1.xml'], /2026-09-25/);
  assert.match(entries['xl/worksheets/sheet2.xml'], /stratospheric/);
  assert.match(entries['xl/worksheets/sheet2.xml'], /原输入：stratosphenic/);
  assert.ok(!Object.values(entries).join('').includes('ignored'));
  for (const header of X.HEADERS) assert.ok(entries['xl/worksheets/sheet1.xml'].includes(header));
});

test('export deduplicates terms and keeps candidate C words out of A/B', () => {
  const a = E.seed([{word: 'resilience', level: 'A', firstSeen: '2026-10-13'}])[0];
  const bytes = X.buildVocabularyXlsx([a, {...a, level: 'B'}, {...a, word: 'skipped', level: 'C'}]);
  const entries = unzipStored(bytes);
  assert.equal((entries['xl/worksheets/sheet1.xml'].match(/>resilience</g) || []).length, 1);
  assert.equal((entries['xl/worksheets/sheet2.xml'].match(/>resilience</g) || []).length, 0);
  assert.match(entries['xl/worksheets/sheet2.xml'], /ref="A1:M1"/);
});

test('browser export returns a correctly typed real xlsx Blob', async () => {
  const blob = X.exportVocabularyXlsx([]);
  assert.equal(blob.type, X.MIME);
  const bytes = new Uint8Array(await blob.arrayBuffer());
  assert.equal(bytes[0], 0x50); assert.equal(bytes[1], 0x4b);
  assert.equal(Object.keys(unzipStored(bytes)).length, 7);
});
