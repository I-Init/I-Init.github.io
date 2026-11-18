'use client';

import { Check, Play, RotateCcw, Shuffle, SkipForward, X } from 'lucide-react';
import type { KeyboardEvent, PointerEvent } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { InitState, MotionPreset, Problem, Vec3 } from '@/lib/demo/init-sim';
import {
  angleBetween,
  cost,
  DEG,
  fromGravityOffset,
  gaussNewtonStep,
  gravityError,
  gravityOffset,
  impliedRollPitch,
  initialVelocityError,
  keyframeCount,
  makeSegment,
  networkInit,
  preintegrate,
  propagatedVelocity,
  rollPitchFromGravity,
  rotatedPredictions,
  solve,
} from '@/lib/demo/init-sim';

import { DemoButton, DemoCard, prefersReducedMotion, Segmented, Slider, Stat } from '@/components/demos/controls';
import Plot, { COLORS, Legend, linePath, niceDomain, TooltipRow } from '@/components/demos/Plot';

type Method = 'vel' | 'rp';
type Status = { kind: 'start' } | { kind: 'manual' } | { kind: 'step'; n: number } | { kind: 'running' } | { kind: 'converged'; n: number };

const STEP_MS = 700;
const AXES = ['x', 'y', 'z'] as const;

function lerpVec(a: Vec3, b: Vec3, f: number): Vec3 {
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
}

function lerpState(a: InitState, b: InitState, f: number): InitState {
  const g = lerpVec(a.gravity, b.gravity, f);
  const n = Math.hypot(...g) || 1;
  return { gravity: [g[0] / n, g[1] / n, g[2] / n], v0: lerpVec(a.v0, b.v0, f), bias: lerpVec(a.bias, b.bias, f) };
}

/** Keeps the iterations that visibly move the estimate, ending on the converged state. */
function visibleSteps(history: InitState[]) {
  const kept = [history[0]];
  for (const s of history.slice(1)) {
    const prev = kept[kept.length - 1];
    const moved =
      angleBetween(s.gravity, prev.gravity) > 0.05 * DEG ||
      Math.hypot(s.v0[0] - prev.v0[0], s.v0[1] - prev.v0[1], s.v0[2] - prev.v0[2]) > 0.005 ||
      Math.hypot(s.bias[0] - prev.bias[0], s.bias[1] - prev.bias[1], s.bias[2] - prev.bias[2]) > 0.02 * DEG;
    if (moved) kept.push(s);
  }
  const last = history[history.length - 1];
  if (kept.length > 1) kept[kept.length - 1] = last;
  else if (last !== kept[0]) kept.push(last);
  return kept;
}

const ease = (f: number) => (f < 0.5 ? 2 * f * f : 1 - (-2 * f + 2) ** 2 / 2);
const fmt = (v: number, digits = 2) => (Math.abs(v) < 0.5 * 10 ** -digits ? 0 : v).toFixed(digits);
const fmtVec = (v: Vec3) => `(${v.map((x) => fmt(x / DEG, 1)).join(', ')})`;

