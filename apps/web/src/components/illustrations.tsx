import type { SVGProps } from "react";

/*
 * Small spot illustrations for empty and waiting states. They draw in currentColor (the
 * tone's ink) with soft fills, size with the font, and are always decorative.
 */
type Props = SVGProps<SVGSVGElement>;

function Spot({ children, ...props }: Props) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 48 48"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      width="1em"
      height="1em"
      {...props}
    >
      {children}
    </svg>
  );
}

/** A sleepy cloud: Orbit cannot reach its server. */
export function CloudIllustration(props: Props) {
  return (
    <Spot {...props}>
      <path
        d="M14 34h21a8 8 0 0 0 .8-16A11 11 0 0 0 14.6 20 7 7 0 0 0 14 34Z"
        fill="currentColor"
        fillOpacity="0.14"
      />
      <path d="M19 26.5q1.5 1.5 3 0M27 26.5q1.5 1.5 3 0" />
      <path d="M36 9h4l-4 4h4" strokeWidth={1.6} />
    </Spot>
  );
}

/** An empty basket with a little heart: nothing on the shopping list. */
export function BasketIllustration(props: Props) {
  return (
    <Spot {...props}>
      <path
        d="M9 20h30l-3.2 15.5A3 3 0 0 1 32.9 38H15.1a3 3 0 0 1-2.9-2.5L9 20Z"
        fill="currentColor"
        fillOpacity="0.14"
      />
      <path d="M17 20l5-9M31 20l-5-9" />
      <path
        d="M24 32.5s-4.5-2.6-4.5-5.6a2.3 2.3 0 0 1 4.5-.8 2.3 2.3 0 0 1 4.5.8c0 3-4.5 5.6-4.5 5.6Z"
        fill="currentColor"
        fillOpacity="0.35"
        strokeWidth={1.6}
      />
    </Spot>
  );
}

/** A seedling in a pot: no habits yet. */
export function SeedlingIllustration(props: Props) {
  return (
    <Spot {...props}>
      <path
        d="M15 30h18l-2 9a2 2 0 0 1-2 1.5H19a2 2 0 0 1-2-1.5l-2-9Z"
        fill="currentColor"
        fillOpacity="0.14"
      />
      <path d="M24 30v-9" />
      <path d="M24 21c0-5-3.5-8.5-9-8.5 0 5 3.5 8.5 9 8.5Z" fill="currentColor" fillOpacity="0.3" />
      <path d="M24 23c0-4.4 3-7.5 8-7.5 0 4.4-3 7.5-8 7.5Z" fill="currentColor" fillOpacity="0.3" />
    </Spot>
  );
}

/** A closed box: nothing archived. */
export function BoxIllustration(props: Props) {
  return (
    <Spot {...props}>
      <path d="M10 18l14-7 14 7v14l-14 7-14-7V18Z" fill="currentColor" fillOpacity="0.14" />
      <path d="M10 18l14 7 14-7M24 25v14" />
      <path d="M17 14.5l14 7" strokeWidth={1.6} />
    </Spot>
  );
}

/** A small planet with a moon on its way: a module that is coming later. */
export function PlanetIllustration(props: Props) {
  return (
    <Spot {...props}>
      <ellipse
        cx="24"
        cy="26"
        rx="19"
        ry="6.5"
        transform="rotate(-18 24 26)"
        strokeOpacity="0.45"
      />
      <circle cx="24" cy="26" r="10" fill="currentColor" fillOpacity="0.2" />
      <path d="M17.5 21.5a8 8 0 0 1 5-3" strokeWidth={1.6} />
      <circle cx="39" cy="12" r="3" fill="currentColor" fillOpacity="0.35" />
    </Spot>
  );
}
