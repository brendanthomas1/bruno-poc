#!/usr/bin/env node
// Runs one or more Bruno collections with the `bru` CLI and writes JUnit + HTML reports.
//
//   node scripts/run-collections.mjs                     # every collection, env "local"
//   node scripts/run-collections.mjs movies tv           # just these collections
//   node scripts/run-collections.mjs --env ci            # pick an environment
//   node scripts/run-collections.mjs --only-data-driven  # just the CSV-driven run
//   node scripts/run-collections.mjs movies -- --bail     # everything after "--" goes to `bru run`
//
// The token is read from the shell environment (TMDB_READ_ACCESS_TOKEN). If a `.env` file
// exists at the repo root, it is loaded first, so local runs need no extra setup.
// In CI the variable comes from a GitHub Actions secret.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ALL = ["movies", "tv", "search-discover", "people-config"];

// ---- args ---------------------------------------------------------------
const argv = process.argv.slice(2);
const sep = argv.indexOf("--");
const args = sep === -1 ? argv : argv.slice(0, sep);
const passthrough = sep === -1 ? [] : argv.slice(sep + 1);
let env = process.env.BRU_ENV || "local";
let onlyDataDriven = false;
const selected = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--env") env = args[++i];
  else if (args[i] === "--only-data-driven") onlyDataDriven = true;
  else selected.push(args[i]);
}
const collections = selected.length ? selected : ALL;
for (const c of collections) {
  if (!ALL.includes(c)) {
    console.error(`Unknown collection "${c}". Choose from: ${ALL.join(", ")}`);
    process.exit(2);
  }
}

// ---- secrets ----------------------------------------------------------------
const dotEnv = join(root, ".env");
if (existsSync(dotEnv)) {
  process.loadEnvFile(dotEnv); // Node >= 20.12. Never overrides variables already set in the shell.
}
const token = process.env.TMDB_READ_ACCESS_TOKEN;
if (!token || token.startsWith("paste-your")) {
  console.warn(
    "\n⚠  TMDB_READ_ACCESS_TOKEN is not set. Authenticated requests will get 401.\n" +
      "   Copy .env.example to .env and paste your TMDB v4 Read Access Token.\n" +
      "   (The auth-checks negative tests still pass without it.)\n"
  );
}

// ---- run ----------------------------------------------------------------------
const bru = join(root, "node_modules", ".bin", process.platform === "win32" ? "bru.cmd" : "bru");
if (!existsSync(bru)) {
  console.error("Bruno CLI not found. Run `npm install` first.");
  process.exit(2);
}
const reports = join(root, "reports");
mkdirSync(reports, { recursive: true });

// Reporters: never write the Authorization header (the bearer token) into report files,
// because CI uploads those files as build artifacts.
const reportArgs = (name) => [
  "--reporter-junit", join(reports, `${name}.xml`),
  "--reporter-html", join(reports, `${name}.html`),
  "--reporter-skip-headers", "Authorization",
];

const runs = [];
if (!onlyDataDriven) {
  for (const c of collections) runs.push({ name: c, cwd: c, extra: [] });
}
if (onlyDataDriven || collections.includes("search-discover")) {
  runs.push({
    name: "search-discover-data-driven",
    cwd: "search-discover",
    extra: ["data-driven", "--csv-file-path", join(root, "data", "movie-search-cases.csv")],
  });
}

const failed = [];
for (const run of runs) {
  console.log(`\n━━━ ${run.name} (env: ${env}) ━━━`);
  const result = spawnSync(bru, ["run", ...run.extra, "--env", env, ...reportArgs(run.name), ...passthrough], {
    cwd: join(root, "collections", run.cwd),
    stdio: "inherit",
    env: process.env,
    shell: process.platform === "win32",
  });
  if (result.status !== 0) failed.push(run.name);
}

console.log(`\nReports written to ${reports}`);
if (failed.length) {
  console.error(`✗ Failed: ${failed.join(", ")}`);
  process.exit(1);
}
console.log("✓ All runs passed");
