// CrimeTimeSnacks Studio Shell: one desktop window that holds the studio and a
// real browser side by side. Two workspaces (CrimeTime, Instagram), a tab strip
// of Chromium views on a persistent profile (Instagram, grok.com and the rest
// stay signed in between launches), downloads and right-click "Save to episode"
// that land files straight in the current episode's folder, and a Generate
// panel for Gemini image/video into that same folder. No framework.
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
const CHROME_H = 92;
fs.mkdirSync(DOWNLOADS, { recursive: true });
app.setPath("userData", PROFILE);
// Custom schemes used by the Instagram workspace page (file listing + local media).
protocol.registerSchemesAsPrivileged([
  { scheme: "cts-shell", privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } },
  { scheme: "cts-file", privileges: { standard: true, secure: true, stream: true, supportFetchAPI: true } },
]);
app.commandLine.appendSwitch("disable-features", "OutOfBlinkCors");

let win, chromeView, studioView, igView;
let studioProc = null;
const tabs = new Map(); // id -> { view, title, url, loading }
let tabSeq = 0, activeTab = null, workspace = "crimetime", targetDraft = null;
const BROWSER_SESSION = "persist:cts-browser";

/* ---------------------------------------------------------- studio server */
function studioUp() { return new Promise((res) => { const r = http.get(`${STUDIO_URL}/api/drafts`, { timeout: 1500 }, (x) => { x.resume(); res(x.statusCode === 200); }); r.on("error", () => res(false)); r.on("timeout", () => { r.destroy(); res(false); }); }); }
async function ensureStudio() {
  if (await studioUp()) return true;
  studioProc = spawn(process.execPath.includes("electron") ? "node" : "node", [path.join(REPO, "automation", "studio", "server.mjs")], { cwd: REPO, windowsHide: true, stdio: "ignore", env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined } });
  for (let i = 0; i < 40; i++) { await new Promise((r) => setTimeout(r, 300)); if (await studioUp()) return true; }
  return false;
}
function studioApi(method, p, body, raw) {
  return new Promise((resolve, reject) => {
    const u = new URL(p, STUDIO_URL);
    const req = http.request(u, { method, headers: raw ? { "Content-Type": "application/octet-stream", "Content-Length": raw.length } : { "Content-Type": "application/json" } }, (res) => { let s = ""; res.on("data", (c) => (s += c)); res.on("end", () => { try { resolve(JSON.parse(s)); } catch { resolve(s); } }); });
    req.on("error", reject);
    if (raw) req.end(raw); else req.end(body ? JSON.stringify(body) : undefined);
  });
}

/* ------------------------------------------------------------- layout */
function contentBounds() { const b = win.getContentBounds(); return { x: 0, y: CHROME_H, width: b.width, height: Math.max(0, b.height - CHROME_H) }; }
function layout() {
  if (!win) return;
  const b = win.getContentBounds();
  chromeView.setBounds({ x: 0, y: 0, width: b.width, height: CHROME_H });
  const cb = contentBounds();
  const showStudio = !activeTab && workspace === "crimetime";
  const showIg = !activeTab && workspace === "instagram";
  studioView.setBounds(showStudio ? cb : { x: 0, y: 0, width: 0, height: 0 });
  igView.setBounds(showIg ? cb : { x: 0, y: 0, width: 0, height: 0 });
  for (const [id, t] of tabs) t.view.setBounds(id === activeTab ? cb : { x: 0, y: 0, width: 0, height: 0 });
}
function pushTabs() {
  chromeView.webContents.send("tabs", { active: activeTab, workspace, target: targetDraft, tabs: [...tabs.entries()].map(([id, t]) => ({ id, title: t.title, url: t.url, loading: t.loading, canBack: t.view.webContents.navigationHistory?.canGoBack?.() ?? t.view.webContents.canGoBack(), canFwd: t.view.webContents.navigationHistory?.canGoForward?.() ?? t.view.webContents.canGoForward() })) });
}
const toast = (msg, bad = false) => chromeView.webContents.send("toast", { msg, bad });

