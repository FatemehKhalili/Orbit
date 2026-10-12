import { cn } from "@/lib/utils";

/**
 * Orbit's mark: a little lavender planet in a tilted plum ring, with a blush moon riding
 * the ring. The ring is drawn in two halves so it passes behind the planet and in front.
 */
export function OrbitMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={cn("size-8 shrink-0", className)}>
      <g transform="rotate(-20 16 16)" fill="none" strokeWidth="1.8" strokeLinecap="round">
        <path d="M3 16a13 4.6 0 0 1 26 0" stroke="var(--primary)" opacity="0.45" />
      </g>
      <circle cx="16" cy="16" r="8" fill="var(--lavender)" />
      <path
        d="M11.2 11.6a6.4 6.4 0 0 1 4.4-2.3"
        stroke="var(--card)"
        strokeWidth="1.6"
        strokeLinecap="round"
        fill="none"
        opacity="0.8"
      />
      <circle cx="19.5" cy="19" r="1.3" fill="var(--primary)" opacity="0.18" />
      <g transform="rotate(-20 16 16)" fill="none" strokeWidth="1.8" strokeLinecap="round">
        <path d="M29 16a13 4.6 0 0 1-26 0" stroke="var(--primary)" />
      </g>
      <circle
        cx="27.2"
        cy="9.6"
        r="2.3"
        fill="var(--blush)"
        stroke="var(--card)"
        strokeWidth="1.2"
      />
    </svg>
  );
}

/** The mark with the wordmark, for the sidebar and the sign-in page. */
export function OrbitLogo({ className, size = "md" }: { className?: string; size?: "md" | "lg" }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <OrbitMark className={size === "lg" ? "size-12" : "size-9"} />
      <span
        className={cn(
          "font-display font-bold tracking-tight text-primary",
          size === "lg" ? "text-3xl" : "text-xl",
        )}
      >
        orbit
      </span>
    </span>
  );
}
