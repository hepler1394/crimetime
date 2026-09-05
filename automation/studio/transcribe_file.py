#!/usr/bin/env python3
"""Transcribe one audio file to timed segments (faster-whisper, CPU, no keys).

    python transcribe_file.py <audio> <out.json> [--offset SECONDS]

Used by the studio for audio that has no word timings of its own: cloned voice
and Cory's own recordings. edge-tts audio keeps the subtitle timings it ships.
Writes {"segments":[{"start","end","text"}], "duration"} in the shape
build-episodes.mjs renders.
"""
import json
import sys
import time


def main():
    if len(sys.argv) < 3:
        sys.exit("usage: transcribe_file.py <audio> <out.json> [--offset S]")
    src, out = sys.argv[1], sys.argv[2]
    offset = float(sys.argv[sys.argv.index("--offset") + 1]) if "--offset" in sys.argv else 0.0
    from faster_whisper import WhisperModel
    t0 = time.time()
    model = WhisperModel("small", device="cpu", compute_type="int8")
    segments, info = model.transcribe(src, language="en", vad_filter=True, beam_size=1)
    segs = [{"start": round(s.start + offset, 1), "end": round(s.end + offset, 1), "text": s.text.strip()} for s in segments if s.text.strip()]
    json.dump({"duration": round(info.duration + offset, 1), "segments": segs, "model": "faster-whisper small (int8)"}, open(out, "w", encoding="utf-8"), indent=1)
    print(f"transcribed {len(segs)} segments, {info.duration:.0f}s audio, {time.time() - t0:.0f}s wall", flush=True)


if __name__ == "__main__":
    main()