/* --------------------------------------------------------------- tabs */
function newTab(url = "https://www.instagram.com/", activate = true) {
  const id = `t${++tabSeq}`;
  const view = new WebContentsView({ webPreferences: { partition: BROWSER_SESSION, contextIsolation: true, sandbox: true, nodeIntegration: false } });
  const wc = view.webContents;
  const t = { view, title: "New tab", url, loading: true };
  tabs.set(id, t);
  win.contentView.addChildView(view);
  wc.on("page-title-updated", (_e, title) => { t.title = title; pushTabs(); });
  wc.on("did-start-loading", () => { t.loading = true; pushTabs(); });
  wc.on("did-stop-loading", () => { t.loading = false; t.url = wc.getURL(); pushTabs(); });
  wc.on("did-navigate", (_e, u) => { t.url = u; pushTabs(); });
  wc.on("did-navigate-in-page", (_e, u) => { t.url = u; pushTabs(); });
  wc.setWindowOpenHandler(({ url: u }) => { newTab(u, true); return { action: "deny" }; });
  wc.on("context-menu", (_e, params) => {
    const items = [];
    if (params.srcURL && params.mediaType === "image") items.push({ label: "Save image to episode", click: () => saveUrlToEpisode(params.srcURL, wc) }, { label: "Copy image address", click: () => clipboard.writeText(params.srcURL) });
    if (params.srcURL && params.mediaType === "video") items.push({ label: "Save video to episode", click: () => saveUrlToEpisode(params.srcURL, wc) });
    if (params.linkURL) items.push({ label: "Open link in new tab", click: () => newTab(params.linkURL, true) }, { label: "Copy link", click: () => clipboard.writeText(params.linkURL) });
    if (params.selectionText) items.push({ label: "Copy", role: "copy" }, { label: "Save selection to episode notes", click: () => saveNoteToEpisode(params.selectionText, wc.getURL()) });
    items.push({ type: "separator" }, { label: "Back", enabled: wc.navigationHistory?.canGoBack?.() ?? wc.canGoBack(), click: () => (wc.navigationHistory?.goBack ? wc.navigationHistory.goBack() : wc.goBack()) }, { label: "Reload", click: () => wc.reload() }, { label: "Open in system browser", click: () => osShell.openExternal(wc.getURL()) });
    Menu.buildFromTemplate(items).popup({ window: win });
  });
  wc.loadURL(url);
  if (activate) { activeTab = id; }
  layout(); pushTabs();
  return id;
}
function closeTab(id) {
  const t = tabs.get(id); if (!t) return;
  win.contentView.removeChildView(t.view); t.view.webContents.close(); tabs.delete(id);
  if (activeTab === id) activeTab = [...tabs.keys()].pop() || null;
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
    const ses = wc.session;
    const cookies = (await ses.cookies.get({ url })).map((c) => `${c.name}=${c.value}`).join("; ");
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
  const buf = Buffer.from(`\n\n---\n${stamp}  ${from}\n\n${text.trim()}\n`, "utf8");
  // Append: fetch existing notes if any, then re-upload.
  let existing = "";
  try { const r = await fetch(`${STUDIO_URL}/api/draft/${id}/file?name=notes.md`); if (r.ok) existing = await r.text(); } catch { /* none */ }
  const r = await studioApi("POST", `/api/draft/${id}/upload?name=notes.md`, null, Buffer.concat([Buffer.from(existing, "utf8"), buf]));
  if (r?.ok) toast(`Selection saved to notes.md in ${id}`); else toast(r?.error || "note save failed", true);
}

