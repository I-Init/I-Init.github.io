// Three-dimensional toy model of I-Init for the interactive demo.
//
// A body follows an analytic trajectory with roll, pitch, and yaw. Synthetic IMU samples
// come from that trajectory plus a constant gyroscope bias, a simulated Motion Network adds
// slowly varying noise to the true body-frame velocity and roll & pitch, and a Gauss–Newton
// solver aligns the two as in equations (8)–(11) of the paper. Everything here is
// illustrative: it is not the paper's code, network, or data.

export const GRAVITY = 9.81;
export const IMU_HZ = 200;
export const DT = 1 / IMU_HZ;
/** One key-frame every 8 samples, the stride of the Motion Network's convolutional stem. */
export const KEYFRAME_STRIDE = 8;
export const MAX_WINDOW = 5;
export const DEG = Math.PI / 180;

const ACC_NOISE = 0.05; // m/s^2 per sample
const GYRO_NOISE = 0.1 * DEG; // rad/s per sample
const RP_NOISE = 4 * DEG; // network roll & pitch error, rad
const NOISE_CORRELATION_TIME = 0.2; // s, the network's errors drift slowly across key-frames
// Roll & pitch cannot see rotation about gravity, so the bias component along gravity is
// constrained only by the velocity residuals and readily absorbs network noise. Unlike the
// paper's solver, this toy adds a weak zero-mean prior (3 °/s) on the bias to keep it bounded.
const BIAS_PRIOR = 3 * DEG;

export type Vec3 = [number, number, number];
export type MotionPreset = 'gentle' | 'aggressive';
/** vel: equation (9), bias fixed at zero. rp: equation (11), bias estimated. */
export type Variant = 'vel' | 'rp';

/** IMU samples and network predictions for one segment, independent of the bias magnitude. */
export type Segment = {
  /** Gyroscope (rad/s) and accelerometer (m/s^2) samples in the body frame, xyz interleaved, without bias. */
  gyro: Float64Array;
  acc: Float64Array;
  /** Unit direction of the gyroscope bias; problems scale it. */
  biasDir: Vec3;
  /** Per key-frame k = 1..K_max (index k - 1). */
  keyTime: Float64Array;
  trueRoll: Float64Array;
  truePitch: Float64Array;
  trueVelBody: Vec3[]; // v_{b_k}^{b_k}
  trueVelB0: Vec3[]; // v_{b_k}^{b_0}
  /** Unit-variance network velocity errors; a problem scales them by its noise level. */
  velErr: Vec3[];
  netRoll: Float64Array;
  netPitch: Float64Array;
  /** Network attitude \hat R_{b_k}^{G_0}, row-major 3x3 per key-frame, with an arbitrary heading. */
  netAtt: Float64Array;
  /** True initial state in {b0}. */
  gravity: Vec3; // unit vector
  v0: Vec3;
  roll0: number;
  pitch0: number;
};

export type Problem = {
  segment: Segment;
  /** Number of key-frames in the window. */
  K: number;
  /** Magnitude of the true gyroscope bias, rad/s. */
  bias: number;
  /** Network velocity error, m/s (also its predicted standard deviation). */
  velNoise: number;
};

export type InitState = { gravity: Vec3; v0: Vec3; bias: Vec3 };

export type Preintegration = {
  /** γ_k, the rotation of {b_k} relative to {b0}, row-major 3x3 per key-frame. */
  rot: Float64Array;
  /** β_k, the velocity increment in {b0}, xyz per key-frame. */
  beta: Float64Array;
};

// ---------------------------------------------------------------------------------------
// Small vector and rotation helpers

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: Vec3) => Math.sqrt(dot(a, a));
const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
const normalize = (a: Vec3) => scale(a, 1 / (norm(a) || 1));
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

/** R v for a row-major 3x3 matrix stored at offset o. */
function mulVec(m: ArrayLike<number>, o: number, v: Vec3): Vec3 {
  return [
    m[o] * v[0] + m[o + 1] * v[1] + m[o + 2] * v[2],
    m[o + 3] * v[0] + m[o + 4] * v[1] + m[o + 5] * v[2],
    m[o + 6] * v[0] + m[o + 7] * v[1] + m[o + 8] * v[2],
  ];
}

