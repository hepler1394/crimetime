// Web-sized copies of cover art. The show covers are 3000x3000 and up to 2.5 MB; the pages
// show them at 150 to 440 CSS pixels. Measured on an emulated phone on 2026-09-18, the
// homepage was 4.8 MB and episodes.html 5.2 MB, nearly all of it covers. The originals stay
// where they are for the feed, Open Graph and the podcast apps, which want the big one.
//
//   const small = await thumb("/images/episodes/x.jpg", 640);   // "/images/thumbs/x-640.jpg"
//
// Made once with ffmpeg and remade only when the source is newer. No ffmpeg, a missing
// source, or a source already smaller than asked: the original path comes back, so a build
// never loses a picture over this.

import { mkdir, stat } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "images", "thumbs");
const mtime = (p) => stat(p).then((s) => s.mtimeMs, () => 0);

export async function thumb(webPath, size = 640) {
  if (!webPath || /^https?:/.test(webPath)) return webPath || "";
  const rel = webPath.replace(/^\//, "");
  const src = join(ROOT, rel);
  const srcTime = await mtime(src);
  if (!srcTime) return webPath;
  const probe = spawnSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width", "-of", "csv=p=0", src], { encoding: "utf8", windowsHide: true });
  const width = parseInt(probe.stdout, 10);
  if (!width || width <= size * 1.15) return webPath;
  const name = `${rel.split("/").pop().replace(/\.[^.]+$/, "")}-${size}.jpg`;
  const out = join(OUT, name);
  if ((await mtime(out)) < srcTime) {
    await mkdir(OUT, { recursive: true });
    const r = spawnSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", src, "-vf", `scale=${size}:-2:flags=lanczos`, "-q:v", "4", out], { windowsHide: true });
    if (r.status !== 0) { console.warn(`thumbs: could not size ${webPath}, using the original`); return webPath; }
  }
  return `/images/thumbs/${name}`;
}