/* ------------------------------------------------------------ window */
function createWindow() {
  win = new BaseWindow({ width: 1680, height: 980, minWidth: 1100, minHeight: 640, backgroundColor: "#050505", title: "CrimeTimeSnacks Studio", autoHideMenuBar: true });
  chromeView = new WebContentsView({ webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, sandbox: false } });
  studioView = new WebContentsView({ webPreferences: { partition: "persist:cts-studio", contextIsolation: true, sandbox: true } });
  igView = new WebContentsView({ webPreferences: { partition: BROWSER_SESSION, contextIsolation: true, sandbox: true } });
  win.contentView.addChildView(studioView); win.contentView.addChildView(igView); win.contentView.addChildView(chromeView);
  chromeView.webContents.loadFile(path.join(__dirname, "chrome.html"));
  studioView.webContents.loadURL(STUDIO_URL);
  igView.webContents.loadFile(path.join(__dirname, "ig.html"));
  igView.webContents.setWindowOpenHandler(({ url }) => { newTab(url, true); return { action: "deny" }; });
  studioView.webContents.setWindowOpenHandler(({ url }) => { if (url.startsWith(STUDIO_URL)) return { action: "allow" }; newTab(url, true); return { action: "deny" }; });
  win.on("resize", layout); win.on("maximize", layout); win.on("unmaximize", layout);
  layout();

  // Downloads from browser tabs go to the target episode when there is one, else the shell's downloads folder.
  const ses = session.fromPartition(BROWSER_SESSION);
  ses.on("will-download", (_e, item) => {
    const name = item.getFilename();
    const file = path.join(DOWNLOADS, name);
    item.setSavePath(file);
    item.once("done", async (_ev, state) => {
      if (state !== "completed") return toast(`Download ${state}: ${name}`, true);
      const id = targetDraft || (await studioApi("GET", "/api/drafts").catch(() => []))[0]?.id;
      if (!id) return toast(`Downloaded ${name} to studio-shell/downloads`);
      const r = await studioApi("POST", `/api/draft/${id}/upload?name=${encodeURIComponent(name)}`, null, fs.readFileSync(file)).catch((e) => ({ error: e.message }));
      toast(r?.ok ? `Downloaded ${name} into ${id}` : `Downloaded to studio-shell/downloads (${r?.error || "studio upload failed"})`);
    });
  });
  ses.protocol.handle("cts-shell", (req) => {
    const u = new URL(req.url);
    if (u.hostname === "ig-files") {
      const dir = path.join(IG_STUDIO, "out");
      let files = [];
      try { files = fs.readdirSync(dir).filter((f) => /\.(jpg|jpeg|png|mp4)$/i.test(f)).map((f) => { const st = fs.statSync(path.join(dir, f)); return { name: f, path: path.join(dir, f), size: st.size, mtime: st.mtimeMs }; }).sort((x, y) => y.mtime - x.mtime); } catch { /* none */ }
      return new Response(JSON.stringify(files), { headers: { "Content-Type": "application/json" } });
    }
    if (u.hostname === "reveal") { const p = u.searchParams.get("p") || ""; if (p.replace(/\\/g, "/").startsWith(IG_STUDIO)) osShell.showItemInFolder(p); return new Response("ok"); }
    return new Response("not found", { status: 404 });
  });
  ses.protocol.handle("cts-file", (req) => {
    const p = decodeURIComponent(new URL(req.url).pathname.replace(/^\/+/, "")).replace(/^([a-zA-Z]):?\//, "$1:/");
    const norm = p.replace(/\\/g, "/");
    if (!norm.startsWith(IG_STUDIO) && !norm.startsWith(REPO.replace(/\\/g, "/"))) return new Response("forbidden", { status: 403 });
    return net.fetch(`file:///${norm}`);
  });
  ses.setPermissionRequestHandler((_wc, permission, cb) => cb(["media", "clipboard-read", "clipboard-sanitized-write", "notifications", "fullscreen"].includes(permission)));
}

/* --------------------------------------------------------------- ipc */
ipcMain.handle("shell", async (_e, { cmd, ...a }) => {
  const t = active();
  switch (cmd) {
    case "newTab": newTab(a.url || "https://www.instagram.com/", true); break;
    case "closeTab": closeTab(a.id); break;
    case "activate": activeTab = a.id || null; layout(); pushTabs(); break;
    case "home": activeTab = null; layout(); pushTabs(); break;
    case "workspace": workspace = a.name; activeTab = null; layout(); pushTabs(); break;
    case "navigate": { let u = String(a.url || "").trim(); if (!u) break; if (!/^[a-z]+:\/\//i.test(u)) u = /\s/.test(u) || !u.includes(".") ? `https://duckduckgo.com/?q=${encodeURIComponent(u)}` : `https://${u}`; if (t) t.view.webContents.loadURL(u); else newTab(u, true); break; }
    case "back": if (t) (t.view.webContents.navigationHistory?.goBack ? t.view.webContents.navigationHistory.goBack() : t.view.webContents.goBack()); break;
    case "forward": if (t) (t.view.webContents.navigationHistory?.goForward ? t.view.webContents.navigationHistory.goForward() : t.view.webContents.goForward()); break;
    case "reload": if (t) t.view.webContents.reload(); else if (workspace === "crimetime") studioView.webContents.reload(); else igView.webContents.reload(); break;
    case "drafts": return studioApi("GET", "/api/drafts").catch(() => []);
    case "setTarget": targetDraft = a.id || null; pushTabs(); break;
    case "generate": {
      const id = a.draft || (await requireTarget()); if (!id) return { ok: false, error: "no episode selected" };
      return studioApi("POST", "/api/run", { action: "generate", id, prompt: a.prompt, kind: a.kind, model: a.model, ref: a.ref, seconds: a.seconds });
    }
    case "job": return studioApi("GET", `/api/job/${a.id}`);
    case "openFolder": osShell.openPath(a.path); break;
    case "external": osShell.openExternal(a.url); break;
    case "igFiles": {
      const dir = path.join(IG_STUDIO, "out");
      try { return fs.readdirSync(dir).filter((f) => /\.(jpg|jpeg|png|mp4)$/i.test(f)).map((f) => { const st = fs.statSync(path.join(dir, f)); return { name: f, path: path.join(dir, f), size: st.size, mtime: st.mtimeMs }; }).sort((x, y) => y.mtime - x.mtime); } catch { return []; }
    }
    case "copyPath": clipboard.writeText(a.path); break;
    case "revealFile": osShell.showItemInFolder(a.path); break;
    case "readText": { try { return fs.readFileSync(a.path, "utf8"); } catch { return ""; } }
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
