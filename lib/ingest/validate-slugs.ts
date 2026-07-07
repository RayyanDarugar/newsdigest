import type { IngestPayload } from "@/lib/ingest/schema";

export function validateSlugs(
  payload: IngestPayload,
  knownIndustries: Set<string>,
  knownCategories: Set<string>,
): { unknownIndustries: string[]; unknownCategories: string[] } {
  const unknownIndustries = new Set<string>();
  const unknownCategories = new Set<string>();

  for (const item of payload.items) {
    if (item.industry && !knownIndustries.has(item.industry)) {
      unknownIndustries.add(item.industry);
    }
  }
  for (const entry of payload.entries) {
    if (entry.industry && !knownIndustries.has(entry.industry)) {
      unknownIndustries.add(entry.industry);
    }
    if (!knownCategories.has(entry.category)) {
      unknownCategories.add(entry.category);
    }
  }

  return {
    unknownIndustries: [...unknownIndustries].sort(),
    unknownCategories: [...unknownCategories].sort(),
  };
}
