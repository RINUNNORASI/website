import { readdir, readFile, stat } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import assert from 'node:assert/strict';

const output = resolve('dist');
const base = ('/' + (process.env.BASE_PATH || '').replace(/^\/+|\/+$/g, '')).replace(/\/?$/, '/');
const expected = [
  'index.html',
  'zh/index.html', 'en/index.html',
  'zh/about/index.html', 'en/about/index.html',
  'zh/search/index.html', 'en/search/index.html',
  'zh/notes/welcome/index.html', 'en/notes/welcome/index.html',
  'pagefind/pagefind.js', 'pagefind/pagefind-ui.js', 'pagefind/pagefind-ui.css',
];

for (const name of expected) {
  assert((await stat(join(output, name))).isFile(), 'Missing build output: ' + name);
}

async function collect(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collect(path));
    else if (entry.name.endsWith('.html')) files.push(path);
  }
  return files;
}

let checkedLinks = 0;
for (const page of await collect(output)) {
  const html = await readFile(page, 'utf8');
  for (const match of html.matchAll(/\b(?:href|src)="([^"]+)"/g)) {
    const url = match[1].split(/[?#]/)[0];
    if (!url.startsWith('/') || url.startsWith('//')) continue;
    assert(url.startsWith(base), 'URL loses deployment base path: ' + url);
    const relative = decodeURIComponent(url.slice(base.length));
    const target = resolve(output, relative || '.');
    assert(target === output || target.startsWith(output + sep), 'URL escapes output: ' + url);
    const info = await stat(target);
    if (info.isDirectory()) await stat(join(target, 'index.html'));
    checkedLinks++;
  }
}

for (const language of ['zh', 'en']) {
  const html = await readFile(join(output, language, 'index.html'), 'utf8');
  assert(html.includes('lang="' + language + '"'), 'Wrong language on home page');
  assert(html.includes('data-pswp-width="1200"'), 'Gallery dimensions are missing');
  const search = await readFile(join(output, language, 'search/index.html'), 'utf8');
  assert(search.includes('pagefind-ui.js'), 'Production search UI is missing');
}

console.log('Build verification passed: two languages, gallery markup, search assets and ' + checkedLinks + ' local URLs.');
