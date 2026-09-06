"use client";

import { useEffect, useRef } from "react";
import { SCENES, mulberry32, seedFrom, type SceneKey } from "./scenes";
import { useReducedMotion } from "@/components/providers/PreferencesProvider";

/**
 * Ambient particles. A single canvas, capped particle count, and a render loop
 * that pauses whenever the tab or the element is off-screen — atmosphere should
 * never cost the user a frame in a game.
 */

type Props = {
  scene: SceneKey;
  className?: string;
  /** Multiplier on the default particle count for this scene. */
  density?: number;
};

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  life: number;
  maxLife: number;
  drift: number;
};

const BASE_COUNT: Record<string, number> = {
  dust: 34,
  embers: 26,
  snow: 46,
  spores: 30,
  sparks: 22,
  none: 0,
};

export default function Atmosphere({ scene, className = "", density = 1 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    const spec = SCENES[scene];
    const kind = spec.particles;
    if (reducedMotion || kind === "none") return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    const count = Math.round((BASE_COUNT[kind] ?? 24) * density);
    const rand = mulberry32(seedFrom(scene));
    let width = 0;
    let height = 0;
    let dpr = 1;
    let running = true;
    let frame = 0;

    const particles: Particle[] = [];

    const spawn = (initial = false): Particle => {
      const maxLife = 6_000 + rand() * 10_000;
      const speed =
        kind === "embers" ? -0.16 : kind === "snow" ? 0.22 : kind === "sparks" ? -0.1 : 0.06;
      return {
        x: rand() * width,
        y: initial ? rand() * height : kind === "embers" || kind === "sparks" ? height + 10 : -10,
        vx: (rand() - 0.5) * 0.14,
        vy: speed * (0.6 + rand() * 0.9),
        size: kind === "snow" ? 1 + rand() * 2 : 0.7 + rand() * 1.6,
        life: initial ? rand() * maxLife : 0,
        maxLife,
        drift: rand() * Math.PI * 2,
      };
    };

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = rect.width;
      height = rect.height;
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (particles.length === 0) {
        for (let i = 0; i < count; i += 1) particles.push(spawn(true));
      }
    };

    resize();

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    const visibility = new IntersectionObserver(
      ([entry]) => {
        running = entry.isIntersecting && !document.hidden;
        if (running && frame === 0) frame = requestAnimationFrame(tick);
      },
      { threshold: 0 },
    );
    visibility.observe(canvas);

    const onVisibility = () => {
      running = !document.hidden;
      if (running && frame === 0) frame = requestAnimationFrame(tick);
    };
    document.addEventListener("visibilitychange", onVisibility);

    let last = performance.now();

    function tick(now: number) {
      frame = 0;
      if (!running || !ctx) return;

      const dt = Math.min(48, now - last);
      last = now;

      ctx.clearRect(0, 0, width, height);

      for (let i = 0; i < particles.length; i += 1) {
        const p = particles[i];
        p.life += dt;
        if (p.life > p.maxLife || p.y < -20 || p.y > height + 20) {
          particles[i] = spawn();
          continue;
        }

        p.drift += dt * 0.0006;
        p.x += (p.vx + Math.sin(p.drift) * 0.16) * (dt / 16);
        p.y += p.vy * (dt / 16);

        const t = p.life / p.maxLife;
        const fade = Math.sin(Math.PI * t);
        const alpha = fade * (kind === "sparks" || kind === "embers" ? 0.7 : 0.42);

        ctx.beginPath();
        ctx.fillStyle = spec.palette.accent;
        ctx.globalAlpha = Math.max(0, alpha);
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();

        if (kind === "embers" || kind === "sparks") {
          ctx.globalAlpha = Math.max(0, alpha * 0.28);
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * 3.4, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      ctx.globalAlpha = 1;
      frame = requestAnimationFrame(tick);
    }

    frame = requestAnimationFrame(tick);

    return () => {
      running = false;
      if (frame) cancelAnimationFrame(frame);
      observer.disconnect();
      visibility.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [scene, density, reducedMotion]);

  if (reducedMotion || SCENES[scene].particles === "none") return null;

  return (
    <canvas
      ref={canvasRef}
      className={`pointer-events-none absolute inset-0 h-full w-full ${className}`}
      aria-hidden="true"
    />
  );
}
