#!/usr/bin/env python3
"""CrimeTimeSnacks transcriber — turns every episode into a searchable transcript.

Reads automation/episodes.json, finds episodes with no transcript yet, grabs the
audio (local audio/ file if present, otherwise downloads from the feed URL), and
transcribes with faster-whisper (small model, int8 — CPU friendly, no API, $0).
Writes automation/transcripts/<slug>.json used by build-episodes + build-search.

Run:  python automation/transcribe.py          (transcribe everything missing)
      python automation/transcribe.py <slug>   (one episode)

First run: pip install faster-whisper
"""
import json
import sys
import time
import tempfile
import urllib.request
from pathlib import Path

HERE = Path(__file__).parent
ROOT = HERE.parent
OUT = HERE / "transcripts"
OUT.mkdir(exist_ok=True)

# Local files that don't match their episode slug.
LOCAL_AUDIO_HINTS = {
    "erik-and-lyle-the-menendez-brothers": "menendez-brothers.m4a",
    "murders-in-moscow": "moscow-murders.mp3",
}


def local_audio_for(slug: str):
    hint = LOCAL_AUDIO_HINTS.get(slug)
    candidates = [ROOT / "audio" / hint] if hint else []
    candidates += list((ROOT / "audio").glob(f"{slug}.*")) if (ROOT / "audio").exists() else []
    for c in candidates:
        if c and c.exists():
            return c
    return None


def fetch_audio(url: str, tmpdir: str) -> Path:
    suffix = ".m4a" if ".m4a" in url else ".mp3"
    dest = Path(tmpdir) / ("episode" + suffix)
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 CrimeTimeSnacksTranscriber/1.0"})
    with urllib.request.urlopen(req, timeout=120) as r, open(dest, "wb") as f:
        while True:
            chunk = r.read(1 << 16)
            if not chunk:
                break
            f.write(chunk)
    return dest


def main():
    only = sys.argv[1] if len(sys.argv) > 1 else None
    episodes = json.loads((HERE / "episodes.json").read_text(encoding="utf-8"))["episodes"]
    todo = []
    for ep in episodes:
        if only and ep["slug"] != only:
            continue
        if (OUT / f"{ep['slug']}.json").exists():
            continue
        todo.append(ep)
    if not todo:
        print("All episodes already transcribed.")
        return

    from faster_whisper import WhisperModel  # imported late so --help stays fast
    print(f"Transcribing {len(todo)} episode(s) with faster-whisper small (int8, CPU)...")
    model = WhisperModel("small", device="cpu", compute_type="int8")

    for ep in todo:
        slug, title = ep["slug"], ep["title"]
        t0 = time.time()
        with tempfile.TemporaryDirectory() as tmp:
            src = local_audio_for(slug)
            if src is None:
                print(f"  {slug}: downloading audio...")
                try:
                    src = fetch_audio(ep["audio"], tmp)
                except Exception as e:
                    print(f"  {slug}: SKIP (download failed: {e})")
                    continue
            print(f"  {slug}: transcribing {src.name}...")
            try:
                segments, info = model.transcribe(str(src), language="en", vad_filter=True, beam_size=1)
                segs = [
                    {"start": round(s.start, 1), "end": round(s.end, 1), "text": s.text.strip()}
                    for s in segments
                    if s.text.strip()
                ]
            except Exception as e:
                print(f"  {slug}: SKIP (transcription failed: {e})")
                continue
        out = {
            "slug": slug,
            "title": title,
            "language": info.language,
            "duration": round(info.duration, 1),
            "model": "faster-whisper small (int8)",
            "generated": time.strftime("%Y-%m-%d"),
            "note": "Auto-transcribed; may contain minor errors.",
            "segments": segs,
        }
        (OUT / f"{slug}.json").write_text(json.dumps(out, indent=1), encoding="utf-8")
        print(f"  {slug}: DONE — {len(segs)} segments, {info.duration:.0f}s audio, {time.time()-t0:.0f}s wall")

    print("Transcription complete. Now run: node automation/build-all.mjs")


if __name__ == "__main__":
    main()
