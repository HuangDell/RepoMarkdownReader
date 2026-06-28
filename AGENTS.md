# Agent Memory

## Project

This repository is for a self-hosted Markdown knowledge/blog reader. The target deployment is a Raspberry Pi. The app should periodically pull GitHub repositories, render Markdown documents with math formulas, and provide a reading experience similar to:

https://labuladong.online/zh/algo/home/

The current implementation direction is Fumadocs plus Next.js, with the app scaffolded under `web/`. Use the user's fork as a reference or possible upstream customization point if framework-level changes become necessary:

https://github.com/HuangDell/fumadocs

Do not fork or patch Fumadocs internals unless normal extension points are insufficient.

## Requirements

Requirements and early open-source survey notes live in `docs/requirements.md`.

Current feature goals:

- Render Markdown correctly on desktop and mobile, including formulas.
- Support multiple GitHub repositories.
- Add repositories by GitHub URL and clone them locally.
- Delete repositories from the service.
- Periodically pull configured repositories.
- Support online edits with commit and push, likely requiring GitHub authentication.
- Support local page-bottom comments that do not modify source files.
- Keep the UI dense, readable, and document-first, closer to a technical docs reader than a marketing site.

## Current Stack

- Node.js: use Node 22 by default. The last verified version was `v22.22.3`.
- Frontend/docs app: Next.js 16 plus Fumadocs 16 in `web/`.
- Package manager: npm.
- Registry mirror: `.npmrc` and `web/.npmrc` use `https://registry.npmmirror.com/` for faster installs in China.
- Default build path uses native SWC.
- WASM fallback scripts remain available as `dev:wasm`, `build:wasm`, and `types:check:wasm`.

## Useful Commands

Run these from `web/` unless noted otherwise:

```bash
npm install
npm run dev
npm run lint
npm run types:check
npm run build
```

Development notes are in `docs/development.md`.

In the Codex sandbox, `next build` or `next dev` may need escalated execution because Turbopack binds an internal local port. A normal user shell should not need anything special.

## SWC Native Notes

There was an earlier native SWC `Bus error` caused by a truncated `@next/swc-linux-x64-gnu` binary after an interrupted install. Reinstalling the package fixed it:

```bash
npm install --force --no-save @next/swc-linux-x64-gnu@16.2.9
```

For Next 16.2.9, the unpacked package should be about 130 MB. If native SWC fails again, check the installed binary size before changing framework versions.

## Git And Hygiene

- Keep `web/node_modules/`, `web/.next/`, `web/.source/`, `web/next-env.d.ts`, and `*.tsbuildinfo` out of git.
- Keep local Codex/session directories such as `.agents/` and `.codex/` out of git.
- Do not revert unrelated user changes.
- Prefer scoped edits and update docs when project-level decisions change.

## Last Known Verification

The following passed under Node 22 after switching back to native SWC:

- `npm run lint`
- `npm run types:check`
- `npm run build`

The build was run with escalated execution in Codex due the Turbopack sandbox port-binding restriction.
