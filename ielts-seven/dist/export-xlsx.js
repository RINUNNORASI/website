(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) {
    root.buildVocabularyXlsx = api.buildVocabularyXlsx;
    root.exportVocabularyXlsx = api.exportVocabularyXlsx;
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  const MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  const HEADERS = ['词汇', '英式IPA', '中文义', '词性', '词族', '搭配中译', '同义替换',
    '双语例句', '首次学习日期', '最近复习日期', '下一复习日期', '错词标记', '备注'];
  const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  const NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  const encoder = new TextEncoder();
  function escapeXml(value) {
    return String(value == null ? '' : value).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
  }
  function format(value) {
    if (value === null || value === undefined) return '';
    if (Array.isArray(value)) return value.map(format).filter(Boolean).join('\n');
    if (typeof value === 'object') {
      if ('en' in value || 'zh' in value) return [value.en, value.zh].filter(Boolean).join(' — ');
      if ('word' in value) return [value.word, value.meaning || value.diff || value.note].filter(Boolean).join(' — ');
      return Object.values(value).map(format).filter(Boolean).join('；');
    }
    return String(value);
  }
  function values(record) {
    const example = record.example || {en: record.exampleEn, zh: record.exampleZh};
    const active = (record.errors || []).filter(error => !error.resolved);
    const errors = active.length ? '待订正：' + active.map(error => error.date + ' / ' + error.answer).join('；')
      : (record.errors || []).length ? '历史错词已订正（保留记录）' : '无已确认错误';
    const origins = (record.origins || []).map(origin => origin.date + ' ' + (origin.batch || '') +
      (origin.original && origin.original.toLowerCase() !== record.word ? ' 原输入：' + origin.original : '')).join('；');
    const notes = [record.notes, record.memory ? '记忆提示：' + record.memory : '',
      record.needsContent ? '词义/音标待核实补充' : '', origins ? '词源：' + origins : '',
      '实际接触 ' + (record.contacts || 1) + ' 次；状态：' + ({unconfirmed: '未确认', studied: '已完成教学',
        'correct-once': '本次作答正确', 'needs-review': '待订正'}[record.status] || '未确认')]
      .filter(Boolean).join('\n');
    return [record.displayWord || record.word, record.ipa, record.meaning, record.pos, format(record.family),
      format(record.collocations), format(record.synonyms), [example.en, example.zh].filter(Boolean).join('\n'),
      record.firstSeen, record.lastReview || '', record.nextReview || '', errors, notes];
  }
  function columnName(index) {
    let name = '', value = index + 1;
    while (value) { value--; name = String.fromCharCode(65 + value % 26) + name; value = Math.floor(value / 26); }
    return name;
  }
  function worksheet(records) {
    const rows = [HEADERS, ...records.map(values)];
    const data = rows.map((row, rowIndex) => '<row r="' + (rowIndex + 1) + '">' + row.map((value, colIndex) =>
      '<c r="' + columnName(colIndex) + (rowIndex + 1) + '" s="' + (rowIndex === 0 ? 1 : 2) + '" t="inlineStr"><is><t xml:space="preserve">'
      + escapeXml(value) + '</t></is></c>').join('') + '</row>').join('');
    const widths = [24, 24, 28, 12, 30, 45, 42, 56, 20, 20, 20, 40, 60];
    return XML + '<worksheet xmlns="' + NS + '"><dimension ref="A1:M' + rows.length + '"/>'
      + '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'
      + '<sheetFormatPr defaultRowHeight="20"/><cols>' + widths.map((width, i) => '<col min="' + (i + 1)
        + '" max="' + (i + 1) + '" width="' + width + '" customWidth="1"/>').join('') + '</cols>'
      + '<sheetData>' + data + '</sheetData><autoFilter ref="A1:M' + rows.length + '"/></worksheet>';
  }
  const CRC_TABLE = Array.from({length: 256}, (_, value) => {
    let crc = value;
    for (let bit = 0; bit < 8; bit++) crc = (crc & 1) ? (0xedb88320 ^ (crc >>> 1)) : (crc >>> 1);
    return crc >>> 0;
  });
  function crc32(bytes) {
    let crc = 0xffffffff;
    for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 255] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
  }
  function concat(chunks) {
    const out = new Uint8Array(chunks.reduce((size, chunk) => size + chunk.length, 0));
    let offset = 0;
    for (const chunk of chunks) { out.set(chunk, offset); offset += chunk.length; }
    return out;
  }
  function zip(files) {
    const local = [], central = []; let offset = 0;
    for (const [path, xml] of files) {
      const name = encoder.encode(path), data = encoder.encode(xml), crc = crc32(data);
      const header = new Uint8Array(30), h = new DataView(header.buffer);
      h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x800, true);
      h.setUint16(8, 0, true); h.setUint16(12, 0x21, true); h.setUint32(14, crc, true);
      h.setUint32(18, data.length, true); h.setUint32(22, data.length, true); h.setUint16(26, name.length, true);
      local.push(header, name, data);
      const directory = new Uint8Array(46), d = new DataView(directory.buffer);
      d.setUint32(0, 0x02014b50, true); d.setUint16(4, 20, true); d.setUint16(6, 20, true);
      d.setUint16(8, 0x800, true); d.setUint16(10, 0, true); d.setUint16(14, 0x21, true);
      d.setUint32(16, crc, true); d.setUint32(20, data.length, true); d.setUint32(24, data.length, true);
      d.setUint16(28, name.length, true); d.setUint32(42, offset, true);
      central.push(directory, name); offset += header.length + name.length + data.length;
    }
    const directory = concat(central), end = new Uint8Array(22), e = new DataView(end.buffer);
    e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true);
    e.setUint32(12, directory.length, true); e.setUint32(16, offset, true);
    return concat([...local, directory, end]);
  }
  function buildVocabularyXlsx(records) {
    if (!Array.isArray(records)) throw new Error('词库必须为数组');
    const map = new Map();
    for (const record of records) {
      if (!record || typeof record.word !== 'string' || !['A', 'B'].includes(record.level)) continue;
      const key = record.word.trim().toLowerCase();
      if (!map.has(key) || record.level === 'A') map.set(key, record);
    }
    const words = [...map.values()].sort((a, b) => (a.firstSeen || '').localeCompare(b.firstSeen || '') || a.word.localeCompare(b.word));
    const contentTypes = XML + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
      + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
      + '<Default Extension="xml" ContentType="application/xml"/>'
      + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
      + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
      + '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
      + '<Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>';
    const relationships = XML + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>';
    const workbook = XML + '<workbook xmlns="' + NS + '" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
      + '<bookViews><workbookView/></bookViews><sheets><sheet name="A重点掌握" sheetId="1" r:id="rId1"/>'
      + '<sheet name="B认读即可" sheetId="2" r:id="rId2"/></sheets></workbook>';
    const workbookRels = XML + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>'
      + '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>'
      + '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>';
    const styles = XML + '<styleSheet xmlns="' + NS + '"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font>'
      + '<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts>'
      + '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>'
      + '<fill><patternFill patternType="solid"><fgColor rgb="FF35624E"/><bgColor indexed="64"/></patternFill></fill></fills>'
      + '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>'
      + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
      + '<cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
      + '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"><alignment vertical="top" wrapText="1"/></xf>'
      + '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf></cellXfs>'
      + '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';
    return zip([['[Content_Types].xml', contentTypes], ['_rels/.rels', relationships], ['xl/workbook.xml', workbook],
      ['xl/_rels/workbook.xml.rels', workbookRels], ['xl/styles.xml', styles],
      ['xl/worksheets/sheet1.xml', worksheet(words.filter(word => word.level === 'A'))],
      ['xl/worksheets/sheet2.xml', worksheet(words.filter(word => word.level === 'B'))]]);
  }
  function exportVocabularyXlsx(records) { return new Blob([buildVocabularyXlsx(records)], {type: MIME}); }
  return {buildVocabularyXlsx, exportVocabularyXlsx, MIME, HEADERS};
});
