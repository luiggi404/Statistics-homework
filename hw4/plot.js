// HW4 — small SVG plotting helper: lines, bands, histograms, points; linear or log axes.
// Reuses the site's .chart / .legend / .tip styles and colour tokens.
(function () {
  "use strict";
  const NS = "http://www.w3.org/2000/svg";
  const el = (tag, attrs, parent) => {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  };
  const fmt = (v) => {
    if (v === 0) return "0";
    const a = Math.abs(v);
    if (a >= 1e4) return (v / 1000).toFixed(a >= 1e5 ? 0 : 0) + "k";
    if (a >= 1000) return String(Math.round(v));
    if (a >= 10) return String(Math.round(v * 10) / 10);
    if (a >= 1) return String(Math.round(v * 100) / 100);
    if (a >= 0.01) return String(Math.round(v * 1000) / 1000);
    return v.toExponential(0).replace("e-", "e−");
  };
  const niceStep = (span, target) => {
    const raw = span / target, e = Math.pow(10, Math.floor(Math.log10(raw)));
    for (const m of [1, 2, 2.5, 5, 10]) if (m * e >= raw) return m * e;
    return 10 * e;
  };
  function ticks(lo, hi, log) {
    if (!log) {
      const st = niceStep(hi - lo || 1, 5), out = [];
      for (let v = Math.ceil(lo / st) * st; v <= hi + st * 1e-9; v += st) out.push(Math.abs(v) < st * 1e-9 ? 0 : v);
      return out;
    }
    const out = [], e0 = Math.floor(Math.log10(lo)), e1 = Math.ceil(Math.log10(hi));
    const mult = e1 - e0 <= 2 ? [1, 2, 5] : [1];
    for (let e = e0; e <= e1; e++) for (const f of mult) { const v = f * Math.pow(10, e); if (v >= lo * 0.999 && v <= hi * 1.001) out.push(v); }
    return out;
  }

  // o: { title, caption, xLog, yLog, xMin, xMax, yMin, yMax, xLabel, yLabel, height,
  //      layers: [{type:'line'|'band'|'hist'|'points'|'hline'|'vline', ...}], legend:[[name,color,dash?]] }
  window.plot = function (container, o) {
    container.innerHTML = "";
    container.classList.add("chart");
    if (o.title) { const t = document.createElement("p"); t.className = "ttl"; t.textContent = o.title; container.appendChild(t); }
    if (o.caption) { const c = document.createElement("p"); c.className = "cap"; c.innerHTML = o.caption; container.appendChild(c); }
    if (o.legend) {
      const l = document.createElement("div"); l.className = "legend";
      o.legend.forEach(([name, color, dash]) => {
        const s = document.createElement("span"); s.style.setProperty("--c", color); s.textContent = name;
        if (dash) s.classList.add("dash");
        l.appendChild(s);
      });
      container.appendChild(l);
    }
    const tip = document.createElement("div"); tip.className = "tip"; container.appendChild(tip);

    // data extent
    let xs = [], ys = [];
    for (const L of o.layers) {
      if (L.type === "line" || L.type === "points") { xs.push(...L.x); ys.push(...L.y); }
      if (L.type === "band") { xs.push(...L.x); ys.push(...L.lo, ...L.hi); }
      if (L.type === "hist") { xs.push(L.edges[0], L.edges[L.edges.length - 1]); ys.push(0, ...L.dens); }
    }
    const fin = (a) => a.filter((v) => Number.isFinite(v) && (v > 0 || true));
    xs = fin(xs); ys = fin(ys);
    if (o.yLog) ys = ys.filter((v) => v > 0);
    if (o.xLog) xs = xs.filter((v) => v > 0);
    let x0 = o.xMin ?? Math.min(...xs), x1 = o.xMax ?? Math.max(...xs);
    let y0 = o.yMin ?? Math.min(...ys), y1 = o.yMax ?? Math.max(...ys);
    if (!o.yLog && o.yMax == null) { const pad = (y1 - y0) * 0.04 || 1; y1 += pad; if (o.yMin == null && y0 !== 0) y0 -= pad; }
    if (o.yLog && o.yMin == null) y0 = Math.pow(10, Math.floor(Math.log10(y0)));
    if (o.yLog && o.yMax == null) y1 = Math.pow(10, Math.ceil(Math.log10(y1)));

    const W = 640, H = o.height || 250, m = { l: 52, r: 12, t: 10, b: 40 };
    const pw = W - m.l - m.r, ph = H - m.t - m.b;
    const tx = o.xLog ? Math.log10 : (v) => v, ty = o.yLog ? Math.log10 : (v) => v;
    const X = (v) => m.l + ((tx(v) - tx(x0)) / (tx(x1) - tx(x0))) * pw;
    const Y = (v) => m.t + ph - ((ty(v) - ty(y0)) / (ty(y1) - ty(y0))) * ph;
    const cy = (v) => Math.max(m.t - 2, Math.min(m.t + ph + 2, Y(v)));

    const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": o.title || "chart" }, container);
    const clipId = "c" + Math.random().toString(36).slice(2);
    el("rect", { x: m.l, y: m.t, width: pw, height: ph }, el("clipPath", { id: clipId }, el("defs", {}, svg)));

    // grid + axes
    const g = el("g", {}, svg);
    ticks(y0, y1, o.yLog).forEach((v) => {
      const y = Y(v);
      el("line", { x1: m.l, x2: W - m.r, y1: y, y2: y, stroke: "var(--line)", "stroke-width": 1 }, g);
      el("text", { x: m.l - 6, y: y + 4, "text-anchor": "end", "font-size": 11, fill: "var(--fg2)" }, g).textContent = (o.yFmt || fmt)(v);
    });
    ticks(x0, x1, o.xLog).forEach((v) => {
      const x = X(v);
      el("line", { x1: x, x2: x, y1: m.t + ph, y2: m.t + ph + 4, stroke: "var(--fg2)" }, g);
      el("text", { x, y: m.t + ph + 16, "text-anchor": "middle", "font-size": 10.5, fill: "var(--fg2)" }, g).textContent = (o.xFmt || fmt)(v);
    });
    if (o.xLabel) el("text", { x: m.l + pw / 2, y: H - 4, "text-anchor": "middle", "font-size": 11, fill: "var(--fg2)" }, g).textContent = o.xLabel;
    if (o.yLabel) el("text", { x: 12, y: m.t + ph / 2, "text-anchor": "middle", "font-size": 11, fill: "var(--fg2)", transform: `rotate(-90 12 ${m.t + ph / 2})` }, g).textContent = o.yLabel;

    const body = el("g", { "clip-path": `url(#${clipId})` }, svg);
    const pathOf = (x, y) => {
      let d = "", pen = false;
      for (let i = 0; i < x.length; i++) {
        if (!Number.isFinite(y[i]) || (o.yLog && y[i] <= 0) || (o.xLog && x[i] <= 0)) { pen = false; continue; }
        d += (pen ? "L" : "M") + X(x[i]).toFixed(1) + "," + cy(y[i]).toFixed(1); pen = true;
      }
      return d;
    };
    for (const L of o.layers) {
      if (L.type === "band") {
        const top = L.x.map((x, i) => X(x).toFixed(1) + "," + cy(L.hi[i]).toFixed(1));
        const bot = L.x.map((x, i) => X(x).toFixed(1) + "," + cy(L.lo[i]).toFixed(1)).reverse();
        el("path", { d: "M" + top.join("L") + "L" + bot.join("L") + "Z", fill: L.color, "fill-opacity": L.opacity ?? 0.15 }, body);
      } else if (L.type === "hist") {
        L.dens.forEach((d, i) => {
          if (d <= 0) return;
          const xa = X(L.edges[i]), xb = X(L.edges[i + 1]), y = cy(d);
          const r = el("rect", { x: xa + 0.5, y, width: Math.max(0.5, xb - xa - 1), height: m.t + ph - y, fill: L.color, "fill-opacity": L.opacity ?? 0.8 }, body);
          if (L.tip) { r.addEventListener("mousemove", (e) => show(e, L.tip(i))); r.addEventListener("mouseleave", hide); }
        });
      } else if (L.type === "line") {
        el("path", { d: pathOf(L.x, L.y), fill: "none", stroke: L.color, "stroke-width": L.width ?? 1.5, "stroke-opacity": L.opacity ?? 1,
          "stroke-dasharray": L.dash || "", "stroke-linejoin": "round", "stroke-linecap": "round" }, body);
      } else if (L.type === "points") {
        L.x.forEach((x, i) => {
          if (!Number.isFinite(L.y[i]) || (o.yLog && L.y[i] <= 0)) return;
          const c = el("circle", { cx: X(x), cy: cy(L.y[i]), r: L.r ?? 4, fill: L.color, stroke: "var(--bg)", "stroke-width": 1.5 }, body);
          if (L.tip) { c.addEventListener("mousemove", (e) => show(e, L.tip(i))); c.addEventListener("mouseleave", hide); }
        });
      } else if (L.type === "hline") {
        el("line", { x1: m.l, x2: W - m.r, y1: Y(L.y), y2: Y(L.y), stroke: L.color || "var(--fg2)", "stroke-width": 1.2, "stroke-dasharray": L.dash ?? "5 4" }, body);
      } else if (L.type === "vline") {
        el("line", { x1: X(L.x), x2: X(L.x), y1: m.t, y2: m.t + ph, stroke: L.color || "var(--fg2)", "stroke-width": 1.2, "stroke-dasharray": L.dash ?? "5 4" }, body);
      }
    }
    el("line", { x1: m.l, x2: W - m.r, y1: m.t + ph, y2: m.t + ph, stroke: "var(--fg2)", "stroke-width": 1 }, svg);

    function show(evt, text) {
      const r = container.getBoundingClientRect();
      tip.textContent = text; tip.style.opacity = 1;
      let x = evt.clientX - r.left + 12;
      if (x + tip.offsetWidth > r.width) x = evt.clientX - r.left - tip.offsetWidth - 12;
      tip.style.left = x + "px"; tip.style.top = evt.clientY - r.top - 30 + "px";
    }
    function hide() { tip.style.opacity = 0; }
  };
})();
