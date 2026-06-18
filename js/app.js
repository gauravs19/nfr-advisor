/* NFR Advisor — data-driven single-page app. Tables + trade-off matrix, no canvas. */
(async function () {
  const catalog = await NFR.loadCatalog();
  const tabsEl = document.getElementById("tabs");
  const railEl = document.getElementById("rail");
  const viewEl = document.getElementById("view");

  const VIEWS = [
    { id: "overview",   label: "Overview",         mount: mountOverview },
    { id: "applicable", label: "Applicable NFRs", mount: mountApplicable },
    { id: "tradeoffs",  label: "Trade-offs",      mount: mountTradeoffs },
    { id: "scenarios",  label: "Scenarios",        mount: mountScenarios },
    { id: "export",     label: "Export",           mount: mountExport }
  ];

  let current = null, activeId = "overview";

  const esc = s => String(s == null ? "" : s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
  const whyTags = n => (n.fired && n.fired.length)
    ? n.fired.map(f => `<span class="tag">${Object.entries(f.when).map(([k,v]) => esc(k+"="+v)).join(", ")} ${f.weight>=0?"+":""}${f.weight}</span>`).join("")
    : `<span class="hint">base relevance only (+${n.baseScore||0})</span>`;

  function switchTo(id) {
    activeId = id;
    viewEl.innerHTML = "";
    [...tabsEl.children].forEach(a => a.classList.toggle("active", a.dataset.id === id));
    const v = VIEWS.find(x => x.id === id);
    current = v.mount(viewEl) || null;
  }

  tabsEl.innerHTML = VIEWS.map(v => `<a href="#${v.id}" data-id="${v.id}">${v.label}</a>`).join("");
  tabsEl.querySelectorAll("a").forEach(a => a.addEventListener("click", e => { e.preventDefault(); switchTo(a.dataset.id); }));

  UI.renderContextRail(railEl, catalog, (ctx) => { if (current && current.onContext) current.onContext(ctx); });

  // theme toggle (theme is pre-applied in index.html to avoid flash)
  const themeBtn = document.getElementById("themeToggle");
  function applyThemeIcon() {
    const t = document.documentElement.getAttribute("data-theme") || "dark";
    themeBtn.textContent = t === "dark" ? "☀ Light" : "🌙 Dark";
  }
  themeBtn.addEventListener("click", () => {
    const next = (document.documentElement.getAttribute("data-theme") === "light") ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", next);
    try { localStorage.setItem("nfr-theme", next); } catch (e) { /* ignore */ }
    applyThemeIcon();
  });
  applyThemeIcon();

  // parse an ISO string like "Performance Efficiency > Time Behaviour" into crumb HTML
  function isoCrumb(iso) {
    const parts = String(iso || "").split(">").map(s => s.trim()).filter(Boolean);
    if (!parts.length) return "";
    return parts.map((p, i) => i === parts.length - 1 ? `<b>${esc(p)}</b>` : esc(p)).join(" › ");
  }

  switchTo(activeId);

  // ============================ 0. OVERVIEW (cross-dimension dashboard) ============================
  function mountOverview(host) {
    host.innerHTML = `
      <div class="panel" style="margin-bottom:1rem">
        <h2>Overview</h2>
        <p class="hint">A cross-dimension summary for the current system context. Drill into any tab for detail.</p>
        <div class="stat-grid" id="stats"></div>
      </div>
      <div class="panel" style="margin-bottom:1rem">
        <h2>Coverage by quality dimension</h2>
        <p class="hint">How strongly each ISO/IEC 25010 dimension applies to this system (sum of relevance across its NFRs).</p>
        <div id="dims"></div>
      </div>
      <div class="layout" style="grid-template-columns:1fr 1fr">
        <div class="panel"><h2>Top priorities</h2><div id="top"></div></div>
        <div class="panel"><h2>Open risks (unresolved trade-offs)</h2><div id="risks"></div></div>
      </div>`;
    const statsEl = host.querySelector("#stats"), dimsEl = host.querySelector("#dims"), topEl = host.querySelector("#top"), risksEl = host.querySelector("#risks");

    function render() {
      const ctx = NFR.getContext();
      const all = NFR.rankNfrs(catalog, ctx);
      const relevant = all.filter(n => n.tier !== "low");
      const high = all.filter(n => n.tier === "high"), med = all.filter(n => n.tier === "medium");
      const conflicts = NFR.activeConflicts(all, "medium");
      const pr = NFR.getPriorities();
      const unresolved = conflicts.filter(e => !pr[e.key]);

      statsEl.innerHTML = [
        ["Relevant NFRs", relevant.length, "var(--accent)"],
        ["High importance", high.length, "var(--good)"],
        ["Medium importance", med.length, "var(--warn)"],
        ["Trade-offs", conflicts.length, "var(--accent-2)"],
        ["Unresolved", unresolved.length, unresolved.length ? "var(--bad)" : "var(--good)"]
      ].map(([lbl,num,col]) => `<div class="stat"><div class="num" style="color:${col}">${num}</div><div class="lbl">${lbl}</div></div>`).join("");

      const byCat = {};
      catalog.categories.forEach(c => byCat[c.id] = { label: c.label, color: c.color, sum: 0, count: 0 });
      all.forEach(n => { const b = byCat[n.category]; if (!b) return; b.sum += n.relevance; if (n.tier !== "low") b.count++; });
      const maxSum = Math.max(0.001, ...Object.values(byCat).map(b => b.sum));
      dimsEl.innerHTML = Object.values(byCat).sort((a,b)=>b.sum-a.sum).map(b => `
        <div class="dim-row">
          <div class="dim-name"><span class="catdot" style="background:${b.color}"></span>${esc(b.label)}</div>
          <div class="meter"><i style="width:${Math.round(b.sum/maxSum*100)}%;background:${b.color}"></i></div>
          <div class="dim-count">${b.count} NFR${b.count===1?"":"s"}</div>
        </div>`).join("");

      topEl.innerHTML = relevant.length
        ? `<table class="tt"><tbody>${relevant.slice(0,6).map(n=>`<tr><td><b>${esc(n.name)}</b></td><td style="text-align:right"><span class="badge ${n.tier}">${n.tier} · ${n.score}</span></td></tr>`).join("")}</tbody></table>`
        : `<p class="hint">No high/medium NFRs for this context.</p>`;

      risksEl.innerHTML = unresolved.length
        ? `<table class="tt"><tbody>${unresolved.map(e=>`<tr><td>${esc(e.a.name)} ↔ ${esc(e.b.name)}</td><td style="text-align:right"><span class="pill conflict">unresolved</span></td></tr>`).join("")}</tbody></table><p class="hint" style="margin-top:.5rem">Resolve these on the <b>Trade-offs</b> tab.</p>`
        : (conflicts.length ? `<p class="hint">All ${conflicts.length} trade-offs resolved. ✓</p>` : `<p class="hint">No trade-off tensions for this context.</p>`);
    }
    render();
    return { onContext: render };
  }

  // ============================ 1. APPLICABLE NFRs (grouped by dimension → subsections) ============================
  function mountApplicable(host) {
    host.innerHTML = `
      <div class="panel">
        <h2>Applicable NFRs</h2>
        <p class="hint">Grouped by ISO/IEC 25010 quality dimension and ranked within each. Click a dimension to collapse it; click an NFR to expand its full detail — including the exact rules that drove its importance (no black box).</p>
        <div class="toolbar">
          <input type="text" id="q" class="grow" placeholder="Filter by name / alias…">
          <select id="cat"><option value="">All dimensions</option>${catalog.categories.map(c=>`<option value="${c.id}">${esc(c.label)}</option>`).join("")}</select>
          <select id="tier"><option value="">All tiers</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select>
          <button class="btn secondary" id="expandAll">Expand all</button>
        </div>
        <div id="groups"></div>
      </div>`;
    const groupsEl = host.querySelector("#groups");
    const q = host.querySelector("#q"), catSel = host.querySelector("#cat"), tierSel = host.querySelector("#tier"), expandBtn = host.querySelector("#expandAll");
    const collapsed = {}, openSub = {};
    let allOpen = false;

    function filtered() {
      let r = NFR.rankNfrs(catalog, NFR.getContext());
      const text = q.value.trim().toLowerCase();
      if (text) r = r.filter(n => (n.name+" "+(n.aliases||[]).join(" ")).toLowerCase().includes(text));
      if (catSel.value) r = r.filter(n => n.category === catSel.value);
      if (tierSel.value) r = r.filter(n => n.tier === tierSel.value);
      return r;
    }
    function subDetail(n) {
      return `<div class="sub-detail">
        <div class="iso-crumb">ISO/IEC 25010: ${isoCrumb(n.iso)}</div>
        <h4>Why it applies</h4><div class="why">${whyTags(n)}</div>
        <h4>Measurable scenario</h4><div class="mono">${esc(n.scenarioTemplate.stimulus)} → <b>${esc(n.scenarioTemplate.response)}</b> → <b>${esc(n.scenarioTemplate.measure)}</b></div>
        <h4>Metrics</h4><div class="hint">${n.metrics.map(esc).join(" · ")}</div>
        <h4>Tactics</h4><div class="hint">${n.tactics.map(esc).join(" · ")}</div>
        <h4>Fitness function</h4><div class="mono">${esc(n.fitnessFunction)}</div>
        ${(n.conflicts_with||[]).length?`<h4>Conflicts with</h4>${n.conflicts_with.map(c=>`<span class="tag">${esc(c)}</span>`).join("")}`:""}
        ${(n.reinforces||[]).length?`<h4>Reinforces</h4>${n.reinforces.map(c=>`<span class="tag">${esc(c)}</span>`).join("")}`:""}
      </div>`;
    }
    function render() {
      const rows = filtered();
      const cats = catalog.categories.map(c => Object.assign({}, c, { items: rows.filter(n => n.category === c.id) }))
        .filter(c => c.items.length)
        .sort((a,b) => Math.max.apply(null, b.items.map(n=>n.score)) - Math.max.apply(null, a.items.map(n=>n.score)));
      if (!cats.length) { groupsEl.innerHTML = `<p class="hint">No NFRs match the current filters.</p>`; return; }
      groupsEl.innerHTML = cats.map(c => {
        const isCol = collapsed[c.id];
        const tiers = { high:0, medium:0, low:0 }; c.items.forEach(n => tiers[n.tier]++);
        const meta = `${c.items.length} NFR${c.items.length===1?"":"s"} · ${tiers.high} high / ${tiers.medium} med`;
        const subs = c.items.map(n => {
          const isOpen = allOpen || openSub[n.id];
          return `<div class="subsection">
            <div class="sub-head" data-sub="${n.id}">
              <span class="chev" style="${isOpen?'':'transform:rotate(-90deg)'}">▾</span>
              <span class="sub-name">${esc(n.name)}</span>
              <span class="badge ${n.tier}">${n.tier} · ${n.score}</span>
              <span class="iso-crumb" style="margin-left:auto">${(n.aliases||[]).slice(0,2).map(esc).join(", ")}</span>
            </div>
            ${isOpen ? subDetail(n) : ""}
          </div>`;
        }).join("");
        return `<div class="section ${isCol?'collapsed':''}">
          <div class="section-head" data-cat="${c.id}">
            <span class="chev">▾</span><span class="catdot" style="background:${c.color}"></span>
            <span class="s-title">${esc(c.label)}</span><span class="s-meta">${meta}</span>
          </div>
          <div class="section-body">${subs}</div>
        </div>`;
      }).join("");
      groupsEl.querySelectorAll(".section-head").forEach(h => h.addEventListener("click", () => { const id=h.dataset.cat; collapsed[id]=!collapsed[id]; render(); }));
      groupsEl.querySelectorAll(".sub-head").forEach(h => h.addEventListener("click", () => { const id=h.dataset.sub; openSub[id]=!openSub[id]; allOpen=false; render(); }));
    }
    expandBtn.addEventListener("click", () => { allOpen = !allOpen; expandBtn.textContent = allOpen ? "Collapse all" : "Expand all"; render(); });
    [q, catSel, tierSel].forEach(el => el.addEventListener("input", render));
    render();
    return { onContext: render };
  }

  // ============================ 2. TRADE-OFFS (matrix + resolution list) ============================
  function mountTradeoffs(host) {
    host.innerHTML = `
      <div class="panel" style="margin-bottom:1rem">
        <h2>Trade-off matrix</h2>
        <p class="hint">Relevant NFRs (medium+). A red cell is a conflict, green is reinforcing. Click a conflict cell to prioritize the <b>row</b> NFR over the <b>column</b> NFR — the cell turns green on the winning side. Each resolved conflict becomes an ADR on export.</p>
        <div style="overflow:auto" id="matrixWrap"></div>
        <div class="legend">
          <span><span class="dot" style="background:#3a1212"></span>conflict (unresolved)</span>
          <span><span class="dot" style="background:#14532d"></span>resolved (row wins)</span>
          <span><span class="dot" style="background:#14361f"></span>reinforce</span>
        </div>
      </div>
      <div class="panel"><h2>Conflicts &amp; decisions</h2><div id="list"></div></div>`;
    const matrixWrap = host.querySelector("#matrixWrap");
    const listEl = host.querySelector("#list");

    const TENSION = {
      "consistency::latency":"Strong consistency adds coordination latency (CAP/PACELC).",
      "latency::scalability":"Some scale-out patterns add network hops.",
      "availability::cost-efficiency":"Redundancy for uptime costs idle capacity.",
      "availability::consistency":"Partition tolerance forces a choice (CAP).",
      "consistency::scalability":"Sharding/replication weakens global consistency.",
      "auditability::latency":"Synchronous audit writes add to the hot path.",
      "confidentiality::latency":"Encryption / extra hops cost time.",
      "confidentiality::learnability":"Stricter security adds user friction.",
      "authz::learnability":"More auth steps reduce ease of use.",
      "integrity::latency":"Validation & signing add per-request work.",
      "latency::modularity":"Indirection layers can cost latency.",
      "latency::modifiability":"Abstractions for change can cost latency.",
      "cost-efficiency::recoverability":"DR replicas cost money.",
      "latency::portability":"Portability abstractions can cost latency."
    };
    const tension = (a,b) => TENSION[[a,b].sort().join("::")] || "These qualities pull the design in opposite directions.";
    const keyOf = (a,b) => [a,b].sort().join("::");

    function relationship(a, b) {
      const conf = (a.conflicts_with||[]).includes(b.id) || (b.conflicts_with||[]).includes(a.id);
      if (conf) return "conflict";
      const rein = (a.reinforces||[]).includes(b.id) || (b.reinforces||[]).includes(a.id);
      if (rein) return "reinforce";
      return "";
    }

    function render() {
      const ranked = NFR.rankNfrs(catalog, NFR.getContext()).filter(n => n.tier !== "low");
      const pr = NFR.getPriorities();
      if (ranked.length < 2) { matrixWrap.innerHTML = `<p class="hint">Need at least two relevant NFRs to compare. Adjust the context.</p>`; listEl.innerHTML = ""; return; }

      // matrix
      let html = `<table class="matrix"><thead><tr><th class="rh"></th>` +
        ranked.map((n,i)=>`<th class="ch" title="${esc(n.name)}">${i+1}</th>`).join("") + `</tr></thead><tbody>`;
      ranked.forEach((rowN, ri) => {
        html += `<tr><th class="rh" title="${esc(rowN.name)}">${ri+1} · ${esc(rowN.name)}</th>`;
        ranked.forEach((colN, ci) => {
          if (ri === ci) { html += `<td class="self">—</td>`; return; }
          const rel = relationship(rowN, colN);
          if (rel === "conflict") {
            const w = pr[keyOf(rowN.id, colN.id)];
            const cls = w ? (w === rowN.id ? "win" : "lose") : "";
            const mark = w ? (w === rowN.id ? "✓" : "·") : "✕";
            html += `<td class="conflict ${cls}" data-row="${rowN.id}" data-col="${colN.id}" title="${esc(rowN.name)} ↔ ${esc(colN.name)}">${mark}</td>`;
          } else if (rel === "reinforce") {
            html += `<td class="reinforce" title="reinforces">+</td>`;
          } else { html += `<td></td>`; }
        });
        html += `</tr>`;
      });
      html += `</tbody></table>`;
      matrixWrap.innerHTML = html;
      matrixWrap.querySelectorAll("td.conflict").forEach(td => td.addEventListener("click", () => {
        NFR.setPriority(keyOf(td.dataset.row, td.dataset.col), td.dataset.row); render();
      }));

      // list
      const conflicts = NFR.activeConflicts(NFR.rankNfrs(catalog, NFR.getContext()), "medium");
      if (!conflicts.length) { listEl.innerHTML = `<p class="hint">No active conflicts for this context. Try raising availability target, data sensitivity, or latency sensitivity.</p>`; return; }
      listEl.innerHTML = `<table class="tt"><thead><tr><th>Trade-off</th><th>Tension</th><th>Decision</th></tr></thead><tbody>` +
        conflicts.map(e => {
          const w = pr[e.key];
          const status = w ? `<span class="pill resolved">prioritized: ${esc(w===e.a.id?e.a.name:e.b.name)}</span>` : `<span class="pill conflict">unresolved</span>`;
          return `<tr><td><b>${esc(e.a.name)}</b> ↔ <b>${esc(e.b.name)}</b><br>${status}</td>
            <td class="hint">${esc(tension(e.a.id,e.b.id))}</td>
            <td><button class="btn ${w===e.a.id?'':'secondary'}" data-key="${e.key}" data-win="${e.a.id}">${esc(e.a.name)}</button>
                <button class="btn ${w===e.b.id?'':'secondary'}" data-key="${e.key}" data-win="${e.b.id}">${esc(e.b.name)}</button></td></tr>`;
        }).join("") + `</tbody></table>`;
      listEl.querySelectorAll("button[data-key]").forEach(b => b.addEventListener("click", () => { NFR.setPriority(b.dataset.key, b.dataset.win); render(); }));
    }
    render();
    return { onContext: render };
  }

  // ============================ 3. SCENARIOS ============================
  function mountScenarios(host) {
    host.innerHTML = `<div class="panel"><h2>Scenario editor</h2>
      <p class="hint">Each relevant NFR becomes a measurable quality scenario — stimulus → response → measure. Edit the measures to your real targets; they're saved and flow into the export.</p>
      <div id="scenarios"></div></div>`;
    const wrap = host.querySelector("#scenarios");
    function render() {
      const ranked = NFR.rankNfrs(catalog, NFR.getContext()).filter(n => n.tier !== "low");
      const saved = NFR.getScenarios();
      if (!ranked.length) { wrap.innerHTML = `<p class="hint">No medium/high relevance NFRs for this context yet.</p>`; return; }
      wrap.innerHTML = ranked.map(n => {
        const s = saved[n.id] || n.scenarioTemplate; const color = NFR.categoryColor(catalog,n.category);
        return `<div class="nfr-card" style="border-left-color:${color};margin-bottom:.7rem">
          <div class="row"><div class="name">${esc(n.name)}</div><span class="badge ${n.tier}">${n.tier}</span></div>
          <div class="control"><label>Stimulus</label><input type="text" data-id="${n.id}" data-f="stimulus" value="${esc(s.stimulus)}"></div>
          <div class="control"><label>Response</label><input type="text" data-id="${n.id}" data-f="response" value="${esc(s.response)}"></div>
          <div class="control"><label>Measure (acceptance)</label><input type="text" data-id="${n.id}" data-f="measure" value="${esc(s.measure)}"></div>
          <div class="kv">Fitness function: <span class="mono">${esc(n.fitnessFunction)}</span></div></div>`;
      }).join("");
      wrap.querySelectorAll("input[data-id]").forEach(inp => inp.addEventListener("change", () => {
        const id=inp.dataset.id, f=inp.dataset.f;
        const cur = NFR.getScenarios()[id] || Object.assign({}, (catalog.nfrs.find(x=>x.id===id)||{}).scenarioTemplate);
        cur[f] = inp.value; NFR.setScenario(id, cur);
      }));
    }
    render();
    return { onContext: render };
  }

  // ============================ 4. EXPORT ============================
  function mountExport(host) {
    host.innerHTML = `
      <div class="panel" style="margin-bottom:1rem">
        <h2>Export</h2>
        <p class="hint"><b>nfrs.yaml</b> is machine-readable; <b>nfrs.md</b> is the human spec; <b>ADRs</b> capture each resolved trade-off.</p>
        <div class="row">
          <div class="seg" style="max-width:360px">
            <button class="active" data-tab="yaml">nfrs.yaml</button><button data-tab="md">nfrs.md</button><button data-tab="adr">ADRs</button>
          </div>
          <span class="spacer"></span>
          <button class="btn secondary" id="copyBtn">Copy</button><button class="btn" id="dlBtn">Download</button>
        </div>
      </div>
      <pre class="export" id="out"></pre>`;
    const out = host.querySelector("#out");
    let tab = "yaml";
    const yEsc = s => /[:#{}\[\],&*?|<>=!%@`"']/.test(s) ? JSON.stringify(s) : s;
    function gather() {
      const ctx = NFR.getContext();
      const all = NFR.rankNfrs(catalog, ctx);
      const ranked = all.filter(n => n.tier !== "low");
      const scenarios = NFR.getScenarios(), priorities = NFR.getPriorities();
      const conflicts = NFR.activeConflicts(all, "medium");
      ranked.forEach(n => n.scenario = scenarios[n.id] || n.scenarioTemplate);
      return { ctx, ranked, conflicts, priorities };
    }
    function toYaml() {
      const { ctx, ranked, conflicts, priorities } = gather();
      let y = "# Generated by NFR Advisor — ISO/IEC 25010, arc42 Q42, ATAM\ncontext:\n";
      Object.keys(ctx).forEach(k => y += `  ${k}: ${yEsc(String(ctx[k]))}\n`);
      y += "nfrs:\n";
      ranked.forEach(n => {
        y += `  - id: ${n.id}\n    name: ${yEsc(n.name)}\n    category: ${n.category}\n    iso: ${yEsc(n.iso)}\n    importance: ${n.tier}\n    score: ${n.score}\n`;
        y += `    scenario:\n      stimulus: ${yEsc(n.scenario.stimulus)}\n      response: ${yEsc(n.scenario.response)}\n      measure: ${yEsc(n.scenario.measure)}\n`;
        y += `    fitness_function: ${yEsc(n.fitnessFunction)}\n    tactics:\n`;
        n.tactics.forEach(t => y += `      - ${yEsc(t)}\n`);
      });
      y += "tradeoffs:\n"; if (!conflicts.length) y += "  []\n";
      conflicts.forEach(e => { const w = priorities[e.key]; y += `  - between: [${e.a.id}, ${e.b.id}]\n    resolution: ${w?("prioritize "+w):"UNRESOLVED"}\n`; });
      return y;
    }
    function toMd() {
      const { ctx, ranked, conflicts, priorities } = gather();
      let m = "# Non-Functional Requirements\n\n_Generated by NFR Advisor — ISO/IEC 25010, arc42 Q42, ATAM._\n\n## System context\n\n| Dimension | Value |\n|---|---|\n";
      Object.keys(ctx).forEach(k => m += `| ${k} | ${ctx[k]} |\n`);
      m += "\n## Quality requirements (by importance)\n\n";
      ["high","medium"].forEach(tier => {
        const g = ranked.filter(n => n.tier === tier); if (!g.length) return;
        m += `### ${tier==="high"?"High importance":"Medium importance"}\n\n`;
        g.forEach(n => { m += `#### ${n.name}\n- **ISO 25010:** ${n.iso}\n- **Scenario:** ${n.scenario.stimulus} → ${n.scenario.response}\n- **Measure:** ${n.scenario.measure}\n- **Tactics:** ${n.tactics.join("; ")}\n- **Verify:** ${n.fitnessFunction}\n\n`; });
      });
      m += "## Trade-offs\n\n"; if (!conflicts.length) m += "_No active conflicts among selected NFRs._\n";
      conflicts.forEach(e => { const w = priorities[e.key]; m += `- **${e.a.name} ↔ ${e.b.name}** — ${w?("prioritize **"+(w===e.a.id?e.a.name:e.b.name)+"**"):"_unresolved_"}\n`; });
      return m;
    }
    function toAdr() {
      const { ctx, conflicts, priorities } = gather();
      if (!conflicts.length) return "# No trade-off ADRs\n\nNo conflicts among the selected NFRs for this context.\n";
      return conflicts.map((e,i) => {
        const w = priorities[e.key], num = String(i+1).padStart(4,"0");
        const winner = w?(w===e.a.id?e.a:e.b):null, loser = w?(w===e.a.id?e.b:e.a):null;
        return `# ADR-${num}: Trade-off between ${e.a.name} and ${e.b.name}\n\n## Status\n${w?"Accepted":"Proposed (UNRESOLVED)"}\n\n## Context\nFor a ${ctx.domain} system at ${ctx.userScale} scale (availability ${ctx.availabilityTarget}%, data ${ctx.dataSensitivity}), **${e.a.name}** and **${e.b.name}** are both relevant but conflict.\n\n## Decision\n${w?`Prioritize **${winner.name}** over **${loser.name}** where they conflict.`:"_Not yet decided._"}\n\n## Consequences\n${w?`- Favour tactics for ${winner.name}: ${winner.tactics.slice(0,3).join("; ")}.\n- Accept reduced ${loser.name}; mitigate via: ${loser.tactics.slice(0,2).join("; ")}.\n- Watch: ${winner.scenarioTemplate.measure}.`:"- Pending decision."}\n`;
      }).join("\n---\n\n");
    }
    const content = () => tab==="yaml"?toYaml():tab==="md"?toMd():toAdr();
    const filename = () => tab==="yaml"?"nfrs.yaml":tab==="md"?"nfrs.md":"adr-tradeoffs.md";
    const render = () => out.textContent = content();
    host.querySelectorAll("button[data-tab]").forEach(b => b.addEventListener("click", () => {
      host.querySelectorAll("button[data-tab]").forEach(x => x.classList.remove("active")); b.classList.add("active"); tab = b.dataset.tab; render();
    }));
    host.querySelector("#copyBtn").addEventListener("click", () => { navigator.clipboard.writeText(content()); const btn=host.querySelector("#copyBtn"); const t=btn.textContent; btn.textContent="Copied!"; setTimeout(()=>btn.textContent=t,1200); });
    host.querySelector("#dlBtn").addEventListener("click", () => { const blob=new Blob([content()],{type:"text/plain"}); const a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download=filename(); a.click(); URL.revokeObjectURL(a.href); });
    render();
    return { onContext: render };
  }
})();
