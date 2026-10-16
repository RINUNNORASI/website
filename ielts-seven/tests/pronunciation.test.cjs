const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const code = fs.readFileSync(require.resolve('../dist/pronunciation.js'), 'utf8');
const deferred = () => {let resolve; const promise = new Promise(done => {resolve = done;}); return {promise, resolve};};
const settle = async () => {for (let i = 0; i < 12; i++) await Promise.resolve();};
const recording = () => ({ok: true, json: async () => ({available: true, accent: 'UK',
  audioUrl: 'https://api.dictionaryapi.dev/voice.mp3', sourceUrl: 'https://example.org/dictionary'})});

test('stopping during a dictionary lookup prevents late audio from starting', async () => {
  const lookup = deferred(), statuses = []; let starts = 0;
  const window = {speechSynthesis: {cancel() {}}};
  new Function('window', 'fetch', 'Audio', code)(window, () => lookup.promise,
    class {constructor() {starts++;}});
  const pending = window.IELTS_AUDIO.play('resilience', status => statuses.push(status.kind));
  window.IELTS_AUDIO.stop(); lookup.resolve(recording()); await pending;
  assert.equal(starts, 0);
  assert.deepEqual(statuses, ['loading']);
});

test('stopping a pending player suppresses a stale successful-play callback', async () => {
  const playback = deferred(), statuses = []; let pauses = 0;
  const window = {speechSynthesis: {cancel() {}}};
  new Function('window', 'fetch', 'Audio', code)(window, async () => recording(), class {
    play() {return playback.promise;}
    pause() {pauses++;}
  });
  const pending = window.IELTS_AUDIO.play('resilience', status => statuses.push(status.kind));
  await settle(); window.IELTS_AUDIO.stop(); playback.resolve(); await pending;
  assert.equal(pauses, 1);
  assert.deepEqual(statuses, ['loading']);
});

test('a voice arriving after stop cannot speak the previous account word', async () => {
  let callback, ready = false, utterances = 0;
  const window = {speechSynthesis: {cancel() {},
    getVoices: () => ready ? [{lang: 'en-GB', name: 'Synthetic test voice'}] : [],
    addEventListener(_name, fn) {callback = fn;}, removeEventListener() {},
    speak() {utterances++;}}};
  new Function('window', 'fetch', 'Audio', 'SpeechSynthesisUtterance', code)(window,
    async () => ({ok: false}), class {}, class {});
  const pending = window.IELTS_AUDIO.play('a private phrase');
  await settle(); window.IELTS_AUDIO.stop(); ready = true; callback(); await pending;
  assert.equal(utterances, 0);
});

test('queued speech is not reported as heard before onstart, and speech errors report unavailable', async () => {
  let utterance; const statuses = [];
  const window = {speechSynthesis: {cancel() {},
    getVoices: () => [{lang: 'en-GB', name: 'Synthetic test voice'}],
    speak(value) {utterance = value;}}};
  new Function('window', 'fetch', 'Audio', 'SpeechSynthesisUtterance', code)(window,
    async () => ({ok: false}), class {}, class {});
  await window.IELTS_AUDIO.play('resilience', status => statuses.push(status.kind));
  assert.deepEqual(statuses, ['loading']);
  utterance.onerror();
  assert.deepEqual(statuses, ['loading', 'unavailable']);
  window.IELTS_AUDIO.stop();
  utterance.onstart();
  assert.deepEqual(statuses, ['loading', 'unavailable'], 'late speech events after stop stay ignored');
});

test('speech is acknowledged only when the selected utterance actually starts', async () => {
  let utterance; const statuses = [];
  const window = {speechSynthesis: {cancel() {},
    getVoices: () => [{lang: 'en-GB', name: 'Synthetic test voice'}],
    speak(value) {utterance = value;}}};
  new Function('window', 'fetch', 'Audio', 'SpeechSynthesisUtterance', code)(window,
    async () => ({ok: false}), class {}, class {});
  await window.IELTS_AUDIO.play('resilience', status => statuses.push(status.kind));
  utterance.onstart();
  assert.deepEqual(statuses, ['loading', 'speech']);
  window.IELTS_AUDIO.stop();
});
