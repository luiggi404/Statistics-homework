// HW4 — simulation engine for the penetration-score random walk.
// Pure computation, no DOM: also runs under Node for testing (module.exports).
(function (root) {
  "use strict";

  // ---------- seeded PRNG: xoshiro128** initialised by splitmix32 ----------
  const rotl = (x, k) => (x << k) | (x >>> (32 - k));
  function rng(seed) {
    let s = seed >>> 0;
    const sm = () => {
      s = (s + 0x9e3779b9) | 0;
      let z = s;
      z = Math.imul(z ^ (z >>> 16), 0x85ebca6b);
      z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35);
      return (z ^ (z >>> 16)) >>> 0;
    };
    let a = sm(), b = sm(), c = sm(), d = sm();
    return function next() {
      const r = Math.imul(rotl(Math.imul(b, 5), 7), 9);
      const t = b << 9;
      c ^= a; d ^= b; b ^= c; a ^= d; c ^= t; d = rotl(d, 11);
      return r >>> 0;
    };
  }

  // ---------- the two increment models ----------
  const MODELS = {
    bern: (p) => ({ key: "bern", name: "Bernoulli", mu: p, var: p * (1 - p), sd: Math.sqrt(p * (1 - p)),
      rho: p * (1 - p) * (p * p + (1 - p) * (1 - p)), lattice: 1 }),
    rad: () => ({ key: "rad", name: "Rademacher", mu: 0, var: 1, sd: 1, rho: 1, lattice: 2 }),
  };

  // Log-spaced checkpoints 1-2-5 up to n, plus n itself.
  function checkpoints(n) {
    const out = [];
    for (let e = 1; e <= n; e *= 10) for (const f of [1, 2, 5]) if (e * f <= n && e * f >= 10) out.push(e * f);
    if (out[out.length - 1] !== n) out.push(n);
    return out;
  }
  // Dense grid for drawing trajectories: union of linear and log spacing.
  function drawGrid(n, pts = 260) {
    const set = new Set([1, n]);
    for (let i = 1; i <= pts; i++) set.add(Math.max(1, Math.round((i * n) / pts)));
    for (let i = 0; i <= pts; i++) set.add(Math.max(1, Math.round(Math.pow(n, i / pts))));
    return [...set].sort((a, b) => a - b);
  }

  // Simulate m attackers × n systems for one model.
  // Returns S at every checkpoint (row-major: attacker j, checkpoint c) and full drawn paths for the first T attackers.
  function simulate({ model, n, m, seed, T = 60 }) {
    const next = rng(seed);
    const cp = checkpoints(n), C = cp.length;
    const grid = drawGrid(n), G = grid.length;
    const S = new Int32Array(m * C);
    const paths = [];
    const thr = model.key === "bern" ? Math.floor(model.mu * 4294967296) : 0;
    const isRad = model.key === "rad";
    for (let j = 0; j < m; j++) {
      const draw = j < T;
      const path = draw ? new Int32Array(G) : null;
      let s = 0, ci = 0, gi = 0, word = 0, bits = 0;
      for (let k = 1; k <= n; k++) {
        if (isRad) {
          if (bits === 0) { word = next(); bits = 32; }
          s += (word & 1) ? 1 : -1; word >>>= 1; bits--;
        } else {
          s += next() < thr ? 1 : 0;
        }
        if (k === cp[ci]) { S[j * C + ci] = s; ci++; }
        if (draw && k === grid[gi]) { path[gi] = s; gi++; }
      }
      if (draw) paths.push(path);
    }
    return { model, n, m, cp, S, grid, paths };
  }

  // Column of values of S at checkpoint index c, for all attackers.
  function column(sim, c) {
    const C = sim.cp.length, out = new Float64Array(sim.m);
    for (let j = 0; j < sim.m; j++) out[j] = sim.S[j * C + c];
    return out;
  }
  function meanVar(a) {
    let s = 0; for (const v of a) s += v;
    const mean = s / a.length;
    let q = 0; for (const v of a) q += (v - mean) * (v - mean);
    return { mean, var: q / (a.length - 1) };
  }

  // ---------- normal distribution ----------
  function erf(x) { // Abramowitz–Stegun 7.1.26 refined (W. J. Cody style rational would be overkill here)
    const s = Math.sign(x); x = Math.abs(x);
    const t = 1 / (1 + 0.5 * x);
    const y = 1 - t * Math.exp(-x * x - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 +
      t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))));
    return s * y;
  }
  const Phi = (x) => 0.5 * (1 + erf(x / Math.SQRT2));
  const phi = (x) => Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);

  // Kolmogorov–Smirnov distance between the empirical CDF of `z` and Φ (exact for ties).
  function ksNormal(z) {
    const a = Float64Array.from(z).sort();
    const m = a.length; let D = 0;
    for (let i = 0; i < m; i++) {
      const F = Phi(a[i]);
      D = Math.max(D, (i + 1) / m - F, F - i / m);
    }
    return D;
  }

  // Exact sup_x |P(Z_n ≤ x) − Φ(x)| for Z_n = (S_n − nμ)/(σ√n), S_n built from Binomial(n, q):
  // Bernoulli: S_n = B; Rademacher: S_n = 2B − n with q = 1/2. No sampling noise.
  function lgamma(x) { // Lanczos
    const g = 7, c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
      -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
    if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - lgamma(1 - x);
    x -= 1; let a = c[0]; const t = x + g + 0.5;
    for (let i = 1; i < 9; i++) a += c[i] / (x + i);
    return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
  }
  function exactKS(model, n) {
    const q = model.key === "bern" ? model.mu : 0.5;
    const lq = Math.log(q), lr = Math.log(1 - q), ln1 = lgamma(n + 1);
    let F = 0, D = 0;
    for (let b = 0; b <= n; b++) {
      const pm = Math.exp(ln1 - lgamma(b + 1) - lgamma(n - b + 1) + b * lq + (n - b) * lr);
      const s = model.key === "bern" ? b : 2 * b - n;
      const z = (s - n * model.mu) / (model.sd * Math.sqrt(n));
      const P = Phi(z);
      D = Math.max(D, Math.abs(F - P)); // left limit
      F += pm;
      D = Math.max(D, Math.abs(F - P)); // value at the atom
    }
    return D;
  }
  const BERRY_ESSEEN_C = 0.4748; // Shevtsova (2011)
  const berryEsseen = (model, n) => (BERRY_ESSEEN_C * model.rho) / (Math.pow(model.sd, 3) * Math.sqrt(n));

  // Expected maximum of k iid N(0,1): E[max] = ∫ x · k φ(x) Φ(x)^(k−1) dx, by quadrature.
  function expMaxNormal(k) {
    let s = 0; const h = 0.002;
    for (let x = -9; x <= 9; x += h) s += x * k * phi(x) * Math.pow(Phi(x), k - 1) * h;
    return s;
  }
  // Average of the block maxima of z over disjoint blocks of size k.
  function blockMax(z, k) {
    const B = Math.floor(z.length / k); let s = 0;
    for (let b = 0; b < B; b++) { let mx = -Infinity; for (let i = b * k; i < (b + 1) * k; i++) if (z[i] > mx) mx = z[i]; s += mx; }
    return { mean: s / B, blocks: B };
  }

  // Histogram aligned to the lattice of S_n (step 1 or 2), so bins never alias.
  function latticeHist(values, model, n, scale, maxBins = 46) {
    const L = model.lattice;
    let lo = Infinity, hi = -Infinity;
    for (const v of values) { if (v < lo) lo = v; if (v > hi) hi = v; }
    const span = Math.max(L, hi - lo + L);
    const w = L * Math.max(1, Math.ceil(span / (L * maxBins)));
    const start = lo - L / 2, B = Math.ceil((hi + L / 2 - start) / w);
    const counts = new Float64Array(B);
    for (const v of values) counts[Math.min(B - 1, Math.floor((v - start) / w))]++;
    const edges = []; for (let i = 0; i <= B; i++) edges.push((start + i * w) / scale);
    const dens = Array.from(counts, (c) => c / (values.length * (w / scale)));
    return { edges, dens, counts: Array.from(counts) };
  }

  const API = { rng, MODELS, checkpoints, drawGrid, simulate, column, meanVar, erf, Phi, phi, ksNormal,
    exactKS, berryEsseen, expMaxNormal, blockMax, latticeHist };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else root.HW4 = API;
})(typeof window !== "undefined" ? window : globalThis);
