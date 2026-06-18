/* Screen 4 — Utility Tree (p5 horizontal tree). Root → categories → NFR leaves (tier-ranked). */
(async function () {
  UI.renderTopbar("utility-tree.html");
  const catalog = await NFR.loadCatalog();
  const rail = document.getElementById("rail");
  const host = document.getElementById("host");

  let tree = null, W = 820, H = 560;

  function build(ctx) {
    const ranked = NFR.rankNfrs(catalog, ctx).filter(n => n.tier !== "low");
    const byCat = {};
    ranked.forEach(n => { (byCat[n.category] = byCat[n.category] || []).push(n); });
    const cats = Object.keys(byCat).map(catId => ({
      id: catId,
      label: NFR.categoryLabel(catalog, catId),
      color: NFR.categoryColor(catalog, catId),
      leaves: byCat[catId].sort((a,b)=>b.score-a.score)
    }));
    const totalLeaves = ranked.length || 1;
    tree = { cats, totalLeaves };
    layout();
  }

  function layout() {
    if (!tree) return;
    const xRoot = 60, xCat = W * 0.36, xLeaf = W * 0.62;
    let leafIdx = 0;
    const gap = (H - 40) / tree.totalLeaves;
    tree.cats.forEach(cat => {
      const start = leafIdx;
      cat.leaves.forEach(leaf => {
        leaf.x = xLeaf;
        leaf.y = 20 + gap * (leafIdx + 0.5);
        leafIdx++;
      });
      cat.x = xCat;
      cat.y = cat.leaves.length ? (cat.leaves[0].y + cat.leaves[cat.leaves.length-1].y) / 2 : 20 + gap*(start+0.5);
    });
    tree.rootX = xRoot; tree.rootY = H/2;
  }

  new p5(function (p) {
    p.setup = function () {
      W = Math.min(host.clientWidth || 820, 980); H = 560;
      p.createCanvas(W, H).parent(host);
      build(NFR.getContext());
      UI.renderContextRail(rail, catalog, (ctx) => build(ctx));
    };
    p.windowResized = function () { W = Math.min(host.clientWidth || 820, 980); p.resizeCanvas(W, H); build(NFR.getContext()); };
    p.draw = function () {
      p.background(11, 18, 32);
      if (!tree) return;
      // edges root->cat
      p.stroke(80, 100, 130); p.strokeWeight(1.4);
      tree.cats.forEach(cat => p.line(tree.rootX+8, tree.rootY, cat.x-4, cat.y));
      // edges cat->leaf
      tree.cats.forEach(cat => {
        cat.leaves.forEach(leaf => {
          const c = p.color(cat.color); c.setAlpha(150); p.stroke(c); p.strokeWeight(1.2);
          p.line(cat.x+4, cat.y, leaf.x-4, leaf.y);
        });
      });
      // root
      p.noStroke(); p.fill(56,189,248); p.rectMode(p.CENTER);
      p.rect(tree.rootX, tree.rootY, 70, 30, 6);
      p.fill(4,38,58); p.textAlign(p.CENTER,p.CENTER); p.textSize(12); p.text("Utility", tree.rootX, tree.rootY);
      // categories
      tree.cats.forEach(cat => {
        p.fill(cat.color); p.rect(cat.x, cat.y, 14, 14, 3);
        p.fill(220); p.textAlign(p.LEFT,p.CENTER); p.textSize(11);
        p.text(cat.label, cat.x+14, cat.y);
      });
      // leaves
      tree.cats.forEach(cat => {
        cat.leaves.forEach(leaf => {
          const tcol = leaf.tier === "high" ? p.color(34,197,94) : p.color(234,179,8);
          p.fill(tcol); p.noStroke(); p.circle(leaf.x, leaf.y, 11);
          p.fill(210); p.textAlign(p.LEFT,p.CENTER); p.textSize(10);
          const meas = leaf.scenarioTemplate.measure;
          p.text(leaf.name + "  —  " + (meas.length>34?meas.slice(0,32)+"…":meas), leaf.x+10, leaf.y);
        });
      });
    };
  });
})();
