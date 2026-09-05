#!/usr/bin/env python
"""Voice clone for the podcast studio: Chatterbox TTS (Resemble AI, MIT), CPU.

    .venv/Scripts/python tts_clone.py --ref voice/cory-reference.wav --text-file p.txt --out p.wav
    .venv/Scripts/python tts_clone.py --ref ... --jsonl paragraphs.jsonl --outdir tts/

Reads paragraphs, synthesizes each in the reference voice, writes 24 kHz mono WAVs.
The model (~2 GB) downloads from Hugging Face on first run into the HF cache.
CPU only on this PC (AMD GPU): budget roughly 4 to 8 seconds of compute per
second of audio, so a two minute episode takes 8 to 15 minutes. Fine for the
weekly job; the studio shows progress per paragraph.
"""
import argparse
import json
import sys
import time
from pathlib import Path


def log(msg):
    print(msg, flush=True)


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
    torch.set_num_threads(max(1, torch.get_num_threads()))
    t0 = time.time()
    log("loading chatterbox (first run downloads the model)...")
    model = ChatterboxTTS.from_pretrained(device="cpu")
    log(f"model ready in {time.time() - t0:.0f}s, sample rate {model.sr}")

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
        t1 = time.time()
        wav = model.generate(text, audio_prompt_path=a.ref, exaggeration=a.exaggeration, cfg_weight=a.cfg)
        ta.save(str(out), wav, model.sr)
        secs = wav.shape[-1] / model.sr
        log(f"  {out.name}: {secs:.1f}s audio in {time.time() - t1:.0f}s")
    log("done")


if __name__ == "__main__":
    main()
