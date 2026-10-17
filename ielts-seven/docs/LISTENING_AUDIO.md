# Bundled open-source neural listening audio

The three MP3 files under `dist/assets/listening/` speak this site's exact existing
original exercise scripts from `dist/listening-data.js`. They are **Kokoro-82M
neural synthetic British English**, not human recordings or official IELTS test
material. The receptionist and narrator use `bf_emma`; the caller uses
`bm_george`. Dialogue role labels are omitted, while all authored words, spelling,
numbers, dates, and answers are preserved.

## Playback and reproduction

The bundled MP3s play as ordinary same-origin media. Listeners do not need a
speech API, device voices, browser speech synthesis, Python, or the model files.
The 326 MB model and 28 MB voice bundle are used only on a developer machine and
are not shipped to the website, its browsers, or its hosting services.

For regeneration, use Python 3.12, Node.js, and FFmpeg/ffprobe with libmp3lame.
Create the environment and place model downloads **outside the repository**:

```sh
python3 -m venv /tmp/xunci-neural-tts-venv
/tmp/xunci-neural-tts-venv/bin/pip install -r scripts/listening-audio-requirements.txt
mkdir -p /tmp/xunci-neural-models
curl --fail --location --output /tmp/xunci-neural-models/kokoro-v1.0.onnx https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.1/kokoro-v1.0.onnx
curl --fail --location --output /tmp/xunci-neural-models/voices-v1.0.bin https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.1/voices-v1.0.bin
OMP_NUM_THREADS=2 /tmp/xunci-neural-tts-venv/bin/python scripts/generate-listening-audio.py --model /tmp/xunci-neural-models/kokoro-v1.0.onnx --voices /tmp/xunci-neural-models/voices-v1.0.bin
```

The generator verifies both model SHA-256 values against the public release
metadata before loading them. Generation itself runs offline, reads only the
`originals` collection, stages all audio before replacing the published files,
and writes `manifest.json` with engine/model/voice/script/audio provenance.
It also updates each original lesson's audio URL with `?v=<first 12 audio SHA-256
characters>` so refreshed pages request the current recording after regeneration.
The public scripts, questions, expected answers, and official sample recordings
are unchanged.

Generation uses the neural model's own duration prediction at speed `0.90`,
British phonemization (`en-gb`), 0.35-second gaps between dialogue turns, and a
short leading/trailing pause. There is no forced uniform words-per-minute time
stretch. Encoding is **24 kHz mono MP3 at 80 kbit/s**, with loudness normalization
to a target of -16 LUFS and a true-peak limit of -1.5 dBTP. These remain original
practice clips, not a reproduction of IELTS exam timing or examiner delivery.

Pinned runtime: `kokoro-onnx 0.6.1`, `onnxruntime 1.31.0`, `numpy 2.5.4`,
`soundfile 0.14.0`, `phonemizer 3.4.0`, `espeakng-loader 0.2.4`.
FFmpeg `7.1.5-0+deb13u1`, libmp3lame `3.100-6+b3`. Full precision model:
`Kokoro-82M v1.0`, `model-files-v1.1` ONNX export. Different platforms can produce
different audio binary hashes; each regeneration records its actual hashes.

## Asset verification

Every MP3 is parsed with ffprobe and fully decoded by FFmpeg. Codec, sample rate,
bitrate, duration, PCM RMS, peak, and non-silent fraction are checked to reject
empty, truncated, extremely quiet, or clipped files. This is format and signal
verification, not a claim of a human listening or browser/device playback test.

| Asset | Bytes | Decoded duration | Overall words/min | PCM RMS dBFS | PCM peak dBFS |
| --- | ---: | ---: | ---: | ---: | ---: |
| `library-workshop.mp3` | 334472 | 33.36 s | 151.1 | -16.04 | -1.63 |
| `riverside-volunteers.mp3` | 335912 | 33.49 s | 188.1 | -16.61 | -1.81 |
| `urban-shade-study.mp3` | 383672 | 38.26 s | 155.3 | -16.55 | -1.77 |

Total size: **1054056 bytes**. SHA-256 values:

| Asset | Audio SHA-256 | Exact original UTF-8 `script` SHA-256 |
| --- | --- | --- |
| `library-workshop.mp3` | `a33392f30d07fdb9b963cd3bdf1f38e22fb0243bbe21794269004d90d3b418f9` | `5fabcd4c9c763e6142de93fc206dee1fcaf342b3f1ebb45c29564f4938e70dec` |
| `riverside-volunteers.mp3` | `862857fb40d64a335cc0d86233dfde893911c08f1a5eb56463f0ab18b1f7650f` | `e87514ec70c7e54ca24b45454a197131601bd55065b97e59e7b0eff21cba7df1` |
| `urban-shade-study.mp3` | `baf2462781a4d64c48c3588dd0aecfd15508e909dc3eb462dcc0be7263bb4c08` | `b5a5d6029104d8c7845b2a98d04eac3da2ddba1c1395ad14146df9833522cccc` |

Model SHA-256: `beb0d1848dee9a49da392cc3df26958d46cfa35d321edf434f52949153f0df3a`.
Voice-bundle SHA-256: `bca610b8308e8d99f32e6fe4197e7ec01679264efed0cac9140fe9c29f1fbf7d`.

## Attribution and license sources

- [Kokoro-82M model card](https://huggingface.co/hexgrad/Kokoro-82M):
  hexgrad, Apache-2.0 licensed model weights.
- [Official voice list](https://huggingface.co/hexgrad/Kokoro-82M/blob/main/VOICES.md):
  `bf_emma` and `bm_george` are the selected British English presets published with
  the model. No private recordings, uploaded identities, or voice cloning are used.
- [kokoro-onnx source and license](https://github.com/thewh1teagle/kokoro-onnx):
  thewh1teagle, MIT runtime; its README separately identifies the model as Apache-2.0.
- [Verified public model export release](https://github.com/thewh1teagle/kokoro-onnx/releases/tag/model-files-v1.1):
  download sizes and SHA-256 digests for the full precision model and voice bundle.
- [Phonemizer](https://github.com/bootphon/phonemizer) and
  [eSpeak NG](https://github.com/espeak-ng/espeak-ng) provide local text-to-phoneme
  preprocessing under their GPL licenses; their source/binaries are not copied
  into this website. The audible waveform is generated by Kokoro, not eSpeak.

Only generated audio, the site's original text, provenance, and the site's own
small regeneration script are published here. Model weights and third-party
runtime source/binaries are not redistributed. Attribution does not imply
endorsement by model, voice, runtime, or IELTS authors.

An independent local Whisper tiny.en recognizer also decoded all three final
MP3s. All 12 answer-bearing items were recovered: Mason and M-A-S-O-N, Tuesday,
6:15, eight pounds; the change from 17 to 18 May, north gate, 24 volunteers, water
bottle; 48 locations, six weeks, surface temperature, and interviews. This is a
secondary intelligibility check, not a human pronunciation or naturalness score.
The recognizer made minor substitutions in non-answer phrases, so its output is
not treated as a replacement transcript or proof of perfect pronunciation.