export default function AlignmentDemo() {
  const [motion, setMotion] = useState<MotionPreset>('aggressive');
  const [seed, setSeed] = useState(52);
  const [biasDeg, setBiasDeg] = useState(2);
  const [velNoise, setVelNoise] = useState(0.3);
  const [windowLen, setWindowLen] = useState(2.5);
  const [method, setMethod] = useState<Method>('vel');

  const segment = useMemo(() => makeSegment(seed, motion), [seed, motion]);
  const problem = useMemo<Problem>(
    () => ({ segment, K: keyframeCount(windowLen), bias: biasDeg * DEG, velNoise }),
    [segment, windowLen, biasDeg, velNoise]
  );
  const start = useMemo(() => networkInit(problem), [problem]);

  const [estimate, setEstimate] = useState<InitState>(start);
  const [status, setStatus] = useState<Status>({ kind: 'start' });
  // Once the reader has solved, scenario changes jump straight to the new solution.
  const follow = useRef(false);
  const frame = useRef<number | null>(null);

  const stop = useCallback(() => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
  }, []);
  useEffect(() => stop, [stop]);

  useEffect(() => {
    stop();
    if (follow.current) {
      const history = solve(problem, method, start);
      setEstimate(history[history.length - 1]);
      setStatus({ kind: 'converged', n: history.length - 1 });
    } else {
      setEstimate(start);
      setStatus({ kind: 'start' });
    }
  }, [problem, method, start, stop]);

  const reset = () => {
    stop();
    follow.current = false;
    setEstimate(start);
    setStatus({ kind: 'start' });
  };

  const step = () => {
    stop();
    follow.current = false;
    setEstimate(gaussNewtonStep(problem, estimate, method));
    setStatus((s) => ({ kind: 'step', n: s.kind === 'step' ? s.n + 1 : 1 }));
  };

  const run = () => {
    stop();
    const history = solve(problem, method, estimate);
    const steps = visibleSteps(history);
    const finish = () => {
      frame.current = null;
      follow.current = true;
      setEstimate(history[history.length - 1]);
      setStatus({ kind: 'converged', n: history.length - 1 });
    };
    if (steps.length < 2 || prefersReducedMotion()) return finish();
    setStatus({ kind: 'running' });
    const t0 = performance.now();
    const tick = (now: number) => {
      // A frame's timestamp can precede the start time taken when the animation began.
      const progress = Math.max(0, (now - t0) / STEP_MS);
      if (progress >= steps.length - 1) return finish();
      const i = Math.floor(progress);
      setEstimate(lerpState(steps[i], steps[i + 1], ease(progress - i)));
      frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
  };

  const moveGravity = (gravity: Vec3) => {
    stop();
    follow.current = false;
    setEstimate((s) => ({ ...s, gravity }));
    setStatus({ kind: 'manual' });
  };

  // Everything drawn below follows from the current estimate.
  const { K } = problem;
  const times = useMemo(() => Array.from(segment.keyTime.subarray(0, K)), [segment, K]);
  const pre = useMemo(() => preintegrate(problem, estimate.bias), [problem, estimate.bias]);
  const propagated = useMemo(() => propagatedVelocity(problem, estimate, pre), [problem, estimate, pre]);
  const predicted = useMemo(() => rotatedPredictions(problem, pre), [problem, pre]);
  const implied = useMemo(() => impliedRollPitch(problem, estimate, pre), [problem, estimate, pre]);
  const implied0 = rollPitchFromGravity(estimate.gravity);
  const objective = cost(problem, estimate, method, pre);
  const gErr = gravityError(problem, estimate);
  const vErr = initialVelocityError(problem, estimate);
  const T = times[times.length - 1];

  const statusText = {
    start: 'Network Init: the unrefined network guess.',
    manual: 'Manual estimate. Press Solve.',
    step: `Gauss–Newton step ${status.kind === 'step' ? status.n : 0}.`,
    running: 'Solving…',
    converged: `Converged in ${status.kind === 'converged' ? status.n : 0} iterations.`,
  }[status.kind];

  return (
    <DemoCard title='Velocity alignment'>
      <p className='pb-4 text-base text-gray-600'>
        <strong className='text-gray-800'>Try it:</strong> drag the blue dot in the gravity target, then press Solve.
        Raise the bias and lengthen the window to compare <i>vel</i> with <i>+rp</i>.
      </p>

      <div className='flex flex-wrap items-end gap-x-6 gap-y-3 rounded-xl bg-gray-50 p-3'>
        <Segmented
          label='Method'
          value={method}
          options={[
            { value: 'vel', label: 'I-Init: vel' },
            { value: 'rp', label: 'I-Init: +rp' },
          ]}
          onChange={setMethod}
        />
        <div className='flex flex-wrap gap-2'>
          <DemoButton primary onClick={run} disabled={status.kind === 'running'} icon={<Play aria-hidden='true' className='h-4 w-4' />}>
            Solve
          </DemoButton>
          <DemoButton onClick={step} icon={<SkipForward aria-hidden='true' className='h-4 w-4' />}>
            Step
          </DemoButton>
          <DemoButton onClick={reset} icon={<RotateCcw aria-hidden='true' className='h-4 w-4' />}>
            Network Init
          </DemoButton>
        </div>
      </div>
      <p role='status' className='pt-2 text-base text-gray-600'>
        {statusText}
      </p>

      <div className='grid gap-6 pt-4 lg:grid-cols-[20rem_minmax(0,1fr)]'>
        <div className='order-2 space-y-4 lg:order-1'>
          <div>
            <div className='pb-1 text-sm font-medium text-gray-700'>Gravity error in {'{'}b₀{'}'}</div>
            <div className='flex items-center gap-3'>
              <GravityTarget truth={segment.gravity} estimate={estimate.gravity} start={start.gravity} onMove={moveGravity} />
              <Legend
                className='flex-col'
                items={[
                  { color: COLORS.truth, dot: true, label: 'Truth' },
                  { color: COLORS.blue, dot: true, label: 'Estimate' },
                  { color: COLORS.residual, dot: true, label: 'Network Init' },
                ]}
              />
            </div>
          </div>
          <div className='grid grid-cols-2 gap-2'>
            <Stat
              label='Gravity-direction error'
              value={`${fmt(gErr)}°`}
              status={
                gErr < 5 ? (
                  <span className='inline-flex items-center gap-0.5 text-sm font-medium text-green-700'>
                    <Check aria-hidden='true' className='h-3.5 w-3.5' /> under 5°
                  </span>
                ) : (
                  <span className='inline-flex items-center gap-0.5 text-sm font-medium text-red-700'>
                    <X aria-hidden='true' className='h-3.5 w-3.5' /> over 5°
                  </span>
                )
              }
            />
            <Stat label='Initial-velocity error' value={`${fmt(vErr)} m/s`} />
            <Stat
              wide
              label={`Objective (${method === 'rp' ? '11' : '9'})`}
              value={objective < 1e6 ? Math.round(objective).toLocaleString('en-US') : '> 1,000,000'}
            />
            <Stat wide label='Gyroscope-bias estimate' value={method === 'rp' ? `${fmtVec(estimate.bias)} °/s` : 'No estimate'} />
          </div>
          <fieldset className='space-y-3 rounded-xl border border-gray-200 p-3'>
            <legend className='px-1 text-sm font-semibold uppercase tracking-wide text-gray-500'>Simulated truth</legend>
            <Segmented
              label='Motion'
              value={motion}
              options={[
                { value: 'gentle', label: 'Gentle' },
                { value: 'aggressive', label: 'Aggressive' },
              ]}
              onChange={setMotion}
            />
            <Slider
              label='Gyroscope bias'
              value={biasDeg}
              min={0}
              max={5}
              step={0.25}
              format={(v) => `${v.toFixed(2)} °/s`}
              onChange={setBiasDeg}
              hint='Random direction. Zero mimics AirIMU correction.'
            />
            <Slider
              label='Network velocity noise (σ)'
              value={velNoise}
              min={0.05}
              max={0.6}
              step={0.05}
              format={(v) => `${v.toFixed(2)} m/s`}
              onChange={setVelNoise}
            />
            <Slider
              label='Window T'
              value={windowLen}
              min={0.5}
              max={5}
              step={0.25}
              format={(v) => `${v.toFixed(2)} s · ${keyframeCount(v)} key-frames`}
              onChange={setWindowLen}
            />
            <DemoButton onClick={() => setSeed((s) => s + 1)} icon={<Shuffle aria-hidden='true' className='h-4 w-4' />}>
              New trajectory
            </DemoButton>
          </fieldset>
        </div>

        <div className='order-1 min-w-0 space-y-3 lg:order-2'>
          <Legend
            items={[
              { color: COLORS.orange, dot: true, label: 'Network prediction' },
              { color: COLORS.blue, label: 'Estimate (preintegrated)' },
              { color: COLORS.truth, dashed: true, label: 'Truth' },
              { color: COLORS.residual, label: 'Residual' },
            ]}
          />
          <h4 className='pt-1 text-base font-semibold text-gray-800'>
            Velocity in {'{'}b₀{'}'} <span className='font-normal text-gray-500'>(residual 8)</span>
          </h4>
          {AXES.map((name, axis) => (
            <TimeChart
              key={name}
              title={`${name} (m/s)`}
              ariaLabel={`Velocity ${name} component in the first body frame: network predictions, preintegrated velocity, and truth`}
              T={T}
              times={times}
              network={predicted.map((v) => v[axis])}
              estimate={[estimate.v0[axis], ...propagated.map((v) => v[axis])]}
              truth={[segment.v0[axis], ...segment.trueVelB0.slice(0, K).map((v) => v[axis])]}
              minSpan={0.6}
              digits={2}
              unit=' m/s'
              xLabel={axis === 2}
            />
          ))}
          <h4 className='pt-2 text-base font-semibold text-gray-800'>
            Roll &amp; pitch{' '}
            <span className='font-normal text-gray-500'>
              {method === 'rp' ? '(residual 10)' : '(not used by vel)'}
            </span>
          </h4>
          <div className={method === 'rp' ? 'space-y-3' : 'space-y-3 opacity-70'}>
            {(['roll', 'pitch'] as const).map((name, i) => {
              const net = i === 0 ? segment.netRoll : segment.netPitch;
              const truth = i === 0 ? segment.trueRoll : segment.truePitch;
              return (
                <TimeChart
                  key={name}
                  title={`${name[0].toUpperCase()}${name.slice(1)} (°)`}
                  ariaLabel={`${name} over the window: network predictions, the value implied by the estimate, and truth`}
                  T={T}
                  times={times}
                  network={Array.from(net.subarray(0, K), (v) => v / DEG)}
                  estimate={[implied0[i] / DEG, ...implied.map((rp) => rp[i] / DEG)]}
                  truth={[(i === 0 ? segment.roll0 : segment.pitch0) / DEG, ...Array.from(truth.subarray(0, K), (v) => v / DEG)]}
                  minSpan={10}
                  digits={1}
                  unit='°'
                  xLabel={i === 1}
                  residuals={method === 'rp'}
                />
              );
            })}
          </div>
        </div>
      </div>
    </DemoCard>
  );
}

