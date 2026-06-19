/* NFR Advisor — shared UI: the persistent, grouped context control rail */
(function (global) {
  "use strict";

  // logical groupings for the context dimensions (ids must match the catalog)
  const GROUPS = [
    { title: "Business & domain", dims: ["domain", "region", "publicSector", "userType", "lifecycleStage"] },
    { title: "Scale & performance", dims: ["userScale", "latencySensitivity", "availabilityTarget", "systemCriticality"] },
    { title: "Data & compliance", dims: ["dataSensitivity", "dataResidency"] },
    { title: "Architecture & delivery", dims: ["architectureStyle", "deployment", "teamMaturity", "budget"] },
    { title: "AI / ML", dims: ["aiUsage"] }
  ];

  function dimControl(dim, ctx) {
    const buttons = dim.options.map(opt =>
      `<button data-dim="${dim.id}" data-val="${opt}" class="${ctx[dim.id] === opt ? "active" : ""}">${opt}</button>`
    ).join("");
    return `<div class="control"><label>${dim.label}</label><div class="seg">${buttons}</div></div>`;
  }

  function renderContextRail(host, catalog, onChange) {
    const ctx = NFR.getContext();
    const byId = {}; catalog.contextDimensions.forEach(d => byId[d.id] = d);
    const used = new Set();

    let html = `<div class="rail-head"><h2>System context</h2><button class="btn secondary" id="resetCtx">Reset</button></div>`;
    GROUPS.forEach((g, gi) => {
      const dims = g.dims.map(id => byId[id]).filter(Boolean);
      if (!dims.length) return;
      dims.forEach(d => used.add(d.id));
      html += `<div class="rail-group"><div class="rail-group-head" data-grp="${gi}"><span class="chev">▾</span>${g.title}</div>
        <div class="rail-group-body">${dims.map(d => dimControl(d, ctx)).join("")}</div></div>`;
    });
    // any dimension not placed in a group falls into "Other"
    const leftovers = catalog.contextDimensions.filter(d => !used.has(d.id));
    if (leftovers.length) {
      html += `<div class="rail-group"><div class="rail-group-head" data-grp="other"><span class="chev">▾</span>Other</div>
        <div class="rail-group-body">${leftovers.map(d => dimControl(d, ctx)).join("")}</div></div>`;
    }
    host.innerHTML = html;

    host.querySelectorAll(".seg button").forEach(btn => {
      btn.addEventListener("click", () => {
        const dim = btn.getAttribute("data-dim"), val = btn.getAttribute("data-val");
        host.querySelectorAll(`button[data-dim="${dim}"]`).forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        onChange(NFR.patchContext(dim, val));
      });
    });
    host.querySelectorAll(".rail-group-head").forEach(h => h.addEventListener("click", () => {
      h.parentElement.classList.toggle("collapsed");
    }));
    const reset = host.querySelector("#resetCtx");
    if (reset) reset.addEventListener("click", () => {
      NFR.setContext(Object.assign({}, NFR.DEFAULT_CONTEXT));
      renderContextRail(host, catalog, onChange);
      onChange(NFR.getContext());
    });
  }

  global.UI = { renderContextRail, GROUPS };
})(window);
