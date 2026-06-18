/* NFR Advisor — shared UI: topbar + context control rail */
(function (global) {
  "use strict";

  const NAV = [
    { href: "intake.html", label: "1 · Context" },
    { href: "canvas.html", label: "2 · Relevance" },
    { href: "conflict.html", label: "3 · Trade-offs" },
    { href: "utility-tree.html", label: "4 · Utility Tree" },
    { href: "scenario.html", label: "5 · Scenarios" },
    { href: "export.html", label: "6 · Export" }
  ];

  function renderTopbar(activeHref) {
    const links = NAV.map(n =>
      `<a href="${n.href}" class="${n.href === activeHref ? "active" : ""}">${n.label}</a>`
    ).join("");
    document.body.insertAdjacentHTML("afterbegin",
      `<header class="topbar">
         <div class="brand">NFR&nbsp;<span>Advisor</span></div>
         <nav>${links}</nav>
       </header>`);
  }

  // Builds segmented controls for each context dimension. onChange(ctx) fires on every change.
  function renderContextRail(host, catalog, onChange) {
    const ctx = NFR.getContext();
    host.innerHTML = "<h2>System context</h2>" + catalog.contextDimensions.map(dim => {
      const buttons = dim.options.map(opt =>
        `<button data-dim="${dim.id}" data-val="${opt}" class="${ctx[dim.id] === opt ? "active" : ""}">${opt}</button>`
      ).join("");
      return `<div class="control"><label>${dim.label}</label><div class="seg">${buttons}</div></div>`;
    }).join("") +
    `<div class="control"><button class="btn secondary" id="resetCtx">Reset</button></div>`;

    host.querySelectorAll(".seg button").forEach(btn => {
      btn.addEventListener("click", () => {
        const dim = btn.getAttribute("data-dim");
        const val = btn.getAttribute("data-val");
        host.querySelectorAll(`button[data-dim="${dim}"]`).forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        const updated = NFR.patchContext(dim, val);
        onChange(updated);
      });
    });
    const reset = host.querySelector("#resetCtx");
    if (reset) reset.addEventListener("click", () => {
      NFR.setContext(Object.assign({}, NFR.DEFAULT_CONTEXT));
      renderContextRail(host, catalog, onChange);
      onChange(NFR.getContext());
    });
  }

  global.UI = { renderTopbar, renderContextRail, NAV };
})(window);
