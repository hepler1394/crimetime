// CrimeTimeSnacks Studio Shell: one desktop window that holds the studio and a
// real browser. Two workspaces (Studio, Instagram), each with its own tab strip
// of Chromium views on a persistent profile (Instagram, grok.com and the rest
// stay signed in between launches). Downloads and right-click "Save to episode"
// land files in the current episode's folder. A Generate panel renders Gemini
// images/video into that folder. Post opens Instagram's create flow with the
// file already attached and the caption on the clipboard. No framework.
//
//   cd studio-shell && npm start
//
// The studio server (automation/studio/server.mjs) is started by the shell if
// nothing answers on 127.0.0.1:4177, and stopped when the shell closes.

const { app, BaseWindow, WebContentsView, session, ipcMain, Menu, shell: osShell, clipboard, protocol, net } = require("electron");
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const http = require("http");

const REPO = path.resolve(__dirname, "..");
const STUDIO_URL = "http://127.0.0.1:4177";
const IG_STUDIO = "D:/Dev/GitHub/ig-studio";
const PROFILE = path.join(__dirname, "profile");
const DOWNLOADS = path.join(__dirname, "downloads");
const BASE_CHROME_H = 92;
let CHROME_H = BASE_CHROME_H; // grows when the Generate panel opens, which lives in the chrome view
const BROWSER_SESSION = "persist:cts-browser";
const STUDIO_SESSION = "persist:cts-studio";
fs.mkdirSync(DOWNLOADS, { recursive: true });
app.setPath("userData", PROFILE);
// Custom schemes: cts-shell (commands + file lists), cts-file (local media). Both take a ?p= query, never a path.
protocol.registerSchemesAsPrivileged([
  { scheme: "cts-shell", privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } },
  { scheme: "cts-file", privileges: { standard: true, secure: true, stream: true, supportFetchAPI: true, corsEnabled: true } },
]);

let win, chromeView, studioView, igView, studioProc = null;
const tabs = new Map(); // id -> { view, title, url, loading, ws }
let tabSeq = 0, activeTab = null, workspace = "crimetime", targetDraft = null;
const activeByWs = { crimetime: null, instagram: null };
const allowedRoot = (p) => { const n = p.replace(/\\/g, "/"); return n.startsWith(IG_STUDIO) || n.startsWith(REPO.replace(/\\/g, "/")); };

/* ---------------------------------------------------------- studio server */
function studioUp() { return new Promise((res) => { const r = http.get(`${STUDIO_URL}/api/drafts`, { timeout: 1500 }, (x) => { x.resume(); res(x.statusCode === 200); }); r.on("error", () => res(false)); r.on("timeout", () => { r.destroy(); res(false); }); }); }
async function ensureStudio() {
  if (await studioUp()) return true;
  studioProc = spawn("node", [path.join(REPO, "automation", "studio", "server.mjs")], { cwd: REPO, windowsHide: true, stdio: "ignore" });
  for (let i = 0; i < 40; i++) { await new Promise((r) => setTimeout(r, 300)); if (await studioUp()) return true; }
  return false;
}
function studioApi(method, p, body, raw) {
  return new Promise((resolve, reject) => {
    const req = http.request(new URL(p, STUDIO_URL), { method, headers: { "X-CTS": "1", ...(raw ? { "Content-Type": "application/octet-stream", "Content-Length": raw.length } : { "Content-Type": "application/json" }) } }, (res) => { let s = ""; res.on("data", (c) => (s += c)); res.on("end", () => { try { resolve(JSON.parse(s)); } catch { resolve(s); } }); });
    req.on("error", reject);
    if (raw) req.end(raw); else req.end(body ? JSON.stringify(body) : undefined);
  });
}

