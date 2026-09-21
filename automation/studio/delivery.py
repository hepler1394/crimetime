#!/usr/bin/env python3
"""Per-paragraph delivery measurements for the audio gate.

    python delivery.py <voice.wav> <spans.json> <out.json>

spans.json is [[start, end], ...] in seconds, one per script paragraph (audio-paragraphs.mjs
writes it). For each paragraph this reports the things episode-audit.mjs cannot get from a word
list: how fast it is spoken, how much the pitch moves, how loud it is, and the level right at
each end so a splice seam can be checked.

Pitch is reported in semitones around the speaker's own median, not in hertz, because a flat
read is flat relative to how this voice normally moves. Frames too quiet to be speech are left
out, so a paragraph's pauses do not read as monotone.
"""
import json
import sys

import numpy as np


def main():
    if len(sys.argv) < 4:
        sys.exit("usage: delivery.py <voice.wav> <spans.json> <out.json>")
    import librosa

    wav, spans_path, out_path = sys.argv[1], sys.argv[2], sys.argv[3]
    spans = json.load(open(spans_path, encoding="utf-8"))

    sr = 16000
    y, _ = librosa.load(wav, sr=sr, mono=True)
    hop = 512
    frame = 2048
    rms = librosa.feature.rms(y=y, frame_length=frame, hop_length=hop)[0]
    rms_db = 20.0 * np.log10(np.maximum(rms, 1e-9))
    # Speech frames only: well above the noise floor of the dry voice track.
    floor = np.percentile(rms_db, 90) - 30.0
    voiced_mask = rms_db > floor

    f0 = librosa.yin(y, fmin=60, fmax=320, sr=sr, frame_length=frame, hop_length=hop)
    f0 = np.asarray(f0, dtype=float)
    n = min(len(rms_db), len(f0))
    f0, rms_db, voiced_mask = f0[:n], rms_db[:n], voiced_mask[:n]
    good = voiced_mask & np.isfinite(f0) & (f0 > 60) & (f0 < 320)
    median_f0 = float(np.median(f0[good])) if good.any() else 0.0

    def frames(a, b):
        i0 = max(0, int(a * sr / hop))
        i1 = min(n, int(b * sr / hop))
        return i0, i1

    def band_db(a, b):
        i0, i1 = frames(a, b)
        seg = rms_db[i0:i1]
        seg = seg[seg > floor]
        return round(float(np.mean(seg)), 2) if seg.size else None

    out = []
    for i, (a, b) in enumerate(spans):
        i0, i1 = frames(a, b)
        seg_f0 = f0[i0:i1]
        seg_good = good[i0:i1]
        seg_db = rms_db[i0:i1]
        speech = seg_db > floor
        rec = {
            "i": i,
            "seconds": round(float(b - a), 3),
            "voiced": round(float(seg_good.mean()), 3) if seg_good.size else 0.0,
            "speech": round(float(speech.mean()), 3) if speech.size else 0.0,
            "rmsDb": round(float(np.mean(seg_db[speech])), 2) if speech.any() else None,
            "f0Median": None,
            "f0SemitoneSd": None,
            "headDb": band_db(a, min(b, a + 0.6)),
            "tailDb": band_db(max(a, b - 0.6), b),
        }
        vals = seg_f0[seg_good]
        if vals.size > 8 and median_f0 > 0:
            semis = 12.0 * np.log2(np.maximum(vals, 1e-6) / median_f0)
            semis = semis[np.abs(semis) < 18]
            if semis.size > 8:
                rec["f0Median"] = round(float(np.median(vals)), 1)
                rec["f0SemitoneSd"] = round(float(np.std(semis)), 3)
        # Pauses inside the paragraph: runs of non-speech frames long enough to hear.
        pauses = []
        run = 0
        for k in range(len(speech)):
            if not speech[k]:
                run += 1
            else:
                if run * hop / sr >= 0.18:
                    pauses.append(round(run * hop / sr, 3))
                run = 0
        rec["pauses"] = pauses
        out.append(rec)

    json.dump({"sr": sr, "hop": hop, "floorDb": round(float(floor), 2), "f0Median": round(median_f0, 1),
               "paragraphs": out}, open(out_path, "w", encoding="utf-8"))
    print(f"{len(out)} paragraphs, median f0 {median_f0:.0f} Hz", flush=True)


if __name__ == "__main__":
    main()
