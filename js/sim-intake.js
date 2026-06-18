/* Screen 1 — Context Intake */
(async function () {
  UI.renderTopbar("intake.html");
  const catalog = await NFR.loadCatalog();
  const rail = document.getElementById("rail");
  const summary = document.getElementById("summary");
  const preview = document.getElementById("preview");

  function render(ctx) {
    summary.innerHTML = catalog.contextDimensions.map(d =>
      `<span class="detail-card"><span class="tag">${d.label}: ${ctx[d.id]}</span></span>`
    ).join("");

    const ranked = NFR.rankNfrs(catalog, ctx).slice(0, 6);
    preview.innerHTML = ranked.map(n => {
      const color = NFR.categoryColor(catalog, n.category);
      return `<div class="nfr-card" style="border-left-color:${color}">
        <div class="name">${n.name}</div>
        <div class="kv">${NFR.categoryLabel(catalog, n.category)}</div>
        <div class="bar"><i style="width:${Math.round(n.relevance*100)}%;background:${color}"></i></div>
        <div class="kv tier-${n.tier}">${n.tier.toUpperCase()} · score ${n.score}</div>
      </div>`;
    }).join("");
  }

  UI.renderContextRail(rail, catalog, render);
  render(NFR.getContext());
})();
