import { getProfileBio } from "@/lib/queries";
import { saveBio } from "./actions";

export const dynamic = "force-dynamic";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  const [{ saved }, bio] = await Promise.all([searchParams, getProfileBio()]);

  return (
    <main>
      <h1 className="mb-2 font-display text-3xl font-extrabold uppercase tracking-tight">
        Settings
      </h1>
      <p className="mb-8 max-w-[58ch] text-sm text-text-muted">
        Your profile is included in every deep dive and chat so business angles
        are aimed at you — interests, skills, what kinds of opportunities
        you&rsquo;re hunting. Leave it empty for generic angles.
      </p>

      <form action={saveBio} className="max-w-2xl space-y-4">
        <label
          htmlFor="bio"
          className="block font-mono text-xs uppercase tracking-[0.15em] text-text-muted"
        >
          About me
        </label>
        <textarea
          id="bio"
          name="bio"
          rows={8}
          defaultValue={bio}
          placeholder="e.g. USC student studying business, interested in logistics and energy startups, looking for internship-scale opportunities and small ventures I could start with a technical co-founder…"
          className="w-full rounded border border-border bg-surface px-3 py-2.5 text-sm leading-relaxed text-text outline-none placeholder:text-text-muted focus:border-accent"
        />
        <div className="flex items-center gap-3">
          <button
            type="submit"
            className="rounded bg-accent px-4 py-2 font-mono text-xs font-bold uppercase tracking-wide text-accent-contrast transition-opacity hover:opacity-90"
          >
            Save
          </button>
          {saved && (
            <span className="font-mono text-xs uppercase tracking-wide text-text-muted">
              Saved.
            </span>
          )}
        </div>
      </form>

      <p className="mt-6 max-w-2xl text-xs text-text-muted">
        Existing deep dives keep their old angles — use the Regenerate button
        on an entry to re-run it with your updated profile.
      </p>
    </main>
  );
}
