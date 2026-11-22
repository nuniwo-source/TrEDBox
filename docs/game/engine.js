/* TrEDBoxle engine: data loading, seeded randomness and puzzle generation (no DOM here). */
(function () {
  const CFG = window.TREDBOXLE_CONFIG;

  // ---------------------------------------------------------------- properties
  const PROPS = {
    et:    { key: "et", short: "E<sub>T</sub>", label: "Triplet energy", unit: "kcal/mol", min: 15, max: 90, step: 0.5, dec: 1, tol: 1.5, scale: 18 },
    ox:    { key: "ox", short: "E<sub>1/2</sub>(M<sup>•+</sup>/M)", label: "Ground-state oxidation potential", unit: "V vs SCE", min: -1, max: 2.5, step: 0.01, dec: 2, tol: 0.06, scale: 1.0 },
    red:   { key: "red", short: "E<sub>1/2</sub>(M/M<sup>•−</sup>)", label: "Ground-state reduction potential", unit: "V vs SCE", min: -3, max: 0.5, step: 0.01, dec: 2, tol: 0.06, scale: 1.0 },
    exOx:  { key: "exOx", short: "E*<sub>1/2</sub>(M<sup>•+</sup>/M*)", label: "Excited-state oxidation potential", unit: "V vs SCE", min: -3, max: 0.5, step: 0.01, dec: 2, tol: 0.06, scale: 1.0 },
    exRed: { key: "exRed", short: "E*<sub>1/2</sub>(M*/M<sup>•−</sup>)", label: "Excited-state reduction potential", unit: "V vs SCE", min: -0.5, max: 3, step: 0.01, dec: 2, tol: 0.06, scale: 1.0 }
  };
  const POT_KEYS = ["ox", "red", "exOx", "exRed"];
  const KCAL_PER_EV = 23.0605;

  // ---------------------------------------------------------------- seeded RNG
  function hash(str) {
    let h = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i++) { h = Math.imul(h ^ str.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
    h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  }
  function rng(seed) {
    let a = typeof seed === "number" ? seed : hash(String(seed));
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
  function shuffle(r, arr) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  function sample(r, arr, n) { return shuffle(r, arr).slice(0, n); }

  // ---------------------------------------------------------------- dates
  const DAY = 86400000;
  function todayStr() { const d = new Date(); return ymd(d); }
  function ymd(d) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
  function parseYmd(s) { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); }
  function dayNumber(dateStr) { return Math.round((parseYmd(dateStr) - parseYmd(CFG.launchDate)) / DAY) + 1; }
  function dateOfNumber(n) { const d = parseYmd(CFG.launchDate); d.setDate(d.getDate() + n - 1); return ymd(d); }

  // ---------------------------------------------------------------- data
  let MOLS = [];
  let SOURCE = "sample";

  function fromSeed(m) {
    return Object.assign({ createdAt: CFG.seedCreatedAt, src: "Common literature value (sample data; replaced by verified TrEDBox data when available)" }, m);
  }

  // ---- verified molecules, read live from the TrEDBox game feed (public.game_molecules(): approved rows only)
  const num = v => (v === null || v === undefined || v === "" || isNaN(+v)) ? undefined : +v;
  const norm = s => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
  // best value first: experimental over calculated, then higher curator score, then smaller uncertainty
  const better = (a, b) => (a.origin === "exp") - (b.origin === "exp") || (a.score ?? -1) - (b.score ?? -1) || (b.unc ?? 99) - (a.unc ?? 99);
  function strHash(s) { let h = 2166136261; for (const ch of s) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); }

  function buildMolecules(rows) {
    const mols = new Map(), alias = new Map();
    function molFor(r) {
      const ids = [r.idcode && "i:" + r.idcode, r.cas && "c:" + norm(r.cas), r.smiles && "s:" + r.smiles].filter(Boolean);
      let key = ids.map(i => alias.get(i)).find(Boolean);
      if (!key) { key = ids[0] || "n:" + norm(r.name);
        mols.set(key, { key, name: r.commercial_name || r.name, smiles: r.smiles || undefined, idcode: r.idcode || undefined, cls: r.cls || "", role: "", firstSeen: "", best: {} }); }
      ids.forEach(i => alias.set(i, key));
      const m = mols.get(key), d = String(r.approved_at || "").slice(0, 10);
      if (d && (!m.firstSeen || d < m.firstSeen)) m.firstSeen = d;
      if (!m.cls && r.cls) m.cls = r.cls;
      return m;
    }
    const offer = (m, k, c) => { if (!m.best[k] || better(c, m.best[k]) > 0) m.best[k] = c; };
    const src = r => [r.citation, r.doi ? "doi:" + r.doi : ""].filter(Boolean).join(" · ") || undefined;
    for (const r of rows) {
      const v = num(r.value); if (v === undefined) continue;
      const m = molFor(r), c = { v, unc: num(r.unc), origin: r.origin, score: num(r.score), src: src(r), doi: r.doi || undefined, e00: num(r.e00_ev) };
      if (r.feed === "et") {
        if (r.role && m.role !== "sensitizer") m.role = r.role === "acceptor" ? (m.role || "substrate") : "sensitizer";   // donor / both
        offer(m, "et", c);
      } else {
        if (r.category === "photocatalyst" && m.role !== "sensitizer") m.role = "photocatalyst";
        else if (r.category === "substrate" && !m.role) m.role = "substrate";
        const excited = r.state && r.state !== "S0";
        offer(m, excited ? (r.redox_kind === "ox" ? "exOx" : "exRed") : (r.redox_kind === "ox" ? "ox" : "red"), c);
      }
    }
    const out = [];
    for (const m of mols.values()) {
      const b = m.best; if (!Object.keys(b).length) continue;
      const o = { id: "tb-" + strHash(m.key), name: m.name, smiles: m.smiles, idcode: m.idcode, cls: m.cls, role: m.role, createdAt: m.firstSeen || CFG.launchDate };
      if (b.et) { o.et = b.et.v; o.etUnc = b.et.unc; o.src = b.et.src; o.doi = b.et.doi; }
      for (const k of POT_KEYS) if (b[k]) { o[k] = b[k].v; o.potSrc = o.potSrc || b[k].src; o.doi = o.doi || b[k].doi; if (b[k].e00 !== undefined && o.e00 === undefined) o.e00 = b[k].e00; }
      out.push(o);
    }
    return out;
  }

  async function fetchFeed() {
    let rows = [];
    for (let offset = 0; ; offset += 1000) {
      const res = await fetch(`${CFG.feedUrl}/rest/v1/rpc/game_molecules?limit=1000&offset=${offset}`, {
        method: "POST", headers: { apikey: CFG.feedKey, "Content-Type": "application/json" }, body: "{}" });
      if (!res.ok) throw new Error("feed HTTP " + res.status);
      const page = await res.json(); rows = rows.concat(page);
      if (page.length < 1000) return rows;
    }
  }

  async function load() {
    let rows = null, cached = false;
    try { rows = await fetchFeed(); try { localStorage.setItem("tredboxle:feed", JSON.stringify({ at: Date.now(), rows })); } catch (e) {} }
    catch (e) {
      console.info("TrEDBox feed not reachable", e);
      try { const c = JSON.parse(localStorage.getItem("tredboxle:feed") || "null"); if (c && c.rows) { rows = c.rows; cached = true; } } catch (e2) {}
    }
    const verified = rows && rows.length ? buildMolecules(rows) : [];
    if (verified.length) {
      MOLS = verified;
      SOURCE = `TrEDBox, ${verified.length} verified molecules${cached ? " (offline copy)" : ""}`;
    } else {
      MOLS = (window.TREDBOXLE_SEED || []).map(fromSeed);
      SOURCE = `built-in sample (${MOLS.length} molecules), waiting for the TrEDBox feed`;
    }
    MOLS.sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || "") || String(a.id).localeCompare(String(b.id)));
    return MOLS;
  }

  const has = (m, k) => typeof m[k] === "number";
  function poolFor(dateStr) { return dateStr ? MOLS.filter(m => !m.createdAt || m.createdAt <= dateStr) : MOLS; }

  // ---------------------------------------------------------------- hints
  function bracketHint(mol, prop, pool) {
    const v = mol[prop.key], gap = prop.key === "et" ? 3 : 0.12;
    const others = pool.filter(m => m !== mol && has(m, prop.key));
    const below = others.filter(m => m[prop.key] <= v - gap).sort((a, b) => b[prop.key] - a[prop.key])[0];
    const above = others.filter(m => m[prop.key] >= v + gap).sort((a, b) => a[prop.key] - b[prop.key])[0];
    const f = m => `${m.name} (${fmt(m[prop.key], prop)})`;
    if (below && above) return `It lies between ${f(below)} and ${f(above)}.`;
    if (below) return `It is higher than ${f(below)}.`;
    if (above) return `It is lower than ${f(above)}.`;
    return null;
  }
  function rangeHint(v, prop) {
    if (prop.key === "et") { const lo = Math.floor(v / 5) * 5; return `It is between ${lo} and ${lo + 5} kcal/mol.`; }
    const lo = Math.floor(v / 0.25) * 0.25; return `It is between ${lo.toFixed(2)} and ${(lo + 0.25).toFixed(2)} V.`;
  }
  function numericHints(mol, prop, pool) {
    const h = [];
    h.push(`Class: ${mol.cls || "—"}${mol.role ? " · typically used as " + mol.role : ""}.`);
    if (prop.key === "exRed" && has(mol, "red")) h.push(`Ground-state reduction: ${fmt(mol.red, PROPS.red)}${has(mol, "e00") ? ` and E<sub>0,0</sub> = ${mol.e00.toFixed(2)} eV` : ""}. Remember E*<sub>red</sub> ≈ E<sub>red</sub> + E<sub>0,0</sub>.`);
    else if (prop.key === "exOx" && has(mol, "ox")) h.push(`Ground-state oxidation: ${fmt(mol.ox, PROPS.ox)}${has(mol, "e00") ? ` and E<sub>0,0</sub> = ${mol.e00.toFixed(2)} eV` : ""}. Remember E*<sub>ox</sub> ≈ E<sub>ox</sub> − E<sub>0,0</sub>.`);
    else { const b = bracketHint(mol, prop, pool); if (b) h.push(b); }
    h.push(rangeHint(mol[prop.key], prop));
    return h;
  }

  // ---------------------------------------------------------------- generators
  function fmt(v, prop) { return (prop.key !== "et" && v > 0 ? "+" : "") + v.toFixed(prop.dec) + " " + prop.unit; }

  function genGuess(r, pool, propKey, opts = {}) {
    const keys = Array.isArray(propKey) ? propKey : [propKey];
    const cands = [];
    pool.forEach(m => keys.forEach(k => { if (has(m, k)) cands.push([m, k]); }));
    if (!cands.length) return null;
    const [mol, k] = opts.index !== undefined ? shuffle(rng("cands-" + keys.join()), cands)[opts.index % cands.length] : pick(r, cands);
    const prop = PROPS[k];
    return { type: "guess", view: opts.view || "tiles", mol, prop, answer: mol[k], maxTries: opts.maxTries || CFG.dailyMaxTries,
      hints: numericHints(mol, prop, pool), anchors: opts.view === "ladder" ? pool.filter(m => m !== mol && has(m, k)).slice() : [] };
  }

  // choose the sensitizer: exactly one option can (or cannot) sensitize the substrate
  function genPick(r, pool, n, variant) {
    const withEt = pool.filter(m => has(m, "et") && m.role !== "photocatalyst");
    const subs = shuffle(r, withEt.filter(m => m.role === "substrate")).concat(shuffle(r, withEt.filter(m => m.role !== "substrate")));
    for (const s of subs) {
      const cands = pool.filter(m => m !== s && has(m, "et") && m.role !== "substrate");
      const ok = cands.filter(m => m.et >= s.et + 1.5), no = cands.filter(m => m.et <= s.et - 1.5);
      const [one, many] = variant === "cannot" ? [no, ok] : [ok, no];
      if (one.length && many.length >= n - 1) {
        const correct = pick(r, one);
        const options = shuffle(r, [correct].concat(sample(r, many, n - 1)));
        const hints = [
          variant === "cannot" ? "Energy transfer is efficient when E<sub>T</sub>(sensitizer) is at least ~1–3 kcal/mol above E<sub>T</sub>(substrate)." :
            "Efficient triplet–triplet energy transfer needs E<sub>T</sub>(sensitizer) ≳ E<sub>T</sub>(substrate).",
          "Reveal: " + revealWrong(r, options, correct),
          "Class of the answer: " + (correct.cls || "—")
        ];
        return { type: "pick", substrate: s, options, correct: options.indexOf(correct), variant, maxTries: n > 4 ? 3 : 1, hints };
      }
    }
    return null;
  }
  function revealWrong(r, options, correct) { const w = pick(r, options.filter(o => o !== correct)); return `${w.name} has E<sub>T</sub> = ${w.et.toFixed(1)} kcal/mol.`; }

  function genRank(r, pool, n, propKey) {
    const k = propKey || "et", prop = PROPS[k], minGap = k === "et" ? 2.5 : 0.1;
    for (let attempt = 0; attempt < 60; attempt++) {
      const chosen = sample(r, pool.filter(m => has(m, k)), n);
      if (chosen.length < n) return null;
      const sorted = chosen.slice().sort((a, b) => b[k] - a[k]);
      if (sorted.every((m, i) => i === 0 || sorted[i - 1][k] - m[k] >= minGap))
        return { type: "rank", prop, mols: chosen, order: sorted.map(m => m.id), maxTries: n > 4 ? 5 : 4,
          hints: ["The highest is " + sorted[0].name + ".", "The lowest is " + sorted[n - 1].name + ".", "Class list: " + chosen.map(m => m.name + " — " + (m.cls || "?")).join("; ") + "."] };
    }
    return null;
  }

  function genHigherLower(r, pool, propKey) {
    const k = propKey || "et", prop = PROPS[k], gap = k === "et" ? 2 : 0.08;
    const c = pool.filter(m => has(m, k));
    for (let i = 0; i < 40; i++) { const [a, b] = sample(r, c, 2); if (a && b && Math.abs(a[k] - b[k]) >= gap) return { type: "hl", prop, a, b }; }
    return null;
  }

  function genChoice(r, pool, propKey) {
    const k = propKey || "et", prop = PROPS[k];
    const c = pool.filter(m => has(m, k)); if (c.length < 4) return null;
    const mol = pick(r, c);
    const spread = k === "et" ? [6, 14] : [0.25, 0.7];
    const vals = [mol[k]];
    let guard = 0;
    while (vals.length < 4 && guard++ < 100) {
      const d = (spread[0] + r() * (spread[1] - spread[0])) * (r() < 0.5 ? -1 : 1) * (1 + vals.length * 0.15);
      const v = Math.round((mol[k] + d) / prop.step) * prop.step;
      if (v >= prop.min && v <= prop.max && vals.every(x => Math.abs(x - v) > spread[0] * 0.7)) vals.push(v);
    }
    const choices = shuffle(r, vals);
    return { type: "mc", prop, mol, choices, correct: choices.indexOf(mol[k]) };
  }

  function genExtreme(r, pool, n) {
    const modes = [
      { k: "exRed", want: "max", q: "Which is the strongest <b>excited-state oxidant</b>?" },
      { k: "exOx", want: "min", q: "Which is the strongest <b>excited-state reductant</b>?" },
      { k: "red", want: "min", q: "Which reduced form M<sup>•−</sup> is the strongest <b>ground-state reductant</b>?" },
      { k: "ox", want: "max", q: "Which oxidized form M<sup>•+</sup> is the strongest <b>ground-state oxidant</b>?" },
      { k: "et", want: "max", q: "Which has the <b>highest triplet energy</b>?" },
      { k: "et", want: "min", q: "Which has the <b>lowest triplet energy</b>?" }
    ];
    for (const mode of shuffle(r, modes)) {
      const c = pool.filter(m => has(m, mode.k)); if (c.length < n) continue;
      const opts = sample(r, c, n);
      const vals = opts.map(m => m[mode.k]).sort((a, b) => a - b);
      const gap = mode.k === "et" ? 1.5 : 0.08;
      if (vals.some((v, i) => i && v - vals[i - 1] < gap)) continue;
      const target = mode.want === "max" ? Math.max(...vals) : Math.min(...vals);
      return { type: "extreme", prop: PROPS[mode.k], question: mode.q, options: opts, correct: opts.findIndex(m => m[mode.k] === target) };
    }
    return null;
  }

  function genCompute(r, pool) {
    const c = [];
    pool.forEach(m => { if (has(m, "e00") && has(m, "red") && has(m, "exRed")) c.push([m, "exRed"]); if (has(m, "e00") && has(m, "ox") && has(m, "exOx")) c.push([m, "exOx"]); });
    if (!c.length) return null;
    const [mol, k] = pick(r, c);
    const ground = k === "exRed" ? "red" : "ox";
    const answer = k === "exRed" ? mol.red + mol.e00 : mol.ox - mol.e00;
    return { type: "compute", mol, prop: PROPS[k], ground: PROPS[ground], groundVal: mol[ground], e00: mol.e00, answer: Math.round(answer * 100) / 100, reported: mol[k] };
  }

  // energy-transfer feasibility: will it go?
  function genFeasible(r, pool) {
    const c = pool.filter(m => has(m, "et"));
    for (let i = 0; i < 50; i++) {
      const [s, q] = sample(r, c, 2); if (!s || !q || s.role === "substrate") continue;
      const d = s.et - q.et; if (Math.abs(d) < 2) continue;
      return { type: "feasible", sens: s, sub: q, answer: d > 0 };
    }
    return null;
  }

  // ---------------------------------------------------------------- daily
  function daily(dateStr) {
    const n = dayNumber(dateStr);
    const rot = CFG.dailyRotation;
    let fmtName = rot[(n - 1 + rot.length * 1000) % rot.length];
    let pool = poolFor(dateStr);
    if (pool.length < 12) pool = MOLS.slice(0, Math.max(12, pool.length));   // early days of a new data set
    const r = rng("tredboxle-daily-" + dateStr);
    // walk through a fixed permutation so the same molecule does not come back for a long time
    const cycle = Math.floor((n - 1) / rot.length);
    let p = null;
    const tryFormat = f => {
      if (f === "guess-et") return genGuess(r, shuffle(rng("et-perm"), pool), "et", { index: cycle * 2 + (rot.indexOf(f) === (n - 1) % rot.length ? 0 : 1) });
      if (f === "guess-pot") return genGuess(r, shuffle(rng("pot-perm"), pool), ["ox", "red"], { index: cycle });
      if (f === "ladder") return genGuess(r, shuffle(rng("lad-perm"), pool), ["exRed", "exOx"], { index: cycle, view: "ladder" });
      if (f === "pick") return genPick(r, pool, 6, "can");
      if (f === "pick-cannot") return genPick(r, pool, 6, "cannot");
      if (f === "rank") return genRank(r, pool, 5, "et");
      return null;
    };
    p = tryFormat(fmtName);
    if (!p) { fmtName = "guess-et"; p = genGuess(r, pool, "et"); }
    p.number = n; p.date = dateStr; p.format = fmtName;
    return p;
  }

  // ---------------------------------------------------------------- free play
  const FREE_FORMATS = {
    et:  ["guess", "pick", "rank", "hl", "mc", "extreme", "feasible", "slider"],
    pot: ["guess", "rank", "hl", "mc", "extreme", "compute", "slider"]
  };
  function free(topic, seed) {
    const r = rng(seed);
    const topics = topic === "mix" ? ["et", "pot"] : [topic];
    for (let i = 0; i < 30; i++) {
      const t = pick(r, topics);
      const f = pick(r, FREE_FORMATS[t]);
      const keys = t === "et" ? ["et"] : POT_KEYS;
      const k = pick(r, keys);
      let p = null;
      if (f === "guess") p = genGuess(r, MOLS, k, { maxTries: 3, view: t === "pot" && r() < 0.5 ? "ladder" : "tiles" });
      if (f === "slider") { p = genGuess(r, MOLS, k, { maxTries: 1 }); if (p) p.oneShot = true; }
      if (f === "pick") p = genPick(r, MOLS, 4, r() < 0.7 ? "can" : "cannot");
      if (f === "rank") p = genRank(r, MOLS, 4, k);
      if (f === "hl") p = genHigherLower(r, MOLS, k);
      if (f === "mc") p = genChoice(r, MOLS, k);
      if (f === "extreme") { p = genExtreme(r, MOLS.filter(m => t === "et" ? true : POT_KEYS.some(x => has(m, x))), 4); }
      if (f === "compute") p = genCompute(r, MOLS);
      if (f === "feasible") p = genFeasible(r, MOLS);
      if (p) { p.topic = t; return p; }
    }
    return genGuess(r, MOLS, "et", { maxTries: 3 });
  }

  // ---------------------------------------------------------------- scoring helpers
  function closeness(guess, answer, prop) { return Math.max(0, 1 - Math.abs(guess - answer) / prop.scale); }
  function isHit(guess, answer, prop) { return Math.abs(guess - answer) <= prop.tol + 1e-9; }
  function colorFor(c, hit) {
    if (hit) return "var(--hit)";
    const hue = Math.round(4 + c * 108);  // red -> orange -> yellow -> yellow-green
    return `hsl(${hue} 72% ${44 + c * 4}%)`;
  }
  function emojiFor(c, hit) { return hit ? "🟩" : c > 0.75 ? "🟨" : c > 0.4 ? "🟧" : "🟥"; }

  window.TREDBOXLE = { PROPS, POT_KEYS, KCAL_PER_EV, load, daily, free, dayNumber, dateOfNumber, todayStr, parseYmd,
    closeness, isHit, colorFor, emojiFor, fmt, rng, buildMolecules, get mols() { return MOLS; }, get source() { return SOURCE; } };
})();
