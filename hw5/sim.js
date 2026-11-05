// HW5 — Welford's recurrences and the sampling distribution of the mean and variance.
// Pure computation, no DOM: also runs under Node for testing (module.exports).
// Reuses the seeded PRNG and normal CDF of HW4.
(function (root) {
  "use strict";
  const HW4 = root.HW4 || (typeof require !== "undefined" ? require("../hw4/sim.js") : null);
  const { rng, Phi, drawGrid } = HW4;

  // ---------- Welford's algorithm: the whole point of Ex. 1 ----------
  // State: k (count), mean (Knuth's M_k), ss (sum of squared deviations SS_k).
  function welford() {
    let k = 0, mean = 0, ss = 0;
    return {
      push(x) {
        k++;
        const d = x - mean;   // x_k − M_{k−1}
        mean += d / k;        // M_k = M_{k−1} + (x_k − M_{k−1}) / k        (Knuth)
        ss += d * (x - mean); // SS_k = SS_{k−1} + (x_k − M_{k−1})(x_k − M_k) (Welford)
      },
      get n() { return k; }, get mean() { return mean; }, get ss() { return ss; },
      get sampleVar() { return k > 1 ? ss / (k - 1) : NaN; },
      get popVar() { return k > 0 ? ss / k : NaN; },
    };
  }

  // The textbook one-pass formula and the two-pass formula, for comparison.
  function naiveVar(xs) {
    let s = 0, q = 0; for (const x of xs) { s += x; q += x * x; }
    const n = xs.length; return (q - (s * s) / n) / (n - 1);
  }
  function twoPassVar(xs) {
    let s = 0; for (const x of xs) s += x;
    const m = s / xs.length; let q = 0; for (const x of xs) q += (x - m) * (x - m);
    return q / (xs.length - 1);
  }

  // ---------- score distributions on {0, 1, …, 10} ----------
  const K = 11;
  const binom = (p) => {
    const out = []; let c = 1;
    for (let k = 0; k < K; k++) { out.push(c * Math.pow(p, k) * Math.pow(1 - p, 10 - k)); c = (c * (10 - k)) / (k + 1); }
    return out;
  };
  const norm = (a) => { const s = a.reduce((x, y) => x + y, 0); return a.map((v) => v / s); };
  const DISTS = {
    binom: (p) => ({ key: "binom", name: `Binomial(10, ${p})`, pmf: binom(p),
      story: "Each attempt is 10 independent checks (recon, foothold, privilege escalation, …), each passed with probability p; the score is the number passed." }),
    unif: () => ({ key: "unif", name: "Uniform{0, …, 10}", pmf: new Array(K).fill(1 / K),
      story: "Every score from 0 to 10 is equally likely: no information about the attacker." }),
    geom: () => ({ key: "geom", name: "Truncated geometric (r = 0.6)", pmf: norm(Array.from({ length: K }, (_, k) => Math.pow(0.6, k))),
      story: "Most attempts are stopped early and a deep compromise is rare: P(score = k) ∝ 0.6ᵏ. Right-skewed, heavy right tail." }),
    bimodal: () => ({ key: "bimodal", name: "Bimodal (all-or-nothing)", pmf: [0.30, 0.12, 0.05, 0.03, 0.02, 0.02, 0.02, 0.03, 0.06, 0.15, 0.20],
      story: "An attempt is either blocked at the perimeter or ends in full compromise; partial outcomes are rare." }),
  };

  // Exact moments from the pmf: μ, σ², third and fourth central moments.
  function moments(pmf) {
    let mu = 0; pmf.forEach((p, k) => (mu += p * k));
    let m2 = 0, m3 = 0, m4 = 0;
    pmf.forEach((p, k) => { const d = k - mu; m2 += p * d * d; m3 += p * d * d * d; m4 += p * d * d * d * d; });
    return { mu, var: m2, sd: Math.sqrt(m2), mu3: m3, mu4: m4, skew: m3 / Math.pow(m2, 1.5), kurt: m4 / (m2 * m2) };
  }
  function makeDist(key, p) {
    const d = DISTS[key](p);
    Object.assign(d, moments(d.pmf));
    // inverse-CDF sampler: one 32-bit word per score
    const thr = new Float64Array(K); let c = 0;
    for (let k = 0; k < K; k++) { c += d.pmf[k]; thr[k] = c * 4294967296; }
    thr[K - 1] = Infinity;
    d.thr = thr;
    return d;
  }

  // Theory for the sampling mean and the sampling variance (n−1 divisor) of n i.i.d. scores.
  function theory(d, n) {
    return {
      meanXbar: d.mu, varXbar: d.var / n,
      meanS2: d.var, varS2: (d.mu4 - (d.var * d.var * (n - 3)) / (n - 1)) / n,
      meanPop: (d.var * (n - 1)) / n,
      cov: d.mu3 / n,
    };
  }

  // Checkpoints n = 2, 5, 10, 20, 50, … up to N, plus N.
  function checkpoints(N) {
    const out = [2];
    for (let e = 1; e <= N; e *= 10) for (const f of [1, 2, 5]) if (e * f <= N && e * f >= 5) out.push(e * f);
    if (out[out.length - 1] !== N) out.push(N);
    return out;
  }

  // m hackers, each attempting N systems. Every hacker runs Welford's recurrence along
  // their own trajectory; the state (M_n, SS_n) is recorded at every checkpoint n.
  // Full running paths are kept for the first T hackers on a draw grid.
  function simulate({ dist, N, m, seed, T = 40 }) {
    const next = rng(seed), thr = dist.thr;
    const cp = checkpoints(N), C = cp.length;
    const grid = drawGrid(N, 200), G = grid.length;
    const M = new Float64Array(m * C), SS = new Float64Array(m * C);
    const paths = [];
    for (let j = 0; j < m; j++) {
      const draw = j < T;
      const pm = draw ? new Float64Array(G) : null, pv = draw ? new Float64Array(G) : null;
      let mean = 0, ss = 0, ci = 0, gi = 0;
      for (let k = 1; k <= N; k++) {
        const u = next(); let x = 0; while (u >= thr[x]) x++;
        const d = x - mean; mean += d / k; ss += d * (x - mean); // ← Welford, 3 lines
        if (k === cp[ci]) { M[j * C + ci] = mean; SS[j * C + ci] = ss; ci++; }
        if (draw && k === grid[gi]) { pm[gi] = mean; pv[gi] = k > 1 ? ss / (k - 1) : NaN; gi++; }
      }
      if (draw) paths.push({ mean: pm, s2: pv });
    }
    return { dist, N, m, cp, M, SS, grid, paths };
  }

  const T975 = [NaN, 12.706, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306, 2.262, 2.228, 2.201, 2.179, 2.160, 2.145,
    2.131, 2.120, 2.110, 2.101, 2.093, 2.086, 2.080, 2.074, 2.069, 2.064, 2.060, 2.056, 2.052, 2.048, 2.045, 2.042];
  const Z975 = 1.959964;
  function t975(df) { // exact table to 30, Cornish–Fisher expansion beyond (error < 1e-4)
    if (df <= 30) return T975[df];
    const z = Z975, z3 = z * z * z, z5 = z3 * z * z;
    return z + (z3 + z) / (4 * df) + (5 * z5 + 16 * z3 + 3 * z) / (96 * df * df);
  }

  // Statistics across the m hackers at checkpoint index c (aggregated with Welford, too).
  function analyse(sim, c) {
    const { dist: d, m, cp } = sim, C = cp.length, n = cp[c];
    const A = welford(), B = welford(), P = welford();
    let sxy = 0, covT = 0, covZ = 0;
    const xbar = new Float64Array(m), s2 = new Float64Array(m);
    const t = t975(n - 1);
    for (let j = 0; j < m; j++) {
      const mean = sim.M[j * C + c], ss = sim.SS[j * C + c];
      const v = ss / (n - 1);
      xbar[j] = mean; s2[j] = v;
      const dA = mean - A.mean; A.push(mean); B.push(v); P.push(ss / n);
      sxy += dA * (v - B.mean); // co-moment, Welford-style
      const half = Math.sqrt(v / n), err = Math.abs(mean - d.mu);
      if (err <= t * half + 1e-12) covT++;
      if (err <= Z975 * half + 1e-12) covZ++;
    }
    const th = theory(d, n);
    return {
      n, xbar, s2, th,
      avgXbar: A.mean, varXbar: A.sampleVar,
      avgS2: B.mean, varS2: B.sampleVar,
      avgPop: P.mean,
      cov: sxy / (m - 1), corr: sxy / (m - 1) / Math.sqrt(A.sampleVar * B.sampleVar),
      seXbar: Math.sqrt(th.varXbar / m), seS2: Math.sqrt(th.varS2 / m),
      covT: covT / m, covZ: covZ / m, t,
    };
  }

  // Histogram with optional lattice step (so discrete values never alias between bins).
  function hist(values, nb = 40, step = 0) {
    let lo = Infinity, hi = -Infinity;
    for (const v of values) { if (v < lo) lo = v; if (v > hi) hi = v; }
    if (hi === lo) { lo -= 0.5; hi += 0.5; }
    let w = (hi - lo) / nb, start = lo;
    if (step > 0) { w = step * Math.max(1, Math.ceil((hi - lo + step) / (step * nb))); start = lo - step / 2; }
    const B = Math.max(1, Math.ceil((hi - start) / w + 1e-9) + (step > 0 ? 0 : 0));
    const counts = new Float64Array(B);
    for (const v of values) counts[Math.min(B - 1, Math.max(0, Math.floor((v - start) / w + 1e-9)))]++;
    const edges = []; for (let i = 0; i <= B; i++) edges.push(start + i * w);
    return { edges, counts: Array.from(counts), dens: Array.from(counts, (c) => c / (values.length * w)) };
  }

  const API = { welford, naiveVar, twoPassVar, DISTS, makeDist, moments, theory, checkpoints, simulate, analyse, hist, t975, Phi, rng };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else root.HW5 = API;
})(typeof window !== "undefined" ? window : globalThis);
