/* NFR Advisor — data-driven single-page app. Enterprise edition. */
(async function () {
  const catalog = await NFR.loadCatalog();
  const fv = document.getElementById("footVersion");
  if (fv) fv.textContent = `v${catalog.version} · ${catalog.nfrs.length} NFRs · ${catalog.regulations.length} standards · ${catalog.contextDimensions.length} context dims`;
  const tabsEl = document.getElementById("tabs");
  const railEl = document.getElementById("rail");
  const viewEl = document.getElementById("view");

  // hydrate from a shared permalink (#s=<base64>) before anything reads state,
  // then strip the hash so a later refresh keeps locally-edited state.
  (function () {
    const m = /[#&]s=([^&]*)/.exec(location.hash);
    if (!m) return;
    const decoded = NFR.decodeState(decodeURIComponent(m[1]));
    if (decoded && NFR.importState(decoded)) {
      try { history.replaceState(null, "", location.pathname + location.search); } catch (e) {}
    }
  })();

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

  // observability mapping → cloud-native-observability catalog (verify each NFR in prod)
  const OBS_REPO = catalog.observabilityRepo;
  const OBS_ACTION = { page: ["🔴", "Page"], ticket: ["🟠", "Ticket"], watch: ["🟢", "Watch"] };
  function obsBlock(n) {
    const o = (catalog.observability || {})[n.id];
    if (!o || !OBS_REPO) return "";
    const secs = (o.sections || []).map(id => {
      const s = (catalog.observabilitySections || {})[id];
      return s ? `<a class="reg-chip" href="${OBS_REPO}/blob/main/CATALOG.md#${s.anchor}" target="_blank" rel="noopener" title="${esc(s.label)}">§${esc(id)} ${esc(s.label)}</a>` : "";
    }).join("");
    const [ai, al] = OBS_ACTION[o.action] || ["", o.action];
    const metrics = (o.signals || []).map(m => `<span class="tag mono">${esc(m)}</span>`).join("");
    const alert = o.alert ? ` · alert <a class="mono" href="${OBS_REPO}/blob/main/alerts/prometheus-rules.yml" target="_blank" rel="noopener">${esc(o.alert)}</a>` : "";
    return `<h4>Observe in production</h4>
      <div class="hint">Signal model <b>${esc(o.method)}</b> · <span class="obs-action ${esc(o.action)}">${ai} ${esc(al)}</span>${alert}</div>
      <div style="margin:.35rem 0">${metrics}</div>
      <div class="hint">Catalog: ${secs}</div>`;
  }

  // ---------- live posture → "what changed" toast ----------
  function posture() {
    const all = ranked();
    return {
      relevant: all.filter(n => n.tier !== "low").length,
      mandatory: all.filter(n => n.mandatory).length,
      conflicts: NFR.activeConflicts(all, "medium").length,
      regs: NFR.applicableRegulations(catalog, NFR.getContext()).map(r => r.name)
    };
  }
  let lastPosture = posture();
  function diffPosture(prev, now) {
    const msgs = [];
    const dRel = now.relevant - prev.relevant;
    if (dRel) msgs.push(`${dRel > 0 ? "+" : ""}${dRel} relevant NFR${Math.abs(dRel) === 1 ? "" : "s"}`);
    now.regs.filter(r => !prev.regs.includes(r)).forEach(r => msgs.push(`${r} now applies`));
    prev.regs.filter(r => !now.regs.includes(r)).forEach(r => msgs.push(`${r} no longer applies`));
    const dConf = now.conflicts - prev.conflicts;
    if (dConf) msgs.push(`${dConf > 0 ? "+" : ""}${dConf} trade-off${Math.abs(dConf) === 1 ? "" : "s"}`);
    return msgs;
  }
  let toastTimer = null;
  function showToast(msgs) {
    if (!msgs || !msgs.length) return;
    let el = document.getElementById("toast");
    if (!el) { el = document.createElement("div"); el.id = "toast"; el.className = "toast"; document.body.appendChild(el); }
    el.innerHTML = msgs.map(m => `<span>${esc(m)}</span>`).join("");
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 3200);
  }

  // ---------- journey progress strip ----------
  const journeyEl = document.getElementById("journey");
  function refreshJourney() {
    if (!journeyEl) return;
    const all = ranked();
    const relevant = all.filter(n => n.tier !== "low");
    const conflicts = NFR.activeConflicts(all, "medium");
    const pr = NFR.getPriorities();
    const resolved = conflicts.filter(e => pr[e.key]).length;
    const mat = NFR.getMaturity(), scen = NFR.getScenarios();
    const R = relevant.length;
    const assessed = relevant.filter(n => typeof mat[n.id] === "number").length;
    const edited = relevant.filter(n => scen[n.id]).length;
    const regs = NFR.applicableRegulations(catalog, NFR.getContext()).length;
    const tradeDone = conflicts.length === 0 || resolved === conflicts.length;
    const matDone = R > 0 && assessed === R;
    const steps = [
      { id: "overview",   label: "Overview",   note: "",                                          state: "info" },
      { id: "applicable", label: "NFRs",       note: `${R}`,                                       state: R ? "done" : "todo" },
      { id: "compliance", label: "Compliance", note: `${regs}`,                                    state: "info" },
      { id: "tradeoffs",  label: "Trade-offs", note: conflicts.length ? `${resolved}/${conflicts.length}` : "0", state: !R ? "todo" : (tradeDone ? "done" : "partial") },
      { id: "scenarios",  label: "Scenarios",  note: `${edited}/${R}`,                             state: !R ? "todo" : (edited === R && R ? "done" : (edited ? "partial" : "todo")) },
      { id: "maturity",   label: "Maturity",   note: `${assessed}/${R}`,                           state: !R ? "todo" : (matDone ? "done" : (assessed ? "partial" : "todo")) },
      { id: "export",     label: "Export",     note: "",                                           state: (matDone && tradeDone && R) ? "done" : "todo" }
    ];
    const ICON = { done: "✓", partial: "◐", todo: "○", info: "•" };
    journeyEl.innerHTML = steps.map((s, i) =>
      `<button class="jstep ${s.state}${s.id === activeId ? " active" : ""}" data-go="${s.id}">
        <span class="jnum">${i + 1}</span><span class="jicon" aria-hidden="true">${ICON[s.state]}</span>
        <span class="jlabel">${esc(s.label)}</span>${s.note ? `<span class="jnote">${esc(s.note)}</span>` : ""}</button>`
    ).join("");
    journeyEl.querySelectorAll("button[data-go]").forEach(b => b.addEventListener("click", () => switchTo(b.dataset.go)));
  }

  // readiness score panel — the "verdict", shown at the end (Export)
  function paintScore(gaugeEl, scoreHint, scoreComps) {
    const r = NFR.readiness(catalog, NFR.getContext());
    const assessed = Object.keys(NFR.getMaturity()).length;
    if (!assessed) {
      const inScope = r.counts.relevant;
      gaugeEl.style.background = `conic-gradient(var(--accent) ${Math.min(inScope, 20) / 20 * 360}deg, var(--code-bg) 0)`;
      gaugeEl.innerHTML = `<div class="score-inner"><div class="score-num">${inScope}</div><div class="score-grade">in scope</div></div>`;
      scoreHint.innerHTML = `<b>Provisional posture:</b> ${inScope} relevant NFR${inScope===1?"":"s"} · ${r.counts.mandatory} mandatory · ${r.counts.conflicts} trade-off${r.counts.conflicts===1?"":"s"} to resolve. The full <b>readiness score</b> computes once you <b>assess maturity</b> (tab 6 · Maturity &amp; Gaps); the compliance and trade-off components below are already in.`;
    } else {
      const gColor = r.score>=70?"var(--good)":r.score>=40?"var(--warn)":"var(--bad)";
      gaugeEl.style.background = `conic-gradient(${gColor} ${r.score*3.6}deg, var(--code-bg) 0)`;
      gaugeEl.innerHTML = `<div class="score-inner"><div class="score-num">${r.score}</div><div class="score-grade">grade ${r.grade}</div></div>`;
      scoreHint.innerHTML = `<b>Score = Maturity×50% + Compliance×30% + Trade-offs×20%</b> (each 0–100). It rises as you assess <b>Maturity</b> and resolve <b>Trade-offs</b>.`;
    }
    const cc = r.counts;
    const comps = [
      ["Maturity", "50%", r.components.maturity, `avg current÷target across ${cc.relevant} relevant NFRs (unassessed counts as 0)`],
      ["Compliance", "30%", r.components.compliance, cc.mandatory ? `avg maturity attainment across ${cc.mandatory} mandatory NFRs` : "no mandatory NFRs in scope → 100"],
      ["Trade-offs", "20%", r.components.tradeoffs, cc.conflicts ? `${cc.resolved} of ${cc.conflicts} conflicts resolved` : "no conflicts in scope → 100"]
    ];
    scoreComps.innerHTML = comps.map(([l,w,v,ex])=>`
      <div class="comp-row"><span class="comp-l">${l} <span class="comp-w">×${w}</span></span>
        <span class="meter"><i style="width:${v}%;background:${v>=70?'var(--good)':v>=40?'var(--warn)':'var(--bad)'}"></i></span>
        <span class="comp-v">${v}</span></div>
      <div class="comp-ex">${ex}</div>`).join("");
  }

  function switchTo(id) {
    activeId = id;
    viewEl.innerHTML = "";
    [...tabsEl.children].forEach(a => {
      const on = a.dataset.id === id;
      a.classList.toggle("active", on);
      a.setAttribute("aria-selected", on ? "true" : "false");
      a.tabIndex = on ? 0 : -1;
    });
    const idx = VIEWS.findIndex(x => x.id === id);
    current = VIEWS[idx].mount(viewEl) || null;
    // workflow Back / Next nav
    const prev = VIEWS[idx - 1], next = VIEWS[idx + 1];
    const nav = document.createElement("div");
    nav.className = "view-nav";
    nav.innerHTML =
      (prev ? `<button class="btn secondary" data-go="${prev.id}">← ${esc(prev.label)}</button>` : `<span></span>`) +
      `<span class="step-of">Step ${idx + 1} of ${VIEWS.length}</span>` +
      (next ? `<button class="btn" data-go="${next.id}">${esc(next.label)} →</button>` : `<span></span>`);
    viewEl.appendChild(nav);
    nav.querySelectorAll("button[data-go]").forEach(b => b.addEventListener("click", () => { switchTo(b.dataset.go); window.scrollTo({ top: 0, behavior: "smooth" }); }));
    refreshJourney();
  }
  const TAB_HELP = {
    overview: "Start here — what's in scope, coverage by dimension, top risks, and your recommended next step.",
    applicable: "The ranked NFR backlog: which quality attributes apply to this system and why.",
    compliance: "Which laws & standards apply to this context, and the NFRs they make mandatory.",
    tradeoffs: "Where chosen NFRs conflict — decide which wins; each decision becomes an ADR.",
    scenarios: "Make each NFR testable: the SEI 6-part scenario with a quantified SLO.",
    maturity: "Score where you are vs target, and get a prioritized remediation roadmap.",
    export: "The verdict: your readiness score & grade, then nfrs.yaml, a governance spec, and trade-off ADRs."
  };
  tabsEl.innerHTML = VIEWS.map((v, i) => `<a href="#${v.id}" data-id="${v.id}" role="tab" aria-selected="false" tabindex="-1" title="${TAB_HELP[v.id] || ""}"><span class="step">${i + 1}</span>${v.label}</a>`).join("");
  tabsEl.querySelectorAll("a").forEach(a => a.addEventListener("click", e => { e.preventDefault(); switchTo(a.dataset.id); }));
  // roving-tabindex keyboard navigation across the tablist
  tabsEl.addEventListener("keydown", e => {
    const tabs = [...tabsEl.children];
    let idx = tabs.findIndex(a => a.dataset.id === activeId);
    if (e.key === "ArrowRight" || e.key === "ArrowDown") idx = (idx + 1) % tabs.length;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") idx = (idx - 1 + tabs.length) % tabs.length;
    else if (e.key === "Home") idx = 0;
    else if (e.key === "End") idx = tabs.length - 1;
    else return;
    e.preventDefault();
    switchTo(tabs[idx].dataset.id);
    tabs[idx].focus();
  });

  const PROFILES = [
    { name: "EU fintech (cards)", context: { domain: "fintech-trading", region: "eu", dataSensitivity: "pci", availabilityTarget: "99.99", systemCriticality: "mission-critical", deployment: "multi-region", userType: "b2c-public", dataResidency: "strict", architectureStyle: "microservices", lifecycleStage: "mature" } },
    { name: "US healthcare SaaS", context: { domain: "healthcare", region: "us", dataSensitivity: "phi", availabilityTarget: "99.99", systemCriticality: "tier-1", userType: "b2b-partner", dataResidency: "regional", architectureStyle: "modular-monolith", lifecycleStage: "growth" } },
    { name: "Global e-commerce", context: { domain: "ecommerce", region: "global", dataSensitivity: "pci", userScale: "over-1M", latencySensitivity: "high", availabilityTarget: "99.99", systemCriticality: "tier-1", userType: "b2c-public", lifecycleStage: "mature" } },
    { name: "Gen-AI startup", context: { domain: "saas-b2b", region: "eu", dataSensitivity: "pii", aiUsage: "genai", userScale: "1k-100k", lifecycleStage: "mvp", systemCriticality: "tier-2", budget: "lean", architectureStyle: "serverless" } },
    { name: "Internal tool", context: { domain: "internal-tool", region: "global", dataSensitivity: "internal", userType: "internal", availabilityTarget: "99.9", systemCriticality: "tier-3", budget: "lean", aiUsage: "none" } }
  ];
  function onContextChange() {
    const now = posture();
    showToast(diffPosture(lastPosture, now));
    lastPosture = now;
    if (current && current.onContext) current.onContext();
    refreshJourney();
  }
  UI.renderContextRail(railEl, catalog, onContextChange, PROFILES);

  const themeBtn = document.getElementById("themeToggle");
  function applyThemeIcon() { themeBtn.textContent = (document.documentElement.getAttribute("data-theme") === "light") ? "🌙 Dark" : "☀ Light"; }
  themeBtn.addEventListener("click", () => {
    const next = (document.documentElement.getAttribute("data-theme") === "light") ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", next);
    try { localStorage.setItem("nfr-theme", next); } catch (e) {}
    applyThemeIcon();
  });
  applyThemeIcon();

  const shareBtn = document.getElementById("shareBtn");
  if (shareBtn) shareBtn.addEventListener("click", () => {
    const url = location.origin + location.pathname + "#s=" + encodeURIComponent(NFR.encodeState());
    const flash = () => { const t = shareBtn.textContent; shareBtn.textContent = "✓ Copied"; setTimeout(() => { shareBtn.textContent = t; }, 1400); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(flash, () => prompt("Copy this link:", url));
    else prompt("Copy this link:", url);
  });

  switchTo(activeId);

  // ============================ OVERVIEW ============================
  function mountOverview(host) {
    host.innerHTML = `
      <details class="panel guide" id="guideDetails" style="margin-bottom:1rem">
        <summary><b>How this works</b> — the 7 tabs, in order</summary>
        <div id="guide"></div>
      </details>
      <div class="panel nextstep" id="nextStep" style="margin-bottom:1rem"></div>
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
    host.querySelector("#guide").innerHTML = [
      ["Set context (left)", "Describe the system once — domain, region, data, scale, criticality, AI. Everything reacts to it."],
      ["1 · Overview", "This page: what's in scope — regulations, coverage by dimension, top priorities, open risks — and your recommended next step."],
      ["2 · Applicable NFRs", "The ranked backlog of quality attributes that apply, with the rules that justify each."],
      ["3 · Compliance", "The laws/standards triggered by your context and the NFRs they make mandatory."],
      ["4 · Trade-offs", "Resolve conflicts between NFRs (e.g. latency vs consistency); decisions become ADRs."],
      ["5 · Scenarios", "Turn each NFR into a testable SEI 6-part scenario with a quantified SLO."],
      ["6 · Maturity & Gaps", "Rate current vs target maturity → gap heatmap → prioritized roadmap."],
      ["7 · Export", "The verdict — your readiness score & grade — then nfrs.yaml, a governance spec, and trade-off ADRs."]
    ].map(([t,d])=>`<div class="guide-row"><div class="guide-t">${t}</div><div class="hint">${d}</div></div>`).join("");

    const nextStepEl = host.querySelector("#nextStep");
    const guideDetails = host.querySelector("#guideDetails");
    // open the guide on first visit only
    try { if (!localStorage.getItem("nfr-seen-guide")) { guideDetails.open = true; localStorage.setItem("nfr-seen-guide", "1"); } } catch (e) {}

    function render() {
      const assessed = Object.keys(NFR.getMaturity()).length;
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

      // recommended next step
      let step;
      if (relevant.length === 0) step = { go: null, txt: "Set your system context on the left to begin." };
      else if (!assessed) step = { go: "maturity", txt: `Assess maturity for your ${relevant.length} relevant NFRs to compute your readiness score.` };
      else if (unresolved.length) step = { go: "tradeoffs", txt: `Resolve ${unresolved.length} open trade-off${unresolved.length===1?"":"s"} — each becomes an ADR.` };
      else step = { go: "export", txt: "You're in good shape — export your NFR spec, ADRs, and governance report." };
      nextStepEl.innerHTML = `<h2 style="margin:0 0 .3rem">✅ Recommended next step</h2><div class="row"><span class="hint" style="flex:1">${step.txt}</span>${step.go?`<button class="btn" id="nsBtn">Go →</button>`:""}</div>`;
      const nsBtn = nextStepEl.querySelector("#nsBtn");
      if (nsBtn) nsBtn.addEventListener("click", () => switchTo(step.go));
    }
    render(); return { onContext: render };
  }

  // ============================ APPLICABLE NFRs (grouped) ============================
  function mountApplicable(host) {
    host.innerHTML = `
      <div class="panel">
        <h2>Applicable NFRs</h2>
        <p class="hint">Grouped by <abbr class="term" title="ISO/IEC 25010 — the international product-quality standard; its 9 quality characteristics are the dimensions used to group NFRs here.">ISO/IEC 25010</abbr> dimension and ranked within each. <span class="mand">MANDATORY</span> = required by a regulation in scope. Click an NFR to expand the full enterprise detail — including the <b>signals &amp; alerts</b> that verify it in production (mapped to the <a href="https://github.com/gauravs19/cloud-native-observability" target="_blank" rel="noopener">cloud-native observability catalog</a>).</p>
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
        <h4>Quality attribute scenario (<abbr class="term" title="SEI 6-part quality-attribute scenario: source · stimulus · artifact · environment · response · response measure — a precise, testable way to state a quality requirement.">SEI 6-part</abbr>)</h4>
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
        ${obsBlock(n)}
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
      if(!regs.length){ regsEl.innerHTML=`<p class="hint">No regulations triggered by this context. For example: set <b>Region = eu</b> and <b>Data Sensitivity = pii</b> for GDPR, <b>Data Sensitivity = pci</b> for PCI-DSS, <b>AI Usage = genai</b> in the EU for the AI Act, or <b>Public Sector = yes</b> in the US for FedRAMP.</p>`; return; }
      const AREAS=[["privacy","Privacy & Data Protection"],["financial","Financial Services"],["healthcare","Healthcare & Life Sciences"],["security","Security & Assurance"],["ai","AI / ML Governance"],["accessibility","Accessibility"],["resilience","Operational Resilience"],["government","Government / Public Sector"]];
      const card=r=>`
        <div class="nfr-card" style="border-left-color:var(--bad);margin-bottom:.6rem">
          <div class="row"><div class="name">${esc(r.name)} — <span class="hint">${esc(r.full)}</span></div></div>
          <div class="kv" style="margin:.3rem 0"><b>Control reference:</b> ${esc(r.control)}</div>
          <div class="kv"><b>Makes mandatory:</b></div>
          <table class="tt"><tbody>${(r.drives||[]).map(id=>{const n=byId[id]; if(!n)return"";return `<tr><td><b>${esc(n.name)}</b></td><td>${sevChip(n.severity)}</td><td style="text-align:right">${esc((n.qa||{}).measure||"")}</td></tr>`;}).join("")}</tbody></table>
        </div>`;
      let html=`<div class="hint" style="margin-bottom:.6rem">${regs.length} regulation${regs.length===1?"":"s"} in scope for this context.</div>`;
      AREAS.forEach(([id,label])=>{ const inArea=regs.filter(r=>r.area===id); if(!inArea.length)return;
        html+=`<h3>${esc(label)} <span class="hint">(${inArea.length})</span></h3>${inArea.map(card).join("")}`; });
      const placed=new Set(AREAS.map(a=>a[0])); const rest=regs.filter(r=>!placed.has(r.area));
      if(rest.length) html+=`<h3>Other</h3>${rest.map(card).join("")}`;
      regsEl.innerHTML=html;
    }
    render(); return { onContext: render };
  }

  // ============================ TRADE-OFFS ============================
  function mountTradeoffs(host) {
    host.innerHTML = `
      <div class="panel" style="margin-bottom:1rem">
        <h2>Trade-off matrix</h2>
        <p class="hint">Relevant NFRs (medium+). Red = conflict, green = reinforce. <b>Click any cell</b> to decide which quality wins — or mark them balanced — and record why. Each resolved conflict becomes an ADR.</p>
        <div style="overflow:auto" id="matrixWrap"></div>
        <div class="legend"><span><span class="dot" style="background:var(--conflict-bg)"></span>conflict</span><span><span class="dot" style="background:var(--win-bg)"></span>resolved</span><span><span class="dot" style="background:var(--med-bg)"></span>balanced</span><span><span class="dot" style="background:var(--reinforce-bg)"></span>reinforce</span></div>
      </div>
      <div class="panel"><h2>Conflicts &amp; decisions</h2><div id="list"></div></div>`;
    const matrixWrap=host.querySelector("#matrixWrap"), listEl=host.querySelector("#list");
    const TENSION={ "consistency::latency":"Strong consistency adds coordination latency (CAP/PACELC).","latency::scalability":"Some scale-out patterns add network hops.","availability::cost-efficiency":"Redundancy for uptime costs idle capacity.","availability::consistency":"Partition tolerance forces a choice (CAP).","consistency::scalability":"Sharding/replication weakens global consistency.","auditability::latency":"Synchronous audit writes add to the hot path.","confidentiality::latency":"Encryption / extra hops cost time.","confidentiality::learnability":"Stricter security adds user friction.","authz::learnability":"More auth steps reduce ease of use.","integrity::latency":"Validation & signing add per-request work.","latency::modularity":"Indirection layers can cost latency.","latency::modifiability":"Abstractions for change can cost latency.","cost-efficiency::recoverability":"DR replicas cost money.","latency::portability":"Portability abstractions can cost latency.","cost-efficiency::safety":"Redundancy & certification for safety cost money.","latency::safety":"Safety checks add to reaction time.","availability::sustainability":"Always-on redundancy raises energy use.","latency::sustainability":"Carbon-aware scheduling may defer work.","cost-efficiency::ai-robustness":"Continuous monitoring & retraining cost money.","ai-explainability::latency":"Generating explanations adds inference cost." };
    const tension=(a,b)=>TENSION[[a,b].sort().join("::")]||"These qualities pull the design in opposite directions.";
    const keyOf=(a,b)=>[a,b].sort().join("::");
    function rel(a,b){ if((a.conflicts_with||[]).includes(b.id)||(b.conflicts_with||[]).includes(a.id))return"conflict"; if((a.reinforces||[]).includes(b.id)||(b.reinforces||[]).includes(a.id))return"reinforce"; return""; }
    function render() {
      const rk=ranked().filter(n=>n.tier!=="low"); const pr=NFR.getPriorities(); const rationales=NFR.getRationales();
      const byId={}; rk.forEach(n=>byId[n.id]=n);
      if(rk.length<2){matrixWrap.innerHTML=`<p class="hint">Need at least two relevant NFRs to compare. Adjust the context.</p>`;listEl.innerHTML="";closePop();return;}
      let html=`<table class="matrix" aria-label="NFR trade-off matrix"><caption class="sr-only">Trade-off matrix: each row NFR versus each column NFR. Click a conflict cell to decide which wins, mark balanced, or record a rationale.</caption><thead><tr><th class="rh"></th>`+rk.map((n,i)=>`<th class="ch" scope="col" title="${esc(n.name)}">${i+1}</th>`).join("")+`</tr></thead><tbody>`;
      rk.forEach((rowN,ri)=>{ html+=`<tr><th class="rh" scope="row" title="${esc(rowN.name)}">${ri+1} · ${esc(rowN.name)}</th>`;
        rk.forEach((colN,ci)=>{ if(ri===ci){html+=`<td class="self">—</td>`;return;}
          const r=rel(rowN,colN);
          if(r==="conflict"){const w=pr[keyOf(rowN.id,colN.id)];
            const cls=!w?"":(w==="balanced"?"balanced":(w===rowN.id?"win":"lose"));
            const mk=!w?"✕":(w==="balanced"?"=":(w===rowN.id?"✓":"·"));
            const state=!w?"unresolved":(w==="balanced"?"balanced":(w===rowN.id?esc(rowN.name)+" prioritized":esc(colN.name)+" prioritized"));
            const lbl=`${esc(rowN.name)} conflicts with ${esc(colN.name)} — ${state}`;
            html+=`<td class="conflict ${cls}" data-row="${rowN.id}" data-col="${colN.id}" title="${esc(rowN.name)} ↔ ${esc(colN.name)} — click to decide" aria-label="${lbl}">${mk}</td>`;}
          else if(r==="reinforce"){html+=`<td class="reinforce" data-row="${rowN.id}" data-col="${colN.id}" title="reinforces — click">+</td>`;} else html+=`<td></td>`; });
        html+=`</tr>`; });
      html+=`</tbody></table>`; matrixWrap.innerHTML=html;
      matrixWrap.querySelectorAll("td.conflict").forEach(td=>td.addEventListener("click",()=>openTradeoff(byId[td.dataset.row],byId[td.dataset.col],td)));
      matrixWrap.querySelectorAll("td.reinforce[data-row]").forEach(td=>td.addEventListener("click",()=>openReinforce(byId[td.dataset.row],byId[td.dataset.col],td)));
      const conflicts=NFR.activeConflicts(ranked(),"medium");
      if(!conflicts.length){listEl.innerHTML=`<p class="hint">No active conflicts for this context.</p>`;return;}
      listEl.innerHTML=`<table class="tt"><thead><tr><th>Trade-off</th><th>Tension</th><th>Decision</th></tr></thead><tbody>`+
        conflicts.map(e=>{const w=pr[e.key]; const rat=rationales[e.key];
          const st = w==="balanced" ? `<span class="pill resolved">⚖ balanced</span>` : (w?`<span class="pill resolved">prioritized: ${esc(w===e.a.id?e.a.name:e.b.name)}</span>`:`<span class="pill conflict">unresolved</span>`);
          return `<tr><td><button class="link-like to-open" data-a="${e.a.id}" data-b="${e.b.id}"><b>${esc(e.a.name)}</b> ↔ <b>${esc(e.b.name)}</b></button><br>${st}${rat?`<div class="hint to-rat-snip">“${esc(rat)}”</div>`:""}</td><td class="hint">${esc(tension(e.a.id,e.b.id))}</td>
            <td><button class="btn ${w===e.a.id?'':'secondary'}" data-key="${e.key}" data-win="${e.a.id}">${esc(e.a.name)}</button>
            <button class="btn ${w===e.b.id?'':'secondary'}" data-key="${e.key}" data-win="${e.b.id}">${esc(e.b.name)}</button>
            <button class="btn ${w==='balanced'?'':'secondary'}" data-key="${e.key}" data-win="balanced" title="Accept both — balanced">⚖</button></td></tr>`;}).join("")+`</tbody></table>`;
      listEl.querySelectorAll("button[data-key]").forEach(b=>b.addEventListener("click",()=>{NFR.setPriority(b.dataset.key,b.dataset.win);render();refreshJourney();}));
      listEl.querySelectorAll(".to-open").forEach(b=>b.addEventListener("click",()=>openTradeoff(byId[b.dataset.a],byId[b.dataset.b],b)));
    }

    // ---------- decision popover (desktop) / modal (mobile) ----------
    let popEl=null, backdropEl=null;
    function closePop(){ if(popEl){popEl.remove();popEl=null;} if(backdropEl){backdropEl.remove();backdropEl=null;}
      document.removeEventListener("keydown",onEsc);
      document.removeEventListener("mousedown",onOutside,true);
      window.removeEventListener("scroll",onScroll,true);
      window.removeEventListener("resize",closePop); }
    function onEsc(e){ if(e.key==="Escape") closePop(); }
    function onOutside(e){ if(popEl && !popEl.contains(e.target)) closePop(); }   // click anywhere outside dismisses
    function onScroll(){ closePop(); }   // a fixed popover can't follow the cell, so close on scroll
    function placePop(anchor){
      if(popEl.classList.contains("modal")||!anchor) return;
      const r=anchor.getBoundingClientRect(), pw=popEl.offsetWidth, ph=popEl.offsetHeight;
      const vw=document.documentElement.clientWidth, vh=document.documentElement.clientHeight;
      let left=r.right+8; if(left+pw>vw-8) left=r.left-pw-8; if(left<8) left=8;
      let top=r.top; if(top+ph>vh-8) top=vh-ph-8; if(top<8) top=8;
      popEl.style.left=left+"px"; popEl.style.top=top+"px";
    }
    function makePop(label){
      closePop();
      const isMobile=window.matchMedia("(max-width:560px)").matches;
      if(isMobile){ backdropEl=document.createElement("div"); backdropEl.className="to-backdrop"; backdropEl.addEventListener("click",closePop); host.appendChild(backdropEl); }
      popEl=document.createElement("div");
      popEl.className="to-pop"+(isMobile?" modal":"");
      popEl.setAttribute("role","dialog"); popEl.setAttribute("aria-modal","true"); popEl.setAttribute("aria-label",label);
      host.appendChild(popEl);
      document.addEventListener("keydown",onEsc);
      setTimeout(() => document.addEventListener("mousedown",onOutside,true), 0);   // defer so the opening click doesn't self-close
      window.addEventListener("scroll",onScroll,true);
      window.addEventListener("resize",closePop);
      return popEl;
    }
    function openTradeoff(a,b,anchor){
      if(!a||!b) return;
      const key=keyOf(a.id,b.id); const w=NFR.getPriorities()[key]; const rat=NFR.getRationales()[key]||"";
      const slo=n=>esc((n.qa||{}).measure||"—");
      const choice=n=>`<button class="to-choice ${w===n.id?'sel':''}" data-pick="${n.id}"><span class="to-name">${esc(n.name)}</span><span class="to-slo">${slo(n)}</span></button>`;
      const p=makePop(`Trade-off: ${a.name} versus ${b.name}`);
      p.innerHTML=`
        <div class="to-head"><span><b>${esc(a.name)}</b> ↔ <b>${esc(b.name)}</b></span><button class="to-x" aria-label="Close">✕</button></div>
        <div class="hint to-tension">${esc(tension(a.id,b.id))}</div>
        <div class="to-q">Which wins where they conflict?</div>
        <div class="to-choices">${choice(a)}${choice(b)}</div>
        <button class="to-balanced ${w==='balanced'?'sel':''}" data-pick="balanced">⚖ Balanced — accept both, no single winner</button>
        <label class="to-rat-l">Rationale <span class="hint">(optional — flows into the ADR)</span></label>
        <textarea class="to-rat" rows="2" placeholder="Why this decision?">${esc(rat)}</textarea>
        <div class="to-foot"><button class="btn secondary to-clear">Clear</button><span class="hint to-adr"></span></div>`;
      placePop(anchor);
      const adr=p.querySelector(".to-adr"); const updAdr=()=>{ adr.textContent=NFR.getPriorities()[key]?"✓ recorded — becomes an ADR":"unresolved"; };
      updAdr();
      const refreshSel=v=>p.querySelectorAll("[data-pick]").forEach(x=>x.classList.toggle("sel",x.dataset.pick===v));
      p.querySelectorAll("[data-pick]").forEach(btn=>btn.addEventListener("click",()=>{ NFR.setPriority(key,btn.dataset.pick); refreshSel(btn.dataset.pick); render(); refreshJourney(); updAdr(); }));
      const ta=p.querySelector(".to-rat"); ta.addEventListener("change",()=>{ NFR.setRationale(key,ta.value.trim()); render(); });
      p.querySelector(".to-clear").addEventListener("click",()=>{ NFR.setPriority(key,null); refreshSel(null); render(); refreshJourney(); updAdr(); });
      p.querySelector(".to-x").addEventListener("click",closePop);
      const f=p.querySelector(".to-choice"); if(f) f.focus();
    }
    function openReinforce(a,b,anchor){
      if(!a||!b) return;
      const p=makePop(`Reinforce: ${a.name} and ${b.name}`);
      p.innerHTML=`<div class="to-head"><span><b>${esc(a.name)}</b> ＋ <b>${esc(b.name)}</b></span><button class="to-x" aria-label="Close">✕</button></div>
        <div class="hint">These qualities <b>reinforce</b> each other — investing in one tends to help the other, so there's no trade-off to resolve. Pursue their tactics together.</div>`;
      placePop(anchor);
      p.querySelector(".to-x").addEventListener("click",closePop);
      p.querySelector(".to-x").focus();
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
        const id=inp.dataset.id,f=inp.dataset.f; const cur=NFR.getScenarios()[id]||Object.assign({},(catalog.nfrs.find(x=>x.id===id)||{}).qa); cur[f]=inp.value; NFR.setScenario(id,cur);refreshJourney();}));
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
      matTable.querySelectorAll("select[data-mat]").forEach(s=>s.addEventListener("change",()=>{NFR.setMaturity(s.dataset.mat,parseInt(s.value,10));render();refreshJourney();}));
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
      <div class="panel score-panel" style="margin-bottom:1rem">
        <div class="score-gauge" id="gauge"></div>
        <div class="score-body">
          <h2 style="margin:0">NFR Readiness Score</h2>
          <p class="hint" id="scoreHint"></p>
          <div id="scoreComps"></div>
        </div>
      </div>
      <div class="panel" style="margin-bottom:1rem">
        <h2>Export</h2>
        <p class="hint"><b>nfrs.yaml</b> machine-readable (SLOs, compliance, maturity); <b>nfrs.md</b> the governance spec; <b>ADRs</b> the trade-off decisions.</p>
        <div class="row"><div class="seg" style="max-width:360px" role="group" aria-label="Export format">
          <button class="active" data-tab="yaml" aria-pressed="true">nfrs.yaml</button><button data-tab="md" aria-pressed="false">nfrs.md</button><button data-tab="adr" aria-pressed="false">ADRs</button>
        </div><span class="spacer"></span><button class="btn secondary" id="copyBtn">Copy</button><button class="btn" id="dlBtn">Download</button></div>
        <div class="row" style="margin-top:.7rem;padding-top:.7rem;border-top:1px solid var(--line)">
          <span class="hint" style="flex:1">Full assessment state (context · scenarios · trade-offs · maturity) — back up, transfer between machines, or re-import later.</span>
          <button class="btn secondary" id="expStateBtn">Export state (.json)</button>
          <button class="btn secondary" id="impStateBtn">Import state</button>
          <input type="file" id="impStateFile" accept="application/json,.json" hidden>
        </div>
      </div>
      <pre class="export" id="out"></pre>`;
    const out=host.querySelector("#out"); let tab="yaml";
    const gaugeEl=host.querySelector("#gauge"), scoreHint=host.querySelector("#scoreHint"), scoreComps=host.querySelector("#scoreComps");
    const yEsc=s=>/[:#{}\[\],&*?|<>=!%@`"']/.test(String(s))?JSON.stringify(s):s;
    function gather(){const ctx=NFR.getContext();const all=ranked();const rk=all.filter(n=>n.tier!=="low");const scenarios=NFR.getScenarios();const priorities=NFR.getPriorities();const mat=NFR.getMaturity();const owners=NFR.getOwners();const conflicts=NFR.activeConflicts(all,"medium");const regs=NFR.applicableRegulations(catalog,ctx);const rationales=NFR.getRationales();rk.forEach(n=>{n.scenario=scenarios[n.id]||n.qa;n.cur=(typeof mat[n.id]==="number")?mat[n.id]:0;n.tgt=NFR.targetMaturity(n.tier);n.gap=Math.max(0,n.tgt-n.cur);n.owner=owners[n.id]||"";});return {ctx,rk,conflicts,priorities,rationales,regs};}
    function toYaml(){const {ctx,rk,conflicts,priorities,rationales,regs}=gather();let y="# Generated by NFR Advisor — ISO/IEC 25010, arc42 Q42, ATAM/SEI scenarios\ncontext:\n";Object.keys(ctx).forEach(k=>y+=`  ${k}: ${yEsc(String(ctx[k]))}\n`);
      y+="compliance:\n";if(!regs.length)y+="  []\n";regs.forEach(r=>{y+=`  - id: ${r.id}\n    name: ${yEsc(r.name)}\n    control: ${yEsc(r.control)}\n    mandates: [${(r.drives||[]).join(", ")}]\n`;});
      y+="nfrs:\n";rk.forEach(n=>{const q=n.scenario||{};y+=`  - id: ${n.id}\n    name: ${yEsc(n.name)}\n    category: ${n.category}\n    iso: ${yEsc(n.iso)}\n    importance: ${n.tier}\n    severity: ${n.severity}\n    mandatory: ${!!n.mandatory}\n    regulations: [${(n.regs||[]).join(", ")}]\n`;
        y+=`    scenario:\n      source: ${yEsc(q.source||"")}\n      stimulus: ${yEsc(q.stimulus||"")}\n      artifact: ${yEsc(q.artifact||"")}\n      environment: ${yEsc(q.environment||"")}\n      response: ${yEsc(q.response||"")}\n      measure: ${yEsc(q.measure||"")}\n`;
        y+=`    maturity: { current: ${n.cur}, target: ${n.tgt}, gap: ${n.gap} }\n`;if(n.owner)y+=`    owner: ${yEsc(n.owner)}\n`;y+=`    fitness_function: ${yEsc(n.fitnessFunction)}\n    tactics:\n`;(n.tactics||[]).forEach(t=>y+=`      - ${yEsc(t)}\n`);});
      y+="tradeoffs:\n";if(!conflicts.length)y+="  []\n";conflicts.forEach(e=>{const w=priorities[e.key];const res=!w?"UNRESOLVED":(w==="balanced"?"balanced":("prioritize "+w));y+=`  - between: [${e.a.id}, ${e.b.id}]\n    resolution: ${res}\n`;if(rationales[e.key])y+=`    rationale: ${yEsc(rationales[e.key])}\n`;});return y;}
    function toMd(){const {ctx,rk,conflicts,priorities,rationales,regs}=gather();let m="# Non-Functional Requirements\n\n_Generated by NFR Advisor — ISO/IEC 25010, arc42 Q42, ATAM/SEI._\n\n## System context\n\n| Dimension | Value |\n|---|---|\n";Object.keys(ctx).forEach(k=>m+=`| ${k} | ${ctx[k]} |\n`);
      m+="\n## Compliance obligations\n\n";if(!regs.length)m+="_No regulations triggered by this context._\n";regs.forEach(r=>{m+=`- **${r.name}** (${r.full}) — ${r.control}\n  - Mandates: ${(r.drives||[]).join(", ")}\n`;});
      m+="\n## Quality requirements (by importance)\n\n";["high","medium"].forEach(tier=>{const g=rk.filter(n=>n.tier===tier);if(!g.length)return;m+=`### ${tier==="high"?"High importance":"Medium importance"}\n\n`;
        g.forEach(n=>{const q=n.scenario||{};m+=`#### ${n.name}${n.mandatory?" — MANDATORY":""} _(severity: ${n.severity})_\n- **ISO 25010:** ${n.iso}\n`;if(n.businessImpact)m+=`- **Business impact:** ${n.businessImpact}\n`;if(n.regs&&n.regs.length)m+=`- **Compliance:** ${n.regs.join(", ")}\n`;
          m+=`- **Scenario:** [${q.source}] ${q.stimulus} → ${q.response}\n- **Measure (SLO):** ${q.measure}\n- **Maturity:** current ${n.cur}/5, target ${n.tgt}/5, gap ${n.gap}${n.owner?` (owner: ${n.owner})`:""}\n- **Tactics:** ${(n.tactics||[]).join("; ")}\n- **Verify:** ${n.fitnessFunction}\n\n`;});});
      m+="## Trade-offs\n\n";if(!conflicts.length)m+="_No active conflicts._\n";conflicts.forEach(e=>{const w=priorities[e.key];const dec=!w?"_unresolved_":(w==="balanced"?"**balanced** (accept both)":("prioritize **"+(w===e.a.id?e.a.name:e.b.name)+"**"));m+=`- **${e.a.name} ↔ ${e.b.name}** — ${dec}${rationales[e.key]?` — _${rationales[e.key]}_`:""}\n`;});return m;}
    function toAdr(){const {ctx,conflicts,priorities,rationales}=gather();if(!conflicts.length)return"# No trade-off ADRs\n\nNo conflicts among the selected NFRs for this context.\n";
      return conflicts.map((e,i)=>{const w=priorities[e.key],num=String(i+1).padStart(4,"0");const balanced=w==="balanced";
        const winner=(w&&!balanced)?(w===e.a.id?e.a:e.b):null,loser=(w&&!balanced)?(w===e.a.id?e.b:e.a):null;
        const status=balanced?"Accepted":(w?"Accepted":"Proposed (UNRESOLVED)");
        const decision=balanced?`Treat **${e.a.name}** and **${e.b.name}** as **balanced** — neither is sacrificed; tune both to their SLOs.`
          :(w?`Prioritize **${winner.name}** over **${loser.name}** where they conflict.`:"_Not yet decided._");
        const consequences=balanced?`- Pursue tactics for both: ${(e.a.tactics||[]).slice(0,2).join("; ")}; ${(e.b.tactics||[]).slice(0,2).join("; ")}.\n- Watch both measures: ${(e.a.qa||{}).measure}; ${(e.b.qa||{}).measure}.`
          :(w?`- Favour tactics for ${winner.name}: ${(winner.tactics||[]).slice(0,3).join("; ")}.\n- Accept reduced ${loser.name}; mitigate via: ${(loser.tactics||[]).slice(0,2).join("; ")}.\n- Watch: ${(winner.qa||{}).measure}.`:"- Pending decision.");
        const rat=rationales[e.key]?`\n\n## Rationale\n${rationales[e.key]}`:"";
        return `# ADR-${num}: Trade-off between ${e.a.name} and ${e.b.name}\n\n## Status\n${status}\n\n## Context\nFor a ${ctx.domain} system (${ctx.region}) at ${ctx.userScale} scale, criticality ${ctx.systemCriticality}, **${e.a.name}** and **${e.b.name}** are both relevant but conflict.\n\n## Decision\n${decision}${rat}\n\n## Consequences\n${consequences}\n`;}).join("\n---\n\n");}
    const content=()=>tab==="yaml"?toYaml():tab==="md"?toMd():toAdr();
    const filename=()=>tab==="yaml"?"nfrs.yaml":tab==="md"?"nfrs.md":"adr-tradeoffs.md";
    const render=()=>out.textContent=content();
    host.querySelectorAll("button[data-tab]").forEach(b=>b.addEventListener("click",()=>{host.querySelectorAll("button[data-tab]").forEach(x=>{x.classList.remove("active");x.setAttribute("aria-pressed","false");});b.classList.add("active");b.setAttribute("aria-pressed","true");tab=b.dataset.tab;render();}));
    host.querySelector("#copyBtn").addEventListener("click",()=>{navigator.clipboard.writeText(content());const btn=host.querySelector("#copyBtn");const t=btn.textContent;btn.textContent="Copied!";setTimeout(()=>btn.textContent=t,1200);});
    host.querySelector("#dlBtn").addEventListener("click",()=>{const blob=new Blob([content()],{type:"text/plain"});const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=filename();a.click();URL.revokeObjectURL(a.href);});
    // full-state JSON export / import
    host.querySelector("#expStateBtn").addEventListener("click",()=>{const blob=new Blob([JSON.stringify(NFR.loadState(),null,2)],{type:"application/json"});const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="nfr-advisor-state.json";a.click();URL.revokeObjectURL(a.href);});
    const impFile=host.querySelector("#impStateFile");
    host.querySelector("#impStateBtn").addEventListener("click",()=>impFile.click());
    impFile.addEventListener("change",()=>{const f=impFile.files&&impFile.files[0];if(!f)return;const r=new FileReader();r.onload=()=>{let ok=false;try{ok=NFR.importState(JSON.parse(r.result));}catch(e){}if(ok)location.reload();else alert("Could not import: not a valid NFR Advisor state file.");};r.readAsText(f);});
    function refreshAll(){ paintScore(gaugeEl, scoreHint, scoreComps); render(); }
    refreshAll(); return { onContext: refreshAll };
  }
})();
