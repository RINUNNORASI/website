#!/usr/bin/env python3
"""Generate original listening MP3s locally with pinned open-source neural TTS.

Install scripts/listening-audio-requirements.txt into an isolated environment,
then supply the two verified public model files. Only audio and its provenance
manifest are written to dist; the large model and runtime remain outside Git.
"""

from __future__ import annotations

import argparse
import array
import hashlib
import importlib.metadata
import json
import math
import pathlib
import re
import subprocess
import tempfile

import numpy as np
import soundfile as sf
from kokoro_onnx import Kokoro

ROOT = pathlib.Path(__file__).resolve().parents[1]
SAMPLE_RATE = 24000
TURN_PAUSE_SECONDS = 0.35
SPEED = 0.90
BITRATE = "80k"
MODEL_SHA256 = "beb0d1848dee9a49da392cc3df26958d46cfa35d321edf434f52949153f0df3a"
VOICES_SHA256 = "bca610b8308e8d99f32e6fe4197e7ec01679264efed0cac9140fe9c29f1fbf7d"
RELEASE = "https://github.com/thewh1teagle/kokoro-onnx/releases/tag/model-files-v1.1"
VOICE_BY_SPEAKER = {"Receptionist": "bf_emma", "Caller": "bm_george"}


def run(*args: str) -> subprocess.CompletedProcess:
    return subprocess.run(args, cwd=ROOT, check=True, capture_output=True)


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def word_count(text: str) -> int:
    return len(re.findall(r"[A-Za-z0-9]+(?:['’\-][A-Za-z0-9]+)*", text))


def turns(script: str) -> list[tuple[str, str]]:
    matches = list(re.finditer(r"\b(Receptionist|Caller):\s*", script))
    if not matches:
        return [("bf_emma", script)]
    if script[: matches[0].start()].strip():
        raise ValueError("Unexpected text before the first dialogue speaker")
    return [
        (
            VOICE_BY_SPEAKER[match.group(1)],
            script[match.end() : matches[index + 1].start() if index + 1 < len(matches) else len(script)].strip(),
        )
        for index, match in enumerate(matches)
    ]


def synthesize(engine: Kokoro, text: str, voice: str) -> np.ndarray:
    # Keep authored words and spelled letters; omit only dialogue role labels.
    # Neural duration prediction controls the pace, without forced WPM stretching.
    samples, sample_rate = engine.create(
        text.replace("’", "'").replace("‘", "'"),
        voice=voice, speed=SPEED, lang="en-gb", sentence_pause=0.25, clause_pause=0.1,
    )
    samples = np.asarray(samples, dtype=np.float32)
    if sample_rate != SAMPLE_RATE or samples.ndim != 1 or not np.isfinite(samples).all():
        raise ValueError("Unexpected neural speech output")
    if len(samples) < SAMPLE_RATE * 0.15 or np.max(np.abs(samples)) < 0.02:
        raise ValueError("Speech output appears empty or silent")
    return samples


def verify(path: pathlib.Path) -> dict:
    info = json.loads(run("ffprobe", "-v", "error", "-show_format", "-show_streams", "-of", "json", str(path)).stdout)
    stream = info["streams"][0]
    if stream["codec_name"] != "mp3" or stream["channels"] != 1 or int(stream["sample_rate"]) != SAMPLE_RATE:
        raise ValueError("Expected a playable 24 kHz mono MP3")
    if int(stream.get("bit_rate", "0")) < 64000:
        raise ValueError("Speech encoding bitrate is too low")
    decoded = run("ffmpeg", "-v", "error", "-i", str(path), "-f", "s16le", "-acodec", "pcm_s16le", "-ac", "1", "-ar", str(SAMPLE_RATE), "-").stdout
    samples = array.array("h", decoded)
    rms = math.sqrt(sum(sample * sample for sample in samples) / len(samples)) / 32768
    peak = max(abs(sample) for sample in samples) / 32768
    audible_fraction = sum(abs(sample) > 327 for sample in samples) / len(samples)
    if len(samples) < SAMPLE_RATE * 10 or rms < 0.01 or peak < 0.1 or peak >= 0.99 or audible_fraction < 0.15:
        raise ValueError(f"Audio appears empty, too quiet, or clipped: {path.name}")
    return {
        "filename": path.name,
        "bytes": path.stat().st_size,
        "seconds": round(len(samples) / SAMPLE_RATE, 2),
        "sha256": sha256(path.read_bytes()),
        "rms_dbfs": round(20 * math.log10(rms), 2),
        "peak_dbfs": round(20 * math.log10(peak), 2),
        "audible_percent": round(audible_fraction * 100, 2),
        "sample_rate": SAMPLE_RATE,
        "bit_rate": int(stream["bit_rate"]),
    }


