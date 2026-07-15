// Improvement ledger helper. Every shipped improvement — human or automated —
// gets a numbered line in automation/improvements.md, so the running count on
// Mission Control is auditable line by line. Auto-generators call logImprovement()
// when they publish something new, so the counter keeps climbing on schedule.

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const LEDGER = join(__dirname, "improvements.md");

export async function logImprovement(text) {
  let body = "";
  try { body = await readFile(LEDGER, "utf8"); } catch { return; } // no ledger, skip quietly
  const nums = body.match(/^(\d+)\./gm) || [];
  const next = nums.length ? Math.max(...nums.map((n) => parseInt(n, 10))) + 1 : 1;
  const stamp = new Date().toISOString().slice(0, 10);
  body = body.trimEnd() + `\n${next}. [auto ${stamp}] ${text}\n`;
  await writeFile(LEDGER, body, "utf8");
}
