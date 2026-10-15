#!/usr/bin/env python3
"""Rebuild a bounded, attributed frequency snapshot from a local upstream file.

Download the public source through the configured network proxy first; this
script performs no network requests. Usage:
  python scripts/build-frequency-data.py /tmp/en_50k.txt
"""
import hashlib
import json
import re
import sys
from pathlib import Path

SOURCE = "https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/en/en_50k.txt"
SOURCE_ROWS = 50000
RETAINED = 17000
TARGET = Path(__file__).resolve().parents[1] / "dist" / "frequency-data.js"


def base36(value):
    digits, result = "0123456789abcdefghijklmnopqrstuvwxyz", ""
    while value:
        value, remainder = divmod(value, 36)
        result = digits[remainder] + result
    return result or "0"


raw = Path(sys.argv[1]).read_bytes()
lines = raw.decode("utf-8").splitlines()
assert len(lines) == SOURCE_ROWS, "Unexpected source length; review the snapshot"
rows = []
for line in lines:
    word, count = line.split()
    if re.fullmatch(r"[a-z]+(?:[-'][a-z]+)*", word):
        rows.append((word, int(count)))
assert len(rows) >= RETAINED
selected = rows[:RETAINED]
assert len({word for word, _ in selected}) == RETAINED
packed = " ".join(word + ":" + base36(count) for word, count in selected)
metadata = {
    "source": SOURCE,
    "author": "Hermit Dave / FrequencyWords; OpenSubtitles2018 corpus",
    "license": "CC-BY-SA-4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0/",
    "sourceSha256": hashlib.sha256(raw).hexdigest(),
    "sourceRows": SOURCE_ROWS,
    "validSourceTokens": len(rows),
    "retainedTokens": RETAINED,
    "minRetainedCount": selected[-1][1],
    "aMaxRank": 10000,
    "aMinCount": selected[9999][1],
    "rankDefinition": "1-based rank after keeping lowercase ASCII tokens with internal hyphens/apostrophes; not original source line number",
    "changes": "Filtered tokens; retained the first 17000; occurrence counts encoded in base 36. Counts unchanged.",
    "limitations": "Subtitle frequency is not a dictionary, CEFR band, IELTS frequency, or evidence of learner mastery. Unlisted words may be valid and useful.",
}
content = """/* FrequencyWords / Hermit Dave, OpenSubtitles2018 English content.
 * Derived data: CC BY-SA 4.0. Attribution and changes: CLASSIFIER-DATA.md.
 * https://github.com/hermitdave/FrequencyWords
 * https://creativecommons.org/licenses/by-sa/4.0/
 */
(function (root, factory) {
  const data = factory();
  if (typeof module === 'object' && module.exports) module.exports = data;
  if (root) root.IELTS_FREQUENCY = data;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  const metadata = Object.freeze(METADATA);
  const packed = PACKED;
  const entries = Object.create(null);
  packed.split(' ').forEach(function (token, index) {
    const colon = token.lastIndexOf(':');
    entries[token.slice(0, colon)] = Object.freeze({count: parseInt(token.slice(colon + 1), 36), rank: index + 1});
  });
  return Object.freeze({metadata, entries: Object.freeze(entries)});
});
""".replace("METADATA", json.dumps(metadata, ensure_ascii=True, separators=(",", ":"))).replace(
    "PACKED", json.dumps(packed, ensure_ascii=True)
)
assert len(content.encode("utf-8")) < 200000, "Frequency bundle exceeds 200KB"
TARGET.write_text(content, encoding="utf-8")
print(json.dumps({"file": str(TARGET), "bytes": len(content.encode()), "tokens": RETAINED,
                  "aMinCount": metadata["aMinCount"], "minRetainedCount": metadata["minRetainedCount"]}))