/* ------------------------------------------------------------- layout */
function layout() {
  if (!win) return;
  const b = win.getContentBounds();
  chromeView.setBounds({ x: 0, y: 0, width: b.width, height: CHROME_H });
  const cb = { x: 0, y: CHROME_H, width: b.width, height: Math.max(0, b.height - CHROME_H) };
  const none = { x: 0, y: 0, width: 0, height: 0 };
  studioView.setBounds(!activeTab && workspace === "crimetime" ? cb : none);
  igView.setBounds(!activeTab && workspace === "instagram" ? cb : none);
  for (const [id, t] of tabs) t.view.setBounds(id === activeTab ? cb : none);
}
function pushTabs() {
  chromeView.webContents.send("tabs", {
    active: activeTab, workspace, target: targetDraft,
    tabs: [...tabs.entries()].filter(([, t]) => t.ws === workspace).map(([id, t]) => {
      const wc = t.view.webContents, nh = wc.navigationHistory;
      return { id, title: t.title, url: t.url, loading: t.loading, canBack: nh?.canGoBack?.() ?? wc.canGoBack(), canFwd: nh?.canGoForward?.() ?? wc.canGoForward() };
    }),
  });
}
const toast = (msg, bad = false) => chromeView?.webContents.send("toast", { msg, bad });
const goBack = (wc) => (wc.navigationHistory?.goBack ? wc.navigationHistory.goBack() : wc.goBack());
const goFwd = (wc) => (wc.navigationHistory?.goForward ? wc.navigationHistory.goForward() : wc.goForward());

/* --------------------------------------------------------------- tabs */
function newTab(url = "https://www.instagram.com/", activate = true, ws = workspace) {
  const id = `t${++tabSeq}`;
  const view = new WebContentsView({ webPreferences: { partition: BROWSER_SESSION, contextIsolation: true, sandbox: true, nodeIntegration: false } });
  const wc = view.webContents;
  const t = { view, title: "New tab", url, loading: true, ws };
  tabs.set(id, t);
  win.contentView.addChildView(view);
  wc.on("page-title-updated", (_e, title) => { t.title = title; pushTabs(); });
  wc.on("did-start-loading", () => { t.loading = true; pushTabs(); });
  wc.on("did-stop-loading", () => { t.loading = false; t.url = wc.getURL(); pushTabs(); });
  wc.on("did-navigate", (_e, u) => { t.url = u; pushTabs(); });
  wc.on("did-navigate-in-page", (_e, u) => { t.url = u; pushTabs(); });
  wc.setWindowOpenHandler(({ url: u }) => { if (/^https?:/.test(u)) newTab(u, true, t.ws); return { action: "deny" }; });
  wc.on("will-navigate", (e, u) => { if (!/^https?:/.test(u)) e.preventDefault(); });
  wc.on("context-menu", async (_e, params) => {
    const items = [];
    // Research projects: save this page as a PDF, or the selection, into any project.
    let projects = []; try { projects = await studioApi("GET", "/api/projects"); if (!Array.isArray(projects)) projects = []; } catch { projects = []; }
    const projMenu = (label, act) => ({ label, submenu: [...projects.slice(0, 15).map((pr) => ({ label: pr.title, click: () => act(pr.id) })), { type: "separator" }, { label: "New project from this page", click: async () => { try { const pr = await studioApi("POST", "/api/projects", { title: (wc.getTitle() || "Untitled").slice(0, 60) }); if (pr?.id) act(pr.id); else toast(pr?.error || "could not create project", true); } catch (e) { toast(e.message, true); } } }] });
    items.push(projMenu("Save page as PDF to project", (pid) => savePagePdfToProject(wc, pid)));
    if (params.selectionText) items.push(projMenu("Save selection to project", (pid) => saveSelectionToProject(wc, pid, params.selectionText)));
    if (params.srcURL && params.mediaType === "image") items.push(projMenu("Save image to project", (pid) => saveUrlToProject(params.srcURL, wc, pid)));
    items.push({ type: "separator" });
    if (params.srcURL && params.mediaType === "image") items.push({ label: "Save image to episode", click: () => saveUrlToEpisode(params.srcURL, wc) }, { label: "Copy image address", click: () => clipboard.writeText(params.srcURL) });
    if (params.srcURL && params.mediaType === "video") items.push({ label: "Save video to episode", click: () => saveUrlToEpisode(params.srcURL, wc) });
    if (params.linkURL) items.push({ label: "Open link in new tab", click: () => newTab(params.linkURL, true, t.ws) }, { label: "Copy link", click: () => clipboard.writeText(params.linkURL) });
    if (params.selectionText) items.push({ label: "Copy", role: "copy" }, { label: "Save selection to episode notes", click: () => saveNoteToEpisode(params.selectionText, wc.getURL()) });
    items.push({ type: "separator" }, { label: "Back", enabled: wc.navigationHistory?.canGoBack?.() ?? wc.canGoBack(), click: () => goBack(wc) }, { label: "Reload", click: () => wc.reload() }, { label: "Open in system browser", click: () => osShell.openExternal(wc.getURL()) });
    Menu.buildFromTemplate(items).popup({ window: win });
  });
  wc.loadURL(url);
  if (activate) { workspace = ws; activeTab = id; activeByWs[ws] = id; }
  layout(); pushTabs();
  return { id, wc };
}
function closeTab(id) {
  const t = tabs.get(id); if (!t) return;
  win.contentView.removeChildView(t.view); t.view.webContents.close(); tabs.delete(id);
  if (activeTab === id) { activeTab = [...tabs.entries()].filter(([, x]) => x.ws === t.ws).map(([k]) => k).pop() || null; activeByWs[t.ws] = activeTab; }
  layout(); pushTabs();
}
const active = () => (activeTab ? tabs.get(activeTab) : null);

