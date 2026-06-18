/* NFR Advisor — single-page app. One context rail, views as tabs. */
(async function () {
  const catalog = await NFR.loadCatalog();
  const tabsEl = document.getElementById("tabs");
  const railEl = document.getElementById("rail");
  const viewEl = document.getElementById("view");

  const VIEWS = [
    { id: "relevance", label: "Relevance", mount: mountRelevance },
    { id: "tradeoffs", label: "Trade-offs", mount: mountTradeoffs },
    { id: "tree",      label: "Utility Tree", mount: mountTree },
    { id: "scenarios", label: "Scenarios", mount: mountScenarios },
    { id: "export",    label: "Export", mount: mountExport }
  ];

  let p5inst = null;          // current p5 sketch (if any)
  let current = null;         // { onContext(ctx) }
  let activeId = "relevance";

  function clearP5() { if (p5inst) { p5inst.remove(); p5inst = null; } }

  function switchTo(id) {
    activeId = id;
    clearP5();
    viewEl.innerHTML = "";
    [...tabsEl.children].forEach(a => a.classList.toggle("active", a.dataset.id === id));
    const v = VIEWS.find(x => x.id === id);
    current = v.mount(viewEl) || null;
  }

  // tabs
  tabsEl.innerHTML = VIEWS.map(v => `<a href="#${v.id}" data-id="${v.id}">${v.label}</a>`).join("");
  tabsEl.querySelectorAll("a").forEach(a =>
    a.addEventListener("click", e => { e.preventDefault(); switchTo(a.dataset.id); }));

  // rail (persistent). On any context change, notify the active view.
  UI.renderContextRail(railEl, catalog, (ctx) => { if (current && current.onContext) current.onContext(ctx); });

  switchTo(activeId);

  // ============================ VIEWS ============================

  // ---- 1. Relevance Canvas ----
  function mountRelevance(host) {
    host.innerHTML = `
      <div class="panel" style="margin-bottom:1rem">
        <h2>Relevance Canvas</h2>
        <p class="hint">NFR nodes animate, resizing & re-ranking by relevance for the context on the left. Red links = trade-off conflicts, green = reinforcing. Click a node for detail.</p>
        <div class="canvas-host" id="host"></div>
        <div class="legend" id="legend"></div>
      </div>
      <div class="panel" id="detailPanel"><h2>Detail</h2><p class="hint">Click a node to see why it applies, how to measure it, and which tactics realize it.</p></div>`;
    const hostEl = host.querySelector("#host");
    const detailPanel = host.querySelector("#detailPanel");
    const legendEl = host.querySelector("#legend");
    let nodes = [], edges = [], selectedId = null, W = 800, H = 520;

    function layout(ranked) {
      const cols = 4, cellW = W / cols, rows = Math.ceil(ranked.length / cols), cellH = (H - 20) / rows;
      ranked.forEach((n, i) => {
        const c = i % cols, r = Math.floor(i / cols);
        n.tx = cellW * c + cellW / 2; n.ty = cellH * r + cellH / 2 + 10; n.tr = 16 + n.relevance * 34;
      });
      return ranked;
    }
    function rebuild(ctx) {
      const ranked = layout(NFR.rankNfrs(catalog, ctx));
      const prev = {}; nodes.forEach(n => prev[n.id] = n);
      nodes = ranked.map(r => {
        const p = prev[r.id];
        return Object.assign(r, { x: p ? p.x : r.tx + Math.sin(r.id.length) * 40, y: p ? p.y : r.ty, rad: p ? p.rad : 4 });
      });
      const conf = NFR.activeConflicts(ranked, "medium"), rein = NFR.reinforceEdges(ranked, "medium");
      edges = conf.map(e => ({ a: e.a.id, b: e.b.id, type: "conflict" }))
        .concat(rein.map(e => ({ a: e.a.id, b: e.b.id, type: "reinforce" })));
      legendEl.innerHTML = catalog.categories.map(c => `<span><span class="dot" style="background:${c.color}"></span>${c.label}</span>`).join("")
        + `<span><span class="dot" style="background:#ef4444"></span>conflict</span><span><span class="dot" style="background:#22c55e"></span>reinforce</span>`;
    }
    function showDetail(n) {
      const fired = (n.fired && n.fired.length)
        ? n.fired.map(f => `<span class="tag">${Object.entries(f.when).map(([k,v]) => k+"="+v).join(", ")} → +${f.weight}</span>`).join("")
        : `<span class="hint">base relevance only</span>`;
      detailPanel.innerHTML = `
        <h2 style="border-left:5px solid ${NFR.categoryColor(catalog,n.category)};padding-left:.5rem">${n.name}</h2>
        <div class="detail-card">
          <span class="tag">${NFR.categoryLabel(catalog,n.category)}</span>
          <span class="tag tier-${n.tier}">${n.tier.toUpperCase()} · score ${n.score}</span>
          <span class="tag">ISO: ${n.iso}</span>
          <h3>Why it applies</h3>${fired}
          <h3>How to measure</h3><div class="mono">${n.scenarioTemplate.stimulus} → <b>${n.scenarioTemplate.response}</b> → <b>${n.scenarioTemplate.measure}</b></div>
          <h3>Metrics</h3><ul>${n.metrics.map(m=>`<li>${m}</li>`).join("")}</ul>
          <h3>Tactics</h3><ul>${n.tactics.map(t=>`<li>${t}</li>`).join("")}</ul>
          <h3>Fitness function</h3><div class="mono">${n.fitnessFunction}</div>
          ${(n.conflicts_with||[]).length?`<h3>Conflicts with</h3>${n.conflicts_with.map(c=>`<span class="tag">${c}</span>`).join("")}`:""}
        </div>`;
    }

    p5inst = new p5(function (p) {
      p.setup = function () { W = Math.min(hostEl.clientWidth || 800, 1000); H = 520; p.createCanvas(W, H).parent(hostEl); rebuild(NFR.getContext()); };
      p.windowResized = function () { W = Math.min(hostEl.clientWidth || 800, 1000); p.resizeCanvas(W, H); rebuild(NFR.getContext()); };
      p.draw = function () {
        p.background(11,18,32);
        const byId = {}; nodes.forEach(n => byId[n.id] = n);
        nodes.forEach(n => { n.x += (n.tx-n.x)*0.12; n.y += (n.ty-n.y)*0.12; n.rad += (n.tr-n.rad)*0.12; });
        edges.forEach(e => {
          const a = byId[e.a], b = byId[e.b]; if (!a||!b) return;
          if (e.type==="conflict"){ p.stroke(239,68,68,150); p.strokeWeight(1.6);} else { p.stroke(34,197,94,90); p.strokeWeight(1.2);}
          p.line(a.x,a.y,b.x,b.y);
        });
        nodes.forEach(n => {
          const col = p.color(NFR.categoryColor(catalog,n.category)); const sel = n.id===selectedId;
          p.noStroke(); if (sel){ p.stroke(255); p.strokeWeight(2);} col.setAlpha(n.tier==="low"?110:235); p.fill(col);
          p.circle(n.x,n.y,n.rad*2); p.noStroke(); p.fill(n.tier==="low"?150:235);
          p.textAlign(p.CENTER,p.CENTER); p.textSize(n.rad>26?11:9);
          p.text(n.name.length>18?n.name.slice(0,16)+"…":n.name, n.x, n.y+n.rad+9);
        });
      };
      p.mousePressed = function () {
        if (p.mouseX<0||p.mouseX>W||p.mouseY<0||p.mouseY>H) return;
        let hit=null; nodes.forEach(n=>{ if (p.dist(p.mouseX,p.mouseY,n.x,n.y)<=n.rad) hit=n; });
        if (hit){ selectedId=hit.id; showDetail(hit); }
      };
    });
    return { onContext: rebuild };
  }

  // ---- 2. Trade-offs ----
  function mountTradeoffs(host) {
    host.innerHTML = `
      <div class="panel" style="margin-bottom:1rem">
        <h2>Trade-off graph</h2>
        <p class="hint">Conflicts between currently-relevant NFRs. A red edge is unresolved; resolve it below by choosing which quality wins — that becomes an ADR on export.</p>
        <div class="canvas-host" id="host"></div>
      </div>
      <div class="panel"><h2>Resolve trade-offs</h2><div id="edges"></div></div>`;
    const hostEl = host.querySelector("#host");
    const edgesEl = host.querySelector("#edges");
    let ranked = [], conflicts = [], nodes = [], W = 800, H = 440;

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
    function tension(a,b){ return TENSION[[a,b].sort().join("::")] || "These qualities pull the design in opposite directions."; }

    function rebuild(ctx) {
      const all = NFR.rankNfrs(catalog, ctx);
      ranked = all.filter(n => n.tier !== "low");
      conflicts = NFR.activeConflicts(all, "medium");
      const cx = W/2, cy = H/2, R = Math.min(W,H)/2 - 60;
      nodes = ranked.map((n,i) => { const ang=(i/ranked.length)*Math.PI*2-Math.PI/2; return Object.assign(n,{x:cx+Math.cos(ang)*R,y:cy+Math.sin(ang)*R}); });
      renderEdges();
    }
    function renderEdges() {
      const pr = NFR.getPriorities();
      if (!conflicts.length) { edgesEl.innerHTML = `<p class="hint">No active conflicts for this context. Try raising availability target, data sensitivity, or latency sensitivity to surface tensions.</p>`; return; }
      edgesEl.innerHTML = `<table class="tt"><thead><tr><th>Trade-off</th><th>Tension</th><th>Decision</th></tr></thead><tbody>` +
        conflicts.map(e => {
          const w = pr[e.key];
          const status = w ? `<span class="pill resolved">prioritized: ${w===e.a.id?e.a.name:e.b.name}</span>` : `<span class="pill conflict">unresolved</span>`;
          return `<tr><td><b>${e.a.name}</b> ↔ <b>${e.b.name}</b><br>${status}</td>
            <td class="hint">${tension(e.a.id,e.b.id)}</td>
            <td><button class="btn ${w===e.a.id?'':'secondary'}" data-key="${e.key}" data-win="${e.a.id}">${e.a.name}</button>
                <button class="btn ${w===e.b.id?'':'secondary'}" data-key="${e.key}" data-win="${e.b.id}">${e.b.name}</button></td></tr>`;
        }).join("") + `</tbody></table>`;
      edgesEl.querySelectorAll("button[data-key]").forEach(b => b.addEventListener("click", () => { NFR.setPriority(b.dataset.key, b.dataset.win); renderEdges(); }));
    }

    p5inst = new p5(function (p) {
      p.setup = function () { W = Math.min(hostEl.clientWidth||800,900); H=440; p.createCanvas(W,H).parent(hostEl); rebuild(NFR.getContext()); };
      p.windowResized = function () { W = Math.min(hostEl.clientWidth||800,900); p.resizeCanvas(W,H); rebuild(NFR.getContext()); };
      p.draw = function () {
        p.background(11,18,32); const pr = NFR.getPriorities(); const byId={}; nodes.forEach(n=>byId[n.id]=n);
        conflicts.forEach(e => { const a=byId[e.a.id],b=byId[e.b.id]; if(!a||!b)return;
          if (pr[e.key]){ p.stroke(34,197,94,160); p.strokeWeight(1.6);} else { p.stroke(239,68,68,170); p.strokeWeight(2.2);} p.line(a.x,a.y,b.x,b.y); });
        nodes.forEach(n => { const col=p.color(NFR.categoryColor(catalog,n.category)); col.setAlpha(235); p.fill(col); p.noStroke();
          p.circle(n.x,n.y,26); p.fill(230); p.textAlign(p.CENTER,p.CENTER); p.textSize(9);
          p.text(n.name.length>16?n.name.slice(0,14)+"…":n.name, n.x, n.y+22); });
      };
    });
    return { onContext: rebuild };
  }

  // ---- 3. Utility Tree ----
  function mountTree(host) {
    host.innerHTML = `
      <div class="panel">
        <h2>Utility tree</h2>
        <p class="hint">ATAM-style decomposition: Utility → quality attributes → relevant NFRs as leaves, ranked by importance.</p>
        <div class="canvas-host" id="host"></div>
        <div class="legend"><span><span class="dot" style="background:#22c55e"></span>High importance</span><span><span class="dot" style="background:#eab308"></span>Medium importance</span></div>
      </div>`;
    const hostEl = host.querySelector("#host");
    let tree = null, W = 820, H = 540;
    function build(ctx) {
      const ranked = NFR.rankNfrs(catalog, ctx).filter(n => n.tier !== "low");
      const byCat = {}; ranked.forEach(n => (byCat[n.category]=byCat[n.category]||[]).push(n));
      const cats = Object.keys(byCat).map(catId => ({ id:catId, label:NFR.categoryLabel(catalog,catId), color:NFR.categoryColor(catalog,catId), leaves:byCat[catId].sort((a,b)=>b.score-a.score) }));
      tree = { cats, totalLeaves: ranked.length || 1 }; layout();
    }
    function layout() {
      if (!tree) return;
      const xCat = W*0.36, xLeaf = W*0.62; let i=0; const gap=(H-40)/tree.totalLeaves;
      tree.cats.forEach(cat => { const start=i; cat.leaves.forEach(l => { l.x=xLeaf; l.y=20+gap*(i+0.5); i++; });
        cat.x=xCat; cat.y = cat.leaves.length ? (cat.leaves[0].y+cat.leaves[cat.leaves.length-1].y)/2 : 20+gap*(start+0.5); });
      tree.rootX=60; tree.rootY=H/2;
    }
    p5inst = new p5(function (p) {
      p.setup = function () { W=Math.min(hostEl.clientWidth||820,980); H=540; p.createCanvas(W,H).parent(hostEl); build(NFR.getContext()); };
      p.windowResized = function () { W=Math.min(hostEl.clientWidth||820,980); p.resizeCanvas(W,H); build(NFR.getContext()); };
      p.draw = function () {
        p.background(11,18,32); if (!tree) return;
        p.stroke(80,100,130); p.strokeWeight(1.4); tree.cats.forEach(c=>p.line(tree.rootX+8,tree.rootY,c.x-4,c.y));
        tree.cats.forEach(cat => cat.leaves.forEach(l => { const c=p.color(cat.color); c.setAlpha(150); p.stroke(c); p.strokeWeight(1.2); p.line(cat.x+4,cat.y,l.x-4,l.y); }));
        p.noStroke(); p.fill(56,189,248); p.rectMode(p.CENTER); p.rect(tree.rootX,tree.rootY,70,30,6);
        p.fill(4,38,58); p.textAlign(p.CENTER,p.CENTER); p.textSize(12); p.text("Utility",tree.rootX,tree.rootY);
        tree.cats.forEach(cat => { p.fill(cat.color); p.rect(cat.x,cat.y,14,14,3); p.fill(220); p.textAlign(p.LEFT,p.CENTER); p.textSize(11); p.text(cat.label,cat.x+14,cat.y); });
        tree.cats.forEach(cat => cat.leaves.forEach(l => { const t=l.tier==="high"?p.color(34,197,94):p.color(234,179,8); p.fill(t); p.noStroke(); p.circle(l.x,l.y,11);
          p.fill(210); p.textAlign(p.LEFT,p.CENTER); p.textSize(10); const m=l.scenarioTemplate.measure; p.text(l.name+"  —  "+(m.length>34?m.slice(0,32)+"…":m), l.x+10, l.y); }));
      };
    });
    return { onContext: build };
  }

  // ---- 4. Scenarios ----
  function mountScenarios(host) {
    host.innerHTML = `<div class="panel"><h2>Scenario editor</h2>
      <p class="hint">Each relevant NFR becomes a measurable quality scenario — stimulus → response → measure. Edit the measures to your real targets; they're saved and flow into the export.</p>
      <div id="scenarios"></div></div>`;
    const wrap = host.querySelector("#scenarios");
    const esc = s => (s||"").replace(/"/g,"&quot;");
    function render(ctx) {
      const ranked = NFR.rankNfrs(catalog, ctx).filter(n => n.tier !== "low");
      const saved = NFR.getScenarios();
      if (!ranked.length) { wrap.innerHTML = `<p class="hint">No medium/high relevance NFRs for this context yet.</p>`; return; }
      wrap.innerHTML = ranked.map(n => {
        const s = saved[n.id] || n.scenarioTemplate; const color = NFR.categoryColor(catalog,n.category);
        return `<div class="nfr-card" style="border-left-color:${color};margin-bottom:.7rem">
          <div class="row"><div class="name">${n.name}</div><span class="tag tier-${n.tier}">${n.tier.toUpperCase()}</span></div>
          <div class="control"><label>Stimulus</label><input type="text" data-id="${n.id}" data-f="stimulus" value="${esc(s.stimulus)}"></div>
          <div class="control"><label>Response</label><input type="text" data-id="${n.id}" data-f="response" value="${esc(s.response)}"></div>
          <div class="control"><label>Measure (acceptance)</label><input type="text" data-id="${n.id}" data-f="measure" value="${esc(s.measure)}"></div>
          <div class="kv">Fitness function: <span class="mono">${n.fitnessFunction}</span></div></div>`;
      }).join("");
      wrap.querySelectorAll("input[data-id]").forEach(inp => inp.addEventListener("change", () => {
        const id=inp.dataset.id, f=inp.dataset.f;
        const cur = NFR.getScenarios()[id] || Object.assign({}, (catalog.nfrs.find(x=>x.id===id)||{}).scenarioTemplate);
        cur[f] = inp.value; NFR.setScenario(id, cur);
      }));
    }
    render(NFR.getContext());
    return { onContext: render };
  }

  // ---- 5. Export ----
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
