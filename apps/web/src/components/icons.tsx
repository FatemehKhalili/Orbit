import type { SVGProps } from "react";

/*
 * Orbit's small icon set: 24px grid, 1.75 stroke, round caps, drawn inline so there is
 * no icon dependency. Decorative by default; give one a label with aria-label and
 * role="img" when it stands alone.
 */
type IconProps = SVGProps<SVGSVGElement>;

function Icon({ children, ...props }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
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

export function HomeIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 11.2 12 4.5l8 6.7" />
      <path d="M6 9.8V18a1.5 1.5 0 0 0 1.5 1.5h9A1.5 1.5 0 0 0 18 18V9.8" />
      <path d="M10 19.5v-4.5a2 2 0 0 1 4 0v4.5" />
    </Icon>
  );
}

export function WalletIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="3.5" y="6" width="17" height="13" rx="3.5" />
      <path d="M3.5 10h17" />
      <path d="M7 6V5.5A1.5 1.5 0 0 1 8.9 4l7 1.9" />
      <circle cx="16.5" cy="14.5" r="1" fill="currentColor" stroke="none" />
    </Icon>
  );
}

export function CalendarIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="3.5" y="5" width="17" height="15" rx="3.5" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
      <circle cx="12" cy="15" r="1.2" fill="currentColor" stroke="none" />
    </Icon>
  );
}

export function SproutIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 20v-8" />
      <path d="M12 12c0-3.5-2.5-6-6.5-6 0 3.5 2.5 6 6.5 6Z" />
      <path d="M12 14c0-3.3 2.2-5.5 6-5.5 0 3.3-2.2 5.5-6 5.5Z" />
      <path d="M8 20h8" />
    </Icon>
  );
}

export function BasketIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 10h16l-1.6 8a2 2 0 0 1-2 1.5H7.6a2 2 0 0 1-2-1.5L4 10Z" />
      <path d="m8.5 10 2-5.5M15.5 10l-2-5.5" />
      <path d="M9.5 14v2.5M14.5 14v2.5" />
    </Icon>
  );
}

export function GiftIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="4" y="9" width="16" height="11" rx="2.5" />
      <path d="M3.5 9h17M12 9v11" />
      <path d="M12 9c-1.5-3.5-5-4-5-1.8C7 8.6 9.3 9 12 9Zm0 0c1.5-3.5 5-4 5-1.8C17 8.6 14.7 9 12 9Z" />
    </Icon>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <Icon strokeWidth={2.5} {...props}>
      <path d="m5.5 12.5 4 4 9-9" />
    </Icon>
  );
}

export function PlusIcon(props: IconProps) {
  return (
    <Icon strokeWidth={2.25} {...props}>
      <path d="M12 5.5v13M5.5 12h13" />
    </Icon>
  );
}

export function PencilIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M14.5 5.5 18.5 9.5" />
      <path d="M5 19l1-4.5L15.8 4.7a1.8 1.8 0 0 1 2.5 0l1 1a1.8 1.8 0 0 1 0 2.5L9.5 18 5 19Z" />
    </Icon>
  );
}

export function TrashIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4.5 7h15M10 4h4" />
      <path d="M6.5 7l.8 11.2A2 2 0 0 0 9.3 20h5.4a2 2 0 0 0 2-1.8L17.5 7" />
    </Icon>
  );
}

export function ArchiveIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="3.5" y="4.5" width="17" height="5" rx="1.5" />
      <path d="M5 9.5V18a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 18V9.5" />
      <path d="M10 13h4" />
    </Icon>
  );
}

export function RestoreIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3L4.5 9" />
      <path d="M4.5 4.5V9H9" />
    </Icon>
  );
}

export function DownloadIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 4.5v10M7.5 10.5 12 15l4.5-4.5" />
      <path d="M5 19.5h14" />
    </Icon>
  );
}

export function LogOutIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M14 4.5h3.5A2 2 0 0 1 19.5 6.5v11a2 2 0 0 1-2 2H14" />
      <path d="M10 8l-4 4 4 4M6 12h9" />
    </Icon>
  );
}

/** Points "back"; flips in right-to-left layouts. */
export function ArrowBackIcon(props: IconProps) {
  return (
    <Icon {...props} className={["rtl:-scale-x-100", props.className].filter(Boolean).join(" ")}>
      <path d="M19 12H5.5M11 6l-6 6 6 6" />
    </Icon>
  );
}

/** Points "forward"; flips in right-to-left layouts. */
export function ArrowForwardIcon(props: IconProps) {
  return (
    <Icon {...props} className={["rtl:-scale-x-100", props.className].filter(Boolean).join(" ")}>
      <path d="M5 12h13.5M13 6l6 6-6 6" />
    </Icon>
  );
}

export function AlertIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5v5" />
      <circle cx="12" cy="16" r="0.9" fill="currentColor" stroke="none" />
    </Icon>
  );
}

export function HeartIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 19.5s-7.5-4.4-7.5-10A4 4 0 0 1 12 7.3a4 4 0 0 1 7.5 2.2c0 5.6-7.5 10-7.5 10Z" />
    </Icon>
  );
}
