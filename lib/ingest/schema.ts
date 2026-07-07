import { z } from "zod";

export const ingestItemSchema = z.object({
  key: z.string().min(1),
  industry: z.string().min(1).nullish(),
  source_type: z.enum(["reddit", "news", "market"]),
  title: z.string().min(1),
  url: z.string().url().nullish(),
  summary: z.string().nullish(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  position: z.number().int().min(0),
});

export const ingestEntrySchema = z.object({
  category: z.string().min(1),
  industry: z.string().min(1).nullish(),
  title: z.string().min(1),
  body: z.string().min(1),
  position: z.number().int().min(0),
  source_refs: z.array(z.string().min(1)).default([]),
});

export const ingestPayloadSchema = z
  .object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD"),
    entries: z.array(ingestEntrySchema),
    items: z.array(ingestItemSchema),
  })
  .superRefine((payload, ctx) => {
    const keys = new Set<string>();
    payload.items.forEach((item, i) => {
      if (keys.has(item.key)) {
        ctx.addIssue({
          code: "custom",
          path: ["items", i, "key"],
          message: `duplicate item key: ${item.key}`,
        });
      }
      keys.add(item.key);
    });
    payload.entries.forEach((entry, i) => {
      entry.source_refs.forEach((ref, j) => {
        if (!keys.has(ref)) {
          ctx.addIssue({
            code: "custom",
            path: ["entries", i, "source_refs", j],
            message: `source_ref does not match any item key: ${ref}`,
          });
        }
      });
    });
  });

export type IngestItem = z.infer<typeof ingestItemSchema>;
export type IngestEntry = z.infer<typeof ingestEntrySchema>;
export type IngestPayload = z.infer<typeof ingestPayloadSchema>;
