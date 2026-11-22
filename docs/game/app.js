/* TrEDBoxle UI: routing, views (daily, archive, free play), game widgets, stats. */
(function () {
  const T = window.TREDBOXLE, CFG = window.TREDBOXLE_CONFIG, ACC = window.TREDBOXLE_ACCESS;
  const $ = (s, el = document) => el.querySelector(s);
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const store = {
    get(k, d) { try { const v = localStorage.getItem("tredboxle:" + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem("tredboxle:" + k, JSON.stringify(v)); } catch (e) {} }
  };

  const FORMAT_NAMES = {
    "guess-et": "Guess the triplet energy", "guess-pot": "Guess the redox potential", "ladder": "Place it on the potential scale",
    "pick": "Pick the sensitizer", "pick-cannot": "Find the sensitizer that fails", "rank": "Rank by triplet energy"
  };
  const FORMAT_ICONS = { "guess-et": "🎯", "guess-pot": "⚡", "ladder": "📏", "pick": "🧪", "pick-cannot": "🚫", "rank": "📶" };

  // ------------------------------------------------------------------ structures (OpenChemLib)
  const svgCache = new Map();
  function structure(m, w = 220, h = 150) {
    if (m.formula && !m.smiles && !m.idcode) return `<div class="formula" style="height:${h}px">${esc(m.formula)}</div>`;
    const key = (m.idcode || m.smiles) + "|" + w + "x" + h;
    if (svgCache.has(key)) return svgCache.get(key);
    if (!window.OCL) return `<div class="formula muted" style="height:${h}px">${esc(m.formula || m.name)}</div>`;
    let out;
    try {
      const mol = m.idcode ? OCL.Molecule.fromIDCode(m.idcode) : OCL.Molecule.fromSmiles(m.smiles);
      if (mol.inventCoordinates) mol.inventCoordinates();
      out = `<div class="struct" style="height:${h}px">` + mol.toSVG(w, h, null, { suppressChiralText: true, suppressCIPParity: true, autoCrop: true, autoCropMargin: 12, noStereoProblem: true }) + "</div>";
    } catch (e) { out = `<div class="formula" style="height:${h}px">${esc(m.formula || m.name)}</div>`; }
    svgCache.set(key, out);
    return out;
  }
  function molCard(m, opts = {}) {
    return `<div class="mol ${opts.cls || ""}" ${opts.attrs || ""}>
      ${structure(m, opts.w || 220, opts.h || 140)}
      <div class="mol-name">${esc(m.name)}</div>
      ${opts.sub ? `<div class="mol-sub">${opts.sub}</div>` : ""}
    </div>`;
  }
  const val = (v, prop) => T.fmt(v, prop);
  const ev = kcal => (kcal / T.KCAL_PER_EV).toFixed(2) + " eV";
  function sourceLine(m, prop) {
    const s = prop && prop.key !== "et" ? (m.potSrc || m.src) : m.src;
    const doi = m.doi ? ` <a href="https://doi.org/${esc(m.doi)}" target="_blank" rel="noopener">DOI</a>` : "";
    return s ? `<p class="source">Source: ${esc(s)}${doi}</p>` : "";
  }

  // ------------------------------------------------------------------ scale (cursor bar)
  function scaleBar(p, st, reveal) {
    const { prop } = p, span = prop.max - prop.min;
    const pos = v => ((Math.min(prop.max, Math.max(prop.min, v)) - prop.min) / span * 100).toFixed(2) + "%";
    const ticks = [];
    const stepT = prop.key === "et" ? 10 : 0.5;
    for (let v = Math.ceil(prop.min / stepT) * stepT; v <= prop.max + 1e-9; v += stepT)
      ticks.push(`<span class="tick" style="left:${pos(v)}"><i></i>${prop.key === "et" ? v : (v > 0 ? "+" : "") + v.toFixed(1)}</span>`);
    const anchors = (p.anchors || []).slice().sort((a, b) => a[prop.key] - b[prop.key]).map((m, i) =>
      `<span class="anchor" style="left:${pos(m[prop.key])};height:${14 + (i % 3) * 16}px" title="${esc(m.name)}: ${val(m[prop.key], prop)}"><b>${esc(short(m.name))}</b></span>`).join("");
    const marks = st.guesses.map((g, i) => { const c = T.closeness(g, p.answer, prop), hit = T.isHit(g, p.answer, prop);
      return `<span class="mark" style="left:${pos(g)};background:${T.colorFor(c, hit)}" title="Guess ${i + 1}: ${val(g, prop)}">${i + 1}</span>`; }).join("");
    const ans = reveal ? `<span class="mark answer" style="left:${pos(p.answer)}" title="Answer">★</span>` : "";
    return `<div class="scale ${p.view === "ladder" ? "ladder" : ""}"><div class="scale-track"></div>${anchors}${ticks.join("")}${marks}${ans}</div>`;
  }
  const short = n => n.length > 12 ? n.slice(0, 10) + "…" : n;

  // ------------------------------------------------------------------ game widgets
  // Each widget: render(el, puzzle, state, api) where api = { save(state), end(result), mode }
  const W = {};

  W.guess = function (el, p, st, api) {
    st.guesses = st.guesses || []; st.hints = st.hints || 0;
    const { prop } = p;
    const done = st.done;
    const last = st.guesses[st.guesses.length - 1];
    const cur = st.cursor ?? (last ?? Math.round(((prop.min + prop.max) / 2) / prop.step) * prop.step);
    const rows = [];
    for (let i = 0; i < p.maxTries; i++) {
      const g = st.guesses[i];
      if (g === undefined) { rows.push(`<div class="try empty"><span>${i + 1}</span></div>`); continue; }
      const c = T.closeness(g, p.answer, prop), hit = T.isHit(g, p.answer, prop);
      const dir = hit ? "✓ spot on" : p.answer > g ? "↑ higher" : "↓ lower";
      const d = Math.abs(g - p.answer);
      const band = hit ? "" : d <= prop.tol * 3 ? "very close" : d <= prop.scale * 0.25 ? "close" : d <= prop.scale * 0.6 ? "warm" : "far";
      rows.push(`<div class="try" style="background:${T.colorFor(c, hit)}"><span>${i + 1}</span><b>${val(g, prop)}</b><em>${dir}</em><small>${band}</small></div>`);
    }
    const asked = p.prop.key === "et"
      ? `What is the <b>triplet energy</b> (${prop.short}) of <b>${esc(p.mol.name)}</b>?`
      : `What is the <b>${prop.label.toLowerCase()}</b> ${prop.short} of <b>${esc(p.mol.name)}</b>?`;
    el.innerHTML = `
      <p class="question">${asked}</p>
      ${molCard(p.mol, { sub: esc(p.mol.cls || ""), w: 260, h: 170 })}
      ${scaleBar(p, st, done)}
      ${done ? "" : `<div class="guess-input">
        <input type="range" id="g-range" min="${prop.min}" max="${prop.max}" step="${prop.step}" value="${cur}" aria-label="Value slider">
        <div class="guess-row">
          <input type="number" id="g-num" min="${prop.min}" max="${prop.max}" step="${prop.step}" value="${(+cur).toFixed(prop.dec)}" aria-label="Value">
          <span class="unit">${prop.unit}</span>
          <button class="btn primary" id="g-go">${p.oneShot ? "Lock in" : "Guess"}</button>
        </div></div>`}
      ${p.oneShot ? "" : `<div class="tries">${rows.join("")}</div>`}
      ${hintsBlock(p, st, done)}
      <div class="after"></div>`;
    if (!done) {
      const r = $("#g-range", el), n = $("#g-num", el);
      r.oninput = () => { n.value = (+r.value).toFixed(prop.dec); st.cursor = +r.value; };
      n.oninput = () => { if (n.value !== "" && !isNaN(+n.value)) { r.value = n.value; st.cursor = +n.value; } };
      const go = () => {
        const g = Math.round(parseFloat(n.value) / prop.step) * prop.step;
        if (isNaN(g)) return;
        st.guesses.push(+g.toFixed(prop.dec)); st.cursor = g;
        const hit = T.isHit(g, p.answer, prop);
        if (hit || st.guesses.length >= p.maxTries) { st.done = true; st.won = hit; }
        api.save(st); W.guess(el, p, st, api);
        if (st.done) api.end(resultOf(p, st));
      };
      $("#g-go", el).onclick = go;
      n.onkeydown = e => { if (e.key === "Enter") go(); };
    }
    wireHints(el, p, st, api, W.guess);
    if (done) $(".after", el).innerHTML = `
      <div class="reveal ${st.won ? "won" : "lost"}">
        <div class="big">${val(p.answer, prop)}${prop.key === "et" ? ` <small>(${ev(p.answer)})</small>` : ""}</div>
        <div>${p.oneShot ? `You said ${val(st.guesses[0], prop)} — off by ${Math.abs(st.guesses[0] - p.answer).toFixed(prop.dec)}` : st.won ? `Solved in ${st.guesses.length}/${p.maxTries}` : "Out of guesses"}</div>
        ${p.mol.etUnc && prop.key === "et" ? `<div class="muted">reported uncertainty ±${p.mol.etUnc}</div>` : ""}
        ${sourceLine(p.mol, prop)}
      </div>`;
  };

  W.pick = function (el, p, st, api) {
    st.picked = st.picked || []; st.hints = st.hints || 0;
    const done = st.done, s = p.substrate;
    const q = p.variant === "cannot"
      ? `Which of these <b>cannot</b> sensitize <b>${esc(s.name)}</b> by triplet energy transfer?`
      : `Which of these <b>can</b> sensitize <b>${esc(s.name)}</b> by triplet energy transfer?`;
    el.innerHTML = `
      <p class="question">${q}</p>
      <div class="substrate">${molCard(s, { sub: `E<sub>T</sub> = <b>${s.et.toFixed(1)}</b> kcal/mol · ${esc(s.cls || "")}`, w: 240, h: 140 })}</div>
      <p class="muted center">${done ? "All triplet energies revealed." : `Triplet energies of the options are hidden. ` + (p.maxTries > 1 ? `You have ${p.maxTries - st.picked.length} pick${p.maxTries - st.picked.length === 1 ? "" : "s"} left.` : "One pick.")}</p>
      <div class="options">${p.options.map((m, i) => {
        const chosen = st.picked.includes(i), right = i === p.correct;
        const cls = chosen ? (right ? "right" : "wrong") : done && right ? "right" : "";
        const show = chosen || done;
        return molCard(m, { cls: "opt " + cls + (done || chosen ? " locked" : ""), attrs: `data-i="${i}" role="button" tabindex="0"`, w: 180, h: 110,
          sub: show ? `E<sub>T</sub> = ${m.et.toFixed(1)} kcal/mol` : `E<sub>T</sub> = ?` });
      }).join("")}</div>
      ${hintsBlock(p, st, done)}
      <div class="after"></div>`;
    if (!done) el.querySelectorAll(".opt:not(.locked)").forEach(c => {
      const act = () => {
        const i = +c.dataset.i; st.picked.push(i);
        if (i === p.correct || st.picked.length >= p.maxTries) { st.done = true; st.won = i === p.correct; }
        api.save(st); W.pick(el, p, st, api); if (st.done) api.end(resultOf(p, st));
      };
      c.onclick = act; c.onkeydown = e => { if (e.key === "Enter" || e.key === " ") act(); };
    });
    wireHints(el, p, st, api, W.pick);
    if (done) {
      const c = p.options[p.correct];
      $(".after", el).innerHTML = `<div class="reveal ${st.won ? "won" : "lost"}"><div class="big">${esc(c.name)}</div>
        <div>E<sub>T</sub> = ${c.et.toFixed(1)} kcal/mol vs ${s.et.toFixed(1)} for ${esc(s.name)} (ΔE<sub>T</sub> = ${(c.et - s.et > 0 ? "+" : "") + (c.et - s.et).toFixed(1)})</div>
        ${sourceLine(c)}</div>`;
    }
  };

  W.rank = function (el, p, st, api) {
    st.attempts = st.attempts || []; st.hints = st.hints || 0;
    st.current = st.current || p.mols.map(m => m.id);
    const byId = Object.fromEntries(p.mols.map(m => [m.id, m]));
    const done = st.done, prop = p.prop;
    const fb = att => att.map((id, i) => { const j = p.order.indexOf(id); return j === i ? "g" : Math.abs(j - i) === 1 ? "y" : "x"; });
    el.innerHTML = `
      <p class="question">Order these from <b>highest</b> to <b>lowest</b> ${prop.label.toLowerCase()} (${prop.short}).</p>
      <ol class="ranklist">${(done ? p.order : st.current).map((id, i) => { const m = byId[id];
        return `<li class="rank-item" data-id="${esc(id)}"><span class="pos">${i + 1}</span>${structure(m, 110, 70)}
          <span class="rname">${esc(m.name)}${done ? `<small>${val(m[prop.key], prop)}</small>` : ""}</span>
          ${done ? "" : `<span class="arrows"><button class="icon" data-mv="-1" aria-label="Move up" ${i === 0 ? "disabled" : ""}>▲</button><button class="icon" data-mv="1" aria-label="Move down" ${i === p.mols.length - 1 ? "disabled" : ""}>▼</button></span>`}</li>`; }).join("")}</ol>
      ${done ? "" : `<div class="center"><button class="btn primary" id="r-go">Submit order (${p.maxTries - st.attempts.length} left)</button></div>`}
      <div class="attempts">${st.attempts.map(a => `<div class="att">${fb(a).map((f, i) => `<span class="chip ${f}" title="${esc(byId[a[i]].name)}">${esc(short(byId[a[i]].name).slice(0, 10))}</span>`).join("")}</div>`).join("")}</div>
      <p class="muted center small">🟩 right place · 🟨 one place off · ⬜ further away</p>
      ${hintsBlock(p, st, done)}
      <div class="after"></div>`;
    if (!done) {
      el.querySelectorAll("[data-mv]").forEach(b => b.onclick = () => {
        const id = b.closest("li").dataset.id, i = st.current.indexOf(id), j = i + +b.dataset.mv;
        [st.current[i], st.current[j]] = [st.current[j], st.current[i]]; api.save(st); W.rank(el, p, st, api);
      });
      $("#r-go", el).onclick = () => {
        st.attempts.push(st.current.slice());
        const win = st.current.every((id, i) => id === p.order[i]);
        if (win || st.attempts.length >= p.maxTries) { st.done = true; st.won = win; }
        api.save(st); W.rank(el, p, st, api); if (st.done) api.end(resultOf(p, st));
      };
    }
    wireHints(el, p, st, api, W.rank);
    if (done) $(".after", el).innerHTML = `<div class="reveal ${st.won ? "won" : "lost"}"><div class="big">${st.won ? `Ranked in ${st.attempts.length}/${p.maxTries}` : "Not this time"}</div><div>The correct order is shown above.</div></div>`;
  };

  function choiceWidget(name, buildQ, opts, isRight, explain) {
    W[name] = function (el, p, st, api) {
      const done = st.done;
      const o = opts(p);
      el.innerHTML = `${buildQ(p)}<div class="${o.cards ? "options four" : "choices"}">${o.items.map((it, i) => {
        const cls = done ? (isRight(p, i) ? "right" : st.answer === i ? "wrong" : "") : "";
        return o.cards ? molCard(it.mol, { cls: "opt " + cls + (done ? " locked" : ""), attrs: `data-i="${i}" role="button" tabindex="0"`, w: 170, h: 100, sub: done ? it.after : it.sub || "" })
          : `<button class="btn choice ${cls}" data-i="${i}" ${done ? "disabled" : ""}>${it.label}</button>`;
      }).join("")}</div><div class="after"></div>`;
      if (!done) el.querySelectorAll("[data-i]").forEach(b => b.onclick = () => {
        st.answer = +b.dataset.i; st.done = true; st.won = isRight(p, st.answer); api.save(st); W[name](el, p, st, api); api.end(resultOf(p, st));
      });
      if (done) $(".after", el).innerHTML = `<div class="reveal ${st.won ? "won" : "lost"}">${explain(p)}</div>`;
    };
  }
  choiceWidget("hl",
    p => `<p class="question">${esc(p.a.name)} has ${p.prop.short} = <b>${val(p.a[p.prop.key], p.prop)}</b>.<br>Is the value of <b>${esc(p.b.name)}</b> higher or lower?</p>
      <div class="pair">${molCard(p.a, { sub: val(p.a[p.prop.key], p.prop), w: 180, h: 110 })}<span class="vs">vs</span>${molCard(p.b, { sub: "?", w: 180, h: 110 })}</div>`,
    () => ({ items: [{ label: "↑ Higher" }, { label: "↓ Lower" }] }),
    (p, i) => (i === 0) === (p.b[p.prop.key] > p.a[p.prop.key]),
    p => `<div class="big">${esc(p.b.name)}: ${val(p.b[p.prop.key], p.prop)}</div>${sourceLine(p.b, p.prop)}`);
  choiceWidget("mc",
    p => `<p class="question">What is the ${p.prop.label.toLowerCase()} ${p.prop.short} of <b>${esc(p.mol.name)}</b>?</p>${molCard(p.mol, { sub: esc(p.mol.cls || ""), w: 240, h: 150 })}`,
    p => ({ items: p.choices.map(v => ({ label: val(v, p.prop) })) }),
    (p, i) => i === p.correct,
    p => `<div class="big">${val(p.mol[p.prop.key], p.prop)}</div>${sourceLine(p.mol, p.prop)}`);
  choiceWidget("extreme",
    p => `<p class="question">${p.question}</p>`,
    p => ({ cards: true, items: p.options.map(m => ({ mol: m, sub: esc(m.cls || ""), after: `${p.prop.short} = ${val(m[p.prop.key], p.prop)}` })) }),
    (p, i) => i === p.correct,
    p => `<div class="big">${esc(p.options[p.correct].name)}</div><div>${p.prop.label}: ${val(p.options[p.correct][p.prop.key], p.prop)}</div>`);
  choiceWidget("feasible",
    p => `<p class="question">Can <b>${esc(p.sens.name)}</b> sensitize <b>${esc(p.sub.name)}</b> by exergonic triplet energy transfer?</p>
      <div class="pair">${molCard(p.sens, { sub: "sensitizer", w: 180, h: 110 })}<span class="vs">→</span>${molCard(p.sub, { sub: "acceptor", w: 180, h: 110 })}</div>`,
    () => ({ items: [{ label: "✓ Yes, downhill" }, { label: "✗ No, uphill" }] }),
    (p, i) => (i === 0) === p.answer,
    p => `<div class="big">E<sub>T</sub>: ${p.sens.et.toFixed(1)} → ${p.sub.et.toFixed(1)} kcal/mol</div><div>ΔE<sub>T</sub> = ${(p.sens.et - p.sub.et > 0 ? "+" : "") + (p.sens.et - p.sub.et).toFixed(1)} kcal/mol</div>`);

  W.compute = function (el, p, st, api) {
    const done = st.done, prop = p.prop;
    const isRed = prop.key === "exRed";
    const cur = st.cursor ?? 0;
    el.innerHTML = `
      <p class="question">Estimate the <b>${prop.label.toLowerCase()}</b> ${prop.short} of <b>${esc(p.mol.name)}</b>.</p>
      ${molCard(p.mol, { sub: esc(p.mol.cls || ""), w: 220, h: 130 })}
      <div class="givens"><div>${p.ground.short} = <b>${val(p.groundVal, p.ground)}</b></div><div>E<sub>0,0</sub> = <b>${p.e00.toFixed(2)} eV</b></div></div>
      ${done ? "" : `<div class="guess-input"><input type="range" id="c-r" min="-3" max="3" step="0.01" value="${cur}">
        <div class="guess-row"><input type="number" id="c-n" step="0.01" value="${(+cur).toFixed(2)}"><span class="unit">V vs SCE</span><button class="btn primary" id="c-go">Check</button></div></div>`}
      <details class="formula-help"><summary>Need the formula?</summary>${isRed ? "E*<sub>red</sub> = E<sub>red</sub> + E<sub>0,0</sub>" : "E*<sub>ox</sub> = E<sub>ox</sub> − E<sub>0,0</sub>"} (E<sub>0,0</sub> in eV equals volts for one electron)</details>
      <div class="after"></div>`;
    if (!done) {
      const r = $("#c-r", el), n = $("#c-n", el);
      r.oninput = () => { n.value = (+r.value).toFixed(2); st.cursor = +r.value; };
      n.oninput = () => { r.value = n.value; st.cursor = +n.value; };
      const go = () => { const g = +(+n.value).toFixed(2); st.guess = g; st.done = true; st.won = Math.abs(g - p.answer) <= 0.05; api.save(st); W.compute(el, p, st, api); api.end(resultOf(p, st)); };
      $("#c-go", el).onclick = go; n.onkeydown = e => { if (e.key === "Enter") go(); };
    } else $(".after", el).innerHTML = `<div class="reveal ${st.won ? "won" : "lost"}"><div class="big">${val(p.answer, prop)}</div>
      <div>You said ${val(st.guess, prop)}. ${isRed ? `${p.groundVal.toFixed(2)} + ${p.e00.toFixed(2)}` : `${p.groundVal.toFixed(2)} − ${p.e00.toFixed(2)}`} = ${p.answer.toFixed(2)} V · reported: ${val(p.reported, prop)}</div>${sourceLine(p.mol, prop)}</div>`;
  };

  function hintsBlock(p, st, done) {
    if (!p.hints || !p.hints.length) return "";
    const shown = p.hints.slice(0, done ? p.hints.length : st.hints);
    const left = p.hints.length - st.hints;
    return `<div class="hints">${done ? "" : `<button class="btn ghost" id="hint-btn" ${left ? "" : "disabled"}>💡 Hint${left ? ` (${left} left)` : "s used"}</button>`}
      ${shown.length ? `<ul>${shown.map((h, i) => `<li><span>${i + 1}</span><div>${h}</div></li>`).join("")}</ul>` : ""}</div>`;
  }
  function wireHints(el, p, st, api, rerender) {
    const b = $("#hint-btn", el); if (!b) return;
    b.onclick = () => { st.hints = Math.min(p.hints.length, st.hints + 1); api.save(st); rerender(el, p, st, api); };
  }

  // ------------------------------------------------------------------ results & share
  function resultOf(p, st) {
    const r = { won: !!st.won, hints: st.hints || 0, type: p.type };
    if (p.type === "guess") { r.tries = st.guesses.length; r.max = p.maxTries; r.rows = st.guesses.map(g => T.emojiFor(T.closeness(g, p.answer, p.prop), T.isHit(g, p.answer, p.prop))); r.err = Math.abs(st.guesses[st.guesses.length - 1] - p.answer); }
    else if (p.type === "pick") { r.tries = st.picked.length; r.max = p.maxTries; r.rows = st.picked.map(i => i === p.correct ? "🟩" : "🟥"); }
    else if (p.type === "rank") { r.tries = st.attempts.length; r.max = p.maxTries;
      r.rows = st.attempts.map(a => a.map((id, i) => { const j = p.order.indexOf(id); return j === i ? "🟩" : Math.abs(j - i) === 1 ? "🟨" : "⬜"; }).join("")); }
    else { r.tries = 1; r.max = 1; r.rows = [st.won ? "🟩" : "🟥"]; }
    return r;
  }
  function shareText(p, res) {
    const head = `TrEDBoxle #${p.number} · ${FORMAT_NAMES[p.format]}`;
    const score = `${res.won ? res.tries : "X"}/${res.max}${res.hints ? " 💡" + res.hints : ""}`;
    const grid = p.type === "rank" ? res.rows.join("\n") : res.rows.join("");
    return `${head}\n${score}\n${grid}\n${location.href.split("#")[0]}`;
  }

  // ------------------------------------------------------------------ daily stats
  function dailyKey(d) { return "daily:" + d; }
  function computeStats() {
    const today = T.todayStr(), n = T.dayNumber(today);
    let played = 0, wins = 0, streak = 0, maxStreak = 0, run = 0, guessSum = 0; const dist = {};
    for (let i = 1; i <= n; i++) {
      const s = store.get(dailyKey(T.dateOfNumber(i)));
      const onDay = s && s.done && s.onDay;
      if (s && s.done) { played++; if (s.won) { wins++; const t = s.tries || 1; guessSum += t; dist[t] = (dist[t] || 0) + 1; } else dist.X = (dist.X || 0) + 1; }
      if (onDay && s.won) { run++; maxStreak = Math.max(maxStreak, run); } else if (i < n || (s && s.done)) run = 0;
    }
    streak = run;
    return { played, wins, winPct: played ? Math.round(wins / played * 100) : 0, streak, maxStreak, avg: wins ? (guessSum / wins).toFixed(1) : "–", dist };
  }

  // ------------------------------------------------------------------ views
  const main = () => $("#main");
  function setTitle(num, sub) { $("#title-num").textContent = num; $("#subtitle").textContent = sub; }
  // colour split: triplet-energy puzzles (TrEnDB green) vs redox puzzles (ReDBox violet)
  const FORMAT_TOPIC = { "guess-et": "et", "pick": "et", "pick-cannot": "et", "rank": "et", "guess-pot": "rx", "ladder": "rx" };
  const TOPIC_LABEL = { et: "Triplet energy", rx: "Redox potential" };
  function setTopic(topic) { const g = $("#game"); if (g) { g.classList.remove("topic-et", "topic-rx"); g.classList.add("topic-" + topic); } }
  function setTab(name) { document.querySelectorAll(".tabs a").forEach(a => a.classList.toggle("active", a.dataset.tab === name)); }

  function viewDaily(dateStr, fromArchive) {
    const today = T.todayStr();
    if (dateStr > today) dateStr = today;
    if (dateStr < CFG.launchDate) dateStr = CFG.launchDate;
    const p = T.daily(dateStr);
    setTab(fromArchive ? "archive" : "daily");
    setTitle(`# ${p.number}`, fromArchive ? `Archive puzzle · ${longDate(dateStr)}` : "Today's puzzle");
    const st = store.get(dailyKey(dateStr), {});
    const topic = FORMAT_TOPIC[p.format] || "et";
    main().innerHTML = `
      <div class="puzzle-head"><span class="badge topic-${topic}"><i>${TOPIC_LABEL[topic]}</i>${FORMAT_ICONS[p.format] || ""} ${FORMAT_NAMES[p.format]}</span><span class="muted small">${longDate(dateStr)}</span></div>
      <section class="card game topic-${topic}" id="game"></section>
      <section class="endbox" id="endbox"></section>`;
    const api = {
      mode: "daily",
      save(s) { if (!s.done) s.onDay = dateStr === T.todayStr(); store.set(dailyKey(dateStr), s); },
      end(res) {
        const s = store.get(dailyKey(dateStr), {}); s.tries = res.tries; s.res = res; s.onDay = dateStr === T.todayStr() && s.onDay !== false; store.set(dailyKey(dateStr), s);
        endBox(p, res, dateStr);
        if (!fromArchive) setTimeout(() => openStats(), 900);
      }
    };
    W[p.type]($("#game"), p, st, api);
    if (st.done && st.res) endBox(p, st.res, dateStr);
  }
  function endBox(p, res, dateStr) {
    const isToday = dateStr === T.todayStr();
    const n = T.dayNumber(dateStr);
    $("#endbox").innerHTML = `<div class="card end">
      <pre class="share-preview">${esc(shareText(p, res))}</pre>
      <div class="end-actions">
        <button class="btn primary" id="share">Share result</button>
        ${n > 1 ? `<a class="btn ghost" href="#/archive/${T.dateOfNumber(n - 1)}">← #${n - 1}</a>` : ""}
        ${!isToday ? `<a class="btn ghost" href="#/archive/${T.dateOfNumber(n + 1)}">#${n + 1} →</a>` : ""}
        <a class="btn ghost" href="#/free">Free play</a>
      </div>
      ${isToday ? `<p class="muted center">Next puzzle in <b id="countdown"></b></p>` : ""}
    </div>`;
    $("#share").onclick = async () => {
      const txt = shareText(p, res);
      try { if (navigator.share && matchMedia("(pointer:coarse)").matches) await navigator.share({ text: txt }); else { await navigator.clipboard.writeText(txt); toast("Copied to clipboard"); } }
      catch (e) { toast("Copy the text above to share"); }
    };
    if (isToday) tickCountdown();
  }
  let cdTimer;
  function tickCountdown() {
    clearInterval(cdTimer);
    const f = () => { const el = $("#countdown"); if (!el) return clearInterval(cdTimer);
      const now = new Date(), mid = new Date(now); mid.setHours(24, 0, 0, 0);
      const s = Math.max(0, Math.floor((mid - now) / 1000));
      el.textContent = [s / 3600, (s % 3600) / 60, s % 60].map(x => String(Math.floor(x)).padStart(2, "0")).join(":");
      if (s === 0) { clearInterval(cdTimer); route(); } };
    f(); cdTimer = setInterval(f, 1000);
  }

  function viewArchive() {
    setTab("archive");
    setTitle("", "Archive · every past puzzle, ready to play");
    const today = T.todayStr(), n = T.dayNumber(today);
    const rows = [];
    for (let i = n; i >= 1; i--) {
      const d = T.dateOfNumber(i), s = store.get(dailyKey(d));
      const fmt = CFG.dailyRotation[(i - 1) % CFG.dailyRotation.length];
      const status = s && s.done ? (s.won ? `<span class="st won">✓ ${s.tries}/${s.res ? s.res.max : "?"}</span>` : `<span class="st lost">✗</span>`) : s && Object.keys(s).length ? `<span class="st prog">…</span>` : `<span class="st new">play</span>`;
      rows.push(`<a class="arch-row topic-${FORMAT_TOPIC[fmt] || "et"}" title="${TOPIC_LABEL[FORMAT_TOPIC[fmt] || "et"]}" href="#/${i === n ? "daily" : "archive/" + d}"><span class="arch-num">#${i}</span><span class="arch-fmt">${FORMAT_ICONS[fmt]} ${FORMAT_NAMES[fmt]}</span><span class="arch-date muted">${shortDate(d)}${i === n ? " · today" : ""}</span>${status}</a>`);
    }
    const st = computeStats();
    main().innerHTML = `<div class="arch-summary card"><div><b>${st.played}</b><span>played</span></div><div><b>${st.winPct}%</b><span>wins</span></div><div><b>${n - st.played}</b><span>to go</span></div></div>
      <p class="legend"><span class="dot et"></span>Triplet energy <span class="dot rx"></span>Redox potential</p>
      <div class="arch-list">${rows.join("")}</div>`;
  }

  function viewFree() {
    setTab("free");
    setTitle("", "Free play · endless questions, asked a different way every time");
    const fs = store.get("free", { topic: "mix", score: 0, streak: 0, best: 0, played: 0 });
    const topics = [["mix", "Mixed"], ["et", "Triplet energies"], ["pot", "Redox potentials"]];
    main().innerHTML = `
      <div class="free-bar">
        <div class="seg">${topics.map(([k, l]) => `<button data-t="${k}" class="${fs.topic === k ? "on" : ""}">${l}</button>`).join("")}</div>
        <div class="scores"><span>Score <b id="f-score">${fs.score}</b></span><span>Streak <b id="f-streak">${fs.streak}</b></span><span>Best <b id="f-best">${fs.best}</b></span></div>
      </div>
      <section class="card game" id="game"></section>
      <div class="center"><button class="btn primary" id="next" hidden>Next question →</button> <button class="btn ghost small" id="reset">Reset score</button></div>`;
    let p;
    const next = () => {
      p = T.free(fs.topic, Date.now() + ":" + Math.random());
      $("#next").hidden = true;
      setTopic(p.topic === "pot" ? "rx" : "et");
      W[p.type]($("#game"), p, {}, api);
      $("#game").scrollIntoView({ block: "nearest", behavior: "smooth" });
    };
    const api = {
      mode: "free", save() {},
      end(res) {
        let pts = 0;
        if (p.oneShot) { pts =Math.round(10 * Math.max(0, 1 - res.err / p.prop.scale)); res.won = pts >= 7; }
        else if (res.won) pts = Math.max(3, 10 - 3 * (res.tries - 1) - 2 * res.hints);
        fs.score += pts; fs.played++;
        fs.streak = res.won ? fs.streak + 1 : 0; fs.best = Math.max(fs.best, fs.streak);
        store.set("free", fs);
        $("#f-score").textContent = fs.score; $("#f-streak").textContent = fs.streak; $("#f-best").textContent = fs.best;
        toast(pts ? `+${pts} points` : "No points this time");
        $("#next").hidden = false; $("#next").focus();
      }
    };
    document.querySelectorAll(".seg button").forEach(b => b.onclick = () => { fs.topic = b.dataset.t; store.set("free", fs); document.querySelectorAll(".seg button").forEach(x => x.classList.toggle("on", x === b)); next(); });
    $("#next").onclick = next;
    $("#reset").onclick = () => { Object.assign(fs, { score: 0, streak: 0, best: 0, played: 0 }); store.set("free", fs); viewFree(); };
    next();
  }

  // ------------------------------------------------------------------ theory (literature questions)
  function viewTheory() {
    setTab("theory");
    setTitle("", "Theory · energy transfer and photoredox, from the literature");
    const TH = window.TREDBOXLE_THEORY;
    const ts = store.get("theory", { topic: "mix", answered: 0, correct: 0, streak: 0, best: 0, seen: [] });
    const topics = [["mix", "Mixed"], ["ent", "Energy transfer"], ["prx", "Photoredox"]];
    main().innerHTML = `
      <div class="free-bar">
        <div class="seg">${topics.map(([k, l]) => `<button data-th="${k}" class="${ts.topic === k ? "on" : ""}">${l}</button>`).join("")}</div>
        <div class="scores"><span>Correct <b id="t-ok">${ts.correct}/${ts.answered}</b></span><span>Streak <b id="t-streak">${ts.streak}</b></span><span>Best <b id="t-best">${ts.best}</b></span></div>
      </div>
      <section class="card game theory" id="game"></section>
      <div class="center"><button class="btn primary" id="next" hidden>Next question →</button> <button class="btn ghost small" id="reset">Reset score</button></div>
      <p class="muted small center">${TH.QUESTIONS.length} questions, each with an explanation and the review or paper it comes from.</p>`;
    const pool = () => TH.QUESTIONS.filter(q => ts.topic === "mix" || q.topic === ts.topic);
    function nextQuestion() {
      let left = pool().filter(q => !ts.seen.includes(q.id));
      if (!left.length) { ts.seen = ts.seen.filter(id => !pool().some(q => q.id === id)); left = pool(); }
      const q = left[Math.floor(Math.random() * left.length)];
      const opts = q.type === "tf" ? [{ label: "True", right: q.answer === true }, { label: "False", right: q.answer === false }]
        : q.options.map((label, i) => ({ label, right: i === 0 })).sort(() => Math.random() - 0.5);
      const topic = q.topic === "ent" ? "et" : "rx";
      setTopic(topic);
      const g = $("#game");
      g.innerHTML = `<div class="puzzle-head"><span class="badge topic-${topic}"><i>${q.topic === "ent" ? "Energy transfer" : "Photoredox"}</i>${q.type === "tf" ? "True or false?" : "Choose one"}</span></div>
        <p class="question theory-q">${q.q}</p>
        <div class="theory-opts ${q.type}">${opts.map((o, i) => `<button class="btn choice theory-opt" data-i="${i}">${o.label}</button>`).join("")}</div>
        <div class="after"></div>`;
      g.querySelectorAll(".theory-opt").forEach(b => b.onclick = () => {
        const pickI = +b.dataset.i, ok = opts[pickI].right;
        g.querySelectorAll(".theory-opt").forEach((x, i) => { x.disabled = true; if (opts[i].right) x.classList.add("right"); else if (i === pickI) x.classList.add("wrong"); });
        ts.answered++; if (ok) ts.correct++; ts.streak = ok ? ts.streak + 1 : 0; ts.best = Math.max(ts.best, ts.streak);
        if (!ts.seen.includes(q.id)) ts.seen.push(q.id);
        store.set("theory", ts);
        $("#t-ok").textContent = ts.correct + "/" + ts.answered; $("#t-streak").textContent = ts.streak; $("#t-best").textContent = ts.best;
        $(".after", g).innerHTML = `<div class="reveal ${ok ? "won" : "lost"} theory-reveal">
          <div class="big">${ok ? "Correct" : "Not quite"}</div>
          <p>${q.explain}</p>
          <div class="refs"><b>From the literature</b>${q.refs.map(k => TH.REFS[k]).map(r => `<a href="https://doi.org/${esc(r.doi)}" target="_blank" rel="noopener"><span>${esc(r.cite)}</span><em>${esc(r.title)}</em></a>`).join("")}</div>
        </div>`;
        $("#next").hidden = false; $("#next").focus();
      });
      $("#next").hidden = true;
    }
    document.querySelectorAll("[data-th]").forEach(b => b.onclick = () => { ts.topic = b.dataset.th; store.set("theory", ts); document.querySelectorAll("[data-th]").forEach(x => x.classList.toggle("on", x === b)); nextQuestion(); });
    $("#next").onclick = nextQuestion;
    $("#reset").onclick = () => { Object.assign(ts, { answered: 0, correct: 0, streak: 0, best: 0, seen: [] }); store.set("theory", ts); viewTheory(); };
    nextQuestion();
  }

  // ------------------------------------------------------------------ modals, menu, toast
  function modal(title, html) {
    const m = $("#modal");
    $("#modal-title").textContent = title; $("#modal-body").innerHTML = html;
    m.hidden = false; $("#modal-close").focus();
  }
  function closeModal() { $("#modal").hidden = true; }
  function openStats() {
    const s = computeStats();
    const keys = [1, 2, 3, 4, 5, "X"]; const mx = Math.max(1, ...keys.map(k => s.dist[k] || 0));
    modal("Statistics", `<div class="stats">${[["Played", s.played], ["Win %", s.winPct], ["Streak", s.streak], ["Max streak", s.maxStreak], ["Avg guesses", s.avg]].map(([l, v]) => `<div><b>${v}</b><span>${l}</span></div>`).join("")}</div>
      <h4>Guess distribution</h4><div class="dist">${keys.map(k => `<div class="drow"><span>${k}</span><div class="dbar" style="width:${Math.max(6, (s.dist[k] || 0) / mx * 100)}%">${s.dist[k] || 0}</div></div>`).join("")}</div>
      <p class="muted small">Streaks count daily puzzles solved on their own day. Archive plays count toward totals only.</p>`);
  }
  function openHelp() {
    modal("How to play", `
      <p>Every day there is a new <b>TrEDBoxle</b> (<b>Tr</b>iplet <b>E</b>nergy &amp; Re<b>D</b>ox <b>Box</b> puzzle). The format changes from day to day, but it is always about <b class="c-et">triplet energies</b> (E<sub>T</sub>, kcal/mol, in green) or <b class="c-rx">redox potentials</b> (ground or excited state, V vs SCE, in violet).</p>
      <ul class="help">
        <li>🎯 <b>Guess the value</b> — drag the cursor or type a number. Each guess is coloured from red to green: the closer you get, the greener it turns. Arrows tell you to go higher or lower. Within ±1.5 kcal/mol or ±0.06 V you win.</li>
        <li>🧪 <b>Pick the sensitizer</b> — the substrate's E<sub>T</sub> is shown, the options' E<sub>T</sub> are hidden. Choose the one that can (or cannot) transfer its triplet energy.</li>
        <li>📶 <b>Rank</b> — sort molecules by E<sub>T</sub>. 🟩 right place, 🟨 one place off.</li>
        <li>📏 <b>Potential scale</b> — place an excited-state potential on a scale that shows other photocatalysts as landmarks.</li>
      </ul>
      <p>📚 <b>Theory</b> asks conceptual questions on energy transfer and photoredox catalysis (Dexter and Sandros, Stern–Volmer, Rehm–Weller and Marcus, quenching cycles, quantum yields, reference electrodes…). Each answer comes with an explanation and the review it is based on.</p>
      <p>💡 Hints are there when you are stuck; they show up in your shared result.</p>
      <p>Everything is open to everyone, with no sign-in. <b>Archive</b> lets you play every past puzzle, <b>Free play</b> serves endless random questions in many formats: higher/lower, multiple choice, compute E* from E<sub>0,0</sub>, will energy transfer go, strongest excited-state oxidant, and more.</p>
      <p class="muted small">Data: ${esc(T.source)}. Only values verified by two curators in <a href="../">TrEDBox</a> (TrEnDB + ReDBox) are used, and new verified molecules are added automatically. Until the first sync, a small built-in sample of common literature values is used.</p>`);
  }
  let toastT;
  function toast(msg) { const t = $("#toast"); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => t.hidden = true, 1800); }

  // ------------------------------------------------------------------ theme
  function applyTheme(t) { if (t === "auto") document.documentElement.removeAttribute("data-theme"); else document.documentElement.setAttribute("data-theme", t); }
  function cycleTheme() {
    const order = ["auto", "light", "dark"]; const cur = store.get("theme", "auto"); const nx = order[(order.indexOf(cur) + 1) % 3];
    store.set("theme", nx); applyTheme(nx); $("#theme-btn").textContent = "Theme: " + nx[0].toUpperCase() + nx.slice(1);
  }

  // ------------------------------------------------------------------ dates
  const longDate = d => T.parseYmd(d).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const shortDate = d => T.parseYmd(d).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });

  // ------------------------------------------------------------------ router
  // ------------------------------------------------------------------ TrEDBox sign-in (same as the database)
  const needsLogin = section => ACC.enabled && !ACC.user && (CFG.loginRequiredFor || []).includes(section);
  function refreshAccountUI() {
    // the sign-in only shows up when some section needs it (loginRequiredFor in game-config.js)
    const gated = ACC.enabled && (CFG.loginRequiredFor || []).length > 0;
    document.body.classList.toggle("locked", gated && !ACC.user);
    $("#acct-top").hidden = !gated; $("#acct-btn").hidden = !gated;
    $("#acct-top").title = ACC.user ? "Signed in as " + ACC.name : "Sign in";
    $(".acct-dot").hidden = !ACC.user;
    $("#acct-btn").textContent = ACC.user ? "↩ Sign out" : "👤 Sign in to TrEDBox";
    $("#acct-line").hidden = !ACC.user;
    $("#acct-line").innerHTML = ACC.user ? `Signed in to TrEDBox as <b>${esc(ACC.name)}</b>${ACC.user.kind === "curator" ? " (curator)" : ""}` : "";
  }
  function viewLocked(section) {
    setTab(section);
    const NAMES = { archive: ["The archive", "Archive · every past puzzle"], free: ["Free play", "Free play · endless questions"], theory: ["Theory", "Theory · questions from the literature"] };
    setTitle("", NAMES[section][1]);
    main().innerHTML = `<section class="card locked-card">
      <div class="lock-big">🔒</div>
      <h2>${NAMES[section][0]} is for signed-in TrEDBox users</h2>
      <p>Today's puzzle is open to everyone. Sign in to TrEDBox to unlock:</p>
      <ul><li>🗂 every past daily puzzle, to play any time</li><li>♾ endless free-play questions in ten formats</li>
        <li>🟢 <a href="../#db">TrEnDB</a> and 🟣 <a href="../photoredbox/index.html#db">ReDBox</a>: the whole database, with sources</li></ul>
      <div class="end-actions"><button class="btn primary" data-auth="in">Sign in</button><a class="btn ghost" href="#/daily">Back to today's puzzle</a></div>
      <p class="muted small">Same sign-in as the database: the preview user name, or your curator email.</p></section>`;
    main().querySelectorAll("[data-auth]").forEach(b => b.onclick = () => openAuth());
  }
  function openAuth() {
    modal("Sign in to TrEDBox", `
      <form id="auth-form" class="auth-form">
        <label>User or curator email<input name="user" required autocomplete="username" autocapitalize="none" spellcheck="false"></label>
        <label>Password<input name="password" type="password" required autocomplete="current-password"></label>
        <p class="auth-msg" id="auth-msg" role="status"></p>
        <button class="btn primary" type="submit">Sign in</button>
        <p class="muted small">This is the TrEDBox sign-in: it also opens the database on this site. Today's puzzle never needs it.</p>
      </form>`);
    $("#auth-form").onsubmit = async e => {
      e.preventDefault();
      const f = new FormData(e.target), msg = $("#auth-msg"), btn = e.target.querySelector("[type=submit]");
      btn.disabled = true; msg.textContent = "…";
      try { await ACC.signIn(String(f.get("user")).trim(), f.get("password")); closeModal(); toast("Signed in to TrEDBox"); }
      catch (err) { msg.textContent = /fetch|network/i.test(err.message) ? "TrEDBox could not be reached. Try again." : err.message; btn.disabled = false; }
    };
  }

  function route() {
    clearInterval(cdTimer);
    const h = location.hash.replace(/^#\/?/, "");
    const [a, b] = h.split("/");
    if ((a === "archive" || a === "free" || a === "theory") && needsLogin(a)) viewLocked(a);
    else if (a === "theory") viewTheory();
    else if (a === "archive" && b) viewDaily(b, true);
    else if (a === "archive") viewArchive();
    else if (a === "free") viewFree();
    else viewDaily(T.todayStr(), false);
    window.scrollTo(0, 0);
  }

  async function init() {
    applyTheme(store.get("theme", "auto"));
    const th = store.get("theme", "auto"); $("#theme-btn").textContent = "Theme: " + th[0].toUpperCase() + th.slice(1);
    $("#menu-btn").onclick = () => { const d = $("#drawer"); d.hidden = !d.hidden; };
    document.addEventListener("click", e => { if (!e.target.closest("#drawer, #menu-btn, #acct-top")) $("#drawer").hidden = true; });
    $("#help-btn").onclick = () => { $("#drawer").hidden = true; openHelp(); };
    $("#stats-btn").onclick = () => { $("#drawer").hidden = true; openStats(); };
    $("#stats-top").onclick = openStats;
    $("#theme-btn").onclick = cycleTheme;
    $("#modal-close").onclick = closeModal;
    $("#modal").onclick = e => { if (e.target.id === "modal") closeModal(); };
    document.addEventListener("keydown", e => { if (e.key === "Escape") { closeModal(); $("#drawer").hidden = true; } });
    main().innerHTML = `<p class="muted center">Loading molecules…</p>`;
    await Promise.all([T.load(), ACC.init().catch(e => console.warn("sign-in check", e))]);
    $("#datasrc").textContent = T.source;
    refreshAccountUI();
    ACC.onChange(() => { refreshAccountUI(); route(); });
    const acct = () => { $("#drawer").hidden = true; if (ACC.user) { ACC.signOut(); toast("Signed out of TrEDBox"); } else openAuth(); };
    $("#acct-btn").onclick = acct;
    $("#acct-top").onclick = () => ACC.user ? ($("#drawer").hidden = false) : openAuth();
    window.addEventListener("hashchange", route);
    route();
    if (!store.get("seenHelp")) { store.set("seenHelp", true); openHelp(); }
    // structures appear once OpenChemLib has loaded
    const ocl = $("#ocl-script");
    if (!window.OCL && ocl) ocl.addEventListener("load", () => { svgCache.clear(); const keep = location.hash; if ($("#game") && !$("#game .reveal") && location.hash.startsWith("#/free")) return refreshStructs(); route(); });
  }
  function refreshStructs() {
    document.querySelectorAll(".formula.muted").forEach(el => {
      const name = el.textContent; const m = T.mols.find(x => (x.formula || x.name) === name);
      if (m) { const h = parseInt(el.style.height) || 120; el.outerHTML = structure(m, Math.round(h * 1.6), h); }
    });
  }
  window.addEventListener("DOMContentLoaded", init);
})();
