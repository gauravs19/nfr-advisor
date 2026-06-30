# NFR Advisor

An interactive, structured advisor for **non-functional requirements (NFRs)**. It takes a system's **context** → ranks the **applicable quality attributes** → surfaces **trade-offs** → turns them into **measurable scenarios** → and exports an **as-code NFR spec + ADRs**.

<!-- walkthrough GIF hidden for now (asset kept at docs/journey.gif)
![NFR Advisor walkthrough — load a profile, see ranked NFRs and the rules behind them, the observability signals that verify each one, resolve trade-offs in the decision popover, rate maturity, and watch the readiness score and as-code export come together](docs/journey.gif)

*The full journey: set context once → ranked NFRs (with the signals & alerts that verify them) → compliance → trade-off decisions → scenarios → maturity → readiness score & as-code export.*
-->

![The trade-off matrix with the decision popover — choose which quality wins, mark it balanced, and record a rationale that flows straight into an ADR](docs/screen-tradeoff.png)

*The full journey, in one app: set context once → ranked NFRs (with the signals & alerts that verify them) → compliance → trade-off decisions → scenarios → maturity → readiness score & as-code export.*

Grounded in **ISO/IEC 25010**, the **arc42 Quality Model (Q42)**, and **ATAM**. A single-page, data-driven app — static, no backend, no build step, deployable to GitHub Pages.

> Most open resources are *catalogs* (arc42 Q42), *standards* (ISO 25010), or *manual methods* (ATAM). None walk an architect from **context → selection → trade-off → measurable criteria → as-code**. That intersection is what this tool fills.

## What's a non-functional requirement?

A **functional requirement** says *what* a system does — "users can transfer money." A **non-functional requirement (NFR)** says *how well* it must do it — the qualities and constraints around that behaviour: how fast, how available, how secure, how recoverable, how cheap to run, how accessible, how auditable. They're also called **quality attributes**.

| | Functional | Non-functional (NFR) |
|---|---|---|
| The question | *What* does it do? | *How well*, under what constraints? |
| Example | "Process a card payment" | p99 < 300 ms · 99.99% uptime · PCI-DSS · RPO < 5 min |
| Where it lives | Backlog / user stories | Architecture, SLOs, runbooks — often nowhere |

**Why they matter.** Systems rarely fail because a feature is missing — they fail because an NFR wasn't met. Outages, breaches, runaway cloud bills, latency that drives users away, a compliance fine, a biased model: each is a *non-functional* failure. NFRs also shape the **architecture** far more than features do, and they're expensive to retrofit — you can't bolt on availability, security, or scalability at the end.

**Why they're hard.** NFRs are usually written as vague adjectives — "fast", "secure", "scalable" — with no number, no owner, and no test, so nobody can tell whether they're actually met. They're cross-cutting, deeply **context-dependent** (a fintech and an internal tool need wildly different things), and the first thing dropped under deadline pressure. The fix is to make each one **context-specific, measurable, traceable to *why*, and verifiable in production** — which is exactly what this tool does.

## The idea

You describe a system **once** — its domain, regulatory region, data sensitivity, scale, criticality, and AI usage — and the tool does the rest: it scores which of **50 quality attributes** actually matter (and **why**, down to the exact rule that fired), flags the ones a regulation makes **mandatory**, finds where they **conflict**, turns each into a **testable SLO**, and tells you **what to instrument in production** to prove it. It's for architects, tech leads, and platform teams who want NFRs to be explicit, defensible, and reviewable — not tribal knowledge buried in a wiki.

```mermaid
flowchart LR
  C["System context<br/>16 dimensions"] --> R["Ranked NFRs<br/>+ why"]
  C --> G["Compliance<br/>mandatory NFRs"]
  R --> T["Trade-offs<br/>→ ADRs"]
  R --> S["Scenarios<br/>6-part + SLO"]
  G --> M["Maturity<br/>& gaps"]
  T --> M
  S --> M
  M --> X["Readiness score<br/>+ as-code export"]
```

## How to use it

One page, one persistent **System context** rail on the left (16 dimensions — domain, region/jurisdiction, scale, data sensitivity, availability target, criticality, architecture style, users, residency, lifecycle, AI usage…), with the **Essentials** open and the rest one click away. Seven steps run along a **progress strip** that shows each step's state and live counts, and doubles as the navigation. Set the context once — every step reacts live, and a toast tells you *what changed* (e.g. "+3 NFRs · GDPR now applies"). A **Share** button copies a permalink that encodes your whole assessment in the URL; the **light / dark toggle** is remembered.

