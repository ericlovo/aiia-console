// MemoryTab — placeholder for the force-directed memory graph that pairs
// with AIIA Brain (or a local fallback store). Real visualization lands in a
// later release once the Brain endpoints are ready.

export function MemoryTab() {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center px-6 py-12">
      <div className="max-w-lg text-center">
        <div className="mb-3 flex items-center justify-center gap-2">
          <h2 className="text-xl font-semibold tracking-tight text-neutral-100">
            Memory
          </h2>
          <span className="rounded-full border border-neutral-700 bg-neutral-900 px-2 py-0.5 text-[10px] uppercase tracking-wider text-neutral-400">
            Coming soon
          </span>
        </div>
        <p className="mb-4 text-sm leading-relaxed text-neutral-300">
          This is where you&apos;ll see what your AI remembers about you — every
          fact, every connection, every decision. You&apos;ll be able to read it,
          edit it, forget anything you want, and export the whole thing.
        </p>
        <p className="text-xs leading-relaxed text-neutral-500">
          <em>
            Memory visualization is coming in the next release. It will pair
            with{" "}
            <a
              href="https://github.com/ericlovo/AIIA"
              target="_blank"
              rel="noreferrer"
              className="text-neutral-300 underline decoration-neutral-700 hover:text-neutral-100 hover:decoration-neutral-400"
            >
              AIIA
            </a>{" "}
            when installed, or fall back to a local store when not.
          </em>
        </p>
      </div>
    </div>
  );
}
