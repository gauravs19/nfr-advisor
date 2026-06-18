# NFR Advisor

An interactive, structured advisor for **non-functional requirements (NFRs)**. It takes a system's **context** → ranks the **applicable quality attributes** → surfaces **trade-offs** → turns them into **measurable scenarios** → and exports an **as-code NFR spec + ADRs**.

Grounded in **ISO/IEC 25010**, the **arc42 Quality Model (Q42)**, and **ATAM**. A single-page p5.js app — static, no backend, deployable to GitHub Pages.

> Most open resources are *catalogs* (arc42 Q42), *standards* (ISO 25010), or *manual methods* (ATAM). None walk an architect from **context → selection → trade-off → measurable criteria → as-code**. That intersection is what this tool fills.

## How to use it

One page, one persistent **System context** rail on the left, and five views as tabs. Set the context once — every tab reacts to it live.

| Tab | What it does |
|-----|--------------|
| **Relevance** | Animated selector — NFR nodes re-rank and resize live as you change context. Click any node for ISO mapping, the rules that fired, metrics, tactics, and a fitness function. |
| **Trade-offs** | Conflicts between the relevant NFRs (latency ↔ consistency, availability ↔ cost…). Resolve each by choosing a winner → becomes an ADR. |
| **Utility Tree** | ATAM-style decomposition: Utility → quality attributes → NFR leaves, ranked by importance. |
| **Scenarios** | Each NFR → a measurable `stimulus → response → measure` scenario (arc42 Q42 / ATAM). |
| **Export** | Generates `nfrs.yaml` (machine-readable), `nfrs.md` (human spec), and trade-off **ADRs**. |

## How it works

- **`data/nfr-catalog.json`** — the heart. Each NFR has its ISO/arc42 mapping, metrics, tactics, a fitness function, `conflicts_with` / `reinforces` edges, and **relevance rules** (`if dataSensitivity = phi → security +5`). The rules are what make it an *advisor* rather than a catalog.
- **`js/engine.js`** — relevance scoring, ranking, and conflict/reinforce edge computation. Pure, dependency-free.
- State persists across screens via `localStorage`.

## Run locally

It's a static site — serve the folder:

```bash
python -m http.server 8000
# open http://localhost:8000
```

(A static server is needed because the catalog is loaded via `fetch`.)

## Tech

Vanilla JS + [p5.js](https://p5js.org/) (bundled locally in `js/lib/`, no CDN — works on restricted networks). No build step. MIT licensed.

## Roadmap

- LLM-assisted context intake (free-text system description → context profile)
- Emit runnable fitness-function stubs (ArchUnit / k6 / axe) from the measures
- Custom catalogs / org-specific NFRs
- Shareable permalinks (encode state in URL)