The catalog covers **50 NFRs** across **9 quality categories** (full ISO/IEC 25010:2023 sub-characteristic coverage), and reacts to **16 context dimensions** (incl. privacy, sustainability/green IT, supply-chain security, safety, data quality, and **AI/ML quality** — explainability, robustness/drift).

| Tab | What it does |
|-----|--------------|
| **Overview** | Cross-dimension dashboard: headline stats (relevant / mandatory / regulations / unresolved trade-offs / avg maturity gap), compliance regimes in scope, coverage-by-dimension chart, top priorities, open risks. |
| **Applicable NFRs** | NFRs grouped into collapsible **ISO/IEC 25010 dimension sections**, ranked within each, with **severity** chips and **MANDATORY** flags. Expand for business impact, compliance drivers, the full **SEI 6-part quality attribute scenario**, the **Why** (exact rules fired), metrics, tactics/patterns, fitness function, conflicts/reinforces. |
| **Compliance** | Regulations triggered by the context — **25 standards across 8 regulatory areas** (GDPR, HIPAA, PCI-DSS, SOC 2, ISO 27001, DORA, EU AI Act, FedRAMP, …) — each with its control reference and the NFRs it makes mandatory. |
| **Trade-offs** | An N×N **trade-off matrix**; click a conflict cell to prioritize one quality over another; resolved conflicts become ADRs. |
| **Scenarios** | Full **SEI 6-part** quality attribute scenario editor (source / stimulus / artifact / environment / response / measure) with quantified SLOs. |
| **Maturity & Gaps** | Rate current maturity (0–5) vs target per NFR; gap bars; a prioritized remediation **roadmap** (mandatory + severity + gap weighted); owner assignment. |
| **Export** | The **readiness verdict** (score + grade), then `nfrs.yaml` (SLOs, compliance, maturity), `nfrs.md` (governance spec), and trade-off **ADRs**. Also exports/imports the full assessment **state as JSON** for backup or transfer. |

**Applicable NFRs** — each NFR expands to the rule that fired, the SEI scenario + SLO, tactics, and the production signals that verify it:

![Applicable NFRs grouped by ISO 25010 dimension; an expanded NFR shows business impact, the 6-part scenario with its SLO, why it applies, tactics, fitness function, and the observability signals/alerts that verify it in production](docs/screen-applicable.png)

**Export** — the journey ends on a readiness score and grade, then the downloadable artifacts:

![The Export tab opening with the NFR readiness score gauge and grade plus the maturity / compliance / trade-off component breakdown, above the yaml / markdown / ADR export](docs/screen-export.png)

> An earlier p5.js canvas version is archived at tag `v0.1-canvas` / branch `archive/canvas-microsim`.

## How it works

- **`data/nfr-catalog.json`** — the heart. Each NFR has its ISO/arc42 mapping, metrics, tactics, a fitness function, `conflicts_with` / `reinforces` edges, and **relevance rules** (`if dataSensitivity = phi → security +5`). The rules are what make it an *advisor* rather than a catalog.
- **`js/engine.js`** — relevance scoring, ranking, and conflict/reinforce edge computation. Pure, dependency-free.
- State persists across screens via `localStorage`.
- **Observability bridge** — every NFR maps to the signals & alerts that verify it in production, drawn from the companion [cloud-native-observability](https://github.com/gauravs19/cloud-native-observability) catalog (RED/USE/GOLD signal model, page/ticket/watch action, OTel/Prometheus metric names, and the matching alert rule). Expand any NFR in **Applicable NFRs** to see it. This closes the loop: *context → requirement → measurable SLO → the telemetry that proves it.*

```mermaid
flowchart LR
  subgraph A["NFR Advisor — what quality you need"]
    N["Availability NFR<br/>SLO: 99.99%"]
  end
  subgraph B["cloud-native-observability — how you prove it"]
    O["error_rate · slo_compliance<br/>burn-rate alert (page)"]
  end
  N -->|"verify in production"| O
```

## Run locally

It's a static site — serve the folder:

```bash
python -m http.server 8000
# open http://localhost:8000
```

(A static server is needed because the catalog is loaded via `fetch`.)

## Tech

Vanilla JS + semantic HTML tables + CSS. No frameworks, no build step, no external dependencies — works offline and on restricted networks. MIT licensed.

## Roadmap

- LLM-assisted context intake (free-text system description → context profile)
- Emit runnable fitness-function stubs (k6 / axe / ArchUnit / OPA + Prometheus alert rules) from each SLO, grounded in the observability mapping ([#17](https://github.com/gauravs19/nfr-advisor/issues/17))
- Custom catalogs / org-specific NFRs
- ~~Shareable permalinks (encode state in URL)~~ — ✅ shipped (the **Share** button)
