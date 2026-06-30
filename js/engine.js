/* NFR Advisor — relevance engine + catalog access (vanilla JS, no deps) */
(function (global) {
  "use strict";

  const STORE_KEY = "nfr-advisor-state-v1";

  // ---- shared context state (persisted across screens via localStorage) ----
  const DEFAULT_CONTEXT = {
    domain: "web-app",
    region: "global",
    publicSector: "no",
    userScale: "1k-100k",
    latencySensitivity: "medium",
    dataSensitivity: "internal",
    availabilityTarget: "99.9",
    teamMaturity: "mixed",
    budget: "moderate",
    deployment: "single-region",
    systemCriticality: "tier-2",
    architectureStyle: "microservices",
    userType: "b2c-public",
    dataResidency: "none",
    lifecycleStage: "growth",
    aiUsage: "none"
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

  // full reset: context AND every assessment map, so no stale data lingers
  // for NFRs that are no longer in scope.
  function resetAll() {
    const fresh = { context: Object.assign({}, DEFAULT_CONTEXT), priorities: {}, scenarios: {}, maturity: {}, owners: {}, rationales: {} };
    saveState(fresh);
    return fresh.context;
  }

  function getPriorities() { return loadState().priorities || {}; }
  // winnerId = an NFR id, the sentinel "balanced", or a falsy value to clear the decision
  function setPriority(edgeKey, winnerId) { const s = loadState(); s.priorities = s.priorities || {}; if (winnerId) s.priorities[edgeKey] = winnerId; else delete s.priorities[edgeKey]; saveState(s); }

  // free-text rationale per trade-off decision (flows into the exported ADRs)
  function getRationales() { return loadState().rationales || {}; }
  function setRationale(edgeKey, text) { const s = loadState(); s.rationales = s.rationales || {}; if (text) s.rationales[edgeKey] = text; else delete s.rationales[edgeKey]; saveState(s); }

  function getScenarios() { return loadState().scenarios || {}; }
  function setScenario(nfrId, scenario) { const s = loadState(); s.scenarios = s.scenarios || {}; s.scenarios[nfrId] = scenario; saveState(s); }

  function getMaturity() { return loadState().maturity || {}; }
  function setMaturity(nfrId, level) { const s = loadState(); s.maturity = s.maturity || {}; s.maturity[nfrId] = level; saveState(s); }
  function getOwners() { return loadState().owners || {}; }
  function setOwner(nfrId, owner) { const s = loadState(); s.owners = s.owners || {}; s.owners[nfrId] = owner; saveState(s); }

  // ---- shareable state (permalinks + JSON import/export) ----
  // unicode-safe base64 of the whole persisted state object
  function encodeState() {
    try { return btoa(unescape(encodeURIComponent(JSON.stringify(loadState())))); }
    catch (e) { return ""; }
  }
  function decodeState(str) {
    try { return JSON.parse(decodeURIComponent(escape(atob(str)))); }
    catch (e) { return null; }
  }
  // merge an imported state object over the defaults and persist it
  function importState(obj) {
    if (!obj || typeof obj !== "object") return false;
    saveState({
      context: Object.assign({}, DEFAULT_CONTEXT, obj.context || {}),
      priorities: obj.priorities || {},
      scenarios: obj.scenarios || {},
      maturity: obj.maturity || {},
      owners: obj.owners || {},
      rationales: obj.rationales || {}
    });
    return true;
  }

  // ---- catalog loading ----
  let _catalog = null;
  async function loadCatalog(path) {
    if (_catalog) return _catalog;
    const res = await fetch(path || "data/nfr-catalog.json");
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

  // ---- compliance ----
  // a regulation applies if ANY of its appliesWhen condition-objects fully matches the context
  function applicableRegulations(catalog, context) {
    return (catalog.regulations || []).filter(reg =>
      (reg.appliesWhen || []).some(cond => Object.keys(cond).every(k => context[k] === cond[k]))
    );
  }
  // set of NFR ids made mandatory by the applicable regulations
  function mandatoryNfrIds(catalog, context) {
    const ids = new Set();
    applicableRegulations(catalog, context).forEach(reg => (reg.drives || []).forEach(id => ids.add(id)));
    return ids;
  }
  // which applicable regulations reference a given NFR
  function regulationsForNfr(catalog, context, nfrId) {
    return applicableRegulations(catalog, context).filter(reg => (reg.drives || []).includes(nfrId));
  }

  // ranking annotated with compliance: flags mandatory NFRs, attaches driving regs,
  // and elevates mandatory NFRs to "high" importance (compliance is non-negotiable).
  function rankAnnotated(catalog, context) {
    const mand = mandatoryNfrIds(catalog, context);
    const ranked = rankNfrs(catalog, context);
    ranked.forEach(n => {
      n.regs = regulationsForNfr(catalog, context, n.id).map(r => r.id);
      n.mandatory = mand.has(n.id);
      if (n.mandatory && n.tier !== "high") { n.tier = "high"; n.elevated = true; }
    });
    ranked.sort((a, b) => (Number(b.mandatory) - Number(a.mandatory)) || (b.score - a.score));
    return ranked;
  }

  // ---- maturity ----
  // target maturity (0-5) derived from importance tier
  function targetMaturity(tier) { return tier === "high" ? 4 : (tier === "medium" ? 3 : 2); }
  function maturityGap(nfr, currentLevel) {
    const cur = (typeof currentLevel === "number") ? currentLevel : 0;
    return Math.max(0, targetMaturity(nfr.tier) - cur);
  }

  // ---- overall NFR readiness score (0-100) ----
  // Blends maturity attainment, compliance attainment (over mandatory NFRs), and trade-off resolution.
  function readiness(catalog, context) {
    const all = rankAnnotated(catalog, context);
    const relevant = all.filter(n => n.tier !== "low");
    const mat = getMaturity();
    const attain = n => { const t = targetMaturity(n.tier); return t ? Math.min(1, ((typeof mat[n.id] === "number") ? mat[n.id] : 0) / t) : 1; };

    const maturity = relevant.length ? relevant.reduce((s, n) => s + attain(n), 0) / relevant.length : 1;
    const mandatory = all.filter(n => n.mandatory);
    const compliance = mandatory.length ? mandatory.reduce((s, n) => s + attain(n), 0) / mandatory.length : 1;
    const conflicts = activeConflicts(all, "medium");
    const pr = getPriorities();
    const resolved = conflicts.filter(e => pr[e.key]).length;
    const tradeoffs = conflicts.length ? resolved / conflicts.length : 1;

    const W = { maturity: 0.5, compliance: 0.3, tradeoffs: 0.2 };
    const score = Math.round((maturity * W.maturity + compliance * W.compliance + tradeoffs * W.tradeoffs) * 100);
    const grade = score >= 85 ? "A" : score >= 70 ? "B" : score >= 55 ? "C" : score >= 40 ? "D" : "E";
    return {
      score, grade, weights: W,
      components: {
        maturity: Math.round(maturity * 100),
        compliance: Math.round(compliance * 100),
        tradeoffs: Math.round(tradeoffs * 100)
      },
      counts: { relevant: relevant.length, mandatory: mandatory.length, conflicts: conflicts.length, resolved }
    };
  }

  global.NFR = {
    DEFAULT_CONTEXT,
    loadState, saveState,
    getContext, setContext, patchContext, resetAll,
    encodeState, decodeState, importState,
    getPriorities, setPriority, getRationales, setRationale,
    getScenarios, setScenario,
    getMaturity, setMaturity, getOwners, setOwner,
    loadCatalog, categoryColor, categoryLabel,
    scoreNfr, rankNfrs, rankAnnotated, activeConflicts, reinforceEdges,
    applicableRegulations, mandatoryNfrIds, regulationsForNfr,
    targetMaturity, maturityGap, readiness
  };
})(window);
