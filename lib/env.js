// Loads settings from an env file that lives OUTSIDE the deployed folder, so a redeploy from
// GitHub cannot wipe it. Variables set in hPanel (Environment variables) always win.
// Files checked, first match per variable wins:
//   1. $DAL_ENV_FILE            (any path you choose)
//   2. ~/dalsuits.env           (Hostinger: the top folder in File Manager)
//   3. <app folder>/.env        (local development; wiped on redeploy, so not for production)
import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const appDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const candidates = [process.env.DAL_ENV_FILE, join(homedir(), "dalsuits.env"), join(appDir, ".env")].filter(Boolean);

export const envFilesLoaded = [];

for (const file of candidates) {
  if (!existsSync(file)) continue;
  let text;
  try { text = readFileSync(file, "utf8"); } catch { continue; }
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const m = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    else v = v.replace(/\s+#.*$/, "");
    if (process.env[m[1]] === undefined || process.env[m[1]] === "") process.env[m[1]] = v;
  }
  envFilesLoaded.push(file === join(appDir, ".env") ? ".env (app folder)" : file.replace(homedir(), "~"));
}

/** Database variables that are still missing (names only, never values). */
export const missingDbVars = () => ["DB_HOST", "DB_NAME", "DB_USER", "DB_PASSWORD"].filter(k => !process.env[k]);
