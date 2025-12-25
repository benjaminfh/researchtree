'use client';

import { useEffect, useMemo, useRef } from 'react';

type Vec2 = { x: number; y: number };

type Trace = {
  id: string;
  alive: boolean;
  isSeed: boolean;
  pos: Vec2;
  velX: number;
  points: Vec2[];
  pathQueue: Vec2[];
  rng: () => number;
  color: string;
  width: number;
  baseAlpha: number;
  stepsSinceBranch: number;
  stepsSinceMerge: number;
  mergingTo?: string;
  mergeStrength: number;
};

type Config = {
  seedMin: number; // minimum number of starting traces
  seedMax: number; // maximum number of starting traces
  grid: {
    stepY: number; // vertical step per tick
    stepX: number; // horizontal grid spacing
    snap: number; // snap strength toward grid columns (0..1)
  };
  motion: {
    lateralJitter: number; // random sideways impulse per step
    driftDamp: number; // drift damping factor (0..1)
    maxDrift: number; // clamp for sideways drift
  };
  branching: {
    chance: number; // per-step branch probability per trace
    cooldownSteps: number; // min steps between branches for a trace
    splitOffsetCols: number; // lateral offset in grid columns
    maxTraces: number; // hard cap for total traces
    branchDxScale: number; // a: dx = a * N * stepX
    branchDyScale: number; // b: dy = b * N * stepY
  };
  merging: {
    enabledAfterFraction: number; // enable merging after seeds/fraction traces exist
    chance: number; // per-step merge probability per trace
    cooldownSteps: number; // min steps between merges for a trace
    captureRadius: number; // pixels to snap/complete merge
    steer: number; // merge steering strength
    killOnMerge: boolean; // remove trace when it merges
  };
  render: {
    blurPass: boolean; // draw a soft glow pass
  };
};

const DEFAULT_CONFIG: Config = {
  seedMin: 4,
  seedMax: 8,
  grid: { stepY: 24, stepX: 24, snap: 0.75 },
  motion: {
    lateralJitter: 0.0,
    driftDamp: 0.0,
    maxDrift: 2.2
  },
  branching: {
    chance: 0.1,
    cooldownSteps: 5,
    splitOffsetCols: 5,
    maxTraces: 100,
    branchDxScale: 2,
    branchDyScale: 2
  },
  merging: {
    enabledAfterFraction: 2,
    chance: 1,
    cooldownSteps: 12,
    captureRadius: 32,
    steer: 0.5,
    killOnMerge: false
  },
  render: {
    blurPass: true
  }
};

function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function dist(a: Vec2, b: Vec2) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function snapToGridX(x: number, stepX: number, snapStrength: number) {
  const col = Math.round(x / stepX);
  const snapped = col * stepX;
  return x + (snapped - x) * snapStrength;
}

function uid(rand: () => number) {
  return `${Math.floor(rand() * 1e9).toString(36)}-${Math.floor(rand() * 1e9).toString(36)}`;
}

function palette() {
  return 'rgb(100, 150, 256)';
}

