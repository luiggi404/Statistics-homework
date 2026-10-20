// Toy elliptic-curve crypto on small primes (the curve family from HW1: y^2 = x^3 + 7 mod p),
// plus the Caesar cipher and its statistical cryptanalysis.
// Everything here is deliberately tiny so the discrete-log attack finishes instantly.
// Browser: window.Toy ; Node: module.exports (for self-tests).
(function (root) {
  const B = 7n;
  const md = (a, p) => { a %= p; return a < 0n ? a + p : a; };
  function inv(a, p) {                 // modular inverse via extended Euclid
    let r0 = md(a, p), r1 = p, s0 = 1n, s1 = 0n;
    while (r1) { const q = r0 / r1; [r0, r1] = [r1, r0 - q * r1]; [s0, s1] = [s1, s0 - q * s1]; }
    return md(s0, p);
  }
  // affine points as [x,y] (BigInt) or null for the point at infinity O
  function add(P, Q, p) {
    p = BigInt(p);
    if (!P) return Q;
    if (!Q) return P;
    if (P[0] === Q[0] && md(P[1] + Q[1], p) === 0n) return null;
    let lam;
    if (P[0] === Q[0] && P[1] === Q[1]) lam = md(3n * P[0] * P[0] * inv(2n * P[1], p), p);
    else lam = md((Q[1] - P[1]) * inv(Q[0] - P[0], p), p);
    const x = md(lam * lam - P[0] - Q[0], p), y = md(lam * (P[0] - x) - P[1], p);
    return [x, y];
  }
  function mul(k, P, p) {               // double-and-add
    k = BigInt(k); p = BigInt(p);
    let R = null, Q = P;
    while (k > 0n) { if (k & 1n) R = add(R, Q, p); Q = add(Q, Q, p); k >>= 1n; }
    return R;
  }
  function points(p) {                  // all affine points, O implicit
    const sq = new Map();
    for (let y = 0n; y < p; y++) { const s = md(y * y, p); if (!sq.has(s)) sq.set(s, []); sq.get(s).push(y); }
    const pts = [];
    for (let x = 0n; x < p; x++) for (const y of sq.get(md(x * x * x + B, p)) || []) pts.push([x, y]);
    return pts;
  }
  function order(P, p) { let R = P, n = 1; while (R) { R = add(R, P, p); n++; } return n; }
  const eq = (P, Q) => (!P && !Q) || (P && Q && P[0] === Q[0] && P[1] === Q[1]);
  const fmt = (P) => (P ? `(${P[0]}, ${P[1]})` : "O");

  // ---------- hybrid EC encryption (toy EC-ElGamal over a message) ----------
  // Public params: prime p, base point G of order n. Private key d in [1, n-1]. Public key Q = dG.
  // Encrypt a byte m (0..n-1 mapped) : pick random ephemeral r, C1 = rG, S = rQ,
  //   mask = S.x mod 256, C2 = (m XOR mask). Decrypt: S = d*C1, same mask, m = C2 XOR mask.
  function keypair(p, G, n, d) {
    d = d == null ? 1 + Math.floor(Math.random() * (n - 1)) : d;
    return { d, Q: mul(d, G, p) };
  }
  function encryptByte(m, p, G, Q, n, r) {
    r = r == null ? 1 + Math.floor(Math.random() * (n - 1)) : r;
    const C1 = mul(r, G, p), S = mul(r, Q, p);
    const mask = Number(md(S[0], p) % 256n);
    return { C1, C2: m ^ mask, r };
  }
  function decryptByte(ct, d, p) {
    const S = mul(d, ct.C1, p);
    const mask = Number(md(S[0], p) % 256n);
    return ct.C2 ^ mask;
  }
  const encryptText = (txt, p, G, Q, n) => [...txt].map((ch) => encryptByte(ch.charCodeAt(0), p, G, Q, n));
  const decryptText = (cts, d, p) => cts.map((c) => String.fromCharCode(decryptByte(c, d, p))).join("");

  // ---------- attacks on the restricted key space ----------
  // 1. brute force: try d = 1,2,... until dG == Q. Cost O(n).
  function attackBrute(p, G, Q, nMax) {
    let R = null;
    for (let d = 1; d <= nMax; d++) { R = add(R, G, p); if (eq(R, Q)) return { d, steps: d }; }
    return null;
  }
  // 2. baby-step giant-step: solve dG = Q in O(sqrt(n)) using a table. Standard DLP algorithm.
  function attackBSGS(p, G, Q, n) {
    const m = Math.ceil(Math.sqrt(n));
    const tbl = new Map();
    let baby = null;                    // j*G for j = 0..m-1
    for (let j = 0; j < m; j++) { tbl.set(baby ? baby[0] + "," + baby[1] : "O", j); baby = add(baby, G, p); }
    const mG = mul(m, G, p), neg_mG = mG ? [mG[0], md(-mG[1], p)] : null;
    let gamma = Q, steps = m;
    for (let i = 0; i < m; i++) {
      const key = gamma ? gamma[0] + "," + gamma[1] : "O";
      steps++;
      if (tbl.has(key)) return { d: i * m + tbl.get(key), steps, m };
      gamma = add(gamma, neg_mG, p);
    }
    return null;
  }

  root.Toy = { B, md, inv, add, mul, points, order, eq, fmt, keypair, encryptByte, decryptByte, encryptText, decryptText, attackBrute, attackBSGS };

  // ================= Caesar cipher =================
  const AZ = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  function caesar(txt, k) {
    k = ((k % 26) + 26) % 26;
    let o = "";
    for (const ch of txt) {
      const c = ch.charCodeAt(0);
      if (c >= 65 && c <= 90) o += String.fromCharCode(((c - 65 + k) % 26) + 65);
      else if (c >= 97 && c <= 122) o += String.fromCharCode(((c - 97 + k) % 26) + 97);
      else o += ch;
    }
    return o;
  }
  const counts = (txt) => {
    const c = new Array(26).fill(0);
    for (const ch of txt.toUpperCase()) { const i = ch.charCodeAt(0) - 65; if (i >= 0 && i < 26) c[i]++; }
    return c;
  };
  // English single-letter frequencies (%), used when no corpus model is supplied.
  const ENGLISH = [8.167,1.492,2.782,4.253,12.702,2.228,2.015,6.094,6.966,0.153,0.772,4.025,2.406,6.749,7.507,1.929,0.095,5.987,6.327,9.056,2.758,0.978,2.360,0.150,1.974,0.074];

  // attack by chi-square against a unigram model (default English or a trained one)
  function attackChi(cipher, model) {
    const f = model || ENGLISH, tot = f.reduce((a, b) => a + b, 0), prob = f.map((v) => v / tot);
    const c = counts(cipher), n = c.reduce((a, b) => a + b, 0) || 1;
    const scores = [];
    for (let k = 0; k < 26; k++) {
      let chi = 0;
      for (let i = 0; i < 26; i++) { const exp = prob[(i - k + 26) % 26] * n; chi += (c[i] - exp) ** 2 / (exp || 1e-9); }
      scores.push(chi);
    }
    const best = scores.indexOf(Math.min(...scores));
    return { key: best, scores, decrypt: caesar(cipher, -best) };
  }
  // attack by log-likelihood (expects log-prob unigram model; higher is better)
  function attackLL(cipher, logp) {
    const c = counts(cipher), scores = [];
    for (let k = 0; k < 26; k++) {
      let s = 0;
      for (let i = 0; i < 26; i++) s += c[i] * logp[(i - k + 26) % 26];
      scores.push(s);
    }
    const best = scores.indexOf(Math.max(...scores));
    return { key: best, scores, decrypt: caesar(cipher, -best) };
  }
  // attack by bigram log-likelihood (logbg is 26x26 log-prob matrix of the plaintext language)
  function attackBigram(cipher, logbg) {
    const up = cipher.toUpperCase().replace(/[^A-Z]/g, "");
    const scores = [];
    for (let k = 0; k < 26; k++) {
      let s = 0;
      for (let t = 0; t + 1 < up.length; t++) {
        const a = (up.charCodeAt(t) - 65 + 26 - k) % 26, b = (up.charCodeAt(t + 1) - 65 + 26 - k) % 26;
        s += logbg[a][b];
      }
      scores.push(s);
    }
    const best = scores.indexOf(Math.max(...scores));
    return { key: best, scores, decrypt: caesar(cipher, -best) };
  }

  root.Caesar = { AZ, caesar, counts, ENGLISH, attackChi, attackLL, attackBigram };
})(typeof module !== "undefined" && module.exports ? module.exports : (window.TC = {}));