/**
 * One quantity over the window. `network` has one value per key-frame; `estimate` and
 * `truth` also start with the value at t = 0.
 */
function TimeChart({
  title,
  ariaLabel,
  T,
  times,
  network,
  estimate,
  truth,
  minSpan,
  digits,
  unit,
  xLabel,
  residuals = true,
}: {
  title: string;
  ariaLabel: string;
  T: number;
  times: number[];
  network: number[];
  estimate: number[];
  truth: number[];
  minSpan: number;
  digits: number;
  unit: string;
  xLabel: boolean;
  residuals?: boolean;
}) {
  // The axis follows the predictions and the truth, so a bad estimate runs off the chart.
  const yDomain = niceDomain([...network, ...truth], minSpan);
  const series = (values: number[]) => [[0, values[0]] as [number, number], ...times.map((t, k): [number, number] => [t, values[k + 1]])];
  return (
    <Plot
      title={title}
      ariaLabel={ariaLabel}
      height={xLabel ? 160 : 140}
      xDomain={[0, T]}
      yDomain={yDomain}
      xLabel={xLabel ? 'time since t₀ (s)' : undefined}
      formatY={(v) => `${+v.toFixed(digits === 1 ? 0 : 1)}`}
      hover={{
        xs: times,
        render: (k) => (
          <>
            <div className='pb-0.5 text-gray-500'>t = {times[k].toFixed(2)} s</div>
            <TooltipRow color={COLORS.orange} dot label='network' value={`${network[k].toFixed(digits)}${unit}`} />
            <TooltipRow color={COLORS.blue} label='estimate' value={`${estimate[k + 1].toFixed(digits)}${unit}`} />
            <TooltipRow color={COLORS.truth} dashed label='truth' value={`${truth[k + 1].toFixed(digits)}${unit}`} />
            {residuals && (
              <div className='pt-0.5 text-gray-500'>
                residual {(network[k] - estimate[k + 1]).toFixed(digits)}
                {unit}
              </div>
            )}
          </>
        ),
      }}
    >
      {(s) => (
        <>
          {residuals &&
            times.map((t, k) => (
              <line key={k} x1={s.x(t)} x2={s.x(t)} y1={s.y(network[k])} y2={s.y(estimate[k + 1])} stroke={COLORS.residual} strokeWidth={1} />
            ))}
          <path d={linePath(series(truth), s)} fill='none' stroke={COLORS.truth} strokeWidth={1.5} strokeDasharray='5 4' />
          <path d={linePath(series(estimate), s)} fill='none' stroke={COLORS.blue} strokeWidth={2} strokeLinejoin='round' strokeLinecap='round' />
          {times.map((t, k) => (
            <circle key={k} cx={s.x(t)} cy={s.y(network[k])} r={2.5} fill={COLORS.orange} />
          ))}
        </>
      )}
    </Plot>
  );
}