export default function BranchingTracesBackground({
  className,
  config
}: {
  className?: string;
  config?: Partial<Config>;
}) {
  const cfg = useMemo<Config>(() => {
    return {
      ...DEFAULT_CONFIG,
      ...config,
      grid: { ...DEFAULT_CONFIG.grid, ...(config?.grid ?? {}) },
      motion: { ...DEFAULT_CONFIG.motion, ...(config?.motion ?? {}) },
      branching: { ...DEFAULT_CONFIG.branching, ...(config?.branching ?? {}) },
      merging: { ...DEFAULT_CONFIG.merging, ...(config?.merging ?? {}) },
      render: { ...DEFAULT_CONFIG.render, ...(config?.render ?? {}) }
    };
  }, [config]);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const tracesRef = useRef<Map<string, Trace>>(new Map());
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    const rand = mulberry32(Math.floor(Date.now() % 2147483647));

    const resize = () => {
      const { clientWidth, clientHeight } = canvas;
      if (clientWidth === 0 || clientHeight === 0) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.floor(clientWidth * dpr);
      canvas.height = Math.floor(clientHeight * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const w = () => canvas.clientWidth;
    const h = () => canvas.clientHeight;

    const seedTraces = () => {
      const seedCount = Math.floor(cfg.seedMin + rand() * (cfg.seedMax - cfg.seedMin + 1));
      tracesRef.current.clear();
      for (let i = 0; i < seedCount; i += 1) {
        const x = (0.1 + 0.8 * rand()) * w();
        const startX = snapToGridX(x, cfg.grid.stepX, 1);
        const traceRand = mulberry32(Math.floor(rand() * 1e9));
        const trace: Trace = {
          id: uid(rand),
          alive: true,
          isSeed: true,
          pos: { x: startX, y: -10 - rand() * 50 },
          velX: (rand() - 0.5) * 0.6,
          points: [{ x: startX, y: -10 }],
          pathQueue: [],
          rng: traceRand,
          color: palette(),
          width: 2.2 + rand() * 1.8,
          baseAlpha: 0.5 + traceRand() * 0.5,
          stepsSinceBranch: 999,
          stepsSinceMerge: 999,
          mergeStrength: 0
        };
        tracesRef.current.set(trace.id, trace);
      }
    };

    seedTraces();

    const clear = () => {
      ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
    };

    const strokePath = (points: Vec2[], color: string, width: number, alpha: number) => {
      if (points.length < 2) return;
      const stepY = cfg.grid.stepY;
      const padY = stepY * 2;
      const first = points[0];
      const last = points[points.length - 1];
      const paddedPoints: Vec2[] = [
        { x: first.x, y: first.y - padY },
        ...points,
        { x: last.x, y: last.y + padY }
      ];

      ctx.globalAlpha = alpha;
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(paddedPoints[0].x, paddedPoints[0].y);
      for (let i = 1; i < paddedPoints.length - 1; i += 1) {
        const curr = paddedPoints[i];
        const next = paddedPoints[i + 1];
        const mid = { x: (curr.x + next.x) / 2, y: (curr.y + next.y) / 2 };
        ctx.quadraticCurveTo(curr.x, curr.y, mid.x, mid.y);
      }
      const finalPoint = paddedPoints[paddedPoints.length - 1];
      ctx.lineTo(finalPoint.x, finalPoint.y);
      ctx.stroke();

      if (cfg.render.blurPass) {
        ctx.globalAlpha = alpha * 0.55;
        ctx.lineWidth = width * 2.2;
        ctx.stroke();
      }
    };

    const buildBranchCurve = (start: Vec2, dir: number, margin: number) => {
      const columns = cfg.branching.splitOffsetCols;
      const dx = dir * columns * cfg.grid.stepX * cfg.branching.branchDxScale;
      const dy = cfg.branching.branchDyScale * columns * cfg.grid.stepY;
      const endX = clamp(start.x + dx, margin, w() - margin);
      const end = { x: endX, y: start.y + dy };
      const cp1 = { x: start.x, y: start.y + dy * 0.35 };
      const cp2 = { x: end.x, y: start.y + dy * 0.65 };
      const segments = Math.max(6, Math.round(dy / cfg.grid.stepY));
      const points: Vec2[] = [];
      for (let i = 1; i <= segments; i += 1) {
        const t = i / segments;
        const omt = 1 - t;
        const x =
          omt * omt * omt * start.x +
          3 * omt * omt * t * cp1.x +
          3 * omt * t * t * cp2.x +
          t * t * t * end.x;
        const y =
          omt * omt * omt * start.y +
          3 * omt * omt * t * cp1.y +
          3 * omt * t * t * cp2.y +
          t * t * t * end.y;
        points.push({ x, y });
      }
      const tailSteps = 2;
      for (let i = 1; i <= tailSteps; i += 1) {
        points.push({ x: end.x, y: end.y + i * cfg.grid.stepY });
      }
      return points;
    };

    let last = performance.now();
    let accum = 0;
    const stepDt = 1 / 25;

    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      accum += dt;

      clear();

      while (accum >= stepDt) {
        accum -= stepDt;

        const traces = tracesRef.current;
        const aliveTraces = [...traces.values()].filter((trace) => trace.alive);
        const mergeEnabled =
          aliveTraces.length >= Math.ceil(cfg.seedMin / cfg.merging.enabledAfterFraction);

        for (const trace of aliveTraces) {
          const localRand = trace.rng;
          trace.stepsSinceBranch += 1;
          trace.stepsSinceMerge += 1;

          const margin = 18;
          if (trace.pathQueue.length > 0) {
            const next = trace.pathQueue.shift()!;
            trace.points.push(next);
            trace.pos = next;
            if (trace.pathQueue.length === 0) {
              trace.velX = 0;
            }

            if (trace.points.length > 240) trace.points.shift();
            if (trace.pos.y > h() + 40) {
              trace.alive = false;
            }
            continue;
          }

          const targetY = trace.pos.y + cfg.grid.stepY;
          let vx = trace.velX + (localRand() - 0.5) * cfg.motion.lateralJitter;

          if (trace.mergingTo) {
            const target = traces.get(trace.mergingTo);
            if (!target || !target.alive) {
              trace.mergingTo = undefined;
              trace.mergeStrength = 0;
            } else {
              const steer = cfg.merging.steer * (0.5 + 0.5 * trace.mergeStrength);
              const dx = target.pos.x - trace.pos.x;
              vx += clamp(dx / cfg.grid.stepX, -3, 3) * steer;
              trace.mergeStrength = clamp(trace.mergeStrength + 0.02, 0, 1);

              if (dist(trace.pos, target.pos) <= cfg.merging.captureRadius) {
                if (cfg.merging.killOnMerge) {
                  trace.alive = false;
                } else {
                  trace.mergingTo = undefined;
                  trace.mergeStrength = 0;
                }
              }
            }
          }

          vx *= cfg.motion.driftDamp;
          vx = clamp(vx, -cfg.motion.maxDrift, cfg.motion.maxDrift);
          trace.velX = vx;

          let nextX = trace.pos.x + vx * cfg.grid.stepX * 0.35;
          nextX = snapToGridX(nextX, cfg.grid.stepX, cfg.grid.snap);

          nextX = clamp(nextX, margin, w() - margin);

          const next = { x: nextX, y: targetY };
          trace.points.push(next);
          trace.pos = next;

          if (trace.points.length > 240) trace.points.shift();

          if (trace.pos.y > h() + 40) {
            trace.alive = false;
          }

          const canBranch =
            traces.size < cfg.branching.maxTraces && trace.stepsSinceBranch >= cfg.branching.cooldownSteps;
          if (canBranch && localRand() < cfg.branching.chance) {
            trace.stepsSinceBranch = 0;

            const dir = localRand() < 0.5 ? -1 : 1;
            const branchStart = { x: trace.pos.x, y: trace.pos.y };
            const branchRand = mulberry32(Math.floor(localRand() * 1e9));
            const branch: Trace = {
              ...trace,
              id: uid(rand),
              alive: true,
              isSeed: false,
              pos: branchStart,
              points: [branchStart],
              pathQueue: buildBranchCurve(branchStart, dir, margin),
              rng: branchRand,
              velX: clamp(trace.velX + dir * (0.6 + localRand()), -cfg.motion.maxDrift, cfg.motion.maxDrift),
              width: clamp(trace.width * (0.9 + 0.2 * branchRand()), 1.8, 4.6),
              color: palette(),
              baseAlpha: 0.5 + branchRand() * 0.5,
              stepsSinceBranch: 0,
              stepsSinceMerge: 999,
              mergingTo: undefined,
              mergeStrength: 0
            };
            traces.set(branch.id, branch);
          }

          const canMerge =
            mergeEnabled &&
            !trace.mergingTo &&
            trace.stepsSinceMerge >= cfg.merging.cooldownSteps &&
            aliveTraces.length >= 2;
          if (canMerge && localRand() < cfg.merging.chance) {
            const candidates = aliveTraces.filter((item) => item.id !== trace.id && item.alive);
            if (candidates.length) {
              const target = candidates[Math.floor(localRand() * candidates.length)];
              trace.mergingTo = target.id;
              trace.mergeStrength = 0.1;
              trace.stepsSinceMerge = 0;
            }
          }
        }
      }

      const tracesToDraw = [...tracesRef.current.values()].filter((trace) => trace.alive);
      if (tracesToDraw.length === 0) {
        seedTraces();
      }
      for (const trace of tracesToDraw) {
        strokePath(trace.points, trace.color, trace.width, trace.baseAlpha);
      }

      ctx.globalAlpha = 1;
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      ro.disconnect();
    };
  }, [cfg]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={className}
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none'
      }}
    />
  );
}
