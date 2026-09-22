// node --test automation/test-check-links.mjs
//
// check-links.mjs runs inside npm test, which runs inside episode-publish.mjs. If it
// reports a broken reference the publish stops and an episode does not ship, so what it
// does and does not walk is load-bearing.
//
// The community zone is a Next.js app in community/, deployed as its own Vercel project.
// Its .next build output is full of hashed asset references that resolve on that zone and
// nowhere else. Walking it would fail every publish.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const run = (root) => spawnSync(process.execPath, [join(here, "check-links.mjs")],
  { encoding: "utf8", env: { ...process.env, CTS_LINK_ROOT: root } });

test("a build output under community/ is not walked", async () => {
  const root = await mkdtemp(join(tmpdir(), "cts-links-"));
  try {
    await mkdir(join(root, "community", ".next", "server"), { recursive: true });
    // Exactly the shape that breaks it: extensionful asset refs that cannot resolve here.
    await writeFile(join(root, "community", ".next", "server", "page.html"),
      '<link href="/_next/static/abc123.css"><img src="/_next/static/def456.png">', "utf8");
    await writeFile(join(root, "index.html"), "<p>fine</p>", "utf8");
    const r = run(root);
    assert.equal(r.status, 0, `check-links should pass but said:\n${r.stdout}`);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("a genuinely broken reference is still caught", async () => {
  const root = await mkdtemp(join(tmpdir(), "cts-links-"));
  try {
    await writeFile(join(root, "index.html"), '<img src="/images/nope.jpg">', "utf8");
    const r = run(root);
    assert.equal(r.status, 1);
    assert.match(r.stdout, /nope\.jpg/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("the studio is still skipped", async () => {
  const root = await mkdtemp(join(tmpdir(), "cts-links-"));
  try {
    await mkdir(join(root, "automation", "studio"), { recursive: true });
    await writeFile(join(root, "automation", "studio", "studio.html"), '<img src="/nope.png">', "utf8");
    const r = run(root);
    assert.equal(r.status, 0, r.stdout);
  } finally { await rm(root, { recursive: true, force: true }); }
});