def versioned_lesson_data(results: list[dict]) -> str:
    """Keep unchanged filenames from retaining old audio in a browser cache."""
    text = (ROOT / "dist/listening-data.js").read_text(encoding="utf-8")
    for asset in results:
        path = "/assets/listening/" + asset["filename"]
        pattern = re.escape(path) + r"(?:\?v=[a-f0-9]+)?"
        text, count = re.subn(pattern, path + "?v=" + asset["sha256"][:12], text)
        if count != 1:
            raise ValueError(f"Expected exactly one original audio URL: {asset['id']}")
    return text


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--model", type=pathlib.Path, required=True, help="Verified kokoro-v1.0.onnx outside the repository")
    parser.add_argument("--voices", type=pathlib.Path, required=True, help="Verified voices-v1.0.bin outside the repository")
    parser.add_argument("--output", type=pathlib.Path, default=ROOT / "dist/assets/listening")
    args = parser.parse_args()
    if importlib.metadata.version("kokoro-onnx") != "0.6.1":
        raise ValueError("Use pinned kokoro-onnx 0.6.1 for this model export")
    for path, expected in [(args.model, MODEL_SHA256), (args.voices, VOICES_SHA256)]:
        if sha256(path.read_bytes()) != expected:
            raise ValueError(f"Public model release SHA-256 mismatch: {path.name}")
    engine = Kokoro(str(args.model), str(args.voices))
    lessons = json.loads(run("node", "-e", "process.stdout.write(JSON.stringify(require('./dist/listening-data.js').originals))").stdout)
    results = []
    # Stage every file first, so failed synthesis cannot replace only some assets.
    with tempfile.TemporaryDirectory(prefix="xunci-neural-audio-") as directory:
        work = pathlib.Path(directory)
        for lesson in lessons:
            if lesson.get("kind") != "original" or not re.fullmatch(r"[a-z0-9-]+", lesson["id"]):
                raise ValueError("Only known original lesson IDs may be synthesized")
            script = lesson["script"]
            utterances = turns(script)
            speech = [np.zeros(round(SAMPLE_RATE * 0.25), dtype=np.float32)]
            for index, (voice, text) in enumerate(utterances):
                speech.append(synthesize(engine, text, voice))
                pause = TURN_PAUSE_SECONDS if index + 1 < len(utterances) else 0.4
                speech.append(np.zeros(round(SAMPLE_RATE * pause), dtype=np.float32))
            combined = work / "combined.wav"
            sf.write(str(combined), np.concatenate(speech), SAMPLE_RATE, subtype="PCM_16")
            encoded = work / f"{lesson['id']}.mp3"
            run(
                "ffmpeg", "-v", "error", "-y", "-i", str(combined),
                "-af", "loudnorm=I=-16:TP=-1.5:LRA=11", "-ac", "1", "-ar", str(SAMPLE_RATE),
                "-c:a", "libmp3lame", "-b:a", BITRATE, "-map_metadata", "-1",
                "-metadata", "comment=Xunci original practice; Kokoro-82M open-source neural synthetic speech; British English",
                str(encoded),
            )
            verification = verify(encoded)
            verification.update({
                "id": lesson["id"],
                "script_sha256": sha256(script.encode("utf-8")),
                "voices": sorted({voice for voice, _ in utterances}),
                "words": sum(word_count(text) for _, text in utterances),
            })
            verification["overall_wpm"] = round(verification["words"] * 60 / verification["seconds"], 1)
            results.append(verification)
            print(json.dumps(verification), flush=True)
        total_bytes = sum(result["bytes"] for result in results)
        if total_bytes >= 1_500_000:
            raise ValueError(f"Audio budget exceeded: {total_bytes} bytes")
        metadata = {
            "engine": "kokoro-onnx", "engine_version": "0.6.1", "engine_license": "MIT",
            "model": "Kokoro-82M v1.0 FP32 ONNX", "model_license": "Apache-2.0",
            "model_release": RELEASE, "model_sha256": MODEL_SHA256, "voices_sha256": VOICES_SHA256,
            "language": "en-gb", "voices": VOICE_BY_SPEAKER, "narrator_voice": "bf_emma",
            "speed": SPEED, "turn_pause_seconds": TURN_PAUSE_SECONDS,
            "format": {"codec": "mp3", "sample_rate": SAMPLE_RATE, "channels": 1, "bit_rate": 80000},
            "package_versions": {name: importlib.metadata.version(name) for name in ["kokoro-onnx", "onnxruntime", "numpy", "soundfile", "phonemizer", "espeakng-loader"]},
            "total_bytes": total_bytes, "assets": results,
        }
        (work / "manifest.json").write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")
        data_js = versioned_lesson_data(results)
        args.output.mkdir(parents=True, exist_ok=True)
        for result in results:
            (args.output / result["filename"]).write_bytes((work / result["filename"]).read_bytes())
        (args.output / "manifest.json").write_bytes((work / "manifest.json").read_bytes())
        if args.output.resolve() == (ROOT / "dist/assets/listening").resolve():
            (ROOT / "dist/listening-data.js").write_text(data_js, encoding="utf-8")
    print(json.dumps({"total_bytes": total_bytes, "assets": len(results)}), flush=True)


if __name__ == "__main__":
    main()