/** R^T v for a row-major 3x3 matrix stored at offset o. */
function mulVecT(m: ArrayLike<number>, o: number, v: Vec3): Vec3 {
  return [
    m[o] * v[0] + m[o + 3] * v[1] + m[o + 6] * v[2],
    m[o + 1] * v[0] + m[o + 4] * v[1] + m[o + 7] * v[2],
    m[o + 2] * v[0] + m[o + 5] * v[1] + m[o + 8] * v[2],
  ];
}

/** out = a b for 3x3 matrices; out must not alias a or b. */
function mulInto(out: Float64Array, a: Float64Array, b: Float64Array) {
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      out[3 * i + j] = a[3 * i] * b[j] + a[3 * i + 1] * b[3 + j] + a[3 * i + 2] * b[6 + j];
    }
  }
}

/** out = Exp(w), Rodrigues' formula. */
function expInto(out: Float64Array, wx: number, wy: number, wz: number) {
  const t2 = wx * wx + wy * wy + wz * wz;
  let a: number;
  let b: number;
  if (t2 < 1e-12) {
    a = 1 - t2 / 6;
    b = 0.5 - t2 / 24;
  } else {
    const t = Math.sqrt(t2);
    a = Math.sin(t) / t;
    b = (1 - Math.cos(t)) / t2;
  }
  out[0] = 1 + b * (wx * wx - t2);
  out[1] = -a * wz + b * wx * wy;
  out[2] = a * wy + b * wx * wz;
  out[3] = a * wz + b * wx * wy;
  out[4] = 1 + b * (wy * wy - t2);
  out[5] = -a * wx + b * wy * wz;
  out[6] = -a * wy + b * wx * wz;
  out[7] = a * wx + b * wy * wz;
  out[8] = 1 + b * (wz * wz - t2);
}

/** R = Rz(yaw) Ry(pitch) Rx(roll), mapping body-frame vectors into the reference frame. */
function eulerToMatrix(roll: number, pitch: number, yaw: number, out = new Float64Array(9), o = 0) {
  const cr = Math.cos(roll);
  const sr = Math.sin(roll);
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  out[o] = cy * cp;
  out[o + 1] = cy * sp * sr - sy * cr;
  out[o + 2] = cy * sp * cr + sy * sr;
  out[o + 3] = sy * cp;
  out[o + 4] = sy * sp * sr + cy * cr;
  out[o + 5] = sy * sp * cr - cy * sr;
  out[o + 6] = -sp;
  out[o + 7] = cp * sr;
  out[o + 8] = cp * cr;
  return out;
}

/** Roll and pitch of a body frame from the gravity direction expressed in it. */
export function rollPitchFromGravity(u: Vec3): [number, number] {
  return [Math.atan2(-u[1], -u[2]), Math.asin(Math.max(-1, Math.min(1, u[0])))];
}

