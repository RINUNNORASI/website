#!/usr/bin/env python3
"""Generate portable audio from the site's original listening scripts, offline.

Requires Python 3, Node.js, FFmpeg/ffprobe, and FFmpeg's installed Flite voices.
No voice model, generator binary, or third-party exercise is copied into dist.
"""

from __future__ import annotations

import array
import hashlib
import json
import math
import pathlib
import re
import subprocess
import tempfile
import wave


ROOT = pathlib.Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "dist/assets/listening"
TARGET_WPM = 145
SAMPLE_RATE = 24000
TURN_PAUSE_SECONDS = 0.38
VOICE_BY_SPEAKER = {"Receptionist": "slt", "Caller": "rms"}


def run(*args: str) -> subprocess.CompletedProcess:
    return subprocess.run(args, cwd=ROOT, check=True, capture_output=True)


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def word_count(text: str) -> int:
    return len(re.findall(r"[A-Za-z0-9]+(?:['’\-][A-Za-z0-9]+)*", text))


def turns(script: str) -> list[tuple[str, str]]:
    matches = list(re.finditer(r"\b(Receptionist|Caller):\s*", script))
    if not matches:
        return [("slt", script)]
    if script[: matches[0].start()].strip():
        raise ValueError("Unexpected text before the first dialogue speaker")
    return [
        (
            VOICE_BY_SPEAKER[match.group(1)],
            script[match.end() : matches[index + 1].start() if index + 1 < len(matches) else len(script)].strip(),
        )
        for index, match in enumerate(matches)
    ]


def synthesize(text: str, voice: str, work: pathlib.Path, index: int) -> bytes:
    # Flite's US English tokenizer expects straight apostrophes. Preserve all
    # spoken words while normalizing punctuation, and don't read role labels.
    textfile = work / f"turn-{index}.txt"
    textfile.write_text(text.replace("’", "'").replace("‘", "'"), encoding="utf-8")
    raw = work / f"turn-{index}-raw.wav"
    run(
        "ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i",
        f"flite=textfile='{textfile}':voice={voice}", "-ac", "1", "-ar", str(SAMPLE_RATE), str(raw),
    )
    with wave.open(str(raw), "rb") as audio:
        duration = audio.getnframes() / audio.getframerate()
    # Pace each speaking turn consistently without changing its pitch.
    target_duration = word_count(text) * 60 / TARGET_WPM
    tempo = duration / target_duration
    if not 0.5 <= tempo <= 2:
        raise ValueError(f"Unexpected speech rate for {voice}: tempo={tempo}")
    paced = work / f"turn-{index}-paced.wav"
    run(
        "ffmpeg", "-v", "error", "-y", "-i", str(raw), "-af", f"atempo={tempo:.8f}",
        "-ac", "1", "-ar", str(SAMPLE_RATE), str(paced),
    )
    with wave.open(str(paced), "rb") as audio:
        if audio.getsampwidth() != 2 or audio.getnchannels() != 1:
            raise ValueError("Expected signed 16-bit mono PCM")
        return audio.readframes(audio.getnframes())


def verify(path: pathlib.Path) -> dict:
    info = json.loads(run("ffprobe", "-v", "error", "-show_format", "-show_streams", "-of", "json", str(path)).stdout)
    stream = info["streams"][0]
    if stream["codec_name"] != "mp3" or stream["channels"] != 1:
        raise ValueError("Expected a playable mono MP3")
    decoded = run("ffmpeg", "-v", "error", "-i", str(path), "-f", "s16le", "-acodec", "pcm_s16le", "-ac", "1", "-ar", str(SAMPLE_RATE), "-").stdout
    samples = array.array("h", decoded)
    rms = math.sqrt(sum(sample * sample for sample in samples) / len(samples)) / 32768
    peak = max(abs(sample) for sample in samples) / 32768
    audible_fraction = sum(abs(sample) > 327 for sample in samples) / len(samples)
    if len(samples) < SAMPLE_RATE * 10 or rms < 0.01 or peak < 0.1 or audible_fraction < 0.15:
        raise ValueError(f"Audio appears empty or unexpectedly quiet: {path.name}")
    return {
        "filename": path.name,
        "bytes": path.stat().st_size,
        "seconds": round(len(samples) / SAMPLE_RATE, 2),
        "sha256": sha256(path.read_bytes()),
        "rms_dbfs": round(20 * math.log10(rms), 2),
        "peak_dbfs": round(20 * math.log10(peak), 2),
        "audible_percent": round(audible_fraction * 100, 2),
    }


def main() -> None:
    lessons = json.loads(run("node", "-e", "process.stdout.write(JSON.stringify(require('./dist/listening-data.js').originals))").stdout)
    OUTPUT.mkdir(parents=True, exist_ok=True)
    results = []
    for lesson in lessons:
        if lesson.get("kind") != "original" or not re.fullmatch(r"[a-z0-9-]+", lesson["id"]):
            raise ValueError("Only known original lesson IDs may be synthesized")
        script = lesson["script"]
        utterances = turns(script)
        with tempfile.TemporaryDirectory(prefix="xunci-original-audio-") as directory:
            work = pathlib.Path(directory)
            speech = bytearray(b"\0\0" * round(SAMPLE_RATE * 0.25))
            for index, (voice, text) in enumerate(utterances):
                speech.extend(synthesize(text, voice, work, index))
                pause = TURN_PAUSE_SECONDS if index + 1 < len(utterances) else 0.4
                speech.extend(b"\0\0" * round(SAMPLE_RATE * pause))
            combined = work / "combined.wav"
            with wave.open(str(combined), "wb") as audio:
                audio.setnchannels(1)
                audio.setsampwidth(2)
                audio.setframerate(SAMPLE_RATE)
                audio.writeframes(speech)
            encoded = work / "final.mp3"
            run(
                "ffmpeg", "-v", "error", "-y", "-i", str(combined),
                "-af", "loudnorm=I=-16:TP=-1.5:LRA=11", "-ac", "1", "-ar", str(SAMPLE_RATE),
                "-c:a", "libmp3lame", "-b:a", "48k", "-map_metadata", "-1",
                "-metadata", "comment=Xunci original practice; offline synthetic speech (CMU Flite)",
                str(encoded),
            )
            verification = verify(encoded)
            target = OUTPUT / f"{lesson['id']}.mp3"
            target.write_bytes(encoded.read_bytes())
            verification["filename"] = target.name
            verification["script_sha256"] = sha256(script.encode("utf-8"))
            verification["voices"] = sorted({voice for voice, _ in utterances})
            verification["words"] = sum(word_count(text) for _, text in utterances)
            verification["overall_wpm"] = round(verification["words"] * 60 / verification["seconds"], 1)
            results.append(verification)
    total_bytes = sum(result["bytes"] for result in results)
    if total_bytes >= 1_000_000:
        raise ValueError(f"Audio budget exceeded: {total_bytes} bytes")
    metadata = {"target_wpm": TARGET_WPM, "total_bytes": total_bytes, "assets": results}
    print(json.dumps(metadata, indent=2))


if __name__ == "__main__":
    main()
