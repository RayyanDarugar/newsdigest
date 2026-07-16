import type { Angle } from "@/lib/types";
import { Icon } from "@/components/icons";

export function AngleCard({ angle, index }: { angle: Angle; index: number }) {
  return (
    <article className="relative overflow-hidden rounded border border-border bg-surface p-4">
      <div className="mb-2 flex items-center gap-2">
        <span className="font-mono text-[10px] font-bold uppercase tracking-wide text-accent">
          Angle {index + 1}
        </span>
        <Icon name="bolt" className="h-3.5 w-3.5 flex-none text-accent" />
      </div>
      <h3 className="font-body font-semibold leading-snug">{angle.title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-text-muted">
        {angle.rationale}
      </p>
      <p className="mt-3 border-t border-border pt-3 text-sm leading-relaxed">
        <span className="font-mono text-[10px] font-bold uppercase tracking-wide text-text-muted">
          First move:{" "}
        </span>
        {angle.first_move}
      </p>
    </article>
  );
}