/** Orthonormal tangent basis at a unit vector; for gravity near -z, close to the x and y axes. */
export function tangentFrame(u: Vec3): [Vec3, Vec3] {
  const e: Vec3 = Math.abs(u[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const t1 = normalize(sub(e, scale(u, dot(e, u))));
  return [t1, cross(t1, u)];
}

/** Moves a unit vector by the tangent offset (a, b), in radians. */
function retract(u: Vec3, t1: Vec3, t2: Vec3, a: number, b: number): Vec3 {
  return normalize([u[0] + a * t1[0] + b * t2[0], u[1] + a * t1[1] + b * t2[1], u[2] + a * t1[2] + b * t2[2]]);
}

// ---------------------------------------------------------------------------------------
// Random numbers

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussianSource(rand: () => number) {
  return () => Math.sqrt(-2 * Math.log(Math.max(rand(), 1e-12))) * Math.cos(2 * Math.PI * rand());
}

/** First-order autoregressive noise with unit marginal variance. */
function correlatedNoise(gauss: () => number, n: number, step: number, tau: number) {
  const rho = Math.exp(-step / tau);
  const out = new Float64Array(n);
  let x = gauss();
  for (let i = 0; i < n; i++) {
    out[i] = x;
    x = rho * x + Math.sqrt(1 - rho * rho) * gauss();
  }
  return out;
}

// ---------------------------------------------------------------------------------------
// Trajectory and sensor synthesis

type Wave = { amp: number; freq: number; phase: number };

function waves(rand: () => number, count: number, total: number, fmin: number, fmax: number) {
  const weights = Array.from({ length: count }, () => 0.5 + rand());
  const sum = weights.reduce((a, b) => a + b, 0);
  return weights.map<Wave>((w) => ({ amp: (total * w) / sum, freq: fmin + (fmax - fmin) * rand(), phase: 2 * Math.PI * rand() }));
}

/** An angle whose rate is Σ A cos(f t + φ), starting from `start`. */
function angleSignal(start: number, terms: Wave[]) {
  return {
    value: (t: number) => start + terms.reduce((s, w) => s + (w.amp / w.freq) * (Math.sin(w.freq * t + w.phase) - Math.sin(w.phase)), 0),
    rate: (t: number) => terms.reduce((s, w) => s + w.amp * Math.cos(w.freq * t + w.phase), 0),
  };
}

const MOTION: Record<MotionPreset, { speed: number; rate: number }> = {
  gentle: { speed: 0.35, rate: 15 * DEG },
  aggressive: { speed: 1.0, rate: 60 * DEG },
};

export function makeSegment(seed: number, motion: MotionPreset): Segment {
  const rand = mulberry32(seed * 7919 + (motion === 'aggressive' ? 1 : 0));
  const gauss = gaussianSource(rand);
  const { speed, rate } = MOTION[motion];

  // Attitude from Euler angles; roll and pitch swing at most 45° from their start, clear of ±90°.
  const rollTerms = waves(rand, 3, rate * 0.8, 0.8, 3.5);
  const pitchTerms = waves(rand, 3, rate * 0.8, 0.8, 3.5);
  for (const terms of [rollTerms, pitchTerms]) {
    const reach = terms.reduce((s, w) => s + (2 * w.amp) / w.freq, 0);
    if (reach > 45 * DEG) terms.forEach((w) => (w.amp *= (45 * DEG) / reach));
  }
  const roll = angleSignal((rand() - 0.5) * 30 * DEG, rollTerms);
  const pitch = angleSignal((rand() - 0.5) * 20 * DEG, pitchTerms);
  const yaw = angleSignal(2 * Math.PI * rand(), waves(rand, 3, rate, 0.6, 3));

  // World-frame velocity v(t) = mean + Σ B cos(f t + φ) per axis; acceleration is its derivative.
  const heading = 2 * Math.PI * rand();
  const cruise = speed * (0.3 + 0.4 * rand());
  const mean: Vec3 = [cruise * Math.cos(heading), cruise * Math.sin(heading), 0];
  const velTerms = [waves(rand, 3, speed * 0.8, 0.6, 2.5), waves(rand, 3, speed * 0.8, 0.6, 2.5), waves(rand, 3, speed * 0.5, 0.6, 2.5)];
  const vel = (t: number) => mean.map((m, i) => m + velTerms[i].reduce((s, w) => s + w.amp * Math.cos(w.freq * t + w.phase), 0)) as Vec3;
  const accel = (t: number) => mean.map((_, i) => -velTerms[i].reduce((s, w) => s + w.amp * w.freq * Math.sin(w.freq * t + w.phase), 0)) as Vec3;

  const attitude = (t: number) => eulerToMatrix(roll.value(t), pitch.value(t), yaw.value(t));
  // Body angular rate from the Euler-angle rates of Rz Ry Rx.
  const bodyRate = (t: number): Vec3 => {
    const r = roll.value(t);
    const p = pitch.value(t);
    const dr = roll.rate(t);
    const dp = pitch.rate(t);
    const dy = yaw.rate(t);
    return [dr - dy * Math.sin(p), dp * Math.cos(r) + dy * Math.sin(r) * Math.cos(p), -dp * Math.sin(r) + dy * Math.cos(r) * Math.cos(p)];
  };

  // Each sample covers [t_s, t_s + DT] and is evaluated at the interval's midpoint.
  const n = Math.round(MAX_WINDOW * IMU_HZ);
  const gyro = new Float64Array(3 * n);
  const acc = new Float64Array(3 * n);
  for (let s = 0; s < n; s++) {
    const t = (s + 0.5) * DT;
    const a = accel(t);
    // Specific force f = a - g with g = (0, 0, -G), rotated into the body frame.
    const f = mulVecT(attitude(t), 0, [a[0], a[1], a[2] + GRAVITY]);
    const w = bodyRate(t);
    for (let i = 0; i < 3; i++) {
      gyro[3 * s + i] = w[i] + GYRO_NOISE * gauss();
      acc[3 * s + i] = f[i] + ACC_NOISE * gauss();
    }
  }

  const kMax = Math.floor(n / KEYFRAME_STRIDE);
  const step = KEYFRAME_STRIDE * DT;
  const velErrAxes = [0, 1, 2].map(() => correlatedNoise(gauss, kMax, step, NOISE_CORRELATION_TIME));
  const rollErr = correlatedNoise(gauss, kMax, step, NOISE_CORRELATION_TIME);
  const pitchErr = correlatedNoise(gauss, kMax, step, NOISE_CORRELATION_TIME);
  const headingOffset = 2 * Math.PI * rand();
  const biasDir = normalize([gauss(), gauss(), gauss()]);
  const R0 = attitude(0);

  const keyTime = new Float64Array(kMax);
  const trueRoll = new Float64Array(kMax);
  const truePitch = new Float64Array(kMax);
  const netRoll = new Float64Array(kMax);
  const netPitch = new Float64Array(kMax);
  const netAtt = new Float64Array(9 * kMax);
  const trueVelBody: Vec3[] = [];
  const trueVelB0: Vec3[] = [];
  const velErr: Vec3[] = [];
  for (let k = 0; k < kMax; k++) {
    const t = (k + 1) * step;
    const v = vel(t);
    keyTime[k] = t;
    trueRoll[k] = roll.value(t);
    truePitch[k] = pitch.value(t);
    trueVelBody.push(mulVecT(attitude(t), 0, v));
    trueVelB0.push(mulVecT(R0, 0, v));
    velErr.push([velErrAxes[0][k], velErrAxes[1][k], velErrAxes[2][k]]);
    netRoll[k] = trueRoll[k] + RP_NOISE * rollErr[k];
    netPitch[k] = truePitch[k] + RP_NOISE * pitchErr[k];
    // Only roll & pitch are meaningful; the heading of {G0} is arbitrary.
    eulerToMatrix(netRoll[k], netPitch[k], yaw.value(t) + headingOffset, netAtt, 9 * k);
  }

  return {
    gyro,
    acc,
    biasDir,
    keyTime,
    trueRoll,
    truePitch,
    trueVelBody,
    trueVelB0,
    velErr,
    netRoll,
    netPitch,
    netAtt,
    gravity: mulVecT(R0, 0, [0, 0, -1]),
    v0: mulVecT(R0, 0, vel(0)),
    roll0: roll.value(0),
    pitch0: pitch.value(0),
  };
}

export function keyframeCount(window: number) {
  return Math.max(2, Math.floor(Math.round(window * IMU_HZ) / KEYFRAME_STRIDE));
}

export function trueBias(problem: Problem): Vec3 {
  return scale(problem.segment.biasDir, problem.bias);
}

/** Network velocity prediction at key-frame k with the problem's noise level applied. */
export function netVelocity(problem: Problem, k: number): Vec3 {
  const truth = problem.segment.trueVelBody[k];
  const err = problem.segment.velErr[k];
  return [truth[0] + problem.velNoise * err[0], truth[1] + problem.velNoise * err[1], truth[2] + problem.velNoise * err[2]];
}

// ---------------------------------------------------------------------------------------
// Preintegration, equation (3), with the candidate bias subtracted from the gyroscope.

export function preintegrate(problem: Problem, biasEstimate: Vec3): Preintegration {
  const { segment, K } = problem;
  const [dx, dy, dz] = sub(trueBias(problem), biasEstimate);
  const rot = new Float64Array(9 * K);
  const beta = new Float64Array(3 * K);
  const R = new Float64Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);
  const half = new Float64Array(9);
  const mid = new Float64Array(9);
  const h = 0.5 * DT;
  let bx = 0;
  let by = 0;
  let bz = 0;
  for (let s = 0; s < K * KEYFRAME_STRIDE; s++) {
    const i = 3 * s;
    // Midpoint rule: rotate each sample by the attitude halfway through its interval.
    expInto(half, (segment.gyro[i] + dx) * h, (segment.gyro[i + 1] + dy) * h, (segment.gyro[i + 2] + dz) * h);
    mulInto(mid, R, half);
    const ax = segment.acc[i];
    const ay = segment.acc[i + 1];
    const az = segment.acc[i + 2];
    bx += (mid[0] * ax + mid[1] * ay + mid[2] * az) * DT;
    by += (mid[3] * ax + mid[4] * ay + mid[5] * az) * DT;
    bz += (mid[6] * ax + mid[7] * ay + mid[8] * az) * DT;
    mulInto(R, mid, half);
    if ((s + 1) % KEYFRAME_STRIDE === 0) {
      const k = (s + 1) / KEYFRAME_STRIDE - 1;
      rot.set(R, 9 * k);
      beta[3 * k] = bx;
      beta[3 * k + 1] = by;
      beta[3 * k + 2] = bz;
    }
  }
  return { rot, beta };
}

// ---------------------------------------------------------------------------------------
// Residuals and the Gauss–Newton solver

function velocityWeight(problem: Problem, k: number) {
  // Σ_init = γ Σ_v γ^T + Σ_β; Σ_v is isotropic, so the rotation drops out.
  const samples = (k + 1) * KEYFRAME_STRIDE;
  return 1 / Math.sqrt(problem.velNoise ** 2 + samples * (ACC_NOISE * DT) ** 2);
}

/** Whitened residuals: three velocity rows per key-frame, then two roll & pitch rows for rp. */
function residuals(problem: Problem, state: InitState, variant: Variant, pre: Preintegration) {
  const { K, segment } = problem;
  const out = new Float64Array(variant === 'rp' ? 5 * K : 3 * K);
  const g = scale(state.gravity, GRAVITY);
  for (let k = 0; k < K; k++) {
    const w = velocityWeight(problem, k);
    const rotated = mulVec(pre.rot, 9 * k, netVelocity(problem, k));
    const t = segment.keyTime[k];
    for (let i = 0; i < 3; i++) out[3 * k + i] = w * (rotated[i] - (state.v0[i] + g[i] * t + pre.beta[3 * k + i]));
  }
  if (variant === 'rp') {
    for (let k = 0; k < K; k++) {
      // r_rp = S q_k with q_k = \hat R_k γ_k^T u and S = [[0, 1, 0], [-1, 0, 0]].
      const q = mulVec(segment.netAtt, 9 * k, mulVecT(pre.rot, 9 * k, state.gravity));
      out[3 * K + 2 * k] = q[1] / RP_NOISE;
      out[3 * K + 2 * k + 1] = -q[0] / RP_NOISE;
    }
  }
  return out;
}

export function cost(problem: Problem, state: InitState, variant: Variant, pre = preintegrate(problem, state.bias)) {
  const res = residuals(problem, state, variant, pre);
  let sum = 0;
  for (let i = 0; i < res.length; i++) sum += res[i] * res[i];
  return sum;
}

function solveLinear(a: number[][], b: number[]) {
  const n = b.length;
  const m = a.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let pivot = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(m[r][c]) > Math.abs(m[pivot][c])) pivot = r;
    [m[c], m[pivot]] = [m[pivot], m[c]];
    const d = m[c][c] || 1e-12;
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = m[r][c] / d;
      for (let j = c; j <= n; j++) m[r][j] -= f * m[c][j];
    }
  }
  return m.map((row, i) => row[n] / (row[i] || 1e-12));
}

