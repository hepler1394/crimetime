#!/usr/bin/env python
"""Voice clone for the podcast studio: Chatterbox TTS (Resemble AI, MIT), CPU.

    .venv/Scripts/python tts_clone.py --ref voice/cory-reference.wav --text-file p.txt --out p.wav
    .venv/Scripts/python tts_clone.py --ref ... --jsonl paragraphs.jsonl --outdir tts/

Reads paragraphs, synthesizes each in the reference voice, writes 24 kHz mono WAVs.
Long inputs are split into sentence groups of about 250 characters and joined
with a short breath: Chatterbox slows sharply (and drifts) past a few hundred
characters, so a 400-character paragraph in one shot took over ten minutes on
this CPU while three 130-character pieces take about two.
The model (~2 GB) downloads from Hugging Face on first run into the HF cache.
"""
import argparse
import json
import re
import sys
import time
from pathlib import Path

MAX_CHARS = 250


def log(msg):
    print(msg, flush=True)


def chunk(text, limit=MAX_CHARS):
    """Sentence groups under `limit` chars; a single long sentence splits on commas."""
    sentences = re.split(r"(?<=[.!?])\s+", text.strip())
    out, buf = [], ""
    for s in sentences:
        if len(s) > limit:
            for piece in re.split(r"(?<=,)\s+", s):
                if len(buf) + len(piece) + 1 > limit and buf:
                    out.append(buf.strip()); buf = ""
                buf += (" " if buf else "") + piece
            continue
        if len(buf) + len(s) + 1 > limit and buf:
            out.append(buf.strip()); buf = ""
        buf += (" " if buf else "") + s
    if buf.strip():
        out.append(buf.strip())
    return out or [text]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--ref", required=True, help="reference wav of the voice to clone (10 to 20 s, clean)")
    ap.add_argument("--text-file", help="one paragraph to synthesize")
    ap.add_argument("--out", help="output wav for --text-file")
    ap.add_argument("--jsonl", help="file with one {\"i\":n,\"text\":...} per line")
    ap.add_argument("--outdir", help="directory for --jsonl outputs (p000.wav ...)")
    ap.add_argument("--exaggeration", type=float, default=0.45, help="0.3 calm .. 0.7 dramatic (default 0.45)")
    ap.add_argument("--cfg", type=float, default=0.5, help="cfg weight; lower = slower, more deliberate pacing (default 0.5)")
    ap.add_argument("--seed", type=int, default=7)
    a = ap.parse_args()

    import torch
    import torchaudio as ta
    from chatterbox.tts import ChatterboxTTS

    torch.manual_seed(a.seed)
    t0 = time.time()
    log("loading chatterbox (first run downloads the model)...")
    model = ChatterboxTTS.from_pretrained(device="cpu")
    log(f"model ready in {time.time() - t0:.0f}s, sample rate {model.sr}")
    breath = torch.zeros(1, int(model.sr * 0.28))

    jobs = []
    if a.text_file:
        jobs.append((Path(a.out), Path(a.text_file).read_text(encoding="utf-8").strip()))
    if a.jsonl:
        outdir = Path(a.outdir)
        outdir.mkdir(parents=True, exist_ok=True)
        for line in Path(a.jsonl).read_text(encoding="utf-8").splitlines():
            if not line.strip():
                continue
            j = json.loads(line)
            jobs.append((outdir / f"p{int(j['i']):03d}.wav", j["text"].strip()))
    if not jobs:
        sys.exit("nothing to synthesize")

    for out, text in jobs:
        if out.exists():
            log(f"  {out.name}: already done, skipping")
            continue
        t1 = time.time()
        pieces = chunk(text)
        wavs = []
        for k, piece in enumerate(pieces):
            torch.manual_seed(a.seed)  # same voice character for every piece
            wavs.append(model.generate(piece, audio_prompt_path=a.ref, exaggeration=a.exaggeration, cfg_weight=a.cfg))
            if k < len(pieces) - 1:
                wavs.append(breath)
        wav = torch.cat(wavs, dim=-1)
        tmp = out.with_suffix(".part.wav")
        ta.save(str(tmp), wav, model.sr)
        tmp.replace(out)
        secs = wav.shape[-1] / model.sr
        log(f"  {out.name}: {len(pieces)} piece(s), {secs:.1f}s audio in {time.time() - t1:.0f}s")
    log("done")


if __name__ == "__main__":
    main()
