// Research projects for the studio: a folder per project under
// automation/studio/projects/<id>/ holding notes.md (clippings with source and
// time), saved PDFs and images, chat.json, and project.json. The shell saves
// into these from any web page; the studio browses, chats over, exports, and
// turns a project into an episode.

import { readFile, writeFile, mkdir, readdir, stat, rm, access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, extname } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const AUTO = join(HERE, "..");
export const PROJECTS = join(HERE, "projects");
export const slugify = (s) => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
const exists = async (p) => { try { await access(p); return true; } catch { return false; } };
const readJson = async (p, fb) => { try { return JSON.parse(await readFile(p, "utf8")); } catch { return fb; } };

export async function listProjects() {
  await mkdir(PROJECTS, { recursive: true });
  const out = [];
  for (const d of await readdir(PROJECTS)) {
    const meta = await readJson(join(PROJECTS, d, "project.json"), null);
    if (!meta) continue;
    const files = (await readdir(join(PROJECTS, d))).filter((f) => !/^(project\.json|chat\.json|notes\.md)$/.test(f));
    let notesBytes = 0; try { notesBytes = (await stat(join(PROJECTS, d, "notes.md"))).size; } catch { /* none */ }
    out.push({ ...meta, files: files.length, notesBytes });
  }
  return out.sort((a, b) => (b.updated || b.created || "").localeCompare(a.updated || a.created || ""));
}
export async function createProject(title) {
  const t = String(title || "").trim(); if (!t) throw new Error("title required");
  let id = slugify(t) || `project-${Date.now()}`;
  if (await exists(join(PROJECTS, id))) id = `${id}-${Date.now().toString(36).slice(-4)}`;
  const dir = join(PROJECTS, id);
  await mkdir(dir, { recursive: true });
  const meta = { id, title: t, created: new Date().toISOString(), updated: new Date().toISOString() };
  await writeFile(join(dir, "project.json"), JSON.stringify(meta, null, 2) + "\n", "utf8");
  await writeFile(join(dir, "notes.md"), `# ${t}\n\nClippings, in the order they were saved. Each carries its source and time.\n`, "utf8");
  return meta;
}
export async function touch(id) {
  const p = join(PROJECTS, id, "project.json"); const meta = await readJson(p, null); if (!meta) return;
  meta.updated = new Date().toISOString(); await writeFile(p, JSON.stringify(meta, null, 2) + "\n", "utf8");
}
export async function getProject(id) {
  const dir = join(PROJECTS, id);
  const meta = await readJson(join(dir, "project.json"), null); if (!meta) return null;
  const names = (await readdir(dir)).filter((f) => !/^(project\.json|chat\.json|notes\.md)$/.test(f));
  const files = [];
  for (const n of names) { const st = await stat(join(dir, n)).catch(() => null); if (st?.isFile()) files.push({ name: n, size: st.size, mtime: st.mtime.toISOString() }); }
  const notes = await readFile(join(dir, "notes.md"), "utf8").catch(() => "");
  const chat = await readJson(join(dir, "chat.json"), []);
  return { ...meta, dir, files: files.sort((a, b) => b.mtime.localeCompare(a.mtime)), notes, chat };
}
export async function appendNote(id, text, source = "") {
  const dir = join(PROJECTS, id); if (!(await exists(dir))) throw new Error("no such project");
  const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
  const block = `\n\n---\n${stamp}${source ? `  ${source}` : ""}\n\n${String(text).trim()}\n`;
  const p = join(dir, "notes.md");
  await writeFile(p, (await readFile(p, "utf8").catch(() => "")) + block, "utf8");
  await touch(id);
}
export async function saveNotes(id, text) {
  const dir = join(PROJECTS, id); if (!(await exists(dir))) throw new Error("no such project");
  await writeFile(join(dir, "notes.md"), String(text), "utf8"); await touch(id);
}