/* ------------------------------------------------------------ saving */
async function requireTarget() {
  if (targetDraft) return targetDraft;
  const list = await studioApi("GET", "/api/drafts").catch(() => []);
  if (Array.isArray(list) && list.length) { targetDraft = list[0].id; pushTabs(); return targetDraft; }
  toast("No episode to save into. Start one in the studio first.", true); return null;
}
async function saveUrlToEpisode(url, wc) {
  const id = await requireTarget(); if (!id) return;
  try {
    const cookies = (await wc.session.cookies.get({ url })).map((c) => `${c.name}=${c.value}`).join("; ");
    const res = await fetch(url, { headers: { Cookie: cookies, "User-Agent": wc.getUserAgent(), Referer: wc.getURL() } });
    if (!res.ok) throw new Error(`download ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    const type = res.headers.get("content-type") || "";
    const ext = type.includes("png") ? ".png" : type.includes("gif") ? ".gif" : type.includes("webp") ? ".webp" : type.includes("mp4") ? ".mp4" : type.includes("webm") ? ".webm" : ".jpg";
    const name = `saved-${new Date().toISOString().slice(11, 19).replace(/:/g, "")}${ext}`;
    const r = await studioApi("POST", `/api/draft/${id}/upload?name=${encodeURIComponent(name)}`, null, buf);
    if (r?.ok) toast(`Saved ${name} to ${id}`); else throw new Error(r?.error || "upload failed");
  } catch (e) { toast(`Save failed: ${e.message}`, true); }
}
async function saveNoteToEpisode(text, from) {
  const id = await requireTarget(); if (!id) return;
  const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
  let existing = "";
  try { const r = await fetch(`${STUDIO_URL}/api/draft/${id}/file?name=notes.md`); if (r.ok) existing = await r.text(); } catch { /* none */ }
  const r = await studioApi("POST", `/api/draft/${id}/upload?name=notes.md`, null, Buffer.from(`${existing}\n\n---\n${stamp}  ${from}\n\n${text.trim()}\n`, "utf8"));
  if (r?.ok) toast(`Selection saved to notes.md in ${id}`); else toast(r?.error || "note save failed", true);
}

/* ------------------------------------------------------- projects */
const slug = (t) => String(t).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "page";
async function savePagePdfToProject(wc, pid) {
  try {
    const pdf = await wc.printToPDF({ printBackground: true, pageSize: "A4", margins: { marginType: "default" } });
    const name = `${slug(wc.getTitle())}-${new Date().toISOString().slice(0, 10)}.pdf`;
    const r = await studioApi("POST", `/api/project/${pid}/upload?name=${encodeURIComponent(name)}`, null, pdf);
    if (!r?.ok) throw new Error(r?.error || "upload failed");
    await studioApi("POST", `/api/project/${pid}/note`, { text: `Saved page as PDF: ${name}
${wc.getTitle()}`, source: wc.getURL() });
    toast(`Saved ${name} to project ${pid}`);
  } catch (e) { toast(`PDF save failed: ${e.message}`, true); }
}
async function saveSelectionToProject(wc, pid, text) {
  try { const r = await studioApi("POST", `/api/project/${pid}/note`, { text, source: `${wc.getTitle()} | ${wc.getURL()}` }); if (!r?.ok) throw new Error(r?.error || "note failed"); toast(`Clipping saved to project ${pid}`); }
  catch (e) { toast(`Clipping failed: ${e.message}`, true); }
}
async function saveUrlToProject(url, wc, pid) {
  try {
    const cookies = (await wc.session.cookies.get({ url })).map((c) => `${c.name}=${c.value}`).join("; ");
    const res = await fetch(url, { headers: { Cookie: cookies, "User-Agent": wc.getUserAgent(), Referer: wc.getURL() } });
    if (!res.ok) throw new Error(`download ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer()); const type = res.headers.get("content-type") || "";
    const ext = type.includes("png") ? ".png" : type.includes("webp") ? ".webp" : type.includes("gif") ? ".gif" : ".jpg";
    const name = `image-${new Date().toISOString().slice(11, 19).replace(/:/g, "")}${ext}`;
    const r = await studioApi("POST", `/api/project/${pid}/upload?name=${encodeURIComponent(name)}`, null, buf);
    if (!r?.ok) throw new Error(r?.error || "upload failed");
    await studioApi("POST", `/api/project/${pid}/note`, { text: `Saved image: ${name}`, source: wc.getURL() });
    toast(`Saved ${name} to project ${pid}`);
  } catch (e) { toast(`Save failed: ${e.message}`, true); }
}

