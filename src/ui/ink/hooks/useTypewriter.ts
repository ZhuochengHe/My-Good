/**
 * Typewriter effect hook for Ink TUI.
 *
 * Drains a character queue at a fixed interval, producing a visible text
 * string that grows one character at a time. The interval is cleared
 * automatically when the queue is empty to avoid idle re-renders.
 */

import { useState, useEffect, useRef } from 'react';

/** Default drain interval in milliseconds (~33 renders/sec). */
const DEFAULT_INTERVAL_MS = 30;

/**
 * Hook options for useTypewriter.
 */
export interface UseTypewriterOptions {
  /** Drain interval in milliseconds. Defaults to 30. */
  readonly intervalMs?: number;
}

/**
 * Hook result returned by useTypewriter.
 */
export interface UseTypewriterResult {
  /** The text visible so far (grows as characters drain). */
  readonly visibleText: string;
  /** Enqueue additional characters to be revealed. */
  readonly enqueue: (text: string) => void;
  /** Immediately reveal all remaining queued characters. */
  readonly flush: () => void;
  /** True while there are still characters in the queue. */
  readonly isDraining: boolean;
}

/**
 * Typewriter effect hook.
 *
 * Maintains an internal character queue and reveals one character every
 * {@link UseTypewriterOptions.intervalMs} milliseconds. Call {@link UseTypewriterResult.enqueue}
 * to add text and {@link UseTypewriterResult.flush} to skip the animation.
 *
 * @param options - Hook configuration.
 * @returns Typewriter state and control functions.
 *
 * @example
 * const { visibleText, enqueue } = useTypewriter();
 * // On new text_delta:
 * enqueue(delta);
 */
export function useTypewriter(options?: UseTypewriterOptions): UseTypewriterResult {
  const intervalMs = options?.intervalMs ?? DEFAULT_INTERVAL_MS;

  const [visibleText, setVisibleText] = useState('');
  const [isDraining, setIsDraining] = useState(false);

  // Internal mutable queue — not state because mutations must not trigger renders.
  const queueRef = useRef<string[]>([]);

  useEffect(() => {
    if (!isDraining) return;

    const timer = setInterval(() => {
      const char = queueRef.current.shift();
      if (char !== undefined) {
        setVisibleText((prev) => prev + char);
      }
      if (queueRef.current.length === 0) {
        clearInterval(timer);
        setIsDraining(false);
      }
    }, intervalMs);

    return (): void => clearInterval(timer);
  }, [isDraining, intervalMs]);

  const enqueue = (text: string): void => {
    for (const char of text) {
      queueRef.current.push(char);
    }
    setIsDraining(true);
  };

  const flush = (): void => {
    const remaining = queueRef.current.splice(0).join('');
    if (remaining.length > 0) {
      setVisibleText((prev) => prev + remaining);
    }
    setIsDraining(false);
  };

  return { visibleText, enqueue, flush, isDraining };
}
