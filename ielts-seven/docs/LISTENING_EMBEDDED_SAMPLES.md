# Official sample viewing inside the listening workspace

The official tab now provides native audio playback and an inline PDF viewer.
The app references unchanged official files on their original hosts. It does not
download, proxy, cache, mirror, transcribe, or republish official recordings,
questions, answers, or transcripts in the repository or application server.
The official source link and the PDF's own copyright information remain visible.

Verified source context:

- [British Council official listening practice](https://takeielts.britishcouncil.org/prepare/ielts-free-practice-mock-tests/academic/listening)
- [IELTS 33-page listening sample task collection](https://cdn.ielts.org/Sample-tests/ielts-listening-sample-tasks-2023.pdf)
- [IELTS copyright statement](https://ielts.org/legal/ielts-copyright-and-trade-mark-statement)
- [British Council terms](https://www.britishcouncil.org/terms)

The sample collection matches the three pre-existing official MP3 task URLs.
The earlier teacher lesson-plan PDFs are replaced with the sample collection.

| Task | Question page | Answer page | Transcript pages |
| --- | ---: | ---: | --- |
| 1: Form completion | 3 | 7 | 4–6 |
| 3: Short answer | 11 | 13 | 12 |
| 5: Matching 1 | 18 | 21 | 19–20 |

The app's answer/transcript controls remain locked until explicit reveal. The
complete official PDF includes answers, so a reader can still scroll to them;
the visible UI discloses this limitation. Official work is self-checked and is
never automatically graded or converted to an IELTS band score.

Remote media remains subject to the official server's availability, framing
policy, network access and the user's PDF reader. Those were not verified in a
live browser. The UI also accepts the user's own downloaded MP3 and PDF for
viewing inside this page. These files stay in browser Blob URLs, are never
uploaded, and are revoked on replacement, account change or controller reset.
PDF imports are limited to 25 MB and audio imports to 100 MB. Neither files nor
listening notes are silently included in cloud vocabulary state.

The site's original exercises use bundled synthetic MP3s, documented separately
in [LISTENING_AUDIO.md](LISTENING_AUDIO.md). They do not require access to the
official media hosts or device speech synthesis.
