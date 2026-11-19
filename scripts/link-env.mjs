#!/usr/bin/env node
// The Bruno desktop app reads `.env` from each collection's root folder.
// This script points every collection at the single repo-root `.env`, so you keep
// the token in one place. The links are gitignored (`**/.env`), like the file itself.
import { existsSync, lstatSync, readdirSync, symlinkSync, copyFileSync, unlinkSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(root, ".env");
if (!existsSync(source)) {
  console.error("No .env at the repo root yet. Run: cp .env.example .env  (then paste your token)");
  process.exit(1);
}

const collectionsDir = join(root, "collections");
for (const name of readdirSync(collectionsDir)) {
  const dir = join(collectionsDir, name);
  if (!existsSync(join(dir, "opencollection.yml"))) continue;
  const target = join(dir, ".env");
  if (existsSync(target) || isBrokenLink(target)) unlinkSync(target);
  try {
    symlinkSync(relative(dir, source), target);
    console.log(`linked  collections/${name}/.env -> ../../.env`);
  } catch {
    copyFileSync(source, target); // e.g. Windows without symlink permission
    console.log(`copied  collections/${name}/.env (symlinks unavailable; re-run after editing .env)`);
  }
}

function isBrokenLink(p) {
  try { return lstatSync(p).isSymbolicLink(); } catch { return false; }
}