/**
 * One Gauss–Newton step. Gravity moves on the sphere through a two-parameter retraction,
 * velocity in R^3, and, for rp, the bias in R^3 with the preintegration recomputed for it.
 */
export function gaussNewtonStep(problem: Problem, state: InitState, variant: Variant): InitState {
  const { K, segment } = problem;
  const useBias = variant === 'rp';
  const cols = useBias ? 8 : 5;
  const pre = preintegrate(problem, state.bias);
  const res = residuals(problem, state, variant, pre);
  const rows = res.length;
  const jac = new Float64Array(rows * cols);
  const [t1, t2] = tangentFrame(state.gravity);

  for (let k = 0; k < K; k++) {
    const w = velocityWeight(problem, k);
    const t = segment.keyTime[k];
    for (let i = 0; i < 3; i++) {
      const row = (3 * k + i) * cols;
      jac[row] = -w * GRAVITY * t * t1[i];
      jac[row + 1] = -w * GRAVITY * t * t2[i];
      jac[row + 2 + i] = -w;
    }
    if (useBias) {
      const d1 = mulVec(segment.netAtt, 9 * k, mulVecT(pre.rot, 9 * k, t1));
      const d2 = mulVec(segment.netAtt, 9 * k, mulVecT(pre.rot, 9 * k, t2));
      const rowA = (3 * K + 2 * k) * cols;
      const rowB = rowA + cols;
      jac[rowA] = d1[1] / RP_NOISE;
      jac[rowA + 1] = d2[1] / RP_NOISE;
      jac[rowB] = -d1[0] / RP_NOISE;
      jac[rowB + 1] = -d2[0] / RP_NOISE;
    }
  }
  // The bias columns need fresh preintegration, so they are differentiated numerically.
  if (useBias) {
    const h = 1e-4;
    for (let j = 0; j < 3; j++) {
      const plus = [...state.bias] as Vec3;
      const minus = [...state.bias] as Vec3;
      plus[j] += h;
      minus[j] -= h;
      const rPlus = residuals(problem, { ...state, bias: plus }, variant, preintegrate(problem, plus));
      const rMinus = residuals(problem, { ...state, bias: minus }, variant, preintegrate(problem, minus));
      for (let r = 0; r < rows; r++) jac[r * cols + 5 + j] = (rPlus[r] - rMinus[r]) / (2 * h);
    }
  }

  const H = Array.from({ length: cols }, () => new Array<number>(cols).fill(0));
  const grad = new Array<number>(cols).fill(0);
  for (let r = 0; r < rows; r++) {
    for (let i = 0; i < cols; i++) {
      const ji = jac[r * cols + i];
      if (ji === 0) continue;
      grad[i] += ji * res[r];
      for (let j = 0; j < cols; j++) H[i][j] += ji * jac[r * cols + j];
    }
  }
  if (useBias) {
    for (let j = 0; j < 3; j++) {
      H[5 + j][5 + j] += 1 / BIAS_PRIOR ** 2;
      grad[5 + j] += state.bias[j] / BIAS_PRIOR ** 2;
    }
  }
  for (let i = 0; i < cols; i++) H[i][i] *= 1 + 1e-9;
  const delta = solveLinear(H, grad.map((v) => -v));
  return {
    gravity: retract(state.gravity, t1, t2, delta[0], delta[1]),
    v0: [state.v0[0] + delta[2], state.v0[1] + delta[3], state.v0[2] + delta[4]],
    bias: useBias ? [state.bias[0] + delta[5], state.bias[1] + delta[6], state.bias[2] + delta[7]] : [0, 0, 0],
  };
}

