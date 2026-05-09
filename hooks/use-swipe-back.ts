'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';

interface UseSwipeBackOptions {
  /** Called when the swipe completes past threshold or with sufficient velocity. */
  onBack: () => void;
  /** Width in px of the left-edge zone where a swipe may start. Default: 24. */
  edgeWidth?: number;
  /** Distance threshold (fraction of screen width) to trigger back. Default: 0.30. */
  distanceThreshold?: number;
  /** Velocity threshold in px/ms (rightward) to trigger back. Default: 0.5. */
  velocityThreshold?: number;
  /** Disable entirely — e.g. on desktop. Default: false. */
  disabled?: boolean;
}

interface UseSwipeBackResult {
  /** Attach to the root element of the screen being swiped. */
  ref: (el: HTMLElement | null) => void;
  /** Inline style: transform + transition. Spread onto the root element. */
  style: CSSProperties;
}

/**
 * iOS-style edge-swipe-back gesture.
 *
 * - Touch must START inside the leftmost `edgeWidth` px of the screen.
 * - First 10px of movement determine axis: horizontal-dominant arms the swipe;
 *   vertical-dominant cancels it (lets normal scroll happen).
 * - While dragging: element follows finger 1:1 (rubber-banded past 60% width).
 * - On release: if past distance threshold OR velocity threshold rightward,
 *   element animates off-screen and `onBack` fires. Otherwise snaps back.
 *
 * Mobile-only by design — no mouse handlers.
 */
export function useSwipeBack(opts: UseSwipeBackOptions): UseSwipeBackResult {
  const { onBack, edgeWidth = 24, distanceThreshold = 0.30, velocityThreshold = 0.5, disabled = false } = opts;
  const elRef = useRef<HTMLElement | null>(null);
  const [translateX, setTranslateX] = useState(0);
  const [animating, setAnimating] = useState(false);

  // Refs so the touch handlers stay stable across renders
  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const lastXRef = useRef(0);
  const lastTRef = useRef(0);
  const velocityRef = useRef(0);
  const armedRef = useRef(false);
  const decidedRef = useRef(false);

  useEffect(() => {
    if (disabled) return;
    const el = elRef.current;
    if (!el) return;

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      const t = e.touches[0]!;
      if (t.clientX > edgeWidth) return; // Not in edge zone — ignore
      armedRef.current = true;
      decidedRef.current = false;
      startXRef.current = t.clientX;
      startYRef.current = t.clientY;
      lastXRef.current = t.clientX;
      lastTRef.current = performance.now();
      velocityRef.current = 0;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!armedRef.current) return;
      const t = e.touches[0]!;
      const dx = t.clientX - startXRef.current;
      const dy = t.clientY - startYRef.current;

      // Axis lock: first 10px of dominant movement decides whether this is a back-swipe
      if (!decidedRef.current) {
        if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return; // Need at least 10px to decide
        if (Math.abs(dy) > Math.abs(dx)) {
          // Vertical wins — cancel, let normal scroll happen
          armedRef.current = false;
          return;
        }
        decidedRef.current = true;
      }

      // Track velocity (instantaneous, last move only)
      const now = performance.now();
      const dt = now - lastTRef.current;
      if (dt > 0) {
        velocityRef.current = (t.clientX - lastXRef.current) / dt;
      }
      lastXRef.current = t.clientX;
      lastTRef.current = now;

      // Rubber-band past 60% screen width
      const w = window.innerWidth;
      const limit = w * 0.6;
      let offset = Math.max(0, dx);
      if (offset > limit) {
        offset = limit + (offset - limit) * 0.3;
      }

      // Prevent native scroll/back navigation while we're handling the gesture
      e.preventDefault();
      setTranslateX(offset);
      setAnimating(false); // No transition during drag — element follows finger
    };

    const onTouchEnd = () => {
      if (!armedRef.current || !decidedRef.current) {
        armedRef.current = false;
        decidedRef.current = false;
        return;
      }
      armedRef.current = false;
      decidedRef.current = false;

      const w = window.innerWidth;
      const offset = translateXRef.current;
      const v = velocityRef.current;

      const distancePassed = offset > w * distanceThreshold;
      const velocityPassed = v > velocityThreshold && offset > 30; // Some minimum to avoid accidental flicks

      if (distancePassed || velocityPassed) {
        // Animate off-screen, then fire onBack
        setAnimating(true);
        setTranslateX(w);
        window.setTimeout(() => {
          onBack();
          // Reset state for next mount
          setTranslateX(0);
          setAnimating(false);
        }, 200);
      } else {
        // Snap back
        setAnimating(true);
        setTranslateX(0);
        window.setTimeout(() => setAnimating(false), 200);
      }
    };

    // Use { passive: false } on touchmove so we can preventDefault the native scroll/back gesture
    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd, { passive: true });
    el.addEventListener('touchcancel', onTouchEnd, { passive: true });

    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', onTouchEnd);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disabled, edgeWidth, distanceThreshold, velocityThreshold, onBack]);

  // Keep a ref of the latest translateX for use inside touchend (closure capture issue)
  const translateXRef = useRef(0);
  useEffect(() => { translateXRef.current = translateX; }, [translateX]);

  const ref = (el: HTMLElement | null) => { elRef.current = el; };

  const style: CSSProperties = {
    transform: translateX > 0 ? `translateX(${translateX}px)` : undefined,
    transition: animating ? 'transform 200ms ease-out' : undefined,
    touchAction: 'pan-y',
    willChange: translateX > 0 ? 'transform' : undefined,
  };

  return { ref, style };
}
