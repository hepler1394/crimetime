#!/usr/bin/env python3
"""Word-level transcript for the audio audit (faster-whisper medium.en, CPU).

    python asr_words.py <audio> <out.json>
    python asr_words.py --batch <out.json> <audio> [<audio> ...]   one model load, {path: words}

Bigger and slower than transcribe_file.py on purpose: the audit needs each word's time and
confidence, and the small model mishears too much to tell a clone glitch from its own mistake.
No VAD and no conditioning on previous text, so a stutter is reported rather than smoothed over.
"""
import json
import sys
import time


def main():
    if len(sys.argv) < 3:
        sys.exit("usage: asr_words.py <audio> <out.json> | --batch <out.json> <audio>...")
    from faster_whisper import WhisperModel
    t0 = time.time()
    model = WhisperModel("medium.en", device="cpu", compute_type="int8")

    def words_of(path):
        segments, info = model.transcribe(path, beam_size=5, word_timestamps=True, vad_filter=False, condition_on_previous_text=False)
        ws = []
        for s in segments:
            for w in (s.words or []):
                ws.append({"w": w.word.strip(), "s": round(w.start, 2), "e": round(w.end, 2), "p": round(w.probability, 3)})
        return ws, info

    if sys.argv[1] == "--batch":
        res = {}
        for path in sys.argv[3:]:
            res[path], _ = words_of(path)
        json.dump(res, open(sys.argv[2], "w", encoding="utf-8"))
        print(f"{len(res)} files, {time.time() - t0:.0f}s wall", flush=True)
        return

    words, info = words_of(sys.argv[1])
    json.dump({"duration": round(info.duration, 1), "model": "faster-whisper medium.en (int8)", "words": words}, open(sys.argv[2], "w", encoding="utf-8"))
    print(f"{len(words)} words, {info.duration:.0f}s audio, {time.time() - t0:.0f}s wall", flush=True)


if __name__ == "__main__":
    main()