/* --------------------------------------------------------------- post */
// Opens Instagram's create flow in the Instagram workspace with the file already
// chosen: Chromium's file-chooser dialog is intercepted (CDP) and answered with
// the path, so the first "Select from computer" click lands on your file. The
// caption goes to the clipboard. You set the crop (9:16 for reels) and Share.
// `file` may be one path or several joined with "|" (a carousel: slides in order).
async function postToInstagram(file, captionFile) {
  const files = String(file || "").split("|").map((f) => f.trim()).filter(Boolean);
  if (!files.length || files.some((f) => !fs.existsSync(f) || !allowedRoot(f))) return toast("Post: file not found.", true);
  file = files[0];
  let caption = "";
  if (captionFile && fs.existsSync(captionFile) && allowedRoot(captionFile)) caption = fs.readFileSync(captionFile, "utf8").trim();
  if (caption) clipboard.writeText(caption);
  const { wc } = newTab("https://www.instagram.com/create/select/", true, "instagram");
  try {
    wc.debugger.attach("1.3");
    await wc.debugger.sendCommand("Page.enable");
    await wc.debugger.sendCommand("Page.setInterceptFileChooserDialog", { enabled: true });
    let done = false;
    wc.debugger.on("message", async (_e, method, params) => {
      if (method === "Page.fileChooserOpened" && !done) {
        done = true;
        try { await wc.debugger.sendCommand("DOM.setFileInputFiles", { files, backendNodeId: params.backendNodeId }); toast(`Attached ${files.length > 1 ? `${files.length} slides` : path.basename(file)}${caption ? ". Caption is on your clipboard." : ""} Set the crop, then Share.`); }
        catch (e) { toast(`Could not attach the file: ${e.message}`, true); }
        try { await wc.debugger.sendCommand("Page.setInterceptFileChooserDialog", { enabled: false }); } catch { /* fine */ }
      }
    });
    toast(`Instagram opening. Click "Select from computer" and ${files.length > 1 ? `${files.length} slides are` : `${path.basename(file)} is`} attached for you.${caption ? " Caption copied." : ""}`);
  } catch (e) { toast(`Post: ${e.message}. Drag the file in by hand.`, true); osShell.showItemInFolder(file); }
}

