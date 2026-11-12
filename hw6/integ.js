// HW6 · Exercise 1 — Riemann sums (partition the domain) vs Lebesgue sums (partition the range).
(function (root) {
  "use strict";

  // ---------------- test functions ----------------
  // lo/hi: inf and sup of f on the domain (hi = Infinity for the unbounded one)
  const FUNCS = [
    { id: "sin", tex: "sin x", dom: "[0, π]", a: 0, b: Math.PI, f: Math.sin, exact: 2, lo: 0, hi: 1 },
    { id: "sq", tex: "x²", dom: "[0, 1]", a: 0, b: 1, f: (x) => x * x, exact: 1 / 3, lo: 0, hi: 1 },
    { id: "step13", tex: "1 if x < ½, 3 if x ≥ ½", dom: "[0, 1]", a: 0, b: 1, f: (x) => (x < 0.5 ? 1 : 3), exact: 2, lo: 1, hi: 3 },
    { id: "abs", tex: "|x − ½|", dom: "[0, 1]", a: 0, b: 1, f: (x) => Math.abs(x - 0.5), exact: 0.25, lo: 0, hi: 0.5 },
    { id: "rsqrt", tex: "1/√x", dom: "(0, 1]", a: 0, b: 1, f: (x) => 1 / Math.sqrt(x), exact: 2, lo: 1, hi: Infinity },
    { id: "step10", tex: "1 if x < ½, 0 if x ≥ ½", dom: "[0, 1]", a: 0, b: 1, f: (x) => (x < 0.5 ? 1 : 0), exact: 0.5, lo: 0, hi: 1 },
    { id: "sinc", tex: "sin x / x", dom: "[0, π]", a: 0, b: Math.PI, f: (x) => (x === 0 ? 1 : Math.sin(x) / x), exact: 1.8519370519824661703610533, lo: 0, hi: 1 },
    { id: "osc", tex: "sin(1/x)", dom: "(0, 1]", a: 0, b: 1, f: (x) => (x === 0 ? 0 : Math.sin(1 / x)), exact: 0.5040670619069283719898561, lo: -1, hi: 1 },
  ];

  // ---------------- Riemann ----------------
  // tag = 0 left, 0.5 midpoint, 1 right
  function riemann(F, N, tag) {
    const h = (F.b - F.a) / N;
    let s = 0;
    for (let i = 0; i < N; i++) s += F.f(F.a + (i + tag) * h);
    return { v: s * h, evals: N };
  }

  // ---------------- Lebesgue ----------------
  // Measure of the preimage {x ∈ [a,b] : pred(f(x))} for pred = (f ≥ t) or (f > t).
  // The domain is scanned on a bracketing grid of G cells (values cached once); inside a cell whose two end values
  // disagree, the crossing is located by bisection on the predicate. A cell where both ends agree is taken whole
  // (an excursion entirely inside one cell is missed — the numerical price of not knowing f⁻¹ in closed form).
  function makeMeasurer(F, G) {
    const a = F.a, b = F.b, w = (b - a) / G;
    const xs = new Float64Array(G + 1), ys = new Float64Array(G + 1);
    for (let i = 0; i <= G; i++) { xs[i] = a + i * w; ys[i] = F.f(xs[i]); }
    let evals = G + 1;
    function measure(t, strict) {
      const P = strict ? (y) => y > t : (y) => y >= t;
      let m = 0;
      for (let i = 0; i < G; i++) {
        const pa = P(ys[i]), pb = P(ys[i + 1]);
        if (pa && pb) { m += w; continue; }
        if (!pa && !pb) continue;
        let lo = xs[i], hi = xs[i + 1];                 // invariant: P(f(lo)) = pa, P(f(hi)) = pb
        for (let k = 0; k < 44 && hi - lo > 1e-13 * w; k++) {
          const mid = 0.5 * (lo + hi);
          evals++;
          if (P(F.f(mid)) === pa) lo = mid; else hi = mid;
        }
        const c = 0.5 * (lo + hi);
        m += pa ? c - xs[i] : xs[i + 1] - c;
      }
      return m;
    }
    return { measure, evals: () => evals, xs, ys };
  }

  // Levels y_0 < y_1 < … < y_K evenly spaced on [lo, Y].  For an unbounded f, Y = lo + √K is a moving cap:
  // the sums integrate min(f, Y), which tends to ∫ f by the monotone convergence theorem.
  function levels(F, K) {
    const Y = Number.isFinite(F.hi) ? F.hi : F.lo + Math.sqrt(K);
    const y = new Float64Array(K + 1);
    for (let j = 0; j <= K; j++) y[j] = F.lo + ((Y - F.lo) * j) / K;
    return y;
  }

  // lower: φ = largest level ≤ f   →  ∫φ = y0·|D| + Σ_{j=1..K} Δ·μ(f ≥ y_j)
  // upper: ψ = smallest level ≥ f  →  ∫ψ = y0·|D| + Σ_{j=1..K} Δ·μ(f > y_{j−1})
  function lebesgue(F, K, G) {
    const M = makeMeasurer(F, G), y = levels(F, K), D = F.b - F.a;
    let lower = y[0] * D, upper = y[0] * D;
    for (let j = 1; j <= K; j++) {
      const d = y[j] - y[j - 1];
      lower += d * M.measure(y[j], false);
      upper += d * M.measure(y[j - 1], true);
    }
    return { lower, upper, v: 0.5 * (lower + upper), evals: M.evals(), y };
  }

  const time = (fn) => { const t0 = performance.now(); const r = fn(); r.ms = performance.now() - t0; return r; };

  // ---------------- pathological: exact rational arithmetic ----------------
  const gcd = (a, b) => { while (b) [a, b] = [b, a % b]; return a; };

  // Thomae with right-endpoint tags k/N:  S_N = (1/N) Σ_{k=1}^{N} 1/(N/gcd(k,N)) = Σ gcd(k,N) / N²
  function thomaeRiemann(N) { let s = 0; for (let k = 1; k <= N; k++) s += gcd(k, N); return s / (N * N); }
  // Upper Darboux sum: sup of Thomae on [k/N,(k+1)/N] is 1/q for the smallest q with a fraction p/q in the cell
  function thomaeUpper(N) {
    let s = 0;
    for (let k = 0; k < N; k++) {
      let q = 1;
      while (Math.ceil((q * k) / N) > Math.floor((q * (k + 1)) / N)) q++;
      s += 1 / q;
    }
    return s / N;
  }
  // Rationals in [0,1] with denominator ≤ Q (Farey sequence F_Q): 1 + Σ φ(q)
  function fareyCount(Q) { let c = 1; for (let q = 1; q <= Q; q++) for (let p = 1; p <= q; p++) if (gcd(p, q) === 1) c++; return c; }

  root.INTEG = { FUNCS, riemann, lebesgue, makeMeasurer, levels, time, gcd, thomaeRiemann, thomaeUpper, fareyCount };
  if (typeof module !== "undefined") module.exports = root.INTEG;
})(typeof window !== "undefined" ? window : globalThis);