const TARGET_MAX = 12; // degrees at the edge of the target
const TARGET_SIZE = 150;

/**
 * The estimated gravity direction plotted as its offset from the truth, in degrees along the
 * {b₀} x and y directions. Dragging or the arrow keys move the estimate.
 */
function GravityTarget({ truth, estimate, start, onMove }: { truth: Vec3; estimate: Vec3; start: Vec3; onMove: (gravity: Vec3) => void }) {
  const c = TARGET_SIZE / 2;
  const radius = c - 12;
  const toPx = (deg: number) => (deg / TARGET_MAX) * radius;
  const place = (offset: [number, number]) => {
    const r = Math.hypot(...offset);
    const k = r > TARGET_MAX ? TARGET_MAX / r : 1;
    return { x: c + toPx(offset[0] * k), y: c - toPx(offset[1] * k), clipped: k < 1 };
  };
  const [dx, dy] = gravityOffset(truth, estimate);
  const dot = place([dx, dy]);
  const init = place(gravityOffset(truth, start));
  const dragging = useRef(false);

  const moveTo = (event: PointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * TARGET_SIZE - c;
    const y = ((event.clientY - rect.top) / rect.height) * TARGET_SIZE - c;
    onMove(fromGravityOffset(truth, (x / radius) * TARGET_MAX, (-y / radius) * TARGET_MAX));
  };

  const onKey = (event: KeyboardEvent<SVGSVGElement>) => {
    const stepDeg = event.shiftKey ? 2 : 0.5;
    const moves: Record<string, [number, number]> = { ArrowLeft: [-stepDeg, 0], ArrowRight: [stepDeg, 0], ArrowUp: [0, stepDeg], ArrowDown: [0, -stepDeg] };
    const m = moves[event.key];
    if (!m) return;
    event.preventDefault();
    onMove(fromGravityOffset(truth, dx + m[0], dy + m[1]));
  };

  return (
    <svg
      viewBox={`0 0 ${TARGET_SIZE} ${TARGET_SIZE}`}
      className='h-40 w-40 shrink-0 cursor-crosshair touch-none select-none rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600'
      role='application'
      tabIndex={0}
      aria-label={`Gravity estimate, ${angleBetween(truth, estimate) / DEG >= 0.005 ? (angleBetween(truth, estimate) / DEG).toFixed(2) : '0'} degrees from the true direction. Drag, or use the arrow keys, to move it.`}
      onPointerDown={(event) => {
        dragging.current = true;
        event.currentTarget.setPointerCapture(event.pointerId);
        moveTo(event);
      }}
      onPointerMove={(event) => dragging.current && moveTo(event)}
      onPointerUp={() => (dragging.current = false)}
      onPointerCancel={() => (dragging.current = false)}
      onKeyDown={onKey}
    >
      <circle cx={c} cy={c} r={radius} fill='#f9fafb' stroke={COLORS.grid} />
      <circle cx={c} cy={c} r={toPx(10)} fill='none' stroke={COLORS.grid} />
      <circle cx={c} cy={c} r={toPx(5)} fill='rgb(22 163 74 / 0.06)' stroke='#86efac' strokeWidth={1.5} />
      <line x1={c - radius} x2={c + radius} y1={c} y2={c} stroke={COLORS.grid} />
      <line x1={c} x2={c} y1={c - radius} y2={c + radius} stroke={COLORS.grid} />
      <text x={c + toPx(5) * 0.72 + 2} y={c - toPx(5) * 0.72 - 2} fontSize={10} fill={COLORS.tick}>
        5°
      </text>
      <text x={c + toPx(10) * 0.72 + 2} y={c - toPx(10) * 0.72 - 2} fontSize={10} fill={COLORS.tick}>
        10°
      </text>
      <text x={c + radius + 2} y={c} dy='0.32em' fontSize={10} fill={COLORS.tick}>
        x
      </text>
      <text x={c} y={c - radius - 3} textAnchor='middle' fontSize={10} fill={COLORS.tick}>
        y
      </text>
      <circle cx={init.x} cy={init.y} r={4} fill='none' stroke={COLORS.residual} strokeWidth={1.5} />
      <circle cx={c} cy={c} r={3.5} fill={COLORS.truth} />
      <circle cx={dot.x} cy={dot.y} r={6} fill={dot.clipped ? '#fff' : COLORS.blue} stroke={dot.clipped ? COLORS.blue : '#fff'} strokeWidth={2} />
    </svg>
  );
}
