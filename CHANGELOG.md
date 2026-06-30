# Changelog

All notable changes to NFR Advisor. Format follows [Keep a Changelog](https://keepachangelog.com/); the catalog is versioned in `data/nfr-catalog.json`.

## [2.1] — 2026-06-30

### Added
- **Observability bridge** — every NFR maps to the signals & alerts that verify it in production (RED/USE/GOLD method, page/ticket/watch action, OTel/Prometheus metric names, matching alert rule), drawn from the companion [cloud-native-observability](https://github.com/gauravs19/cloud-native-observability) catalog. Shown in the Applicable-NFR detail.
- **5 new NFRs → 50 total**, completing ISO/IEC 25010:2023 sub-characteristic coverage: reusability, analysability/diagnosability, installability & replaceability, co-existence, UI consistency & aesthetics.
- **Shareable permalinks** (`#s=` URL state) + full-state **JSON import/export**.
- **Jira-trackable exports**: a bulk-import **CSV** (Epic + a Story per NFR with Given/When/Then acceptance criteria, SLO, priority, labels, Epic Link), an **Epic + User Stories** markdown, and a **PRD** markdown.
- **Interactive trade-off matrix**: clicking a cell opens a decision popover — choose a winner, mark *balanced*, and record a rationale that flows into the ADR.
- **Compliance landscape**: all regulations shown (out-of-scope ones disabled with "triggered when…"), each linking its **official reference**; a toggle to hide out-of-scope.
- **Journey progress strip** with per-step state + live counts (also the navigation), a "what changed" toast on context change, progressive context intake (Essentials open), and inline definitions for ISO 25010 / SEI / arc42.

### Changed
- **Readiness score** moved from Overview (start) to the **Export** tab (end) as the verdict; Overview now leads with orientation + live posture.
- **Removed the header tab row** — the journey chips are the sole navigation (compacted to a single line).
- **Light theme** is now the default (toggle retained).
- Richer README: NFR primer, the model, Mermaid diagrams, screenshots, standards links, and badges.

### Fixed
- Dark-mode `--code-bg` self-reference (gauge/meters/export panel lost their fill).
- `Reset` now clears all assessment state, not just context.
- Trade-off popover dismisses on outside-click / scroll / resize.
- "Recommended next step" follows the journey order and points at Export for the score.
- Accessibility: ARIA roles + keyboard nav, matrix caption/scope, `.sr-only`, focus-visible.

## [0.1-canvas]
- Original p5.js "MicroSim" canvas prototype (archived at tag `v0.1-canvas` / branch `archive/canvas-microsim`).
