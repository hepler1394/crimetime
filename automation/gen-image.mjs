#!/usr/bin/env node
// Image (and video) generation for the studios, on Cory's Gemini key.
//
//   node automation/gen-image.mjs --draft <id> --prompt "..." [--model gemini-3.1-flash-image] [--name art-1] [--ref cover.jpg]
//   node automation/gen-image.mjs --out D:\path\file.png --prompt "..."
//   node automation/gen-image.mjs --draft <id> --video --prompt "..." [--seconds 8]     Veo 3.1 (paid per second; check the bill)
//
// Images: Gemini image models via generateContent (Nano Banana family). The
// result lands in the draft folder as PNG and is listed in the studio's project
// folder. --ref sends an existing image from the folder as a reference (style,
// composition) alongside the prompt.
// Video: Veo 3.1 via predictLongRunning, polled until done, saved as MP4.
// Grok Imagine is NOT here: the SuperGrok quota is only usable on grok.com, so
// the studio shell opens it in a signed-in browser tab and "Save to episode"
// pulls the result into the same folder.

import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, extname } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DRAFTS = join(__dirname, "studio", "drafts");
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i > -1 && args[i + 1] ? args[i + 1] : d; };
const asJson = args.includes("--json");
const out = (o) => console.log(asJson ? JSON.stringify(o) : (o.message || JSON.stringify(o)));
const die = (step, message) => { out({ ok: false, step, message }); process.exit(2); };

const key = process.env.GEMINI_API_KEY;
if (!key) die("key", "GEMINI_API_KEY is not set.");
const prompt = opt("--prompt", "");
if (!prompt) die("args", "--prompt is required");
const draftId = opt("--draft", null);
const video = args.includes("--video");
const name = (opt("--name", "") || `${video ? "clip" : "art"}-${new Date().toISOString().slice(11, 19).replace(/:/g, "")}`).replace(/[^a-zA-Z0-9._-]/g, "-");
let dir = null, outPath = opt("--out", null);
if (draftId) { dir = join(DRAFTS, draftId); try { await stat(join(dir, "episode.json")); } catch { die("draft", `No draft ${draftId}`); } }
if (!outPath && !dir) die("args", "--draft <id> or --out <file>");

const HOUSE = "CrimeTimeSnacks house style: cinematic true-crime documentary still, near-black background, deep red accent light, film grain, restrained, no text, no watermark, no faces of real people, no gore.";
const api = (path, body) => fetch(`https://generativelanguage.googleapis.com/v1beta/${path}?key=${key}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

if (!video) {
  const model = opt("--model", "gemini-3.1-flash-image");
  const parts = [{ text: `${prompt}\n\n${HOUSE}` }];
  const ref = opt("--ref", null);
  if (ref && dir) {
    try { const buf = await readFile(join(dir, ref)); parts.unshift({ inline_data: { mime_type: /\.png$/i.test(ref) ? "image/png" : "image/jpeg", data: buf.toString("base64") } }); parts[1].text = `Use the attached image as the style and composition reference. ${parts[1].text}`; } catch { die("ref", `Reference not found in the folder: ${ref}`); }
  }
  const r = await api(`models/${model}:generateContent`, { contents: [{ parts }], generationConfig: { responseModalities: ["IMAGE", "TEXT"], ...(opt("--aspect", null) ? { imageConfig: { aspectRatio: opt("--aspect", null) } } : {}) } });
  const j = await r.json();
  if (!r.ok) die("gemini", `${r.status} ${j.error?.message || ""}`.slice(0, 300));
  const img = (j.candidates?.[0]?.content?.parts || []).find((p) => p.inlineData || p.inline_data);
  if (!img) die("gemini", `No image in the reply${j.candidates?.[0]?.finishReason ? ` (${j.candidates[0].finishReason})` : ""}. ${(j.candidates?.[0]?.content?.parts || []).map((p) => p.text).filter(Boolean).join(" ").slice(0, 200)}`);
  const data = (img.inlineData || img.inline_data).data; const mime = (img.inlineData || img.inline_data).mimeType || (img.inlineData || img.inline_data).mime_type || "image/png";
  const ext = mime.includes("jpeg") ? ".jpg" : ".png";
  const file = outPath || join(dir, `${name}${ext}`);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, Buffer.from(data, "base64"));
  out({ ok: true, file, model, bytes: Buffer.byteLength(data, "base64"), message: `Image saved: ${file} (${model})` });
} else {
  const model = opt("--model", "veo-3.1-fast-generate-preview");
  const seconds = Math.max(4, Math.min(8, parseInt(opt("--seconds", "8"), 10) || 8));
  const r = await api(`models/${model}:predictLongRunning`, { instances: [{ prompt: `${prompt}\n\n${HOUSE} Slow camera movement, moody, documentary.` }], parameters: { aspectRatio: opt("--aspect", "9:16"), durationSeconds: seconds, personGeneration: "dont_allow" } });
  const j = await r.json();
  if (!r.ok) die("veo", `${r.status} ${j.error?.message || ""}`.slice(0, 300));
  let op = j;
  const t0 = Date.now();
  while (!op.done) {
    if (Date.now() - t0 > 10 * 60 * 1000) die("veo", "Timed out after 10 minutes.");
    await new Promise((res) => setTimeout(res, 8000));
    const pr = await fetch(`https://generativelanguage.googleapis.com/v1beta/${op.name}?key=${key}`);
    op = await pr.json();
    if (!asJson) process.stdout.write(".");
  }
  if (op.error) die("veo", op.error.message || "generation failed");
  const vid = op.response?.generateVideoResponse?.generatedSamples?.[0]?.video || op.response?.generatedVideos?.[0]?.video;
  const uri = vid?.uri; const b64 = vid?.bytesBase64Encoded || vid?.encodedVideo;
  const file = outPath || join(dir, `${name}.mp4`);
  await mkdir(dirname(file), { recursive: true });
  if (b64) await writeFile(file, Buffer.from(b64, "base64"));
  else if (uri) { const vr = await fetch(`${uri}${uri.includes("?") ? "&" : "?"}key=${key}`); if (!vr.ok) die("veo", `download ${vr.status}`); await writeFile(file, Buffer.from(await vr.arrayBuffer())); }
  else die("veo", "Finished but no video was returned.");
  out({ ok: true, file, model, seconds, message: `Video saved: ${file} (${model}, ${seconds}s)` });
}
