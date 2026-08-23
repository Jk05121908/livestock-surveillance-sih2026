# AGENTS.md — livestock-surveillance-sih2026

> Keep this file high-signal. Every line should be something an agent would miss without help. Delete stale claims when the repo changes.

## Snapshot (verified 2026-08-23)
- Empty starter repo — only `README.md:1` (`# livestock-surveillance-sih2026`) and `.git/`. Single commit `56e9468 Initial commit`.
- Remote `origin` = `https://github.com/Jk05121908/livestock-surveillance-sih2026.git`, branch `main` tracks `origin/main`. No other branches.
- No existing instructions: no `AGENTS.md`, `CLAUDE.md`, `.cursorrules`, `.github/copilot-instructions.md` — checked root + `.git` layout.
- No manifests/config: no `package.json`, `pyproject.toml`, `go.mod`, `Dockerfile`, `Makefile`, lockfiles, or `opencode.json`/`opencode.jsonc` at repo root. Global `~/.config/opencode/opencode.jsonc:1-3` is empty (`{"$schema":...}` only).
- No CI/lint/test/typecheck/codegen configured — no `.github/workflows`, no pre-commit, no task runner.

## Repo boundaries
- No `src/` or packages yet. Treat repo as greenfield. When you scaffold, document real entrypoints and package boundaries here (e.g. `frontend/`, `backend/`, `ml/`).
- Do not assume stack. Verify from manifests before running any build/test command.

## Path quirk — space in parent
- Absolute path is `/Users/kavyasingh/Documents/Default Project/livestock-surveillance-sih2026` — note `Default Project` has a space.
- In bash tool use `workdir="/Users/kavyasingh/Documents/Default Project/livestock-surveillance-sih2026"` instead of `cd ... &&`. If you must inline, quote: `"/Users/kavyasingh/Documents/Default Project/..."`.

## Commands
- **None yet** — no build/test/lint scripts to run. After scaffolding, add *exact* verified commands here (e.g. `npm run dev`, single-test invocation) and required order (lint → typecheck → test).
- Verifier: absence confirmed via `find . -maxdepth 4 -type f` (only `README.md` + `.git/*`) and `git log --stat` (1 file).

## Workflow gotchas
- Do not add generic advice here. When you introduce tooling, replace this section with: env loading, generated code, migrations/codegen, dev servers, and deploy steps — only what `package.json`/`Makefile`/config actually defines.
- Until CI exists, run `git status`/`git diff` before commit; push to `origin/main` (default branch). No protected-branch config observed.

## When you change the stack, update this file
- Add: package manager + lockfile, entrypoints, and one-liner for focused verification (single test/file).
- Remove: this "empty repo" snapshot once real code lands.
