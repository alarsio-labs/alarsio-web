// Shown the moment a signed-in page is clicked, while its server data loads. Without
// it a click on a module tab changed nothing on screen until the whole page was ready,
// which read as the site being stuck. The top bar and tabs (the layout) stay put.
export default function Loading() {
  return (
    <div role="status" aria-live="polite" className="mx-auto max-w-5xl px-4 py-8">
      <span className="sr-only">Loading…</span>
      <div className="app-loading-bar" aria-hidden="true" />
      <div aria-hidden="true" className="mt-6 space-y-4">
        <div className="h-9 w-56 bg-neutral-100" />
        <div className="h-4 w-80 max-w-full bg-neutral-100" />
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-24 border border-neutral-200 bg-neutral-50" />
          ))}
        </div>
        <div className="h-48 border border-neutral-200 bg-neutral-50" />
      </div>
    </div>
  );
}
