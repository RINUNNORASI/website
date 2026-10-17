const test = require('node:test');
const assert = require('node:assert/strict');
const handler = import('../worker/index.mjs').then(module => module.default);
const ORIGIN = 'https://media.example.test';
// Non-UTF8 bytes ensure no text encoding can silently corrupt bundled audio.
const AUDIO = Uint8Array.from([0x49, 0x44, 0x33, 0xff, 0x80, 0x00, 0xc3, 0x28, 0xfe, 0x7f]);

function install(t) {
  global.SITE_ASSETS = {
    '/assets/original.mp3': {body: Buffer.from(AUDIO).toString('base64'), type: 'audio/mpeg', base64: true},
    '/assets/empty.mp3': {body: '', type: 'audio/mpeg', base64: true},
    '/index.html': {body: '<h1>循词</h1>', type: 'text/html; charset=utf-8'},
  };
  t.after(() => { delete global.SITE_ASSETS; });
}
async function request(options = {}) {
  return (await handler).fetch(new Request(ORIGIN + (options.path || '/assets/original.mp3'), {
    method: options.method || 'GET', headers: options.headers || {},
  }), {});
}
async function checkRange(range, first, last) {
  const response = await request({headers: {Range: range}});
  assert.equal(response.status, 206, range);
  assert.equal(response.headers.get('Content-Type'), 'audio/mpeg');
  assert.equal(response.headers.get('Accept-Ranges'), 'bytes');
  assert.equal(response.headers.get('Content-Range'), `bytes ${first}-${last}/${AUDIO.length}`);
  assert.equal(response.headers.get('Content-Length'), String(last - first + 1));
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), AUDIO.subarray(first, last + 1));
}

test('public bundled audio preserves exact binary bytes and HEAD reports full length without a body', async t => {
  install(t);
  const full = await request();
  assert.equal(full.status, 200);
  assert.equal(full.headers.get('Content-Type'), 'audio/mpeg');
  assert.equal(full.headers.get('Content-Length'), String(AUDIO.length));
  assert.equal(full.headers.get('Accept-Ranges'), 'bytes');
  assert.equal(full.headers.get('Content-Range'), null);
  assert.deepEqual(new Uint8Array(await full.arrayBuffer()), AUDIO);
  const head = await request({method: 'HEAD', headers: {Range: 'bytes=2-4'}});
  assert.equal(head.status, 200, 'Range is ignored for HEAD, per HTTP semantics');
  assert.equal(head.headers.get('Content-Length'), String(AUDIO.length));
  assert.equal(head.headers.get('Content-Range'), null);
  assert.equal((await head.arrayBuffer()).byteLength, 0);
  const text = await request({method: 'HEAD', path: '/'});
  assert.equal(text.headers.get('Content-Length'), String(Buffer.byteLength('<h1>循词</h1>')));
  assert.equal(text.headers.get('Accept-Ranges'), null);
});

test('native audio seeking supports bounded, open, suffix, oversized and final-byte ranges', async t => {
  install(t);
  await checkRange('bytes=2-5', 2, 5);
  await checkRange('bytes=6-', 6, 9);
  await checkRange('bytes=-3', 7, 9);
  await checkRange('bytes=8-999999999999999999999999999999', 8, 9);
  await checkRange('bytes=-999999999999999999999999999999', 0, 9);
  await checkRange('bytes=9-9', 9, 9);
  await checkRange('bytes=0002-0003', 2, 3);
});

test('unsatisfiable audio ranges return an empty 416 with total size', async t => {
  install(t);
  for (const range of ['bytes=10-', 'bytes=7-3', 'bytes=-0', 'bytes=999999999999999999999999999999-']) {
    const response = await request({headers: {Range: range}});
    assert.equal(response.status, 416, range);
    assert.equal(response.headers.get('Content-Range'), `bytes */${AUDIO.length}`);
    assert.equal(response.headers.get('Content-Length'), '0');
    assert.equal((await response.arrayBuffer()).byteLength, 0);
  }
  const empty = await request({path: '/assets/empty.mp3', headers: {Range: 'bytes=0-'}});
  assert.equal(empty.status, 416);
  assert.equal(empty.headers.get('Content-Range'), 'bytes */0');
});

test('unsupported multipart or malformed ranges and unvalidated If-Range fall back to the full audio', async t => {
  install(t);
  for (const range of ['bytes=0-1,4-5', 'items=0-1', 'bytes=-', 'bytes=two-5', 'bytes=1.5-3', 'bytes=-1-3']) {
    const response = await request({headers: {Range: range}});
    assert.equal(response.status, 200, range);
    assert.equal(response.headers.get('Content-Range'), null);
    assert.deepEqual(new Uint8Array(await response.arrayBuffer()), AUDIO);
  }
  const stale = await request({headers: {Range: 'bytes=2-4', 'If-Range': '"previous-recording"'}});
  assert.equal(stale.status, 200);
  assert.deepEqual(new Uint8Array(await stale.arrayBuffer()), AUDIO);
  const method = await request({method: 'POST'});
  assert.equal(method.status, 405);
  assert.equal(method.headers.get('Allow'), 'GET, HEAD');
});