/* ------------------------------------------------------ custom schemes */
function igFiles() {
  const dir = path.join(IG_STUDIO, "out");
  try {
    return fs.readdirSync(dir).filter((f) => /\.(jpg|jpeg|png|mp4)$/i.test(f)).map((f) => {
      const st = fs.statSync(path.join(dir, f)); const base = f.replace(/\.(jpg|jpeg|png|mp4)$/i, "");
      const cap = ["", "-caption", ".caption"].map((s) => path.join(dir, `${base}${s}.txt`)).find((p) => fs.existsSync(p)) || "";
      return { name: f, path: path.join(dir, f), caption: cap, size: st.size, mtime: st.mtimeMs };
    }).sort((x, y) => y.mtime - x.mtime);
  } catch { return []; }
}
// Only pages we ship may drive the shell: the Instagram workspace (file://) and
// the studio (127.0.0.1:4177). A web site open in a tab gets 403, so a hostile
// page cannot trigger Post, open folders, or read local files.
// Only the pages this app ships may drive it. An opaque-origin document (a sandboxed
// iframe or a data: URL inside a web tab) sends Origin "null", so "null" is not us.
function ownPage(req) {
  const from = req.headers.get("origin") || req.headers.get("referer") || "";
  return from.startsWith(STUDIO_URL) || from.startsWith("file://" + __dirname.replace(/\\/g, "/")) || from.startsWith("cts-shell://") || from.startsWith("cts-file://");
}
const MEDIA_ROOTS = [path.join(IG_STUDIO, "out"), path.join(REPO, "automation", "studio", "drafts"), path.join(REPO, "automation", "studio", "projects"), path.join(REPO, "automation", "studio", "posts")].map((r) => r.replace(/\\/g, "/").toLowerCase());
const servable = (p) => { const n = p.replace(/\\/g, "/").toLowerCase(); return MEDIA_ROOTS.some((r) => n.startsWith(r + "/")) && !n.split("/").some((seg) => seg.startsWith(".")) && /\.(jpe?g|png|gif|webp|mp4|webm|mp3|wav|m4a|pdf|txt|md)$/.test(n); };
function shellRoute(req) {
  if (!ownPage(req)) return new Response("forbidden", { status: 403 });
  const u = new URL(req.url); const q = (k) => u.searchParams.get(k) || "";
  const json = (o) => new Response(JSON.stringify(o), { headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
  switch (u.hostname) {
    case "ig-files": return json(igFiles());
    case "reveal": { const p = q("p"); if (p && allowedRoot(p)) osShell.showItemInFolder(p); return json({ ok: true }); }
    case "post": { postToInstagram(q("p"), q("c")); return json({ ok: true }); }
    case "open": { const p = q("p"); if (p && allowedRoot(p) && fs.existsSync(p) && fs.statSync(p).isDirectory()) osShell.openPath(p); return json({ ok: true }); }
    case "tab": { const url = q("url"); if (/^https?:\/\//.test(url)) newTab(url, true, q("ws") || workspace); return json({ ok: true }); }
    case "ping": return json({ ok: true, shell: true });
    default: return new Response("not found", { status: 404 });
  }
}
function fileRoute(req) {
  if (!ownPage(req)) return new Response("forbidden", { status: 403 });
  const p = new URL(req.url).searchParams.get("p") || "";
  if (!p || !servable(p)) return new Response("forbidden", { status: 403 });
  return net.fetch(`file:///${p.replace(/\\/g, "/")}`);
}

/* ------------------------------------------------------------ window */
function createWindow() {
  win = new BaseWindow({ width: 1680, height: 980, minWidth: 1100, minHeight: 640, backgroundColor: "#050505", title: "CrimeTime Studio", autoHideMenuBar: true });
  chromeView = new WebContentsView({ webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, sandbox: false } });
  studioView = new WebContentsView({ webPreferences: { partition: STUDIO_SESSION, contextIsolation: true, sandbox: true } });
  igView = new WebContentsView({ webPreferences: { partition: BROWSER_SESSION, contextIsolation: true, sandbox: true } });
  win.contentView.addChildView(studioView); win.contentView.addChildView(igView); win.contentView.addChildView(chromeView);
  chromeView.webContents.loadFile(path.join(__dirname, "chrome.html"));
  studioView.webContents.loadURL(STUDIO_URL);
  igView.webContents.loadURL(`${STUDIO_URL}/instagram`); // served by the studio server, same origin as the studio API
  igView.webContents.setWindowOpenHandler(({ url }) => { newTab(url, true, "instagram"); return { action: "deny" }; });
  studioView.webContents.setWindowOpenHandler(({ url }) => { if (url.startsWith(STUDIO_URL)) return { action: "allow" }; newTab(url, true, "crimetime"); return { action: "deny" }; });
  win.on("resize", layout); win.on("maximize", layout); win.on("unmaximize", layout);
  layout();

  for (const part of [BROWSER_SESSION, STUDIO_SESSION]) {
    const ses = session.fromPartition(part);
    ses.protocol.handle("cts-shell", shellRoute);
    ses.protocol.handle("cts-file", fileRoute);
  }
  const ses = session.fromPartition(BROWSER_SESSION);
  // Only research material is filed into an episode. Anything else stays on disk in
  // studio-shell/downloads (gitignored) and is never handed to the studio server.
  const FILEABLE = /\.(jpe?g|png|gif|webp|mp4|webm|mp3|wav|m4a|ogg|pdf|txt|md)$/i;
  const safeName = (n) => n.replace(/[^A-Za-z0-9._ -]/g, "-").replace(/^[.\- ]+/, "").slice(0, 120) || "download";
  ses.on("will-download", (_e, item) => {
    const name = safeName(item.getFilename());
    const file = path.join(DOWNLOADS, name);
    item.setSavePath(file);
    item.once("done", async (_ev, state) => {
      if (state !== "completed") return toast(`Download ${state}: ${name}`, true);
      if (!FILEABLE.test(name)) return toast(`Saved ${name} to studio-shell/downloads. Only images, audio, video, PDF and text go into an episode.`);
      const id = targetDraft || (await studioApi("GET", "/api/drafts").catch(() => []))[0]?.id;
      if (!id) return toast(`Saved ${name} to studio-shell/downloads; no episode is open.`);
      const r = await studioApi("POST", `/api/draft/${id}/upload?name=${encodeURIComponent(name)}`, null, fs.readFileSync(file)).catch((e) => ({ error: e.message }));
      if (r?.ok) { fs.unlink(file, () => {}); toast(`Saved ${name} into ${id}`); }
      else toast(`Kept in studio-shell/downloads (${r?.error || "the studio would not take it"})`);
    });
  });
  // Any site Cory opens in a tab used to be handed the camera, the microphone, the
  // clipboard and notifications without being asked. Grant only what posting needs, and
  // only to Instagram: fullscreen for video, and writing (never reading) the clipboard.
  const permissionFor = (origin, permission) => {
    let host = ""; try { host = new URL(origin).hostname; } catch { return false; }
    const instagram = /(^|\.)instagram\.com$/.test(host);
    if (permission === "fullscreen") return true;
    if (permission === "clipboard-sanitized-write") return instagram;
    return false;
  };
  ses.setPermissionRequestHandler((wc, permission, cb, details) => cb(permissionFor(details?.requestingUrl || wc?.getURL() || "", permission)));
  ses.setPermissionCheckHandler((_wc, permission, origin) => permissionFor(origin || "", permission));
  // Nothing in a web tab has any business asking for a USB stick or a serial port.
  ses.setDevicePermissionHandler(() => false);
}

/* --------------------------------------------------------------- ipc */
ipcMain.handle("shell", async (_e, { cmd, ...a }) => {
  const t = active();
  switch (cmd) {
    case "chromeHeight": CHROME_H = Math.max(BASE_CHROME_H, Math.min(600, Math.round(a.h || BASE_CHROME_H))); layout(); break;
    case "newTab": newTab(a.url || "https://www.instagram.com/", true); break;
    case "closeTab": closeTab(a.id); break;
    case "activate": activeTab = a.id || null; activeByWs[workspace] = activeTab; layout(); pushTabs(); break;
    case "home": activeTab = null; activeByWs[workspace] = null; layout(); pushTabs(); break;
    case "workspace": workspace = a.name; activeTab = activeByWs[workspace] && tabs.has(activeByWs[workspace]) ? activeByWs[workspace] : null; layout(); pushTabs(); break;
    case "navigate": { let u = String(a.url || "").trim(); if (!u) break; if (!/^[a-z]+:\/\//i.test(u)) u = /\s/.test(u) || !u.includes(".") ? `https://duckduckgo.com/?q=${encodeURIComponent(u)}` : `https://${u}`; if (t) t.view.webContents.loadURL(u); else newTab(u, true); break; }
    case "back": if (t) goBack(t.view.webContents); break;
    case "forward": if (t) goFwd(t.view.webContents); break;
    case "reload": if (t) t.view.webContents.reload(); else if (workspace === "crimetime") studioView.webContents.reload(); else igView.webContents.reload(); break;
    case "drafts": return studioApi("GET", "/api/drafts").catch(() => []);
    case "setTarget": targetDraft = a.id || null; pushTabs(); break;
    case "generate": { const id = a.draft || (await requireTarget()); if (!id) return { ok: false, error: "no episode selected" }; return studioApi("POST", "/api/run", { action: "generate", id, prompt: a.prompt, kind: a.kind, model: a.model, ref: a.ref, seconds: a.seconds }); }
    case "job": return studioApi("GET", `/api/job/${a.id}`);
    case "post": postToInstagram(a.file, a.caption); break;
    case "external": osShell.openExternal(a.url); break;
  }
  return { ok: true };
});

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  const up = await ensureStudio();
  createWindow();
  if (!up) toast("Could not start the studio server on port 4177.", true);
  pushTabs();
});
app.on("window-all-closed", () => { if (studioProc) { try { studioProc.kill(); } catch { /* gone */ } } app.quit(); });
