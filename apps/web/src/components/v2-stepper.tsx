"use client";

import { Children, isValidElement, useEffect, useLayoutEffect, useRef, useState, type ReactElement, type ReactNode } from "react";

// A multi-step form in the v2 look (docs/DESIGN.md), after the AnimatedStepper
// pattern: numbered indicators joined by a meter, a sliding step, a container that
// eases to each step's height, Back and Continue. Native, no animation library:
// CSS transitions, which reduced motion turns off (globals.css).
//
// It lives inside one real <form>. Every step stays in the DOM so its fields are
// submitted; Continue checks only the current step's fields. Before JavaScript
// runs, all steps show one under another with the submit button, so the form
// still works.

type StepProps = { title: string; children: ReactNode };

/** One step. V2Stepper reads its title and children; on its own it renders the children. */
export function Step(props: StepProps): ReactNode {
  return props.children;
}

type StepEl = ReactElement<StepProps>;

export function V2Stepper({
  children,
  submitLabel,
  backLabel = "Back",
  nextLabel = "Continue",
  label
}: {
  children: ReactNode;
  submitLabel: string;
  backLabel?: string;
  nextLabel?: string;
  label: string;
}) {
  const steps = Children.toArray(children).filter(isValidElement) as StepEl[];
  const total = steps.length;
  const [enhanced, setEnhanced] = useState(false);
  const [current, setCurrent] = useState(0);
  const [reached, setReached] = useState(0);
  const [direction, setDirection] = useState<1 | -1>(1);
  const [height, setHeight] = useState<number | undefined>(undefined);
  const panels = useRef<(HTMLDivElement | null)[]>([]);
  const headings = useRef<(HTMLHeadingElement | null)[]>([]);
  const moved = useRef(false);

  useEffect(() => setEnhanced(true), []);

  // Ease the container to the current step's height, and follow it if it changes.
  useLayoutEffect(() => {
    if (!enhanced) return;
    const el = panels.current[current];
    if (!el) return;
    const fit = () => setHeight(el.offsetHeight);
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [enhanced, current]);

  // After a move: slide the new step in from the side it comes from (skipped under
  // reduced motion), and put focus on its heading so keyboard and screen-reader
  // users land where the content changed.
  useEffect(() => {
    if (!moved.current) return;
    const el = panels.current[current];
    if (el && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      el.animate(
        [
          { opacity: 0, transform: `translateX(${direction * 20}px)` },
          { opacity: 1, transform: "none" }
        ],
        { duration: 360, easing: "cubic-bezier(0.22, 1, 0.36, 1)" }
      );
    }
    headings.current[current]?.focus({ preventScroll: true });
  }, [current, direction]);

  const go = (to: number) => {
    if (to === current || to < 0 || to >= total) return;
    moved.current = true;
    setDirection(to > current ? 1 : -1);
    setCurrent(to);
    setReached((r) => Math.max(r, to));
  };

  // Only the current step's fields are checked; the browser shows its own message.
  const currentIsValid = () => {
    const fields = panels.current[current]?.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>("input, select, textarea");
    for (const f of fields ?? []) {
      if (!f.checkValidity()) {
        f.reportValidity();
        return false;
      }
    }
    return true;
  };

  const last = current === total - 1;

  return (
    <div className={`st ${enhanced ? "st-on" : ""}`} aria-label={label} role="group">
      {enhanced && (
        <ol className="st-steps" aria-label="Steps">
          {steps.map((s, i) => {
            const state = i === current ? "active" : i < current ? "done" : "todo";
            const canJump = i <= reached && i !== current;
            return (
              <li key={i} className={`st-step st-${state}`}>
                <button
                  type="button"
                  className="st-dot lp-mono"
                  aria-current={i === current ? "step" : undefined}
                  aria-label={`Step ${i + 1} of ${total}: ${s.props.title}${state === "done" ? ", done" : ""}`}
                  disabled={!canJump}
                  onClick={() => (i < current || currentIsValid()) && go(i)}
                >
                  {state === "done" ? (
                    <svg aria-hidden="true" viewBox="0 0 16 16" className="st-check">
                      <path d="M3 8.5 6.5 12 13 4.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" />
                    </svg>
                  ) : (
                    i + 1
                  )}
                </button>
                <span className="st-step-title lp-mono" aria-hidden="true">{s.props.title}</span>
                {i < total - 1 && (
                  <span className="st-bar" aria-hidden="true">
                    <i style={{ transform: `scaleX(${i < current ? 1 : 0})` }} />
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      )}

      <p className="sr-only" aria-live="polite">
        {enhanced ? `Step ${current + 1} of ${total}: ${steps[current]?.props.title ?? ""}` : ""}
      </p>

      <div className="st-viewport" style={enhanced && height !== undefined ? { height } : undefined}>
        {steps.map((s, i) => {
          return (
            <div
              key={i}
              ref={(el) => {
                panels.current[i] = el;
              }}
              className="st-panel"
              hidden={enhanced && i !== current ? true : undefined}
            >
              <p className="lp-mono lp-muted">Step {i + 1} of {total}</p>
              <h2
                className="lp-display st-title"
                tabIndex={-1}
                ref={(el) => {
                  headings.current[i] = el;
                }}
              >
                {s.props.title}
              </h2>
              <div className="st-body">{s.props.children}</div>
            </div>
          );
        })}
      </div>

      <div className="st-foot">
        {enhanced && current > 0 && (
          <button type="button" className="lp-btn lp-btn-line lp-mono st-back" onClick={() => go(current - 1)}>
            {backLabel}
          </button>
        )}
        {/* Separate keys: if React reused one <button> and flipped it to type="submit"
            inside the Continue click, the browser would submit the form on that click. */}
        {enhanced && !last ? (
          <button key="next" type="button" className="lp-btn lp-btn-ink lp-mono st-next" onClick={() => currentIsValid() && go(current + 1)}>
            {nextLabel}
          </button>
        ) : (
          <button key="submit" type="submit" className="lp-btn lp-btn-ink lp-mono st-next">
            {submitLabel}
          </button>
        )}
      </div>
    </div>
  );
}
