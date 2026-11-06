// Shown the moment a signed-in page is clicked, while its server data loads. Without
// it a click on a module link changed nothing on screen until the whole page was ready,
// which read as the site being stuck. The sidebar and top bar (the layout) stay put.
export default function Loading() {
  return (
    <div role="status" aria-live="polite" className="max-w-6xl px-[var(--pad)] pt-8">
      <span className="sr-only">Loading…</span>
      <div className="app-loading-bar" aria-hidden="true" />
      <div aria-hidden="true" className="mt-6 space-y-4">
        <div className="cx-skel h-7 w-56" />
        <div className="cx-skel h-4 w-80 max-w-full" />
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="cx-skel-card h-24" />
          ))}
        </div>
        <div className="cx-skel-card h-48" />
      </div>
    </div>
  );
}
