// HW7 — Statistical independence: contingency tables, frequencies, expected counts, Pearson's χ².
// Pure computation, no DOM: also runs under Node for testing (module.exports).
// Reuses the seeded PRNG of HW4.
(function (root) {
  "use strict";
  const HW4 = root.HW4 || (typeof require !== "undefined" ? require("../hw4/sim.js") : null);
  const { rng } = HW4;

  // ---------- 1. contingency table from raw records ----------
  // records: array of [x, f] pairs. Category order: the given order if any, else first appearance.
  function tabulate(records, xOrder, fOrder) {
    const xs = xOrder ? [...xOrder] : [], fs = fOrder ? [...fOrder] : [];
    const xi = new Map(xs.map((v, i) => [v, i])), fi = new Map(fs.map((v, i) => [v, i]));
    for (const [x, f] of records) {
      if (!xi.has(x)) { xi.set(x, xs.length); xs.push(x); }
      if (!fi.has(f)) { fi.set(f, fs.length); fs.push(f); }
    }
    const O = xs.map(() => fs.map(() => 0));
    for (const [x, f] of records) O[xi.get(x)][fi.get(f)]++;   // the whole tally: one pass, one increment per record
    return margins({ rows: xs, cols: fs, O });
  }
  function margins(t) {
    const r = t.rows.length, c = t.cols.length;
    const rowTot = t.O.map((row) => row.reduce((a, b) => a + b, 0));
    const colTot = t.cols.map((_, j) => t.O.reduce((a, row) => a + row[j], 0));
    const n = rowTot.reduce((a, b) => a + b, 0);
    return { ...t, r, c, rowTot, colTot, n };
  }

  // ---------- 2. relative, marginal and conditional frequencies ----------
  function frequencies(t) {
    const { O, rowTot, colTot, n } = t;
    return {
      joint: O.map((row) => row.map((v) => v / n)),                 // f(x_i, f_j) = n_ij / n
      fx: rowTot.map((v) => v / n),                                 // marginal f(x_i) = n_i. / n
      ff: colTot.map((v) => v / n),                                 // marginal f(f_j) = n_.j / n
      fGivenX: O.map((row, i) => row.map((v) => (rowTot[i] ? v / rowTot[i] : NaN))), // f(f_j | x_i) = n_ij / n_i.
      xGivenF: O.map((row) => row.map((v, j) => (colTot[j] ? v / colTot[j] : NaN))), // f(x_i | f_j) = n_ij / n_.j
    };
  }

  // ---------- 3. expected counts under independence, χ² and friends ----------
  function chiSquare(t) {
    const { O, rowTot, colTot, n, r, c } = t;
    const E = rowTot.map((a) => colTot.map((b) => (a * b) / n));    // E_ij = n_i. n_.j / n
    let chi2 = 0, G = 0, minE = Infinity, small = 0;
    const contrib = [], resid = [], adj = [];
    for (let i = 0; i < r; i++) {
      contrib.push([]); resid.push([]); adj.push([]);
      for (let j = 0; j < c; j++) {
        const e = E[i][j], o = O[i][j], d = o - e;
        const q = e > 0 ? (d * d) / e : 0;
        chi2 += q; contrib[i].push(q);
        resid[i].push(e > 0 ? d / Math.sqrt(e) : 0);                    // Pearson residual
        const v = e * (1 - rowTot[i] / n) * (1 - colTot[j] / n);
        adj[i].push(v > 0 ? d / Math.sqrt(v) : 0);                      // adjusted residual ≈ N(0,1) under H0
        if (o > 0 && e > 0) G += 2 * o * Math.log(o / e);
        minE = Math.min(minE, e); if (e < 5) small++;
      }
    }
    const df = (r - 1) * (c - 1);
    const k = Math.min(r, c) - 1;
    return {
      E, contrib, resid, adj, chi2, df, G, minE, small, cells: r * c,
      p: df > 0 ? chi2Sf(chi2, df) : NaN,
      pG: df > 0 ? chi2Sf(G, df) : NaN,
      V: k > 0 && n > 0 ? Math.sqrt(chi2 / (n * k)) : NaN,            // Cramér's V ∈ [0, 1]
      Cc: Math.sqrt(chi2 / (chi2 + n)),                                // Pearson's contingency coefficient
      phi2: chi2 / n,
    };
  }

  // ---------- 4. the χ² distribution: regularized incomplete gamma ----------
  function lgamma(x) {   // Lanczos, g = 7, n = 9 (≈ 15 digits)
    const g = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
      -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
    if (x < 0.5) return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * x))) - lgamma(1 - x);
    x -= 1; let a = g[0]; const t = x + 7.5;
    for (let i = 1; i < 9; i++) a += g[i] / (x + i);
    return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
  }
  // P(a, x) by its power series (good for x < a + 1)
  function gammaPser(a, x) {
    let sum = 1 / a, del = sum, ap = a;
    for (let k = 0; k < 10000; k++) { ap += 1; del *= x / ap; sum += del; if (Math.abs(del) < Math.abs(sum) * 1e-16) break; }
    return sum * Math.exp(-x + a * Math.log(x) - lgamma(a));
  }
  // Q(a, x) by Lentz's continued fraction (good for x ≥ a + 1)
  function gammaQcf(a, x) {
    const tiny = 1e-300;
    let b = x + 1 - a, c = 1 / tiny, d = 1 / b, h = d;
    for (let i = 1; i < 10000; i++) {
      const an = -i * (i - a); b += 2;
      d = an * d + b; if (Math.abs(d) < tiny) d = tiny;
      c = b + an / c; if (Math.abs(c) < tiny) c = tiny;
      d = 1 / d; const del = d * c; h *= del;
      if (Math.abs(del - 1) < 1e-16) break;
    }
    return Math.exp(-x + a * Math.log(x) - lgamma(a)) * h;
  }
  const gammaQ = (a, x) => (x <= 0 ? 1 : x < a + 1 ? 1 - gammaPser(a, x) : gammaQcf(a, x));
  const chi2Sf = (x, k) => gammaQ(k / 2, x / 2);                          // P(χ²_k > x): the p-value
  const chi2Cdf = (x, k) => 1 - chi2Sf(x, k);
  const chi2Pdf = (x, k) => (x <= 0 ? (k === 2 ? 0.5 : k < 2 ? Infinity : 0)
    : Math.exp((k / 2 - 1) * Math.log(x) - x / 2 - (k / 2) * Math.LN2 - lgamma(k / 2)));
  function chi2Quantile(p, k) {   // x with P(χ²_k ≤ x) = p, by bisection on the CDF
    let lo = 0, hi = Math.max(1, k);
    while (chi2Cdf(hi, k) < p) hi *= 2;
    for (let i = 0; i < 200; i++) { const mid = (lo + hi) / 2; if (chi2Cdf(mid, k) < p) lo = mid; else hi = mid; }
    return (lo + hi) / 2;
  }

  // ---------- 5. permutation test: break the link between X and F, keep both margins ----------
  // Shuffling the F column of the records gives tables with exactly the observed margins
  // drawn from the null hypothesis of independence (conditional on the margins).
  function permutation(t, B, seed) {
    const next = rng(seed), U = () => next() / 4294967296;
    const xIdx = [], fIdx = [];
    t.O.forEach((row, i) => row.forEach((v, j) => { for (let k = 0; k < v; k++) { xIdx.push(i); fIdx.push(j); } }));
    const n = xIdx.length, f = Int32Array.from(fIdx);
    const E = t.rowTot.map((a) => t.colTot.map((b) => (a * b) / t.n));
    const obs = chiSquare(t).chi2;
    const stats = new Float64Array(B); let ge = 0;
    const O = t.rows.map(() => new Int32Array(t.c));
    for (let b = 0; b < B; b++) {
      for (let i = n - 1; i > 0; i--) { const j = (U() * (i + 1)) | 0; const s = f[i]; f[i] = f[j]; f[j] = s; } // Fisher–Yates
      O.forEach((row) => row.fill(0));
      for (let k = 0; k < n; k++) O[xIdx[k]][f[k]]++;
      let q = 0;
      for (let i = 0; i < t.r; i++) for (let j = 0; j < t.c; j++) { const e = E[i][j]; if (e > 0) { const d = O[i][j] - e; q += (d * d) / e; } }
      stats[b] = q; if (q >= obs - 1e-9) ge++;
    }
    return { stats, p: (ge + 1) / (B + 1), obs, B };
  }

  // ---------- 6. data helpers ----------
  // expand an aggregated table into shuffled raw records [x, f]
  function expand(rows, cols, O, seed = 7) {
    const out = [];
    O.forEach((row, i) => row.forEach((v, j) => { for (let k = 0; k < v; k++) out.push([rows[i], cols[j]]); }));
    const next = rng(seed);
    for (let i = out.length - 1; i > 0; i--) { const j = Math.floor((next() / 4294967296) * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
    return out;
  }
  // Synthetic IDS log. Service X has marginal pX; verdict F has marginal pF under independence.
  // lambda ∈ [0, 1] mixes in a service-specific verdict profile: P(F | X = x) = (1 − λ)·pF + λ·profile(x).
  const IDS = {
    services: ["HTTP", "HTTPS", "DNS", "SSH", "SMTP", "FTP"],
    pX: [0.28, 0.34, 0.18, 0.08, 0.08, 0.04],
    verdicts: ["benign", "suspicious", "malicious"],
    pF: [0.80, 0.15, 0.05],
    profile: [[0.78, 0.15, 0.07], [0.90, 0.08, 0.02], [0.85, 0.13, 0.02], [0.45, 0.35, 0.20], [0.70, 0.22, 0.08], [0.50, 0.30, 0.20]],
  };
  function idsLog(n, lambda, seed) {
    const next = rng(seed), U = () => next() / 4294967296;
    const pick = (p) => { let u = U(), k = 0; while (k < p.length - 1 && u >= p[k]) { u -= p[k]; k++; } return k; };
    const out = [];
    for (let k = 0; k < n; k++) {
      const x = pick(IDS.pX);
      const p = IDS.pF.map((q, j) => (1 - lambda) * q + lambda * IDS.profile[x][j]);
      out.push([IDS.services[x], IDS.verdicts[pick(p)]]);
    }
    return out;
  }
  // two-column CSV / TSV / whitespace; a header row is detected when asked
  function parseCSV(text, header) {
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const split = (l) => (l.includes(",") ? l.split(",") : l.includes(";") ? l.split(";") : l.includes("\t") ? l.split("\t") : l.split(/\s+/)).map((s) => s.trim());
    let names = ["X", "F"];
    if (header && lines.length) names = split(lines.shift()).slice(0, 2);
    const recs = lines.map(split).filter((p) => p.length >= 2 && p[0] !== "" && p[1] !== "").map((p) => [p[0], p[1]]);
    return { names, recs };
  }

  const API = { tabulate, margins, frequencies, chiSquare, lgamma, gammaQ, chi2Sf, chi2Cdf, chi2Pdf, chi2Quantile,
    permutation, expand, idsLog, IDS, parseCSV };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else root.HW7 = API;
})(typeof window !== "undefined" ? window : globalThis);
