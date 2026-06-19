/* NFR Advisor — data-driven single-page app. Enterprise edition. */
(async function () {
  const catalog = await NFR.loadCatalog();
  const tabsEl = document.getElementById("tabs");
  const railEl = document.getElementById("rail");
  const viewEl = document.getElementById("view");

  const VIEWS = [
    { id: "overview",   label: "Overview",        mount: mountOverview },
    { id: "applicable", label: "Applicable NFRs", mount: mountApplicable },
    { id: "compliance", label: "Compliance",      mount: mountCompliance },
    { id: "tradeoffs",  label: "Trade-offs",      mount: mountTradeoffs },
    { id: "scenarios",  label: "Scenarios",       mount: mountScenarios },
    { id: "maturity",   label: "Maturity & Gaps", mount: mountMaturity },
    { id: "export",     label: "Export",          mount: mountExport }
  ];
  let current = null, activeId = "overview";

  const esc = s => String(s == null ? "" : s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
  const whyTags = n => (n.fired && n.fired.length)
    ? n.fired.map(f => `<span class="tag">${Object.entries(f.when).map(([k,v]) => esc(k+"="+v)).join(", ")} ${f.weight>=0?"+":""}${f.weight}</span>`).join("")
    : `<span class="hint">base relevance only (+${n.baseScore||0})</span>`;
  const isoCrumb = iso => String(iso||"").split(">").map(s=>s.trim()).filter(Boolean).map((p,i,a)=>i===a.length-1?`<b>${esc(p)}</b>`:esc(p)).join(" › ");
  const sevChip = sev => sev ? `<span class="sev ${sev}">${esc(sev)}</span>` : "";
  const regName = id => { const r=(catalog.regulations||[]).find(x=>x.id===id); return r?r.name:id; };
  const regChips = ids => (ids||[]).map(id=>`<span class="reg-chip" title="${esc((catalog.regulations.find(r=>r.id===id)||{}).full||'')}">${esc(regName(id))}</span>`).join("");
  const mandBadge = n => n.mandatory ? `<span class="mand" title="Mandatory — required by ${(n.regs||[]).map(regName).join(', ')}">MANDATORY</span>` : "";
  const ranked = () => NFR.rankAnnotated(catalog, NFR.getContext());

  function switchTo(id) {
    activeId = id;
    viewEl.innerHTML = "";
    [...tabsEl.children].forEach(a => a.classList.toggle("active", a.dataset.id === id));
    current = VIEWS.find(x => x.id === id).mount(viewEl) || null;
  }
  tabsEl.innerHTML = VIEWS.map(v => `<a href="#${v.id}" data-id="${v.id}">${v.label}</a>`).join("");
  tabsEl.querySelectorAll("a").forEach(a => a.addEventListener("click", e => { e.preventDefault(); switchTo(a.dataset.id); }));

  UI.renderContextRail(railEl, catalog, () => { if (current && current.onContext) current.onContext(); });

  const themeBtn = document.getElementById("themeToggle");
  function applyThemeIcon() { themeBtn.textContent = (document.documentElement.getAttribute("data-theme") === "light") ? "🌙 Dark" : "☀ Light"; }
  themeBtn.addEventListener("click", () => {
    const next = (document.documentElement.getAttribute("data-theme") === "light") ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", next);
    try { localStorage.setItem("nfr-theme", next); } catch (e) {}
    applyThemeIcon();
  });
  applyThemeIcon();
  switchTo(activeId);

  // ============================ OVERVIEW ============================
  function mountOverview(host) {
    host.innerHTML = `
      <div class="panel" style="margin-bottom:1rem">
        <h2>Overview</h2>
        <p class="hint">Cross-dimension summary for the current system context.</p>
        <div class="stat-grid" id="stats"></div>
        <div id="regimes"></div>
      </div>
      <div class="panel" style="margin-bottom:1rem">
        <h2>Coverage by quality dimension</h2>
        <p class="hint">How strongly each ISO/IEC 25010 dimension applies (sum of relevance across its NFRs).</p>
        <div id="dims"></div>
      </div>
      <div class="layout" style="grid-template-columns:1fr 1fr">
        <div class="panel"><h2>Top priorities</h2><div id="top"></div></div>
        <div class="panel"><h2>Open risks (unresolved trade-offs)</h2><div id="risks"></div></div>
      </div>`;
    const statsEl=host.querySelector("#stats"), regimesEl=host.querySelector("#regimes"), dimsEl=host.querySelector("#dims"), topEl=host.querySelector("#top"), risksEl=host.querySelector("#risks");
    function render() {
      const all = ranked();
      const relevant = all.filter(n=>n.tier!=="low"), high=all.filter(n=>n.tier==="high"), med=all.filter(n=>n.tier==="medium");
      const mandatory = all.filter(n=>n.mandatory);
      const conflicts = NFR.activeConflicts(all, "medium"); const pr = NFR.getPriorities();
      const unresolved = conflicts.filter(e=>!pr[e.key]);
      const regs = NFR.applicableRegulations(catalog, NFR.getContext());
      const mat = NFR.getMaturity(); const gaps = relevant.map(n=>NFR.maturityGap(n, mat[n.id])); const avgGap = gaps.length ? (gaps.reduce((a,b)=>a+b,0)/gaps.length) : 0;

      statsEl.innerHTML = [
        ["Relevant NFRs", relevant.length, "var(--accent)"],
        ["Mandatory", mandatory.length, mandatory.length?"var(--bad)":"var(--good)"],
        ["High importance", high.length, "var(--good)"],
        ["Regulations", regs.length, "var(--accent-2)"],
        ["Unresolved trade-offs", unresolved.length, unresolved.length?"var(--bad)":"var(--good)"],
        ["Avg maturity gap", avgGap.toFixed(1), avgGap>2?"var(--bad)":(avgGap>1?"var(--warn)":"var(--good)")]
      ].map(([l,n,c])=>`<div class="stat"><div class="num" style="color:${c}">${n}</div><div class="lbl">${l}</div></div>`).join("");

      regimesEl.innerHTML = regs.length
        ? `<h3>Compliance regimes in scope</h3><div>${regs.map(r=>`<span class="reg-chip" title="${esc(r.full)}">${esc(r.name)}</span>`).join("")}</div>`
        : `<h3>Compliance regimes in scope</h3><p class="hint">None triggered by this context. Set region + data sensitivity (e.g. EU + PII) to surface obligations.</p>`;

      const byCat={}; catalog.categories.forEach(c=>byCat[c.id]={label:c.label,color:c.color,sum:0,count:0});
      all.forEach(n=>{const b=byCat[n.category]; if(!b)return; b.sum+=n.relevance; if(n.tier!=="low")b.count++;});
      const maxSum=Math.max(0.001,...Object.values(byCat).map(b=>b.sum));
      dimsEl.innerHTML=Object.values(byCat).sort((a,b)=>b.sum-a.sum).map(b=>`
        <div class="dim-row"><div class="dim-name"><span class="catdot" style="background:${b.color}"></span>${esc(b.label)}</div>
        <div class="meter"><i style="width:${Math.round(b.sum/maxSum*100)}%;background:${b.color}"></i></div>
        <div class="dim-count">${b.count} NFR${b.count===1?"":"s"}</div></div>`).join("");

      topEl.innerHTML = relevant.length
        ? `<table class="tt"><tbody>${relevant.slice(0,7).map(n=>`<tr><td><b>${esc(n.name)}</b> ${mandBadge(n)}</td><td style="text-align:right">${sevChip(n.severity)} <span class="badge ${n.tier}">${n.tier} · ${n.score}</span></td></tr>`).join("")}</tbody></table>`
        : `<p class="hint">No high/medium NFRs for this context.</p>`;
      risksEl.innerHTML = unresolved.length
        ? `<table class="tt"><tbody>${unresolved.map(e=>`<tr><td>${esc(e.a.name)} ↔ ${esc(e.b.name)}</td><td style="text-align:right"><span class="pill conflict">unresolved</span></td></tr>`).join("")}</tbody></table><p class="hint" style="margin-top:.5rem">Resolve on the <b>Trade-offs</b> tab.</p>`
        : (conflicts.length?`<p class="hint">All ${conflicts.length} trade-offs resolved. ✓</p>`:`<p class="hint">No trade-off tensions for this context.</p>`);
    }
    render(); return { onContext: render };
  }

  // ============================ APPLICABLE NFRs (grouped) ============================
  function mountApplicable(host) {
    host.innerHTML = `
      <div class="panel">
        <h2>Applicable NFRs</h2>
        <p class="hint">Grouped by ISO/IEC 25010 dimension and ranked within each. <span class="mand">MANDATORY</span> = required by a regulation in scope. Click an NFR to expand the full enterprise detail.</p>
        <div class="toolbar">
          <input type="text" id="q" class="grow" placeholder="Filter by name / alias…">
          <select id="cat"><option value="">All dimensions</option>${catalog.categories.map(c=>`<option value="${c.id}">${esc(c.label)}</option>`).join("")}</select>
          <select id="tier"><option value="">All tiers</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select>
          <select id="mand"><option value="">All</option><option value="1">Mandatory only</option></select>
          <button class="btn secondary" id="expandAll">Expand all</button>
        </div>
        <div id="groups"></div>
      </div>`;
    const groupsEl=host.querySelector("#groups");
    const q=host.querySelector("#q"), catSel=host.querySelector("#cat"), tierSel=host.querySelector("#tier"), mandSel=host.querySelector("#mand"), expandBtn=host.querySelector("#expandAll");
    const collapsed={}, openSub={}; let allOpen=false;
    function filtered() {
      let r = ranked(); const text=q.value.trim().toLowerCase();
      if(text) r=r.filter(n=>(n.name+" "+(n.aliases||[]).join(" ")).toLowerCase().includes(text));
      if(catSel.value) r=r.filter(n=>n.category===catSel.value);
      if(tierSel.value) r=r.filter(n=>n.tier===tierSel.value);
      if(mandSel.value) r=r.filter(n=>n.mandatory);
      return r;
    }
    function subDetail(n) {
      const qa=n.qa||{};
      return `<div class="sub-detail">
        <div class="iso-crumb">ISO/IEC 25010: ${isoCrumb(n.iso)}</div>
        ${n.businessImpact?`<h4>Business impact if not met</h4><div class="hint">${esc(n.businessImpact)}</div>`:""}
        ${(n.regs&&n.regs.length)?`<h4>Compliance drivers</h4><div>${regChips(n.regs)}</div>`:""}
        <h4>Quality attribute scenario (SEI 6-part)</h4>
        <div class="qa-grid">
          <dt>Source</dt><dd>${esc(qa.source||"—")}</dd>
          <dt>Stimulus</dt><dd>${esc(qa.stimulus||"—")}</dd>
          <dt>Artifact</dt><dd>${esc(qa.artifact||"—")}</dd>
          <dt>Environment</dt><dd>${esc(qa.environment||"—")}</dd>
          <dt>Response</dt><dd>${esc(qa.response||"—")}</dd>
          <dt>Measure (SLO)</dt><dd><b>${esc(qa.measure||"—")}</b></dd>
        </div>
        <h4>Why it applies</h4><div class="why">${whyTags(n)}</div>
        <h4>Metrics</h4><div class="hint">${(n.metrics||[]).map(esc).join(" · ")}</div>
        <h4>Tactics &amp; patterns</h4><div class="hint">${(n.tactics||[]).map(esc).join(" · ")}</div>
        <h4>Fitness function</h4><div class="mono">${esc(n.fitnessFunction)}</div>
        ${(n.conflicts_with||[]).length?`<h4>Conflicts with</h4>${n.conflicts_with.map(c=>`<span class="tag">${esc(c)}</span>`).join("")}`:""}
        ${(n.reinforces||[]).length?`<h4>Reinforces</h4>${n.reinforces.map(c=>`<span class="tag">${esc(c)}</span>`).join("")}`:""}
      </div>`;
    }
    function render() {
      const rows=filtered();
      const cats=catalog.categories.map(c=>Object.assign({},c,{items:rows.filter(n=>n.category===c.id)}))
        .filter(c=>c.items.length).sort((a,b)=>Math.max.apply(null,b.items.map(n=>n.score))-Math.max.apply(null,a.items.map(n=>n.score)));
      if(!cats.length){groupsEl.innerHTML=`<p class="hint">No NFRs match the current filters.</p>`;return;}
      groupsEl.innerHTML=cats.map(c=>{
        const isCol=collapsed[c.id]; const t={high:0,medium:0,low:0}; c.items.forEach(n=>t[n.tier]++);
        const mandCount=c.items.filter(n=>n.mandatory).length;
        const meta=`${c.items.length} NFR${c.items.length===1?"":"s"} · ${t.high} high${mandCount?` · ${mandCount} mandatory`:""}`;
        const subs=c.items.map(n=>{
          const isOpen=allOpen||openSub[n.id];
          return `<div class="subsection">
            <div class="sub-head" data-sub="${n.id}">
              <span class="chev" style="${isOpen?'':'transform:rotate(-90deg)'}">▾</span>
              <span class="sub-name">${esc(n.name)}</span>
              ${sevChip(n.severity)} ${mandBadge(n)}
              <span class="badge ${n.tier}">${n.tier} · ${n.score}</span>
              <span class="iso-crumb" style="margin-left:auto">${(n.aliases||[]).slice(0,2).map(esc).join(", ")}</span>
            </div>${isOpen?subDetail(n):""}</div>`;
        }).join("");
        return `<div class="section ${isCol?'collapsed':''}"><div class="section-head" data-cat="${c.id}">
          <span class="chev">▾</span><span class="catdot" style="background:${c.color}"></span>
          <span class="s-title">${esc(c.label)}</span><span class="s-meta">${meta}</span></div>
          <div class="section-body">${subs}</div></div>`;
      }).join("");
      groupsEl.querySelectorAll(".section-head").forEach(h=>h.addEventListener("click",()=>{collapsed[h.dataset.cat]=!collapsed[h.dataset.cat];render();}));
      groupsEl.querySelectorAll(".sub-head").forEach(h=>h.addEventListener("click",()=>{openSub[h.dataset.sub]=!openSub[h.dataset.sub];allOpen=false;render();}));
    }
    expandBtn.addEventListener("click",()=>{allOpen=!allOpen;expandBtn.textContent=allOpen?"Collapse all":"Expand all";render();});
    [q,catSel,tierSel,mandSel].forEach(el=>el.addEventListener("input",render));
    render(); return { onContext: render };
  }

  // ============================ COMPLIANCE ============================
  function mountCompliance(host) {
    host.innerHTML = `
      <div class="panel">
        <h2>Compliance &amp; regulatory mapping</h2>
        <p class="hint">Regulations triggered by the current <b>region</b>, <b>data sensitivity</b>, and <b>domain</b>. Each maps to the NFRs it makes <span class="mand">MANDATORY</span>, with the controlling reference.</p>
        <div id="regs"></div>
      </div>`;
    const regsEl=host.querySelector("#regs");
    function render() {
      const ctx=NFR.getContext(); const regs=NFR.applicableRegulations(catalog, ctx); const all=ranked(); const byId={}; all.forEach(n=>byId[n.id]=n);
      if(!regs.length){ regsEl.innerHTML=`<p class="hint">No regulations triggered by this context. For example: set <b>Region = eu</b> and <b>Data Sensitivity = pii</b> for GDPR, or <b>Data Sensitivity = pci</b> for PCI-DSS.</p>`; return; }
      regsEl.innerHTML=regs.map(r=>`
        <div class="nfr-card" style="border-left-color:var(--bad);margin-bottom:.8rem">
          <div class="row"><div class="name">${esc(r.name)} — <span class="hint">${esc(r.full)}</span></div></div>
          <div class="kv" style="margin:.3rem 0"><b>Control reference:</b> ${esc(r.control)}</div>
          <div class="kv"><b>Makes mandatory:</b></div>
          <table class="tt"><tbody>${(r.drives||[]).map(id=>{const n=byId[id]; if(!n)return"";return `<tr><td><b>${esc(n.name)}</b></td><td>${sevChip(n.severity)}</td><td style="text-align:right">${esc((n.qa||{}).measure||"")}</td></tr>`;}).join("")}</tbody></table>
        </div>`).join("");
    }
    render(); return { onContext: render };
  }

  // ============================ TRADE-OFFS ============================
  function mountTradeoffs(host) {
    host.innerHTML = `
      <div class="panel" style="margin-bottom:1rem">
        <h2>Trade-off matrix</h2>
        <p class="hint">Relevant NFRs (medium+). Red = conflict, green = reinforce. Click a conflict cell to prioritize the <b>row</b> over the <b>column</b>. Each resolved conflict becomes an ADR.</p>
        <div style="overflow:auto" id="matrixWrap"></div>
        <div class="legend"><span><span class="dot" style="background:var(--conflict-bg)"></span>conflict</span><span><span class="dot" style="background:var(--win-bg)"></span>resolved (row wins)</span><span><span class="dot" style="background:var(--reinforce-bg)"></span>reinforce</span></div>
      </div>
      <div class="panel"><h2>Conflicts &amp; decisions</h2><div id="list"></div></div>`;
    const matrixWrap=host.querySelector("#matrixWrap"), listEl=host.querySelector("#list");
    const TENSION={ "consistency::latency":"Strong consistency adds coordination latency (CAP/PACELC).","latency::scalability":"Some scale-out patterns add network hops.","availability::cost-efficiency":"Redundancy for uptime costs idle capacity.","availability::consistency":"Partition tolerance forces a choice (CAP).","consistency::scalability":"Sharding/replication weakens global consistency.","auditability::latency":"Synchronous audit writes add to the hot path.","confidentiality::latency":"Encryption / extra hops cost time.","confidentiality::learnability":"Stricter security adds user friction.","authz::learnability":"More auth steps reduce ease of use.","integrity::latency":"Validation & signing add per-request work.","latency::modularity":"Indirection layers can cost latency.","latency::modifiability":"Abstractions for change can cost latency.","cost-efficiency::recoverability":"DR replicas cost money.","latency::portability":"Portability abstractions can cost latency.","cost-efficiency::safety":"Redundancy & certification for safety cost money.","latency::safety":"Safety checks add to reaction time.","availability::sustainability":"Always-on redundancy raises energy use.","latency::sustainability":"Carbon-aware scheduling may defer work.","cost-efficiency::ai-robustness":"Continuous monitoring & retraining cost money.","ai-explainability::latency":"Generating explanations adds inference cost." };
    const tension=(a,b)=>TENSION[[a,b].sort().join("::")]||"These qualities pull the design in opposite directions.";
    const keyOf=(a,b)=>[a,b].sort().join("::");
    function rel(a,b){ if((a.conflicts_with||[]).includes(b.id)||(b.conflicts_with||[]).includes(a.id))return"conflict"; if((a.reinforces||[]).includes(b.id)||(b.reinforces||[]).includes(a.id))return"reinforce"; return""; }
    function render() {
      const rk=ranked().filter(n=>n.tier!=="low"); const pr=NFR.getPriorities();
      if(rk.length<2){matrixWrap.innerHTML=`<p class="hint">Need at least two relevant NFRs to compare. Adjust the context.</p>`;listEl.innerHTML="";return;}
      let html=`<table class="matrix"><thead><tr><th class="rh"></th>`+rk.map((n,i)=>`<th class="ch" title="${esc(n.name)}">${i+1}</th>`).join("")+`</tr></thead><tbody>`;
      rk.forEach((rowN,ri)=>{ html+=`<tr><th class="rh" title="${esc(rowN.name)}">${ri+1} · ${esc(rowN.name)}</th>`;
        rk.forEach((colN,ci)=>{ if(ri===ci){html+=`<td class="self">—</td>`;return;}
          const r=rel(rowN,colN);
          if(r==="conflict"){const w=pr[keyOf(rowN.id,colN.id)];const cls=w?(w===rowN.id?"win":"lose"):"";const mk=w?(w===rowN.id?"✓":"·"):"✕";html+=`<td class="conflict ${cls}" data-row="${rowN.id}" data-col="${colN.id}" title="${esc(rowN.name)} ↔ ${esc(colN.name)}">${mk}</td>`;}
          else if(r==="reinforce"){html+=`<td class="reinforce" title="reinforces">+</td>`;} else html+=`<td></td>`; });
        html+=`</tr>`; });
      html+=`</tbody></table>`; matrixWrap.innerHTML=html;
      matrixWrap.querySelectorAll("td.conflict").forEach(td=>td.addEventListener("click",()=>{NFR.setPriority(keyOf(td.dataset.row,td.dataset.col),td.dataset.row);render();}));
      const conflicts=NFR.activeConflicts(ranked(),"medium");
      if(!conflicts.length){listEl.innerHTML=`<p class="hint">No active conflicts for this context.</p>`;return;}
      listEl.innerHTML=`<table class="tt"><thead><tr><th>Trade-off</th><th>Tension</th><th>Decision</th></tr></thead><tbody>`+
        conflicts.map(e=>{const w=pr[e.key];const st=w?`<span class="pill resolved">prioritized: ${esc(w===e.a.id?e.a.name:e.b.name)}</span>`:`<span class="pill conflict">unresolved</span>`;
          return `<tr><td><b>${esc(e.a.name)}</b> ↔ <b>${esc(e.b.name)}</b><br>${st}</td><td class="hint">${esc(tension(e.a.id,e.b.id))}</td>
            <td><button class="btn ${w===e.a.id?'':'secondary'}" data-key="${e.key}" data-win="${e.a.id}">${esc(e.a.name)}</button>
            <button class="btn ${w===e.b.id?'':'secondary'}" data-key="${e.key}" data-win="${e.b.id}">${esc(e.b.name)}</button></td></tr>`;}).join("")+`</tbody></table>`;
      listEl.querySelectorAll("button[data-key]").forEach(b=>b.addEventListener("click",()=>{NFR.setPriority(b.dataset.key,b.dataset.win);render();}));
    }
    render(); return { onContext: render };
  }

  // ============================ SCENARIOS (6-part editor) ============================
  function mountScenarios(host) {
    host.innerHTML = `<div class="panel"><h2>Scenario editor</h2>
      <p class="hint">Each relevant NFR as a full <b>SEI 6-part quality attribute scenario</b>. Tune the Measure to your real SLO targets; edits are saved and flow into the export.</p>
      <div id="scenarios"></div></div>`;
    const wrap=host.querySelector("#scenarios"); const FIELDS=[["source","Source"],["stimulus","Stimulus"],["artifact","Artifact"],["environment","Environment"],["response","Response"],["measure","Measure (SLO)"]];
    function render() {
      const rk=ranked().filter(n=>n.tier!=="low"); const saved=NFR.getScenarios();
      if(!rk.length){wrap.innerHTML=`<p class="hint">No medium/high relevance NFRs for this context yet.</p>`;return;}
      wrap.innerHTML=rk.map(n=>{const s=saved[n.id]||n.qa||{};const color=NFR.categoryColor(catalog,n.category);
        return `<div class="nfr-card" style="border-left-color:${color};margin-bottom:.7rem">
          <div class="row"><div class="name">${esc(n.name)}</div> ${sevChip(n.severity)} ${mandBadge(n)} <span class="badge ${n.tier}">${n.tier}</span></div>
          ${FIELDS.map(([f,lbl])=>`<div class="control"><label>${lbl}</label><input type="text" data-id="${n.id}" data-f="${f}" value="${esc(s[f]||"")}"></div>`).join("")}
          <div class="kv">Fitness function: <span class="mono">${esc(n.fitnessFunction)}</span></div></div>`;}).join("");
      wrap.querySelectorAll("input[data-id]").forEach(inp=>inp.addEventListener("change",()=>{
        const id=inp.dataset.id,f=inp.dataset.f; const cur=NFR.getScenarios()[id]||Object.assign({},(catalog.nfrs.find(x=>x.id===id)||{}).qa); cur[f]=inp.value; NFR.setScenario(id,cur);}));
    }
    render(); return { onContext: render };
  }

  // ============================ MATURITY & GAPS ============================
  function mountMaturity(host) {
    host.innerHTML = `
      <div class="panel" style="margin-bottom:1rem">
        <h2>Maturity &amp; gap assessment</h2>
        <p class="hint">Rate the <b>current maturity (0–5)</b> of each relevant NFR. Target is derived from its importance. The <b>gap</b> drives the remediation roadmap below.</p>
        <div id="matTable"></div>
      </div>
      <div class="panel"><h2>Prioritized remediation roadmap</h2><p class="hint">Biggest gaps on the highest-severity, mandatory-first NFRs come first.</p><div id="roadmap"></div></div>`;
    const matTable=host.querySelector("#matTable"), roadmapEl=host.querySelector("#roadmap");
    const sevRank={critical:4,high:3,medium:2,low:1};
    function render() {
      const rk=ranked().filter(n=>n.tier!=="low"); const mat=NFR.getMaturity(); const owners=NFR.getOwners();
      if(!rk.length){matTable.innerHTML=`<p class="hint">No relevant NFRs for this context.</p>`;roadmapEl.innerHTML="";return;}
      matTable.innerHTML=`<table class="data"><thead><tr><th>NFR</th><th>Target</th><th>Current</th><th>Gap</th><th>Owner</th></tr></thead><tbody>`+
        rk.map(n=>{const tgt=NFR.targetMaturity(n.tier);const cur=(typeof mat[n.id]==="number")?mat[n.id]:0;const gap=Math.max(0,tgt-cur);
          const opts=[0,1,2,3,4,5].map(v=>`<option value="${v}" ${v===cur?"selected":""}>${v}</option>`).join("");
          return `<tr><td><b>${esc(n.name)}</b> ${mandBadge(n)}<div class="kv">${esc(NFR.categoryLabel(catalog,n.category))}</div></td>
            <td><span class="badge ${n.tier}">${tgt}/5</span></td>
            <td><select data-mat="${n.id}">${opts}</select></td>
            <td><span class="gap-bar"><i style="width:${gap/5*100}%;background:${gap>=3?'var(--bad)':gap>=1?'var(--warn)':'var(--good)'}"></i></span> ${gap}</td>
            <td><input type="text" data-owner="${n.id}" value="${esc(owners[n.id]||"")}" placeholder="team / owner" style="width:120px"></td></tr>`;}).join("")+`</tbody></table>`;
      matTable.querySelectorAll("select[data-mat]").forEach(s=>s.addEventListener("change",()=>{NFR.setMaturity(s.dataset.mat,parseInt(s.value,10));render();}));
      matTable.querySelectorAll("input[data-owner]").forEach(i=>i.addEventListener("change",()=>{NFR.setOwner(i.dataset.owner,i.value);}));

      const road=rk.map(n=>{const cur=(typeof mat[n.id]==="number")?mat[n.id]:0;const gap=Math.max(0,NFR.targetMaturity(n.tier)-cur);return {n,gap,prio:(n.mandatory?100:0)+gap*(sevRank[n.severity]||1)};})
        .filter(x=>x.gap>0).sort((a,b)=>b.prio-a.prio);
      roadmapEl.innerHTML=road.length
        ? `<table class="tt"><thead><tr><th>#</th><th>NFR</th><th>Gap</th><th>First moves (tactics)</th></tr></thead><tbody>`+road.map((x,i)=>`<tr><td>${i+1}</td><td><b>${esc(x.n.name)}</b> ${sevChip(x.n.severity)} ${mandBadge(x.n)}</td><td>${x.gap}</td><td class="hint">${(x.n.tactics||[]).slice(0,3).map(esc).join("; ")}</td></tr>`).join("")+`</tbody></table>`
        : `<p class="hint">No gaps — current maturity meets target for all relevant NFRs. ✓</p>`;
    }
    render(); return { onContext: render };
  }

  // ============================ EXPORT ============================
  function mountExport(host) {
    host.innerHTML = `
      <div class="panel" style="margin-bottom:1rem">
        <h2>Export</h2>
        <p class="hint"><b>nfrs.yaml</b> machine-readable (SLOs, compliance, maturity); <b>nfrs.md</b> the governance spec; <b>ADRs</b> the trade-off decisions.</p>
        <div class="row"><div class="seg" style="max-width:360px">
          <button class="active" data-tab="yaml">nfrs.yaml</button><button data-tab="md">nfrs.md</button><button data-tab="adr">ADRs</button>
        </div><span class="spacer"></span><button class="btn secondary" id="copyBtn">Copy</button><button class="btn" id="dlBtn">Download</button></div>
      </div>
      <pre class="export" id="out"></pre>`;
    const out=host.querySelector("#out"); let tab="yaml";
    const yEsc=s=>/[:#{}\[\],&*?|<>=!%@`"']/.test(String(s))?JSON.stringify(s):s;
    function gather(){const ctx=NFR.getContext();const all=ranked();const rk=all.filter(n=>n.tier!=="low");const scenarios=NFR.getScenarios();const priorities=NFR.getPriorities();const mat=NFR.getMaturity();const owners=NFR.getOwners();const conflicts=NFR.activeConflicts(all,"medium");const regs=NFR.applicableRegulations(catalog,ctx);rk.forEach(n=>{n.scenario=scenarios[n.id]||n.qa;n.cur=(typeof mat[n.id]==="number")?mat[n.id]:0;n.tgt=NFR.targetMaturity(n.tier);n.gap=Math.max(0,n.tgt-n.cur);n.owner=owners[n.id]||"";});return {ctx,rk,conflicts,priorities,regs};}
    function toYaml(){const {ctx,rk,conflicts,priorities,regs}=gather();let y="# Generated by NFR Advisor — ISO/IEC 25010, arc42 Q42, ATAM/SEI scenarios\ncontext:\n";Object.keys(ctx).forEach(k=>y+=`  ${k}: ${yEsc(String(ctx[k]))}\n`);
      y+="compliance:\n";if(!regs.length)y+="  []\n";regs.forEach(r=>{y+=`  - id: ${r.id}\n    name: ${yEsc(r.name)}\n    control: ${yEsc(r.control)}\n    mandates: [${(r.drives||[]).join(", ")}]\n`;});
      y+="nfrs:\n";rk.forEach(n=>{const q=n.scenario||{};y+=`  - id: ${n.id}\n    name: ${yEsc(n.name)}\n    category: ${n.category}\n    iso: ${yEsc(n.iso)}\n    importance: ${n.tier}\n    severity: ${n.severity}\n    mandatory: ${!!n.mandatory}\n    regulations: [${(n.regs||[]).join(", ")}]\n`;
        y+=`    scenario:\n      source: ${yEsc(q.source||"")}\n      stimulus: ${yEsc(q.stimulus||"")}\n      artifact: ${yEsc(q.artifact||"")}\n      environment: ${yEsc(q.environment||"")}\n      response: ${yEsc(q.response||"")}\n      measure: ${yEsc(q.measure||"")}\n`;
        y+=`    maturity: { current: ${n.cur}, target: ${n.tgt}, gap: ${n.gap} }\n`;if(n.owner)y+=`    owner: ${yEsc(n.owner)}\n`;y+=`    fitness_function: ${yEsc(n.fitnessFunction)}\n    tactics:\n`;(n.tactics||[]).forEach(t=>y+=`      - ${yEsc(t)}\n`);});
      y+="tradeoffs:\n";if(!conflicts.length)y+="  []\n";conflicts.forEach(e=>{const w=priorities[e.key];y+=`  - between: [${e.a.id}, ${e.b.id}]\n    resolution: ${w?("prioritize "+w):"UNRESOLVED"}\n`;});return y;}
    function toMd(){const {ctx,rk,conflicts,priorities,regs}=gather();let m="# Non-Functional Requirements\n\n_Generated by NFR Advisor — ISO/IEC 25010, arc42 Q42, ATAM/SEI._\n\n## System context\n\n| Dimension | Value |\n|---|---|\n";Object.keys(ctx).forEach(k=>m+=`| ${k} | ${ctx[k]} |\n`);
      m+="\n## Compliance obligations\n\n";if(!regs.length)m+="_No regulations triggered by this context._\n";regs.forEach(r=>{m+=`- **${r.name}** (${r.full}) — ${r.control}\n  - Mandates: ${(r.drives||[]).join(", ")}\n`;});
      m+="\n## Quality requirements (by importance)\n\n";["high","medium"].forEach(tier=>{const g=rk.filter(n=>n.tier===tier);if(!g.length)return;m+=`### ${tier==="high"?"High importance":"Medium importance"}\n\n`;
        g.forEach(n=>{const q=n.scenario||{};m+=`#### ${n.name}${n.mandatory?" — MANDATORY":""} _(severity: ${n.severity})_\n- **ISO 25010:** ${n.iso}\n`;if(n.businessImpact)m+=`- **Business impact:** ${n.businessImpact}\n`;if(n.regs&&n.regs.length)m+=`- **Compliance:** ${n.regs.join(", ")}\n`;
          m+=`- **Scenario:** [${q.source}] ${q.stimulus} → ${q.response}\n- **Measure (SLO):** ${q.measure}\n- **Maturity:** current ${n.cur}/5, target ${n.tgt}/5, gap ${n.gap}${n.owner?` (owner: ${n.owner})`:""}\n- **Tactics:** ${(n.tactics||[]).join("; ")}\n- **Verify:** ${n.fitnessFunction}\n\n`;});});
      m+="## Trade-offs\n\n";if(!conflicts.length)m+="_No active conflicts._\n";conflicts.forEach(e=>{const w=priorities[e.key];m+=`- **${e.a.name} ↔ ${e.b.name}** — ${w?("prioritize **"+(w===e.a.id?e.a.name:e.b.name)+"**"):"_unresolved_"}\n`;});return m;}
    function toAdr(){const {ctx,conflicts,priorities}=gather();if(!conflicts.length)return"# No trade-off ADRs\n\nNo conflicts among the selected NFRs for this context.\n";
      return conflicts.map((e,i)=>{const w=priorities[e.key],num=String(i+1).padStart(4,"0");const winner=w?(w===e.a.id?e.a:e.b):null,loser=w?(w===e.a.id?e.b:e.a):null;
        return `# ADR-${num}: Trade-off between ${e.a.name} and ${e.b.name}\n\n## Status\n${w?"Accepted":"Proposed (UNRESOLVED)"}\n\n## Context\nFor a ${ctx.domain} system (${ctx.region}) at ${ctx.userScale} scale, criticality ${ctx.systemCriticality}, **${e.a.name}** and **${e.b.name}** are both relevant but conflict.\n\n## Decision\n${w?`Prioritize **${winner.name}** over **${loser.name}** where they conflict.`:"_Not yet decided._"}\n\n## Consequences\n${w?`- Favour tactics for ${winner.name}: ${(winner.tactics||[]).slice(0,3).join("; ")}.\n- Accept reduced ${loser.name}; mitigate via: ${(loser.tactics||[]).slice(0,2).join("; ")}.\n- Watch: ${(winner.qa||{}).measure}.`:"- Pending decision."}\n`;}).join("\n---\n\n");}
    const content=()=>tab==="yaml"?toYaml():tab==="md"?toMd():toAdr();
    const filename=()=>tab==="yaml"?"nfrs.yaml":tab==="md"?"nfrs.md":"adr-tradeoffs.md";
    const render=()=>out.textContent=content();
    host.querySelectorAll("button[data-tab]").forEach(b=>b.addEventListener("click",()=>{host.querySelectorAll("button[data-tab]").forEach(x=>x.classList.remove("active"));b.classList.add("active");tab=b.dataset.tab;render();}));
    host.querySelector("#copyBtn").addEventListener("click",()=>{navigator.clipboard.writeText(content());const btn=host.querySelector("#copyBtn");const t=btn.textContent;btn.textContent="Copied!";setTimeout(()=>btn.textContent=t,1200);});
    host.querySelector("#dlBtn").addEventListener("click",()=>{const blob=new Blob([content()],{type:"text/plain"});const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=filename();a.click();URL.revokeObjectURL(a.href);});
    render(); return { onContext: render };
  }
})();
