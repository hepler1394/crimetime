#!/usr/bin/env python
"""Voice clone for the podcast studio: Chatterbox TTS (Resemble AI, MIT).

    .venv/Scripts/python tts_clone.py --ref voice/cory-reference.wav --text-file p.txt --out p.wav
    .venv/Scripts/python tts_clone.py --ref ... --jsonl paragraphs.jsonl --outdir tts/

Reads paragraphs, synthesizes each in the reference voice, writes 24 kHz mono WAVs.
Long inputs are split into sentence groups of about 250 characters and joined
with a short breath: Chatterbox slows sharply (and drifts) past a few hundred
characters, so a 400-character paragraph in one shot took over ten minutes on
this CPU while three 130-character pieces take about two.
The model (~2 GB) downloads from Hugging Face on first run into the HF cache.

--device picks the backend: "auto" (default) takes CUDA when torch reports it and
falls back to CPU otherwise, so this runs unchanged on mainpc (whose RX 5700 XT
has no CUDA) and takes the GPU on a rented box without a code change. The
chunking and per-piece seeding are deliberately identical on both so a paragraph
rendered on a GPU has the same voice character as one rendered here.
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


def pick_device(requested, torch):
    """Resolve auto/cpu/cuda to a device string, and say why."""
    if requested == "cpu":
        return "cpu"
    available = torch.cuda.is_available()
    if requested == "cuda":
        if not available:
            sys.exit("--device cuda was asked for but torch reports no CUDA device")
        return "cuda"
    return "cuda" if available else "cpu"


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
    ap.add_argument("--device", choices=("auto", "cpu", "cuda"), default="auto",
                    help="auto (default) takes CUDA when present, else CPU")
    a = ap.parse_args()

    import torch
    import torchaudio as ta
    from chatterbox.tts import ChatterboxTTS

    device = pick_device(a.device, torch)
    if device == "cuda":
        log(f"device: cuda ({torch.cuda.get_device_name(0)})")
    else:
        log("device: cpu")

    torch.manual_seed(a.seed)
    t0 = time.time()
    log("loading chatterbox (first run downloads the model)...")
    model = ChatterboxTTS.from_pretrained(device=device)
    log(f"model ready in {time.time() - t0:.0f}s, sample rate {model.sr}")
    # Built on CPU on purpose: every generated piece is pulled back to CPU below,
    # so the pieces and the breath are on one device before they are concatenated.
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

    audio_total = 0.0
    wall0 = time.time()
    for out, text in jobs:
        if out.exists():
            log(f"  {out.name}: already done, skipping")
            continue
        t1 = time.time()
        pieces = chunk(text)
        wavs = []
        for k, piece in enumerate(pieces):
            torch.manual_seed(a.seed)  # same voice character for every piece
            got = model.generate(piece, audio_prompt_path=a.ref, exaggeration=a.exaggeration, cfg_weight=a.cfg)
            # On CUDA the model hands back a device tensor; torch.cat refuses to mix
            # devices and torchaudio.save wants CPU, so land every piece on CPU here.
            wavs.append(got.detach().to("cpu"))
            if k < len(pieces) - 1:
                wavs.append(breath)
        wav = torch.cat(wavs, dim=-1)
        tmp = out.with_suffix(".part.wav")
        ta.save(str(tmp), wav, model.sr)
        tmp.replace(out)
        secs = wav.shape[-1] / model.sr
        audio_total += secs
        log(f"  {out.name}: {len(pieces)} piece(s), {secs:.1f}s audio in {time.time() - t1:.0f}s")
    if audio_total:
        wall = time.time() - wall0
        log(f"rendered {audio_total:.0f}s of audio in {wall:.0f}s on {device} ({audio_total / wall:.2f}x realtime)")
    log("done")


if __name__ == "__main__":
    main()