/** The Network Init guess: gravity from the first predicted roll & pitch, velocity from the first prediction. */
export function networkInit(problem: Problem): InitState {
  const pre = preintegrate(problem, [0, 0, 0]);
  const att = problem.segment.netAtt;
  // \hat R^T (0, 0, -1): the gravity direction in {b_1}, independent of the network's heading.
  const down: Vec3 = [-att[6], -att[7], -att[8]];
  return {
    gravity: normalize(mulVec(pre.rot, 0, down)),
    v0: mulVec(pre.rot, 0, netVelocity(problem, 0)),
    bias: [0, 0, 0],
  };
}

export function solve(problem: Problem, variant: Variant, start = networkInit(problem), maxIterations = 20) {
  const history: InitState[] = [start];
  let state = start;
  for (let i = 0; i < maxIterations; i++) {
    const next = gaussNewtonStep(problem, state, variant);
    const change = angleBetween(next.gravity, state.gravity) + 0.1 * norm(sub(next.v0, state.v0)) + norm(sub(next.bias, state.bias));
    history.push(next);
    state = next;
    if (change < 1e-5) break;
  }
  return history;
}

// ---------------------------------------------------------------------------------------
// Metrics and quantities for display

export function angleBetween(a: Vec3, b: Vec3) {
  return Math.acos(Math.max(-1, Math.min(1, dot(a, b) / (norm(a) * norm(b) || 1))));
}

