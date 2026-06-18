/* NFR Advisor — shared UI: the persistent context control rail */
(function (global) {
  "use strict";

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
        const dim = btn.getAttribute("data-dim"), val = btn.getAttribute("data-val");
        host.querySelectorAll(`button[data-dim="${dim}"]`).forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        onChange(NFR.patchContext(dim, val));
      });
    });
    const reset = host.querySelector("#resetCtx");
    if (reset) reset.addEventListener("click", () => {
      NFR.setContext(Object.assign({}, NFR.DEFAULT_CONTEXT));
      renderContextRail(host, catalog, onChange);
      onChange(NFR.getContext());
    });
  }

  global.UI = { renderContextRail };
})(window);
