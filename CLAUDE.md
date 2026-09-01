# Claude / AI Assistant Guidelines for pi-chat

This project enforces strict AI Agent operating rules documented in [`AGENTS.md`](./AGENTS.md). All AI coding assistants (Claude Code, Pi Coding Agent, Cursor, etc.) must follow these rules:

## 1. Always Pull Latest Trunk Before Any Work
- **Command**: `git fetch origin && git pull origin main`
- **Rule**: Run before starting any analysis, code review, bug fix, or development. Ensure local working tree is clean and up to date with remote `origin/main`.

## 2. Increment Semantic Version on Every Change & Verify Multi-Client Display
- **Rule**: Follow [SemVer 2.0.0](https://semver.org/spec/v2.0.0.html) (`MAJOR.MINOR.PATCH`).
  - `PATCH`: Bug fixes, docs, chore, non-breaking minor tweaks.
  - `MINOR`: Backward-compatible new features.
  - `MAJOR`: Breaking changes / architectural overhauls.
- **Synchronize in Monorepo Lockstep**:
  - `package.json` (`version`)
  - `packages/protocol/package.json` (`version`)
  - `server/package.json` (`version`)
  - `clients/web/package.json` (`version`)
  - `clients/harmony/package.json` (`version`)
  - `clients/harmony/AppScope/app.json5` (`versionName`, `versionCode`)
  - `clients/android/app/build.gradle.kts` (`versionName`, `versionCode`)
  - `clients/web/docs/CHANGELOG.md`
- **Ensure Multi-Client Version Display**:
  - Web UI: Sidebar bottom `#appVersion` badge.
  - Android UI: Navigation drawer bottom & Settings dialog via `BuildConfig.VERSION_NAME`.
  - HarmonyOS UI: Sidebar footer.

## 3. Always Test, Commit & Push to Remote
- **Commands**:
  - Run tests: `pnpm test` and `pnpm build` (plus `pnpm build:android` if Android touched).
  - Commit: `git add . && git commit -m "<type>: <description>"`
  - Push: `git push origin main`
- Verify with `git status` that working tree is clean and synchronized with remote.
