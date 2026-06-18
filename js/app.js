/* NFR Advisor — data-driven single-page app. Tables + trade-off matrix, no canvas. */
(async function () {
  const catalog = await NFR.loadCatalog();
  const tabsEl = document.getElementById("tabs");
  const railEl = document.getElementById("rail");
  const viewEl = document.getElementById("view");

  const VIEWS = [
    { id: "applicable", label: "Applicable NFRs", mount: mountApplicable },
    { id: "tradeoffs",  label: "Trade-offs",      mount: mountTradeoffs },
    { id: "scenarios",  label: "Scenarios",        mount: mountScenarios },
    { id: "export",     label: "Export",           mount: mountExport }
  ];

  let current = null, activeId = "applicable";

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
  switchTo(activeId);

  const esc = s => String(s == null ? "" : s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
  const whyTags = n => (n.fired && n.fired.length)
    ? n.fired.map(f => `<span class="tag">${Object.entries(f.when).map(([k,v]) => esc(k+"="+v)).join(", ")} ${f.weight>=0?"+":""}${f.weight}</span>`).join("")
    : `<span class="hint">base relevance only (+${n.baseScore||0})</span>`;

  // ============================ 1. APPLICABLE NFRs (sortable/filterable table) ============================
  function mountApplicable(host) {
    host.innerHTML = `
      <div class="panel">
        <h2>Applicable NFRs</h2>
        <p class="hint">Ranked for the system context on the left. Importance comes from explicit rules — open a row's <b>Why</b> to see exactly which context facts drove the score. Sort by any column; filter to focus.</p>
        <div class="toolbar">
          <input type="text" id="q" class="grow" placeholder="Filter by name / alias…">
          <select id="cat"><option value="">All categories</option>${catalog.categories.map(c=>`<option value="${c.id}">${esc(c.label)}</option>`).join("")}</select>
          <select id="tier"><option value="">All tiers</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select>
        </div>
        <table class="data"><thead><tr>
          <th data-sort="name">NFR</th>
          <th data-sort="category">Category</th>
          <th data-sort="score">Importance</th>
          <th>ISO 25010</th>
          <th>Why</th>
        </tr></thead><tbody id="tbody"></tbody></table>
      </div>`;
    const tbody = host.querySelector("#tbody");
    const q = host.querySelector("#q"), catSel = host.querySelector("#cat"), tierSel = host.querySelector("#tier");
    let sortKey = "score", sortDir = -1, open = {};

    function rows() {
      let r = NFR.rankNfrs(catalog, NFR.getContext());
      const text = q.value.trim().toLowerCase();
      if (text) r = r.filter(n => (n.name+" "+(n.aliases||[]).join(" ")).toLowerCase().includes(text));
      if (catSel.value) r = r.filter(n => n.category === catSel.value);
      if (tierSel.value) r = r.filter(n => n.tier === tierSel.value);
      r.sort((a,b) => {
        let av = a[sortKey], bv = b[sortKey];
        if (sortKey === "category") { av = NFR.categoryLabel(catalog,a.category); bv = NFR.categoryLabel(catalog,b.category); }
        if (typeof av === "string") return sortDir * av.localeCompare(bv);
        return sortDir * (av - bv);
      });
      return r;
    }
    function render() {
      const maxScore = Math.max(1, ...NFR.rankNfrs(catalog, NFR.getContext()).map(n=>n.score));
      tbody.innerHTML = rows().map(n => {
        const color = NFR.categoryColor(catalog, n.category);
        const main = `<tr class="row-main" data-id="${n.id}">
          <td><b>${esc(n.name)}</b><div class="kv">${(n.aliases||[]).slice(0,2).map(esc).join(", ")}</div></td>
          <td><span class="catdot" style="background:${color}"></span>${esc(NFR.categoryLabel(catalog,n.category))}</td>
          <td><span class="score-bar"><i style="width:${Math.round(n.score/maxScore*100)}%;background:${color}"></i></span><span class="badge ${n.tier}">${n.tier} · ${n.score}</span></td>
          <td class="kv">${esc(n.iso)}</td>
          <td><button class="btn secondary" data-why="${n.id}" style="padding:.2rem .5rem;font-size:.75rem">${open[n.id]?"Hide":"Why"}</button></td>
        </tr>`;
        const detail = open[n.id] ? `<tr class="row-detail"><td colspan="5">
          <div class="why"><b>Why it applies:</b> ${whyTags(n)}</div>
          <h3>Measure</h3><div class="mono">${esc(n.scenarioTemplate.stimulus)} → <b>${esc(n.scenarioTemplate.response)}</b> → <b>${esc(n.scenarioTemplate.measure)}</b></div>
          <h3>Metrics</h3><div class="hint">${n.metrics.map(esc).join(" · ")}</div>
          <h3>Tactics</h3><div class="hint">${n.tactics.map(esc).join(" · ")}</div>
          <h3>Fitness function</h3><div class="mono">${esc(n.fitnessFunction)}</div>
          ${(n.conflicts_with||[]).length?`<h3>Conflicts with</h3>${n.conflicts_with.map(c=>`<span class="tag">${esc(c)}</span>`).join("")}`:""}
        </td></tr>` : "";
        return main + detail;
      }).join("");
      tbody.querySelectorAll("button[data-why]").forEach(b => b.addEventListener("click", e => {
        e.stopPropagation(); const id = b.dataset.why; open[id] = !open[id]; render();
      }));
      tbody.querySelectorAll("tr.row-main").forEach(tr => tr.addEventListener("click", () => { const id = tr.dataset.id; open[id] = !open[id]; render(); }));
    }
    host.querySelectorAll("th[data-sort]").forEach(th => th.addEventListener("click", () => {
      const k = th.dataset.sort; if (sortKey === k) sortDir *= -1; else { sortKey = k; sortDir = (k === "score") ? -1 : 1; }
      host.querySelectorAll("th[data-sort]").forEach(x => { const base = x.textContent.replace(/[ ▲▼]+$/,""); x.innerHTML = base + (x.dataset.sort===sortKey ? ` <span class="arrow">${sortDir<0?"▼":"▲"}</span>` : ""); });
      render();
    }));
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
