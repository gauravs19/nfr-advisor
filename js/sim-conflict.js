/* Screen 3 — Trade-off graph (p5 radial) + resolution table */
(async function () {
  UI.renderTopbar("conflict.html");
  const catalog = await NFR.loadCatalog();
  const rail = document.getElementById("rail");
  const host = document.getElementById("host");
  const edgesEl = document.getElementById("edges");

  let ranked = [], conflicts = [], nodes = [];
  let W = 800, H = 460;

  function rebuild(ctx) {
    ranked = NFR.rankNfrs(catalog, ctx).filter(n => n.tier !== "low");
    conflicts = NFR.activeConflicts(NFR.rankNfrs(catalog, ctx), "medium");

    // radial placement
    const cx = W / 2, cy = H / 2, R = Math.min(W, H) / 2 - 60;
    nodes = ranked.map((n, i) => {
      const ang = (i / ranked.length) * Math.PI * 2 - Math.PI / 2;
      return Object.assign(n, { x: cx + Math.cos(ang) * R, y: cy + Math.sin(ang) * R });
    });
    renderEdges();
  }

  function renderEdges() {
    const priorities = NFR.getPriorities();
    if (!conflicts.length) {
      edgesEl.innerHTML = `<p class="hint">No active conflicts among the relevant NFRs for this context. Either the context is benign, or the conflicting qualities aren't both in scope. Try raising availability target, data sensitivity, or latency sensitivity.</p>`;
      return;
    }
    edgesEl.innerHTML = `<table class="tt"><thead><tr><th>Trade-off</th><th>Tension</th><th>Decision</th></tr></thead><tbody>` +
      conflicts.map(e => {
        const winner = priorities[e.key];
        const status = winner
          ? `<span class="pill resolved">prioritized: ${winner === e.a.id ? e.a.name : e.b.name}</span>`
          : `<span class="pill conflict">unresolved</span>`;
        return `<tr>
          <td><b>${e.a.name}</b> ↔ <b>${e.b.name}</b><br>${status}</td>
          <td class="hint">${tension(e.a.id, e.b.id)}</td>
          <td>
            <button class="btn ${winner===e.a.id?'':'secondary'}" data-key="${e.key}" data-win="${e.a.id}">${e.a.name}</button>
            <button class="btn ${winner===e.b.id?'':'secondary'}" data-key="${e.key}" data-win="${e.b.id}">${e.b.name}</button>
          </td></tr>`;
      }).join("") + `</tbody></table>`;

    edgesEl.querySelectorAll("button[data-key]").forEach(b => {
      b.addEventListener("click", () => {
        NFR.setPriority(b.getAttribute("data-key"), b.getAttribute("data-win"));
        renderEdges();
      });
    });
  }

  function tension(a, b) {
    const map = {
      "consistency::latency": "Strong consistency adds coordination latency (CAP/PACELC).",
      "latency::scalability": "Some scale-out patterns add network hops.",
      "availability::cost-efficiency": "Redundancy for uptime costs more idle capacity.",
      "availability::consistency": "Partition tolerance forces a choice (CAP).",
      "consistency::scalability": "Sharding/replication weakens global consistency.",
      "auditability::latency": "Synchronous audit writes add to the hot path.",
      "confidentiality::latency": "Encryption / extra hops cost time.",
      "confidentiality::learnability": "Stricter security adds user friction.",
      "authz::learnability": "More auth steps reduce ease of use.",
      "integrity::latency": "Validation & signing add per-request work.",
      "latency::modularity": "Indirection layers can cost latency.",
      "latency::modifiability": "Abstractions for change can cost latency.",
      "cost-efficiency::recoverability": "DR replicas cost money.",
      "latency::portability": "Portability abstractions can cost latency."
    };
    return map[[a, b].sort().join("::")] || "These qualities pull the design in opposite directions.";
  }

  new p5(function (p) {
    p.setup = function () {
      W = Math.min(host.clientWidth || 800, 900); H = 460;
      p.createCanvas(W, H).parent(host);
      rebuild(NFR.getContext());
      UI.renderContextRail(rail, catalog, (ctx) => rebuild(ctx));
    };
    p.windowResized = function () { W = Math.min(host.clientWidth || 800, 900); p.resizeCanvas(W, H); rebuild(NFR.getContext()); };
    p.draw = function () {
      p.background(11, 18, 32);
      const priorities = NFR.getPriorities();
      const byId = {}; nodes.forEach(n => byId[n.id] = n);
      conflicts.forEach(e => {
        const a = byId[e.a.id], b = byId[e.b.id];
        if (!a || !b) return;
        const resolved = !!priorities[e.key];
        if (resolved) { p.stroke(34,197,94,160); p.strokeWeight(1.6); }
        else { p.stroke(239,68,68,170); p.strokeWeight(2.2); }
        p.line(a.x, a.y, b.x, b.y);
      });
      nodes.forEach(n => {
        const col = p.color(NFR.categoryColor(catalog, n.category));
        col.setAlpha(235); p.fill(col); p.noStroke();
        p.circle(n.x, n.y, 26);
        p.fill(230); p.textAlign(p.CENTER, p.CENTER); p.textSize(9);
        const label = n.name.length > 16 ? n.name.slice(0,14)+"…" : n.name;
        p.text(label, n.x, n.y + 22);
      });
    };
  });
})();
