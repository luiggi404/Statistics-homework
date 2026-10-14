// Minimal SVG chart helpers (no dependencies).
// barChart: one or two series, hover tooltip per bar. scatter: points with optional per-point titles.
(function () {
  const NS = "http://www.w3.org/2000/svg";
  const el = (tag, attrs = {}, parent) => {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  };
  const niceMax = (v) => {
    if (v <= 0) return 1;
    const e = Math.pow(10, Math.floor(Math.log10(v)));
    for (const m of [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * e >= v) return m * e;
    return 10 * e;
  };
  const fmtNum = (v) => (Number.isInteger(v) ? String(v) : Math.abs(v) >= 10 ? String(Math.round(v * 10) / 10) : String(Math.round(v * 1000) / 1000));

  function frame(container, { title, caption, legend }) {
    container.innerHTML = "";
    container.classList.add("chart");
    if (title) { const t = document.createElement("p"); t.className = "ttl"; t.textContent = title; container.appendChild(t); }
    if (caption) { const c = document.createElement("p"); c.className = "cap"; c.textContent = caption; container.appendChild(c); }
    if (legend) {
      const l = document.createElement("div"); l.className = "legend";
      legend.forEach(([name, color]) => { const s = document.createElement("span"); s.style.setProperty("--c", color); s.textContent = name; l.appendChild(s); });
      container.appendChild(l);
    }
    const tip = document.createElement("div"); tip.className = "tip"; container.appendChild(tip);
    const showTip = (evt, text) => {
      const r = container.getBoundingClientRect();
      tip.textContent = text; tip.style.opacity = 1;
      let x = evt.clientX - r.left + 12, y = evt.clientY - r.top - 30;
      if (x + tip.offsetWidth > r.width) x = evt.clientX - r.left - tip.offsetWidth - 12;
      tip.style.left = x + "px"; tip.style.top = y + "px";
    };
    const hideTip = () => (tip.style.opacity = 0);
    return { showTip, hideTip };
  }

  function axes(svg, W, H, m, yMax, xLabel, yLabel, yFmt) {
    const g = el("g", {}, svg);
    for (let i = 0; i <= 4; i++) {
      const v = (yMax * i) / 4, y = H - m.b - ((H - m.t - m.b) * i) / 4;
      el("line", { x1: m.l, x2: W - m.r, y1: y, y2: y, stroke: "var(--line)", "stroke-width": 1 }, g);
      const t = el("text", { x: m.l - 6, y: y + 4, "text-anchor": "end", "font-size": 11, fill: "var(--fg2)" }, g);
      t.textContent = yFmt ? yFmt(v) : fmtNum(v);
    }
    if (xLabel) { const t = el("text", { x: (m.l + W - m.r) / 2, y: H - 4, "text-anchor": "middle", "font-size": 11, fill: "var(--fg2)" }, g); t.textContent = xLabel; }
    if (yLabel) { const t = el("text", { x: 12, y: (m.t + H - m.b) / 2, "text-anchor": "middle", "font-size": 11, fill: "var(--fg2)", transform: `rotate(-90 12 ${(m.t + H - m.b) / 2})` }, g); t.textContent = yLabel; }
  }

  // series: [{name, values, color}] ; labels: x labels ; ref: horizontal reference value
  window.barChart = function (container, o) {
    const { showTip, hideTip } = frame(container, { title: o.title, caption: o.caption, legend: o.series.length > 1 ? o.series.map((s) => [s.name, s.color]) : null });
    const W = 640, H = o.height || 220, m = { l: 48, r: 8, t: 10, b: o.xLabel ? 40 : 26 };
    const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": o.title || "bar chart" }, container);
    const n = o.labels.length, S = o.series.length;
    const yMax = o.yMax ?? niceMax(Math.max(...o.series.flatMap((s) => s.values), o.ref ?? 0));
    axes(svg, W, H, m, yMax, o.xLabel, o.yLabel, o.yFmt);
    const plotW = W - m.l - m.r, plotH = H - m.t - m.b, band = plotW / n;
    const gap = band > 6 ? 2 : band > 3 ? 1 : 0;
    const bw = Math.max(0.6, (band - gap) / S - (S > 1 ? 1 : 0));
    const base = H - m.b;
    o.series.forEach((s, si) => {
      s.values.forEach((v, i) => {
        const h = (v / yMax) * plotH, x = m.l + i * band + gap / 2 + si * (bw + (S > 1 ? 1 : 0));
        const r = Math.min(4, bw / 2, h);
        // bar with rounded top anchored to baseline
        const path = h <= 0 ? "" : `M${x},${base} V${base - h + r} Q${x},${base - h} ${x + r},${base - h} H${x + bw - r} Q${x + bw},${base - h} ${x + bw},${base - h + r} V${base} Z`;
        if (path) el("path", { d: path, fill: s.color }, svg);
        const hit = el("rect", { x: m.l + i * band, y: m.t, width: band, height: plotH, fill: "transparent" }, svg);
        const txt = (o.tip ? o.tip(i, o.labels[i]) : o.labels[i]) + " — " + o.series.map((t) => (S > 1 ? t.name + ": " : "") + fmtNum(t.values[i])).join(", ");
        hit.addEventListener("mousemove", (e) => showTip(e, txt));
        hit.addEventListener("mouseleave", hideTip);
      });
    });
    if (o.ref != null) {
      const y = base - (o.ref / yMax) * plotH;
      el("line", { x1: m.l, x2: W - m.r, y1: y, y2: y, stroke: "var(--fg2)", "stroke-width": 1.5, "stroke-dasharray": "5 4" }, svg);
      if (o.refLabel) { const t = el("text", { x: W - m.r, y: y - 5, "text-anchor": "end", "font-size": 11, fill: "var(--fg)", stroke: "var(--bg)", "stroke-width": 4, "paint-order": "stroke", "font-weight": 600 }, svg); t.textContent = o.refLabel; }
    }
    // x tick labels: show at most ~12
    const every = Math.max(1, Math.ceil(n / 12));
    o.labels.forEach((lb, i) => {
      if (i % every) return;
      const t = el("text", { x: m.l + i * band + band / 2, y: base + 14, "text-anchor": "middle", "font-size": 10.5, fill: "var(--fg2)" }, svg);
      t.textContent = lb;
    });
    el("line", { x1: m.l, x2: W - m.r, y1: base, y2: base, stroke: "var(--fg2)", "stroke-width": 1 }, svg);
  };

  window.scatterChart = function (container, o) {
    const { showTip, hideTip } = frame(container, { title: o.title, caption: o.caption });
    const W = 640, H = o.height || 260, m = { l: 48, r: 10, t: 10, b: 40 };
    const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": o.title || "scatter plot" }, container);
    const xMax = o.xMax ?? Math.max(...o.points.map((p) => p[0])), yMax = o.yMax ?? Math.max(...o.points.map((p) => p[1]));
    axes(svg, W, H, m, yMax, o.xLabel, o.yLabel, (v) => String(Math.round(v)));
    const plotW = W - m.l - m.r, plotH = H - m.t - m.b;
    const X = (v) => m.l + (v / xMax) * plotW, Y = (v) => H - m.b - (v / yMax) * plotH;
    for (let i = 0; i <= 4; i++) {
      const v = (xMax * i) / 4, t = el("text", { x: X(v), y: H - m.b + 14, "text-anchor": "middle", "font-size": 10.5, fill: "var(--fg2)" }, svg);
      t.textContent = Math.round(v);
    }
    const rad = o.points.length > 800 ? 2 : o.points.length > 150 ? 3 : 4.5;
    const g = el("g", {}, svg);
    o.points.forEach((p) => {
      const c = el("circle", { cx: X(p[0]), cy: Y(p[1]), r: rad, fill: o.color || "var(--s1)", "fill-opacity": 0.75, stroke: "var(--bg)", "stroke-width": rad > 3 ? 1.5 : 0.5 }, g);
      if (o.points.length <= 1200) {
        c.addEventListener("mousemove", (e) => showTip(e, o.tip ? o.tip(p) : `(${p[0]}, ${p[1]})`));
        c.addEventListener("mouseleave", hideTip);
      }
    });
    el("line", { x1: m.l, x2: W - m.r, y1: H - m.b, y2: H - m.b, stroke: "var(--fg2)", "stroke-width": 1 }, svg);
  };
})();
