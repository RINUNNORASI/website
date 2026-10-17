# Bundled original listening audio

The three MP3 files under `dist/assets/listening/` speak this site's existing
original exercise scripts from `dist/listening-data.js`. They contain no official
IELTS questions, recordings, or transcripts. They are **offline synthesized US
English speech**, not human recordings or official IELTS test material. The audio
and the already published original scripts describe exactly the same exercises.

## Playback and reproduction

The MP3 files are ordinary same-origin media assets. Playing them does not require
browser speech synthesis, installed device voices, a voice API, or a third-party
audio host. This fixes the dependency that could leave the original exercises
silent on devices without an available English speech synthesis voice. Browser
user-gesture and media playback policies still apply.

To regenerate on a developer machine with the listed tools already installed:

```sh
python3 scripts/generate-listening-audio.py
```

The generator reads only the `originals` collection. It invokes local FFmpeg Flite
voices and uses temporary PCM files; it does not fetch a model, access the network,
or copy generator binaries/voice models into the repository. It uses `slt` for
monologues and the receptionist, and `rms` for the caller. Role labels are omitted
from the spoken dialogue; apostrophes are normalized for Flite's tokenizer.

Each turn is paced to approximately 145 words per minute without changing pitch,
with 0.38-second gaps between dialogue turns. Including pauses, the resulting
rates are approximately 130–143 words per minute. These are clear practice speeds,
not a claim to reproduce the speed or accent of an IELTS examiner. Encoding is
24 kHz mono MP3 at 48 kbit/s, with loudness normalization to a target of -16 LUFS
and a true-peak limit of -1.5 dBTP.

Generation environment: FFmpeg `7.1.5-0+deb13u1`, Debian `libflite1 2.2-7`,
`libmp3lame0 3.100-6+b3`. Different tool versions may produce different binary
hashes while preserving the script and playback format.

## Asset verification

All three files were independently parsed with ffprobe and fully decoded with
FFmpeg. They have one MP3 audio stream. Decoded PCM length and signal levels were
checked to reject empty, truncated, or silent output. This is format/signal
verification; it does not claim a browser or human listening test.

| Asset | Bytes | Decoded duration | Overall words/min | PCM RMS dBFS | PCM peak dBFS |
| --- | ---: | ---: | ---: | ---: | ---: |
| `library-workshop.mp3` | 233165 | 38.74 s | 130.1 | -16.85 | -2.10 |
| `riverside-volunteers.mp3` | 265133 | 44.08 s | 142.9 | -15.75 | -4.08 |
| `urban-shade-study.mp3` | 250301 | 41.60 s | 142.8 | -15.79 | -3.25 |

Total size: **748599 bytes**. SHA-256 values:

| Asset | Audio SHA-256 | Exact original UTF-8 `script` SHA-256 |
| --- | --- | --- |
| `library-workshop.mp3` | `20285d595a415b83c9ed41ee3dffad818f850073f325bca85a502dde36dfbf04` | `5fabcd4c9c763e6142de93fc206dee1fcaf342b3f1ebb45c29564f4938e70dec` |
| `riverside-volunteers.mp3` | `e3c84b9f56fd43b9dde9878fa56f2e5b306708a7dcff1fa776b26b52ddd3557f` | `e87514ec70c7e54ca24b45454a197131601bd55065b97e59e7b0eff21cba7df1` |
| `urban-shade-study.mp3` | `87641ba174ae79ee19136d4ce9552aa3655c9a0523db102c7e4ea5dab56bbca9` | `b5a5d6029104d8c7845b2a98d04eac3da2ddba1c1395ad14146df9833522cccc` |

## Generator attribution and license context

Flite is by the Language Technologies Institute at Carnegie Mellon University,
Alan W Black, David Huggins-Daines, and other contributors. The locally installed
Debian package's `/usr/share/doc/libflite1/copyright` was inspected for attribution
and terms. Its general Flite software permission notice is reproduced below for
clarity; no Flite source code, executable, or voice model is redistributed here.
The original exercise text remains the site's own content. This generated output
does not imply an endorsement by the voice authors or universities.

> Copyright (c) 1999-2001 by Language Technologies Institute,
> Carnegie Mellon University. All Rights Reserved.
>
> Permission is hereby granted, free of charge, to use and distribute
> this software and its documentation without restriction, including
> without limitation the rights to use, copy, modify, merge, publish,
> distribute, sublicense, and/or sell copies of this work, and to
> permit persons to whom this work is furnished to do so, subject to
> the following conditions:
>
> 1. The code must retain the above copyright notice, this list of
>    conditions and the following disclaimer.
> 2. Any modifications must be clearly marked as such.
> 3. Original authors' names are not deleted.
> 4. The authors' names are not used to endorse or promote products
>    derived from this software without specific prior written
>    permission.
>
> CARNEGIE MELLON UNIVERSITY AND THE CONTRIBUTORS TO THIS WORK
> DISCLAIM ALL WARRANTIES WITH REGARD TO THIS SOFTWARE, INCLUDING
> ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS, IN NO EVENT
> SHALL CARNEGIE MELLON UNIVERSITY NOR THE CONTRIBUTORS BE LIABLE
> FOR ANY SPECIAL, INDIRECT OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
> WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN
> AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION,
> ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF
> THIS SOFTWARE.
