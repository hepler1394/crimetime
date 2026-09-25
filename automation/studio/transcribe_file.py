#!/usr/bin/env python3
"""Transcribe one audio file to timed segments (faster-whisper, CPU, no keys).

    python transcribe_file.py <audio> <out.json> [--offset SECONDS] [--model NAME] [--prompt TEXT]

Used by the studio for audio that has no word timings of its own: Cory's own recordings
and the episodes that predate the studio. Cloned and edge-tts renders take their transcript
from the script instead (script-transcript.mjs); a transcriber guessing at names it has never
seen is how "Maggie Murdoff" reached a public page.

--model  small (default, quick) or medium.en (what the audio audit uses; slower, hears names).
--prompt the case's proper nouns, e.g. "JonBenet Ramsey, Patsy Ramsey, Boulder, Lou Smit".
         Whisper spells what it is primed with; unprimed it wrote "Jean-Benet" for a whole
         episode. Passed as the initial prompt and, where the library supports it, as hotwords
         on every window.

Writes {"segments":[{"start","end","text"}], "duration", "model"} in the shape
build-episodes.mjs renders.
"""
import json
import sys
import time


def arg(name, default=None):
    if name in sys.argv:
        i = sys.argv.index(name)
        if i + 1 < len(sys.argv):
            return sys.argv[i + 1]
    return default


def main():
    if len(sys.argv) < 3:
        sys.exit("usage: transcribe_file.py <audio> <out.json> [--offset S] [--model NAME] [--prompt TEXT]")
    src, out = sys.argv[1], sys.argv[2]
    offset = float(arg("--offset", "0"))
    model_name = arg("--model", "small")
    prompt = arg("--prompt", "") or None
    from faster_whisper import WhisperModel
    t0 = time.time()
    model = WhisperModel(model_name, device="cpu", compute_type="int8")
    kwargs = dict(language="en", vad_filter=True, beam_size=5 if model_name != "small" else 1)
    if prompt:
        kwargs["initial_prompt"] = prompt
        try:
            segments, info = model.transcribe(src, hotwords=prompt, **kwargs)
        except TypeError:
            segments, info = model.transcribe(src, **kwargs)
    else:
        segments, info = model.transcribe(src, **kwargs)
    segs = [{"start": round(s.start + offset, 1), "end": round(s.end + offset, 1), "text": s.text.strip()} for s in segments if s.text.strip()]
    json.dump({"duration": round(info.duration + offset, 1), "segments": segs, "model": f"faster-whisper {model_name} (int8)"}, open(out, "w", encoding="utf-8"), indent=1)
    print(f"transcribed {len(segs)} segments, {info.duration:.0f}s audio, {time.time() - t0:.0f}s wall", flush=True)


if __name__ == "__main__":
    main()
