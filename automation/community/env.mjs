// Loads automation/.env.community into process.env for local runs (studio,
// content run, tests). On Vercel and in CI the variables are already set and
// the file does not exist. Never commit that file.
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

export async function loadEnv() {
  const p = join(dirname(fileURLToPath(import.meta.url)), "..", ".env.community");
  try {
    for (const line of (await readFile(p, "utf8")).split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch { /* not local, or not configured */ }
}
