"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { useReducedMotion } from "@/components/providers/PreferencesProvider";

/**
 * Slow parallax. Driven by a single rAF-throttled scroll listener that writes
 * one CSS custom property — no per-frame React renders, and it disables itself
 * entirely when the visitor prefers reduced motion.
 */
export default function Parallax({
  children,
  speed = 0.18,
  className = "",
  pointer = 0,
}: {
  children: ReactNode;
  /** Fraction of scroll distance the layer moves. Negative moves it upward. */
  speed?: number;
  className?: string;
  /** Extra drift from the cursor, in pixels at the edge of the viewport. */
  pointer?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (reducedMotion) return;
    const element = ref.current;
    if (!element) return;

    let frame = 0;
    let scrollY = window.scrollY;
    let pointerX = 0;
    let pointerY = 0;

    const apply = () => {
      frame = 0;
      const rect = element.getBoundingClientRect();
      // Only animate while the layer is anywhere near the viewport.
      if (rect.bottom < -200 || rect.top > window.innerHeight + 200) return;
      const offset = scrollY * speed;
      element.style.transform = `translate3d(${pointerX}px, ${offset + pointerY}px, 0)`;
    };

    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(apply);
    };

    const onScroll = () => {
      scrollY = window.scrollY;
      schedule();
    };

    const onPointer = (event: PointerEvent) => {
      if (!pointer) return;
      const nx = event.clientX / window.innerWidth - 0.5;
      const ny = event.clientY / window.innerHeight - 0.5;
      pointerX = nx * pointer;
      pointerY = ny * pointer * 0.5;
      schedule();
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    if (pointer) window.addEventListener("pointermove", onPointer, { passive: true });
    apply();

    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("pointermove", onPointer);
      if (frame) cancelAnimationFrame(frame);
      element.style.transform = "";
    };
  }, [speed, pointer, reducedMotion]);

  return (
    <div ref={ref} className={`parallax will-change-transform ${className}`}>
      {children}
    </div>
  );
}