/* ------------------------------------------------------- Gemini over files */
const MIME = { ".pdf": "application/pdf", ".txt": "text/plain", ".md": "text/markdown", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" };
// Builds the multimodal parts for a project: notes as text, PDFs and images inline (under ~18 MB total).
async function projectParts(dir, files, { images = false } = {}) {
  const parts = [];
  const notes = await readFile(join(dir, "notes.md"), "utf8").catch(() => "");
  if (notes.trim()) parts.push({ text: `PROJECT NOTES (clippings with sources):\n${notes}` });
  let budget = 18 * 1024 * 1024; const skipped = [];
  for (const f of files) {
    const ext = extname(f.name).toLowerCase(); const mime = MIME[ext]; if (!mime) continue;
    if (mime.startsWith("image/") && !images) continue;
    if (f.size > budget) { skipped.push(f.name); continue; }
    const buf = await readFile(join(dir, f.name));
    if (mime.startsWith("text/")) parts.push({ text: `FILE ${f.name}:\n${buf.toString("utf8").slice(0, 200000)}` });
    else { parts.push({ text: `FILE ${f.name}:` }); parts.push({ inline_data: { mime_type: mime, data: buf.toString("base64") } }); }
    budget -= f.size;
  }
  return { parts, skipped };
}
async function gemini(model, contents, systemText) {
  const key = process.env.GEMINI_API_KEY; if (!key) throw new Error("GEMINI_API_KEY is not set");
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ system_instruction: { parts: [{ text: systemText }] }, contents, generationConfig: { temperature: 0.4 } }) });
  const j = await r.json();
  if (!r.ok) throw new Error(`Gemini ${r.status}: ${j.error?.message || ""}`.slice(0, 300));
  return (j.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("").trim();
}
export async function chatProject(id, question) {
  const p = await getProject(id); if (!p) throw new Error("no such project");
  const { parts, skipped } = await projectParts(p.dir, p.files, { images: true });
  const history = (p.chat || []).slice(-12);
  const contents = [
    { role: "user", parts: [...parts, { text: "That is everything saved in this research project so far." }] },
    { role: "model", parts: [{ text: "Understood. I have read the notes and files. Ask me anything about them." }] },
    ...history.flatMap((h) => [{ role: "user", parts: [{ text: h.q }] }, { role: "model", parts: [{ text: h.a }] }]),
    { role: "user", parts: [{ text: question }] },
  ];
  const system = `You are the research assistant inside the CrimeTimeSnacks studio, helping Cory (the host) work a true crime case. Answer ONLY from the project's notes and files; when the material does not say, say so plainly. Quote exact lines with their source when useful. Keep the presumption of innocence for anyone not convicted. No emojis. Plain, specific, short.`;
  const a = await gemini(process.env.GEMINI_MODEL || "gemini-3.8-flash", contents, system);
  const entry = { at: new Date().toISOString(), q: question, a, skipped };
  const chat = [...(p.chat || []), entry];
  await writeFile(join(p.dir, "chat.json"), JSON.stringify(chat, null, 2) + "\n", "utf8");
  await touch(id);
  return entry;
}
// One Markdown file with everything readable, for pasting into NotebookLM or anywhere else.
export async function exportProject(id) {
  const p = await getProject(id); if (!p) throw new Error("no such project");
  const pdfs = p.files.filter((f) => /\.pdf$/i.test(f.name));
  let pdfNotes = "";
  if (pdfs.length && process.env.GEMINI_API_KEY) {
    try {
      const { parts } = await projectParts(p.dir, pdfs);
      pdfNotes = await gemini("gemini-3.8-flash", [{ role: "user", parts: [...parts, { text: "For each FILE above, write a faithful, detailed summary of its factual content as plain Markdown under a heading with the file name: who, what, when, where, numbers, quotes with attribution. No commentary, nothing not in the file." }] }], "You extract facts from documents faithfully. No emojis.");
    } catch (e) { pdfNotes = `_PDF summaries unavailable: ${e.message}_`; }
  }
  const md = [`# ${p.title}`, `Exported ${new Date().toISOString().slice(0, 10)} from the CrimeTimeSnacks studio. Files in the project: ${p.files.map((f) => f.name).join(", ") || "none"}.`, "", "## Notes", p.notes.replace(/^# .*\n/, "").trim(), "", pdfNotes ? `## Documents\n\n${pdfNotes}` : "", p.chat?.length ? `## Questions asked\n\n${p.chat.map((c) => `**Q:** ${c.q}\n\n${c.a}`).join("\n\n")}` : ""].filter((s) => s !== "").join("\n\n");
  const out = join(p.dir, `${p.id}-export.md`);
  await writeFile(out, md, "utf8");
  return { file: out, name: `${p.id}-export.md`, chars: md.length };
}
// Research notes for the episode pipeline, written from the project so the
// script writer reads Cory's own material first.
export async function projectToResearch(id) {
  const p = await getProject(id); if (!p) throw new Error("no such project");
  const exp = await exportProject(id);
  const md = await readFile(exp.file, "utf8");
  const caseSlug = slugify(p.title);
  const dir = join(AUTO, "studio", "research", caseSlug);
  await mkdir(dir, { recursive: true });
  const notes = `# Research notes: ${p.title}\nGenerated ${new Date().toISOString().slice(0, 10)} from the studio project "${p.title}" (Cory's own clippings and documents).\n\nRules for the writer: use ONLY facts that appear below. If a detail is not here, leave it out or say it generally.\n\n## Project: ${p.title}\n\n${md}\n`;
  await writeFile(join(dir, "research.md"), notes, "utf8");
  await writeFile(join(dir, "research.json"), JSON.stringify({ case: { slug: caseSlug, title: p.title }, generated: new Date().toISOString(), sources: [{ kind: "project", title: p.title }], fromProject: id }, null, 2) + "\n", "utf8");
  return { caseSlug, title: p.title, chars: notes.length };
}
export async function deleteProject(id) { await rm(join(PROJECTS, id), { recursive: true, force: true }); }
