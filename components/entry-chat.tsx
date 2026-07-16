"use client";

export function EntryChat({
  entryId,
  enabled,
}: {
  entryId: string;
  enabled: boolean;
}) {
  void entryId;
  return (
    <p className="text-sm text-text-muted">
      {enabled ? "Chat coming in the next task." : "Chat unlocks once the deep dive finishes."}
    </p>
  );
}
