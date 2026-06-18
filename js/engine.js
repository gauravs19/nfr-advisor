/* NFR Advisor — relevance engine + catalog access (vanilla JS, no deps) */
(function (global) {
  "use strict";

  const STORE_KEY = "nfr-advisor-state-v1";

  // ---- shared context state (persisted across screens via localStorage) ----
  const DEFAULT_CONTEXT = {
    domain: "web-app",
    userScale: "1k-100k",
    latencySensitivity: "medium",
    dataSensitivity: "internal",
    availabilityTarget: "99.9",
    teamMaturity: "mixed",
    budget: "moderate",
    deployment: "single-region"
  };

  function loadState() {
    try {
      const raw = global.localStorage.getItem(STORE_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) { /* ignore */ }
    return { context: Object.assign({}, DEFAULT_CONTEXT), priorities: {}, scenarios: {} };
  }

  function saveState(state) {
    try { global.localStorage.setItem(STORE_KEY, JSON.stringify(state)); }
    catch (e) { /* ignore */ }
  }

  function getContext() { return loadState().context; }
  function setContext(ctx) { const s = loadState(); s.context = ctx; saveState(s); }
  function patchContext(key, value) { const s = loadState(); s.context[key] = value; saveState(s); return s.context; }

  function getPriorities() { return loadState().priorities || {}; }
  function setPriority(edgeKey, winnerId) { const s = loadState(); s.priorities = s.priorities || {}; s.priorities[edgeKey] = winnerId; saveState(s); }

  function getScenarios() { return loadState().scenarios || {}; }
  function setScenario(nfrId, scenario) { const s = loadState(); s.scenarios = s.scenarios || {}; s.scenarios[nfrId] = scenario; saveState(s); }

  // ---- catalog loading ----
  let _catalog = null;
  async function loadCatalog(path) {
    if (_catalog) return _catalog;
    const res = await fetch(path || "../data/nfr-catalog.json");
    _catalog = await res.json();
    return _catalog;
  }

  function categoryColor(catalog, catId) {
    const c = (catalog.categories || []).find(x => x.id === catId);
    return c ? c.color : "#888";
  }
  function categoryLabel(catalog, catId) {
    const c = (catalog.categories || []).find(x => x.id === catId);
    return c ? c.label : catId;
  }

  // ---- relevance scoring ----
  // ordinal dimensions: a context value "matches" a rule value by equality here,
  // keeping rules explicit & auditable (no magic thresholds).
  function scoreNfr(nfr, context) {
    let score = nfr.baseScore || 0;
    const fired = [];
    (nfr.rules || []).forEach(rule => {
      const matches = Object.keys(rule.when).every(k => context[k] === rule.when[k]);
      if (matches) {
        score += rule.weight;
        fired.push({ when: rule.when, weight: rule.weight });
      }
    });
    return { score: Math.max(0, score), rawScore: score, fired };
  }

  // returns NFRs with score, sorted desc, plus normalized 0..1 relevance
  function rankNfrs(catalog, context) {
    const scored = catalog.nfrs.map(nfr => {
      const s = scoreNfr(nfr, context);
      return Object.assign({}, nfr, { score: s.score, rawScore: s.rawScore, fired: s.fired });
    });
    const max = Math.max(1, ...scored.map(n => n.score));
    scored.forEach(n => { n.relevance = n.score / max; });
    scored.sort((a, b) => b.score - a.score);
    // tier: high (>=0.66), medium (>=0.33), low
    scored.forEach(n => {
      n.tier = n.relevance >= 0.66 ? "high" : (n.relevance >= 0.33 ? "medium" : "low");
    });
    return scored;
  }

  // active conflict edges among the currently-relevant NFRs
  function activeConflicts(rankedNfrs, minTier) {
    const order = { high: 3, medium: 2, low: 1 };
    const threshold = order[minTier || "medium"];
    const byId = {};
    rankedNfrs.forEach(n => { byId[n.id] = n; });
    const edges = [];
    const seen = new Set();
    rankedNfrs.forEach(n => {
      if (order[n.tier] < threshold) return;
      (n.conflicts_with || []).forEach(otherId => {
        const other = byId[otherId];
        if (!other || order[other.tier] < threshold) return;
        const key = [n.id, otherId].sort().join("::");
        if (seen.has(key)) return;
        seen.add(key);
        edges.push({ key: key, a: n, b: other });
      });
    });
    return edges;
  }

  function reinforceEdges(rankedNfrs, minTier) {
    const order = { high: 3, medium: 2, low: 1 };
    const threshold = order[minTier || "medium"];
    const byId = {};
    rankedNfrs.forEach(n => { byId[n.id] = n; });
    const edges = [];
    const seen = new Set();
    rankedNfrs.forEach(n => {
      if (order[n.tier] < threshold) return;
      (n.reinforces || []).forEach(otherId => {
        const other = byId[otherId];
        if (!other || order[other.tier] < threshold) return;
        const key = [n.id, otherId].sort().join("::");
        if (seen.has(key)) return;
        seen.add(key);
        edges.push({ key: key, a: n, b: other });
      });
    });
    return edges;
  }

  global.NFR = {
    DEFAULT_CONTEXT,
    loadState, saveState,
    getContext, setContext, patchContext,
    getPriorities, setPriority,
    getScenarios, setScenario,
    loadCatalog, categoryColor, categoryLabel,
    scoreNfr, rankNfrs, activeConflicts, reinforceEdges
  };
})(window);