export function gravityError(problem: Problem, state: InitState) {
  return angleBetween(state.gravity, problem.segment.gravity) / DEG;
}

export function initialVelocityError(problem: Problem, state: InitState) {
  return norm(sub(state.v0, problem.segment.v0));
}

/** Velocity in {b0} implied by the state at each key-frame, v0 + g t_k + β_k. */
export function propagatedVelocity(problem: Problem, state: InitState, pre: Preintegration): Vec3[] {
  const g = scale(state.gravity, GRAVITY);
  return Array.from({ length: problem.K }, (_, k) => {
    const t = problem.segment.keyTime[k];
    return state.v0.map((v, i) => v + g[i] * t + pre.beta[3 * k + i]) as Vec3;
  });
}

/** Network velocity predictions rotated into {b0}, γ_k \hat v_k. */
export function rotatedPredictions(problem: Problem, pre: Preintegration): Vec3[] {
  return Array.from({ length: problem.K }, (_, k) => mulVec(pre.rot, 9 * k, netVelocity(problem, k)));
}

/** Roll & pitch of each key-frame implied by the state: the gravity direction propagated from {b0}. */
export function impliedRollPitch(problem: Problem, state: InitState, pre: Preintegration): [number, number][] {
  return Array.from({ length: problem.K }, (_, k) => rollPitchFromGravity(mulVecT(pre.rot, 9 * k, state.gravity)));
}

/** Offset of `estimate` from `truth` in degrees, along the tangent directions closest to x and y. */
export function gravityOffset(truth: Vec3, estimate: Vec3): [number, number] {
  const [t1, t2] = tangentFrame(truth);
  const a = dot(estimate, t1);
  const b = dot(estimate, t2);
  const len = Math.hypot(a, b);
  if (len < 1e-12) return [0, 0];
  const angle = angleBetween(truth, estimate) / DEG;
  return [(angle * a) / len, (angle * b) / len];
}

/** The unit vector at the given tangent offset (degrees) from `truth`. */
export function fromGravityOffset(truth: Vec3, dxDeg: number, dyDeg: number): Vec3 {
  const [t1, t2] = tangentFrame(truth);
  const r = Math.hypot(dxDeg, dyDeg);
  if (r < 1e-9) return truth;
  const c = Math.cos(r * DEG);
  const s = Math.sin(r * DEG) / r;
  return normalize(truth.map((u, i) => c * u + s * (dxDeg * t1[i] + dyDeg * t2[i])) as Vec3);
}
