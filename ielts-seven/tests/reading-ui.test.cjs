const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function render(lesson, options = {}) {
  const window = {};
  vm.runInNewContext(fs.readFileSync(require.resolve('../dist/reading-ui.js'), 'utf8'), {window});
  return window.IELTS_READING_UI.render({lesson, date: '2026-10-16', day: 1, showAnswers: false, ...options});
}

const lesson = () => ({
  id: 'reading-fixture', title: 'A useful reading passage', source: 'Example publisher',
  published: '2026-10-14', url: 'https://example.test/original', topic: 'Environment',
  difficulty: 'IELTS 7', focus: 'Locate evidence', minutes: 5,
  questions: [{id: 'q1', type: 'tfng', prompt: 'The source includes a useful detail.', answer: 'TRUE'}]
});

test('available original paragraphs render inline without relying on an external frame', () => {
  const data = {...lesson(), article: {author: 'Example author', paragraphs: [
    {id: 'p1', text: 'The source includes a useful detail.'},
    {id: 'p2', text: 'A second paragraph adds context.'},
    {id: 'p3', text: 'A final paragraph explains the result.'}
  ]}};
  const before = JSON.stringify(data), html = render(data);
  for (const paragraph of data.article.paragraphs) assert.ok(html.includes(paragraph.text));
  assert.match(html, /class="ru-passage-article"/);
  assert.doesNotMatch(html, /<iframe|class="ru-source-card"/);
  assert.equal(JSON.stringify(data), before);
});

test('missing or empty original paragraphs show a usable source card and keep the exercise', () => {
  for (const article of [undefined, {paragraphs: []}]) {
    const data = {...lesson(), article}, before = JSON.stringify(data), html = render(data);
    const card = html.slice(html.indexOf('<article class="ru-source-card">'), html.indexOf('</article>') + 10);
    assert.match(card, /A useful reading passage/);
    assert.match(card, /Example publisher · 2026-10-14/);
    assert.match(card, /本课程保留原文链接/);
    assert.match(card, /data-action="reading-inline-archive">选择站内全文课程/);
    assert.match(card, /href="https:\/\/example\.test\/original" target="_blank" rel="noopener noreferrer">打开原文 ↗/);
    assert.match(html, /id="reading-form"/);
    assert.match(html, /The source includes a useful detail\./);
    assert.doesNotMatch(html, /<iframe|class="ru-passage-article"/);
    assert.equal(JSON.stringify(data), before);
  }
});

test('source card escapes lesson metadata and never emits an unsafe original URL', () => {
  const html = render({...lesson(), title: '<img src=x onerror=alert(1)>', source: 'A & B', url: 'javascript:alert(1)'});
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(html, /A &amp; B/);
  assert.match(html, /href="#" target="_blank" rel="noopener noreferrer">打开原文 ↗/);
  assert.doesNotMatch(html, /<img|javascript:/);
});
