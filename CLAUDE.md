# CabinetMaker

Browser cabinet designer: parametric cabinet → parts → drawings, cut list, nest, CNC preview, estimate.
Product spec and phase plan: `makemeacabinet-clone-plan.md` (read the "Engineering review" section).

## Commands

- `pnpm install` — install deps
- `pnpm dev` — dev server
- `pnpm typecheck` / `pnpm lint` / `pnpm test` / `pnpm build`
- `pnpm verify` — all gates; must pass before a commit is considered done
- `pnpm e2e` — Playwright smoke tests (Chromium at `/opt/pw-browsers` in cloud sessions)

## Architecture

```
src/core/       types.ts (THE contract), units, defaults (catalog), fixtures
src/engine/     Project → ProjectBuild (parts, ops, hardware). Pure TS, no UI.
src/nest/       Parts → sheets (MaxRects, grain, kerf). Pure TS.
src/cam/        Sheet → toolpaths → G-code (+ parser for round-trip tests). Pure TS.
src/estimate/   BOM + cost estimate. Pure TS.
src/drawings/   Drawing model → SVG string and PDF (pdf-lib). Pure TS.
src/pipeline/   runPipeline(project): the single derivation every view reads.
src/ui/         React components, 3D viewer (react-three-fiber), store (zustand).
src/app/        Next.js App Router shell (static export).
```

Rules:

- Only `Project` is persisted. Never store derived data.
- Domain modules (`core`, `engine`, `nest`, `cam`, `estimate`, `drawings`, `pipeline`) never import React, `src/ui` or `src/app`.
- Each module's public API is its `index.ts`. Do not change exported signatures or `src/core/types.ts` without updating every caller; prefer adding optional fields.
- Units are mm. Coordinate frames are documented at the top of `src/core/types.ts`.
- Part ids are deterministic (`${cabinetId}:${role}`); tests rely on it.
- Manufacturer-derived numbers are named constants with a source comment.

## Conventions (ECC)

Follows the ECC plugin rules at `~/.claude/plugins/cache/ecc/ecc/*/rules/{common,typescript,react}` when available:
explicit types on exports, no `any` (use `unknown` and narrow), string-literal unions over enums,
immutable updates, small focused files, TDD (write the failing test first), 80 %+ coverage on domain modules.
Code style: 2-space indent, single quotes, no semicolons, trailing commas.
