/* Screen 5 — Scenario Editor (DOM). Prefills from template, persists per-NFR edits. */
(async function () {
  UI.renderTopbar("scenario.html");
  const catalog = await NFR.loadCatalog();
  const rail = document.getElementById("rail");
  const wrap = document.getElementById("scenarios");

  function render(ctx) {
    const ranked = NFR.rankNfrs(catalog, ctx).filter(n => n.tier !== "low");
    const saved = NFR.getScenarios();
    if (!ranked.length) { wrap.innerHTML = `<p class="hint">No medium/high relevance NFRs for this context yet.</p>`; return; }
    wrap.innerHTML = ranked.map(n => {
      const s = saved[n.id] || n.scenarioTemplate;
      const color = NFR.categoryColor(catalog, n.category);
      return `<div class="nfr-card" style="border-left-color:${color};margin-bottom:.7rem">
        <div class="row"><div class="name">${n.name}</div><span class="tag tier-${n.tier}">${n.tier.toUpperCase()}</span></div>
        <div class="control"><label>Stimulus (trigger / condition)</label><input type="text" data-id="${n.id}" data-f="stimulus" value="${esc(s.stimulus)}"></div>
        <div class="control"><label>Response (expected behaviour)</label><input type="text" data-id="${n.id}" data-f="response" value="${esc(s.response)}"></div>
        <div class="control"><label>Measure (acceptance criterion)</label><input type="text" data-id="${n.id}" data-f="measure" value="${esc(s.measure)}"></div>
        <div class="kv">Fitness function: <span class="mono">${n.fitnessFunction}</span></div>
      </div>`;
    }).join("");

    wrap.querySelectorAll("input[data-id]").forEach(inp => {
      inp.addEventListener("change", () => {
        const id = inp.getAttribute("data-id");
        const f = inp.getAttribute("data-f");
        const current = NFR.getScenarios()[id] || Object.assign({}, (catalog.nfrs.find(x=>x.id===id)||{}).scenarioTemplate);
        current[f] = inp.value;
        NFR.setScenario(id, current);
      });
    });
  }
  function esc(s){ return (s||"").replace(/"/g,"&quot;"); }

  UI.renderContextRail(rail, catalog, render);
  render(NFR.getContext());
})();
