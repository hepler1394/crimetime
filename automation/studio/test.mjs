#!/usr/bin/env node
// Studio server tests: starts the server on a spare port and checks behaviour a
// reviewer would poke at. Run: npm run test:studio
//   * loopback API works (health, drafts, projects create/note/chat-less/export/delete)
//   * writes without the X-CTS header are refused (drive-by POST from a web page)
//   * writes from a foreign Origin are refused even with the header
//   * a wrong Host header is refused (DNS rebinding)
//   * /site/ serves public assets only: no automation/, no dotfiles, no traversal
//   * draft/project file routes refuse traversal and dotfiles
//   * unknown routes 404, oversized JSON bodies are ignored
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { existsSync } from "node:fs";
import http from "node:http";

const here = dirname(fileURLToPath(import.meta.url));
const PORT = 4300 + Math.floor(Math.random() * 500);
const BASE = `http://127.0.0.1:${PORT}`;
const H = { "Content-Type": "application/json", "X-CTS": "1" };
let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => { if (cond) { pass++; console.log(`  ok   ${name}`); } else { fail++; console.log(`  FAIL ${name} ${extra}`); } };

const server = spawn(process.execPath, [join(here, "server.mjs")], { env: { ...process.env, STUDIO_PORT: String(PORT) }, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
let up = false;
for (let i = 0; i < 50 && !up; i++) { await new Promise((r) => setTimeout(r, 200)); try { const r = await fetch(`${BASE}/api/drafts`); up = r.ok; } catch { /* not yet */ } }
if (!up) { console.error("server did not start"); server.kill(); process.exit(1); }
console.log(`studio test server on ${PORT}`);

try {
  // API basics
  const drafts = await (await fetch(`${BASE}/api/drafts`)).json();
  ok("GET /api/drafts is an array", Array.isArray(drafts));
  const music = await (await fetch(`${BASE}/api/music`)).json();
  ok("GET /api/music reports a source", ["cory", "synth"].includes(music.source));

  // Security: drive-by write without header
  let r = await fetch(`${BASE}/api/projects`, { method: "POST", headers: { "Content-Type": "text/plain" }, body: JSON.stringify({ title: "evil" }) });
  ok("POST without X-CTS is refused (403)", r.status === 403, String(r.status));
  r = await fetch(`${BASE}/api/run`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "build" }) });
  ok("POST /api/run without X-CTS is refused", r.status === 403, String(r.status));
  r = await fetch(`${BASE}/api/projects`, { method: "POST", headers: { ...H, Origin: "https://evil.example" }, body: JSON.stringify({ title: "evil" }) });
  ok("POST from a foreign Origin is refused", r.status === 403, String(r.status));
  // fetch() refuses to forge Host; raw http can.
  const hostStatus = await new Promise((resolve) => { const q = http.request({ host: "127.0.0.1", port: PORT, path: "/api/drafts", headers: { Host: "evil.example" } }, (res) => { res.resume(); resolve(res.statusCode); }); q.on("error", () => resolve(0)); q.end(); });
  ok("wrong Host header is refused (421)", hostStatus === 421, String(hostStatus));

  // Security: static serving
  r = await fetch(`${BASE}/site/automation/.env.community`); ok("/site/ refuses automation/", r.status === 403, String(r.status));
  r = await fetch(`${BASE}/site/automation/config.json`); ok("/site/ refuses config", r.status === 403, String(r.status));
  r = await fetch(`${BASE}/site/.git/config`); ok("/site/ refuses dotfiles", r.status === 403, String(r.status));
  r = await fetch(`${BASE}/site/images/../automation/.env.community`); ok("/site/ refuses traversal", r.status !== 200, String(r.status));
  r = await fetch(`${BASE}/site/images/logo.png`); ok("/site/images/logo.png serves", r.status === 200, String(r.status));
  const html = await fetch(`${BASE}/`); ok("UI carries a Content-Security-Policy", !!html.headers.get("content-security-policy"));
  ok("UI denies framing", html.headers.get("x-frame-options") === "DENY");

  // Security: draft file routes
  r = await fetch(`${BASE}/api/draft/nope/file?name=..%2F..%2Fconfig.json`); ok("draft file route refuses traversal", r.status === 400 || r.status === 404, String(r.status));
  r = await fetch(`${BASE}/api/draft/nope/file?name=.env`); ok("draft file route refuses dotfiles", r.status === 400, String(r.status));
  r = await fetch(`${BASE}/api/draft/..%2F..%2Fconfig/`); ok("draft id is validated", r.status === 400 || r.status === 404, String(r.status));

  // Projects round trip
  const created = await (await fetch(`${BASE}/api/projects`, { method: "POST", headers: H, body: JSON.stringify({ title: "Studio self-test" }) })).json();
  ok("project created", !!created.id, JSON.stringify(created));
  if (created.id) {
    r = await fetch(`${BASE}/api/project/${created.id}/note`, { method: "POST", headers: H, body: JSON.stringify({ text: "A clipping.", source: "test" }) });
    ok("project note appended", r.status === 200);
    const pr = await (await fetch(`${BASE}/api/project/${created.id}`)).json();
    ok("project notes contain the clipping", /A clipping\./.test(pr.notes || ""));
    r = await fetch(`${BASE}/api/project/${created.id}/upload?name=..%2Fescape.txt`, { method: "POST", headers: { "X-CTS": "1" }, body: "x" });
    ok("project upload refuses traversal", r.status === 400, String(r.status));
    r = await fetch(`${BASE}/api/project/${created.id}/upload?name=note.txt`, { method: "POST", headers: { "X-CTS": "1" }, body: "hello" });
    ok("project upload accepts a file", r.status === 200, String(r.status));
    r = await fetch(`${BASE}/api/project/${created.id}/file?name=note.txt`); ok("project file downloads", r.status === 200 && (await r.text()) === "hello");
    r = await fetch(`${BASE}/api/project/${created.id}`, { method: "DELETE", headers: H }); ok("project deleted", r.status === 200);
    ok("project folder gone", !existsSync(join(here, "projects", created.id)));
  }

  // Instagram board + posts
  r = await fetch(`${BASE}/instagram`); ok("/instagram serves the board with CSP", r.status === 200 && !!r.headers.get("content-security-policy"), String(r.status));
  const q = await (await fetch(`${BASE}/api/ig/queue`)).json(); ok("GET /api/ig/queue lists posts", Array.isArray(q.posts));
  r = await fetch(`${BASE}/api/ig/file?name=..%2Fcontent%2Fqueue.json`); ok("ig file route refuses traversal", r.status === 400, String(r.status));
  r = await fetch(`${BASE}/api/ig/status`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: "01", status: "posted" }) }); ok("ig status write needs X-CTS", r.status === 403, String(r.status));
  r = await fetch(`${BASE}/api/ig/status`, { method: "POST", headers: H, body: JSON.stringify({ id: "01", status: "nuked" }) }); ok("ig status validates the value", r.status === 400, String(r.status));
  const posts = await (await fetch(`${BASE}/api/posts`)).json(); ok("GET /api/posts is an array", Array.isArray(posts));
  r = await fetch(`${BASE}/api/post/..%2F..%2Fconfig/file?name=x.jpg`); ok("post id is validated", r.status === 400, String(r.status));
  r = await fetch(`${BASE}/api/post/nope/file?name=slide-1.jpg`); ok("unknown post 404", r.status === 404, String(r.status));
  if (posts[0]) {
    r = await fetch(`${BASE}/api/post/${posts[0].id}/file?name=..%2F..%2Fserver.mjs`); ok("post file route refuses traversal", r.status === 400, String(r.status));
    r = await fetch(`${BASE}/api/post/${posts[0].id}/file?name=.env`); ok("post file route refuses dotfiles", r.status === 400, String(r.status));
    r = await fetch(`${BASE}/api/post/${posts[0].id}/upload?name=evil.exe`, { method: "POST", headers: { "X-CTS": "1" }, body: "x" }); ok("post upload refuses non-media", r.status === 400, String(r.status));
    r = await fetch(`${BASE}/api/post/${posts[0].id}`, { method: "DELETE" }); ok("post delete needs X-CTS", r.status === 403, String(r.status));
  }
  r = await fetch(`${BASE}/api/community/digest-test`, { method: "POST", headers: H, body: JSON.stringify({ to: "not-an-email" }) }); ok("digest test validates the address", r.status === 400, String(r.status));

  // Misc
  r = await fetch(`${BASE}/api/nope`); ok("unknown route 404", r.status === 404);
  r = await fetch(`${BASE}/api/run`, { method: "POST", headers: H, body: JSON.stringify({ action: "rm -rf" }) }); ok("unknown action refused", r.status === 400, String(r.status));
  r = await fetch(`${BASE}/api/run`, { method: "POST", headers: H, body: "x".repeat(1_100_000) }); ok("oversized body does not crash the server", r.status >= 400 && r.status < 500, String(r.status));
  const still = await fetch(`${BASE}/api/drafts`); ok("server still answers after abuse", still.ok);
} catch (e) { fail++; console.log(`  FAIL exception ${e.message}`); }

server.kill();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
