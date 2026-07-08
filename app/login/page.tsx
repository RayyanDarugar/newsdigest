import { login } from "./actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <main className="relative z-10 flex min-h-screen items-center justify-center px-4">
      <form action={login} className="w-full max-w-xs space-y-5">
        <div className="flex items-center gap-2.5 font-display text-2xl font-extrabold uppercase tracking-tight">
          <span className="h-6 w-2 flex-none rounded-sm bg-accent" />
          Industry Digest
        </div>
        {error && (
          <p className="font-mono text-xs uppercase tracking-wide text-down">Wrong password.</p>
        )}
        <input
          type="password"
          name="password"
          placeholder="Password"
          autoFocus
          required
          className="w-full rounded border border-border bg-surface px-3 py-2.5 font-mono text-sm text-text outline-none placeholder:text-text-muted focus:border-accent"
        />
        <button
          type="submit"
          className="w-full rounded bg-accent px-3 py-2.5 font-mono text-sm font-bold uppercase tracking-wide text-accent-contrast transition-opacity hover:opacity-90"
        >
          Enter
        </button>
      </form>
    </main>
  );
}
