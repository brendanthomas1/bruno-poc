# Bruno POC: git-native API tests against TMDB

This proof of concept shows what API testing with [Bruno](https://www.usebruno.com/) looks like when it's kept in git. Bruno is an open-source API client that could replace Postman. The target is the public [TMDB (The Movie Database) API](https://developer.themoviedb.org/docs).

It covers the two concerns we usually raise about Postman:

1. **Where API keys and secrets live.** Here they stay in a gitignored `.env` file on your machine, or in an encrypted secret store in the app. CI gets them from a GitHub Actions secret. No secret is ever written to a committed file, and the bearer token never appears in a report.
2. **Data leaving to a vendor cloud.** Bruno has no account, no sync and no cloud workspace. Collections are plain YAML files in this repo. Sharing happens through git and review happens through PRs. Requests go straight from your machine (or the CI runner) to the API.

## What's in here

| Collection | Folder | Requests | Shows |
|---|---|---|---|
| **TMDB - Movies** | `collections/movies` | 10 | details, credits, popular with pagination chaining, now playing, recommendations, images, a **404** negative test, and an `auth-checks/` folder with two **401** negative tests (folder-level auth override and no auth) |
| **TMDB - TV** | `collections/tv` | 5 | series, season, episode, popular TV, and a 404 for a missing season |
| **TMDB - Search & Discover** | `collections/search-discover` | 8 | search movie/person/multi, discover with filters, a **data-driven** folder run from a CSV, and a **workflows** folder that chains search → details → credits |
| **TMDB - People & Configuration** | `collections/people-config` | 5 | API configuration, person details, combined credits, movie and TV genre lists |

**28 requests in total.** They show:

- **Collection-level bearer auth.** `opencollection.yml` sets `Authorization: Bearer {{tmdbToken}}` once, and requests use `auth: inherit`.
- **Folder-level auth.** `movies/auth-checks/folder.yml` overrides the collection token with a fake one to prove TMDB rejects it with 401.
- **Three environments per collection:** `local`, `ci` and `app-secret`. See [Secrets](#how-secrets-stay-out-of-git).
- **Declarative assertions** (the Assert tab) on status, response time, field values and types. For example, `res.status eq 200`, `res.responseTime lt 3000` and `res.body.genres isArray`.
- **JS tests** (`test()` + Chai `expect`) that check the response shape, sort order, filters and cross-field consistency.
- **Collection-level tests** that run after every request: JSON content type, and response time under the `maxResponseTimeMs` budget, which differs between `local` and `ci`.
- **Pre-request scripts.** One computes a rolling date filter. Another skips a request when an earlier step found nothing (`bru.runner.skipRequest()`).
- **Post-response scripts and variable chaining** with `bru.setVar`. Examples: `popularNextPage`, `imageBaseUrl`, and `workflowMovieId` used across requests.
- **Data-driven runs** from `data/movie-search-cases.csv` (`--csv-file-path`).
- **Docs blocks.** Every request, folder and collection has Markdown docs, shown in the app's Docs tab.

## Prerequisites

- **Bruno app** v3.1 or newer: https://www.usebruno.com/downloads (`brew install bruno` on macOS)
- **Node.js** 20.12 or newer (for the CLI and the npm scripts)
- **A TMDB account.** Copy the **API Read Access Token** from https://www.themoviedb.org/settings/api. Use the long v4 token that starts with `eyJ`, not the short v3 "API Key".

```sh
npm install            # installs @usebruno/cli (pinned) into node_modules
```

## Add your token

```sh
cp .env.example .env
# edit .env and paste the token:
# TMDB_READ_ACCESS_TOKEN=eyJhbGciOi...
```

`.env` is gitignored (and so is `**/.env`). Only `.env.example`, which holds a placeholder, is committed.

## Use it in the Bruno app

1. Run `npm run env:link` once. The app reads `.env` from **each collection's root folder**, so this command symlinks `collections/*/.env` to the single repo-root `.env`. The links are gitignored too. On Windows without symlink permission it copies the file instead.
2. In Bruno, open this repo folder as a **workspace** (it contains `workspace.yml`, which lists the four collections). You can also open any folder under `collections/` as a single collection.
3. Pick the **`local`** environment in the top-right environment selector.
4. Send a request, or right-click a collection or folder and choose **Run** to use the runner.

## Run from the command line

The npm scripts wrap the `bru` CLI. They load the root `.env` and write JUnit + HTML reports to `reports/`:

```sh
npm test                    # every collection plus the CSV-driven run, env "local"
npm run test:movies         # one collection (also: test:tv, test:search, test:people)
npm run test:data-driven    # just the CSV iteration run
npm run test:auth-checks    # the 401 negative tests; these pass even without a token
npm run test:ci             # same as CI: env "ci"
npm test -- -- --bail       # anything after a second "--" is passed through to `bru run`
```

You can also call `bru` directly from inside a collection folder (`npx bru` if it isn't on your PATH):

```sh
cd collections/movies
npx bru run --env local                                   # whole collection, recursive
npx bru run get-movie-details.yml --env local             # one request
npx bru run auth-checks --env local                       # one folder
npx bru run --env local --tags smoke                      # only requests tagged "smoke"
npx bru run --env local --env-var movieId=603             # override a variable for this run
npx bru run --env local --reporter-junit out.xml --reporter-html out.html

cd ../search-discover
npx bru run data-driven --env local --csv-file-path ../../data/movie-search-cases.csv
```

When you run `bru` directly, the token comes from either `collections/<name>/.env` (created by `npm run env:link`) or an exported `TMDB_READ_ACCESS_TOKEN` shell variable.

## Repo layout

```
.
├── workspace.yml                  # Bruno workspace: lists the 4 collections
├── .env.example                   # placeholder token (committed)
├── .env                           # YOUR token (gitignored, you create it)
├── data/movie-search-cases.csv    # iteration data for the data-driven folder
├── scripts/
│   ├── run-collections.mjs        # npm test runner: loads .env, runs bru, writes reports/
│   └── link-env.mjs               # npm run env:link: one .env shared by all collections
├── .github/workflows/api-tests.yml
└── collections/
    ├── movies/
    │   ├── opencollection.yml     # collection: bearer auth, variables, collection scripts, docs
    │   ├── environments/
    │   │   ├── local.yml          # token = {{process.env.TMDB_READ_ACCESS_TOKEN}}
    │   │   ├── ci.yml             # same, longer response-time budget
    │   │   └── app-secret.yml     # token is a secret variable (value never in the file)
    │   ├── get-movie-details.yml  # one request per file
    │   ├── ...
    │   └── auth-checks/
    │       ├── folder.yml         # folder-level auth override + folder tests
    │       ├── invalid-token.yml
    │       └── missing-auth.yml
    ├── tv/
    ├── search-discover/
    │   ├── data-driven/           # run with --csv-file-path
    │   └── workflows/             # search → details → credits chain
    └── people-config/
```

### Why the YAML (OpenCollection) format

Bruno has two on-disk formats: the original `.bru` language and **YAML based on the OpenCollection spec**. This repo uses **YAML** because:

- It's the **default for new collections since Bruno v3.1** ([announcement](https://blog.usebruno.com/making-yaml-the-default-in-bruno-v3.1)). The `bru import` CLI also writes OpenCollection by default.
- It's plain YAML, so editors, linters, code review and diff tools handle it without a Bruno-specific plugin. Bruno also says it parses 4-5x faster than `.bru`.
- Workspaces (`workspace.yml`) and global environments are YAML too, so everything uses one format.

`.bru` is still fully supported and the two formats are lossless to convert, so this choice doesn't lock us in.

## How secrets stay out of git

| Where | How the token gets in | What is committed |
|---|---|---|
| **Your machine, CLI or app** (`local` env) | `TMDB_READ_ACCESS_TOKEN` in the gitignored `.env`. The environment file only holds a reference: `tmdbToken: "{{process.env.TMDB_READ_ACCESS_TOKEN}}"` | the reference, never the value |
| **Your machine, app only** (`app-secret` env) | `tmdbToken` is a **secret variable** (`secret: true`). You type the value into the app's environment settings. Bruno encrypts it on your machine and never writes it to the YAML. For the CLI, pass `--env-var tmdbToken=...` | the variable name only |
| **CI** (`ci` env) | GitHub Actions secret `TMDB_READ_ACCESS_TOKEN`, set as an environment variable for the test step only | nothing |

Other safeguards:

- `.gitignore` covers `.env`, `.env.*` (except `.env.example`) and `**/.env`, which includes the per-collection links.
- Reports: the Bruno CLI masks the bearer value (`Bearer ********`) and also masks `.env` values. The runner goes one step further with `--reporter-skip-headers Authorization`, so the header isn't in the JUnit/HTML artifacts at all.
- There's no Bruno account or cloud. Nothing about these requests (URLs, bodies, tokens, history) goes anywhere except to `api.themoviedb.org`.
- Larger setups can use Bruno's external secret providers (HashiCorp Vault, AWS Secrets Manager, Azure Key Vault, GCP Secret Manager) instead of `.env`. This POC doesn't use them.

## CI (GitHub Actions)

`.github/workflows/api-tests.yml` runs on every push and PR to `main`, daily at 06:00 UTC (the Postman-monitor equivalent), and on demand:

1. `npm ci` installs the pinned `@usebruno/cli`.
2. It fails fast with a clear error if the `TMDB_READ_ACCESS_TOKEN` secret is missing.
3. `npm run test:ci` runs all four collections plus the CSV iteration run with the `ci` environment.
4. It uploads `reports/*.xml` (JUnit) and `reports/*.html` as the `bruno-reports` artifact, even when tests fail.

**Setup:** go to repo **Settings → Secrets and variables → Actions → New repository secret**, name it `TMDB_READ_ACCESS_TOKEN`, and paste the v4 Read Access Token. (Bruno also publishes an official `usebruno/bruno-cli-action`. We install the CLI with npm here so CI and local runs use the same pinned version.)

## Postman → Bruno

| Postman concept | Bruno equivalent in this repo |
|---|---|
| Workspace (cloud) | `workspace.yml` + folders in a git repo. Shared with `git clone`, reviewed in PRs |
| Collection | A folder with `opencollection.yml` (`collections/movies/`), one YAML file per request |
| Folder | A sub-folder with `folder.yml` for folder-level auth, variables, scripts and docs |
| Environment | `collections/<name>/environments/<env>.yml` (`local`, `ci`, `app-secret`) |
| Environment "secret" type / vault | Secret variables (`secret: true`, value encrypted locally), `{{process.env.X}}` from `.env`, or external secret providers |
| Globals | Workspace **global environments** (`environments/` next to `workspace.yml`), or collection-level `variables` in `opencollection.yml` |
| Collection / folder auth | `request.auth` in `opencollection.yml` / `folder.yml`; requests use `auth: inherit` |
| Pre-request script | `scripts: - type: before-request` (`req.*`, `bru.*`) at collection, folder or request level |
| Tests (`pm.test`, `pm.expect`) | `scripts: - type: tests` with `test()` + Chai `expect`, plus no-code **assertions** |
| `pm.collectionVariables.set` / `pm.variables.set` | `bru.setVar()` / `bru.getVar()` (runtime variables) |
| `postman.setNextRequest` | `bru.runner.setNextRequest()`, `bru.runner.skipRequest()` |
| Iteration data (CSV/JSON) | `bru run --csv-file-path` / `--json-file-path` |
| Newman | `bru` CLI (`@usebruno/cli`) with `--env`, `--env-var`, `--reporter-junit`, `--reporter-html` |
| Monitors | A scheduled CI job (`on: schedule` cron in the workflow) |
| Postman cloud sync / history | git |

## Limitations and notes

- TMDB data changes (popularity, recommendations, now playing). Tests check shape and invariants rather than exact lists. Assertions on fixed facts (Fight Club = 550, Keanu Reeves' birthday) are stable.
- A full run makes about 30 requests, well within TMDB's rate limits.
- Scripts run in Bruno's default **safe** sandbox (`--sandbox safe`), which has no filesystem or `require` access. Use `--sandbox developer` only if a script needs npm modules.
