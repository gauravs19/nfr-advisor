/* Screen 2 — Relevance Canvas (p5). Animated bubble layout; nodes re-rank & resize on context change. */
(async function () {
  UI.renderTopbar("canvas.html");
  const catalog = await NFR.loadCatalog();
  const rail = document.getElementById("rail");
  const host = document.getElementById("host");
  const detailPanel = document.getElementById("detailPanel");
  const legendEl = document.getElementById("legend");

  // node model with animated target positions/sizes
  let nodes = [];
  let edges = [];
  let selectedId = null;
  let W = 800, H = 540;

  function layout(ranked) {
    // grid layout sorted by score, packed into columns
    const cols = 4;
    const cellW = W / cols;
    const rows = Math.ceil(ranked.length / cols);
    const cellH = (H - 20) / rows;
    ranked.forEach((n, i) => {
      const c = i % cols, r = Math.floor(i / cols);
      n.tx = cellW * c + cellW / 2;
      n.ty = cellH * r + cellH / 2 + 10;
      n.tr = 16 + n.relevance * 34; // target radius
    });
    return ranked;
  }

  function rebuild(ctx) {
    const ranked = layout(NFR.rankNfrs(catalog, ctx));
    const byId = {};
    ranked.forEach(r => byId[r.id] = r);

    // preserve animated positions for existing nodes
    const prev = {};
    nodes.forEach(n => prev[n.id] = n);
    nodes = ranked.map(r => {
      const p = prev[r.id];
      return Object.assign(r, {
        x: p ? p.x : r.tx + (Math.sin(r.id.length) * 40),
        y: p ? p.y : r.ty,
        rad: p ? p.rad : 4
      });
    });

    const conf = NFR.activeConflicts(ranked, "medium");
    const rein = NFR.reinforceEdges(ranked, "medium");
    edges = conf.map(e => ({ a: e.a.id, b: e.b.id, type: "conflict" }))
      .concat(rein.map(e => ({ a: e.a.id, b: e.b.id, type: "reinforce" })));

    legendEl.innerHTML = catalog.categories.map(c =>
      `<span><span class="dot" style="background:${c.color}"></span>${c.label}</span>`).join("") +
      `<span><span class="dot" style="background:#ef4444"></span>conflict link</span>` +
      `<span><span class="dot" style="background:#22c55e"></span>reinforce link</span>`;
  }

  function showDetail(n) {
    const ctx = NFR.getContext();
    const firedHtml = (n.fired && n.fired.length)
      ? n.fired.map(f => `<span class="tag">${Object.entries(f.when).map(([k,v])=>k+"="+v).join(", ")} → +${f.weight}</span>`).join("")
      : `<span class="hint">base relevance only</span>`;
    detailPanel.innerHTML = `
      <h2 style="border-left:5px solid ${NFR.categoryColor(catalog,n.category)};padding-left:.5rem">${n.name}</h2>
      <div class="detail-card">
        <span class="tag">${NFR.categoryLabel(catalog,n.category)}</span>
        <span class="tag tier-${n.tier}">${n.tier.toUpperCase()} · score ${n.score}</span>
        <span class="tag">ISO: ${n.iso}</span>
        <h3>Why it applies (rules fired for this context)</h3>${firedHtml}
        <h3>How to measure</h3>
        <div class="mono">${n.scenarioTemplate.stimulus} → <b>${n.scenarioTemplate.response}</b> → measure: <b>${n.scenarioTemplate.measure}</b></div>
        <h3>Metrics</h3><ul>${n.metrics.map(m=>`<li>${m}</li>`).join("")}</ul>
        <h3>Tactics</h3><ul>${n.tactics.map(t=>`<li>${t}</li>`).join("")}</ul>
        <h3>Fitness function</h3><div class="mono">${n.fitnessFunction}</div>
        ${(n.conflicts_with||[]).length ? `<h3>Conflicts with</h3><div>${n.conflicts_with.map(c=>`<span class="tag">${c}</span>`).join("")}</div>`:""}
      </div>`;
  }

  new p5(function (p) {
    p.setup = function () {
      W = Math.min(host.clientWidth || 800, 1000); H = 540;
      const cnv = p.createCanvas(W, H);
      cnv.parent(host);
      rebuild(NFR.getContext());
      UI.renderContextRail(rail, catalog, (ctx) => rebuild(ctx));
    };

    p.windowResized = function () {
      W = Math.min(host.clientWidth || 800, 1000);
      p.resizeCanvas(W, H);
      rebuild(NFR.getContext());
    };

    p.draw = function () {
      p.background(11, 18, 32);
      const byId = {}; nodes.forEach(n => byId[n.id] = n);

      // ease toward targets
      nodes.forEach(n => {
        n.x += (n.tx - n.x) * 0.12;
        n.y += (n.ty - n.y) * 0.12;
        n.rad += (n.tr - n.rad) * 0.12;
      });

      // edges
      edges.forEach(e => {
        const a = byId[e.a], b = byId[e.b];
        if (!a || !b) return;
        if (e.type === "conflict") { p.stroke(239,68,68,150); p.strokeWeight(1.6); }
        else { p.stroke(34,197,94,90); p.strokeWeight(1.2); }
        p.line(a.x, a.y, b.x, b.y);
      });

      // nodes
      nodes.forEach(n => {
        const col = p.color(NFR.categoryColor(catalog, n.category));
        const sel = n.id === selectedId;
        p.noStroke();
        if (sel) { p.stroke(255); p.strokeWeight(2); }
        col.setAlpha(n.tier === "low" ? 110 : 235);
        p.fill(col);
        p.circle(n.x, n.y, n.rad * 2);
        p.noStroke();
        p.fill(n.tier === "low" ? 150 : 235);
        p.textAlign(p.CENTER, p.CENTER);
        p.textSize(n.rad > 26 ? 11 : 9);
        const label = n.name.length > 18 ? n.name.slice(0, 16) + "…" : n.name;
        p.text(label, n.x, n.y + n.rad + 9);
      });
    };

    p.mousePressed = function () {
      if (p.mouseX < 0 || p.mouseX > W || p.mouseY < 0 || p.mouseY > H) return;
      let hit = null;
      nodes.forEach(n => {
        if (p.dist(p.mouseX, p.mouseY, n.x, n.y) <= n.rad) hit = n;
      });
      if (hit) { selectedId = hit.id; showDetail(hit); }
    };
  });
})();
