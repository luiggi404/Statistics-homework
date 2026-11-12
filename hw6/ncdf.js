// HW6 · Exercise 2 — numerical methods for the standard normal CDF Φ(x).
// Every function returns { v: Φ(x), q: 1 − Φ(x) when the method can give it directly, n: work (terms / panels) }.
(function (root) {
  "use strict";
  const SQRT2PI = Math.sqrt(2 * Math.PI), SQRT2 = Math.SQRT2, SQRTPI = Math.sqrt(Math.PI);
  const phi = (x) => Math.exp(-0.5 * x * x) / SQRT2PI;

  // ---- 1. numerical integration of φ on [0, |x|] -------------------------------------------
  function trapezoid(x, n) {
    const a = Math.abs(x), h = a / n;
    let s = 0.5 * (phi(0) + phi(a));
    for (let i = 1; i < n; i++) s += phi(i * h);
    const I = s * h;                                   // ∫_0^|x| φ
    return { v: x >= 0 ? 0.5 + I : 0.5 - I, n };
  }
  function simpson(x, n) {
    if (n % 2) n++;
    const a = Math.abs(x), h = a / n;
    let s = phi(0) + phi(a);
    for (let i = 1; i < n; i++) s += (i % 2 ? 4 : 2) * phi(i * h);
    const I = (s * h) / 3;
    return { v: x >= 0 ? 0.5 + I : 0.5 - I, n };
  }

  // ---- 2a. Maclaurin series of erf (alternating) -------------------------------------------
  // erf(z) = 2/√π · Σ (−1)^k z^(2k+1) / (k! (2k+1)),   Φ(x) = ½ (1 + erf(x/√2))
  function erfSeries(x) {
    const z = x / SQRT2, z2 = z * z;
    let p = z, sum = z, k = 0, maxTerm = Math.abs(z);   // p = (−1)^k z^(2k+1)/k!
    while (k < 1000) {
      k++;
      p *= -z2 / k;
      const t = p / (2 * k + 1);
      sum += t;
      if (Math.abs(t) > maxTerm) maxTerm = Math.abs(t);
      if (Math.abs(t) <= 1e-17 * Math.abs(sum)) break;
    }
    const erf = (2 / SQRTPI) * sum;
    return { v: 0.5 * (1 + erf), n: k + 1, maxTerm: (2 / SQRTPI) * maxTerm };
  }

  // ---- 2b. Marsaglia's series (all terms positive) ------------------------------------------
  // Φ(x) = ½ + φ(x) · Σ x^(2k+1) / (1·3·5···(2k+1))
  function marsaglia(x) {
    const x2 = x * x;
    let t = x, s = x, k = 0;
    while (k < 2000) {
      k++;
      t *= x2 / (2 * k + 1);
      const s2 = s + t;
      if (s2 === s) break;
      s = s2;
    }
    const ps = phi(x) * s;
    return { v: 0.5 + ps, q: 0.5 - ps, n: k };
  }

  // ---- 3. Laplace continued fraction for the upper tail -------------------------------------
  // Q(x) = 1 − Φ(x) = φ(x) / (x + 1/(x + 2/(x + 3/(x + …)))) ,  x > 0 ; modified Lentz algorithm
  function tailCF(x) {
    const tiny = 1e-300;
    let f = x, C = x, D = 0, k = 0;
    while (k < 5000) {
      k++;
      D = x + k * D; if (D === 0) D = tiny; D = 1 / D;
      C = x + k / C; if (C === 0) C = tiny;
      const delta = C * D;
      f *= delta;
      if (Math.abs(delta - 1) < 1e-16) break;
    }
    return { q: phi(x) / f, n: k };
  }
  function contFrac(x) {
    if (x === 0) return { v: 0.5, q: 0.5, n: 0 };
    const r = tailCF(Math.abs(x));
    return x > 0 ? { v: 1 - r.q, q: r.q, n: r.n } : { v: r.q, q: 1 - r.q, n: r.n };
  }

  // ---- 4. The method proposed here: Marsaglia's series in the centre, Laplace CF in the tails ---
  const SWITCH = 3;
  function hybrid(x) {
    const a = Math.abs(x);
    if (a < SWITCH) {
      // centre: Q = ½ − φ·S is still accurate, because here Q ≥ Q(3) ≈ 1.3e-3
      return marsaglia(x);
    }
    const r = tailCF(a);
    return x > 0 ? { v: 1 - r.q, q: r.q, n: r.n } : { v: r.q, q: 1 - r.q, n: r.n };
  }

  // ---- 5. Classic closed-form approximations -----------------------------------------------
  // Abramowitz & Stegun 26.2.17 (Zelen & Severo, 1964): |error| < 7.5e-8
  const AS = [0.31938153, -0.356563782, 1.781477937, -1.821255978, 1.330274429], ASp = 0.2316419;
  function abramowitzStegun(x) {
    const a = Math.abs(x), t = 1 / (1 + ASp * a);
    const poly = t * (AS[0] + t * (AS[1] + t * (AS[2] + t * (AS[3] + t * AS[4]))));
    const q = phi(a) * poly;
    return x >= 0 ? { v: 1 - q, q, n: 5 } : { v: q, q: 1 - q, n: 5 };
  }
  // Pólya (1949): Φ(x) ≈ ½ (1 + sign(x) √(1 − e^(−2x²/π))),  |error| < 0.003
  function polya(x) {
    const v = 0.5 * (1 + Math.sign(x) * Math.sqrt(1 - Math.exp((-2 * x * x) / Math.PI)));
    return { v, n: 1 };
  }

  root.NCDF = { phi, trapezoid, simpson, erfSeries, marsaglia, contFrac, hybrid, abramowitzStegun, polya, SWITCH };
  if (typeof module !== "undefined") module.exports = root.NCDF;
})(typeof window !== "undefined" ? window : globalThis);
