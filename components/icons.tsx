export type IconName =
  | "bolt"
  | "globe"
  | "chat"
  | "cal"
  | "bars"
  | "target"
  | "doc";

/**
 * Renders once (in the root layout) so every <Icon> elsewhere can reference
 * these shapes by id via <use>, without re-declaring the paths per instance.
 */
export function IconSprite() {
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true" focusable="false">
      <defs>
        <g id="i-bolt">
          <path d="M9 1 3.5 9h4L6.5 15 13 6.5H9L9 1Z" fill="currentColor" />
        </g>
        <g id="i-globe">
          <circle cx="8" cy="8" r="6.25" fill="none" stroke="currentColor" strokeWidth="1.4" />
          <ellipse cx="8" cy="8" rx="2.8" ry="6.25" fill="none" stroke="currentColor" strokeWidth="1.4" />
          <line x1="1.8" y1="8" x2="14.2" y2="8" stroke="currentColor" strokeWidth="1.4" />
        </g>
        <g id="i-chat">
          <path
            d="M2.5 3.5h11v7.2H7.2L4 13.5v-2.8H2.5z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinejoin="round"
          />
        </g>
        <g id="i-cal">
          <rect x="2" y="3.2" width="12" height="10.8" rx="1.2" fill="none" stroke="currentColor" strokeWidth="1.4" />
          <line x1="2" y1="6.4" x2="14" y2="6.4" stroke="currentColor" strokeWidth="1.4" />
          <line x1="5.1" y1="1.4" x2="5.1" y2="4.4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          <line x1="10.9" y1="1.4" x2="10.9" y2="4.4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </g>
        <g id="i-bars">
          <line x1="3" y1="13.5" x2="3" y2="9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          <line x1="8" y1="13.5" x2="8" y2="4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          <line x1="13" y1="13.5" x2="13" y2="7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </g>
        <g id="i-target">
          <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="1.4" />
          <circle cx="8" cy="8" r="2.1" fill="currentColor" />
        </g>
        <g id="i-doc">
          <rect x="3" y="1.5" width="10" height="13" rx="1" fill="none" stroke="currentColor" strokeWidth="1.3" />
          <line x1="5" y1="5" x2="11" y2="5" stroke="currentColor" strokeWidth="1.1" />
          <line x1="5" y1="8" x2="11" y2="8" stroke="currentColor" strokeWidth="1.1" />
          <line x1="5" y1="11" x2="9" y2="11" stroke="currentColor" strokeWidth="1.1" />
        </g>
      </defs>
    </svg>
  );
}

export function Icon({ name, className }: { name: IconName; className?: string }) {
  return (
    <svg className={className} width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
      <use href={`#i-${name}`} />
    </svg>
  );
}
