interface HelloPanelProps {
  pingTs: number | null;
}

export function HelloPanel({ pingTs }: HelloPanelProps): JSX.Element {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800">
      <h2 className="mb-2 text-xl font-semibold">Hello, BSW world.</h2>
      <p className="text-sm text-slate-600 dark:text-slate-300">
        Layer separation is enforced by ESLint. core/ has zero react/electron deps.
      </p>
      <p className="mt-3 font-mono text-xs text-slate-500">IPC ping ts: {pingTs ?? 'pending'}</p>
    </div>
  );
}
