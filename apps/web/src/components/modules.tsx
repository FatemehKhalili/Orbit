import type { ComponentType, SVGProps } from "react";

import {
  BasketIcon,
  CalendarIcon,
  GiftIcon,
  HomeIcon,
  SproutIcon,
  WalletIcon,
} from "@/components/icons";
import { MODULES } from "@/lib/routes";

/** The pastel tones. Class names are spelled out so Tailwind finds them. */
export const TONES = {
  lavender: {
    soft: "bg-lavender-soft",
    ink: "text-lavender-ink",
    fill: "bg-lavender",
    ring: "ring-lavender/40",
  },
  mint: { soft: "bg-mint-soft", ink: "text-mint-ink", fill: "bg-mint", ring: "ring-mint/40" },
  peach: { soft: "bg-peach-soft", ink: "text-peach-ink", fill: "bg-peach", ring: "ring-peach/40" },
  blush: { soft: "bg-blush-soft", ink: "text-blush-ink", fill: "bg-blush", ring: "ring-blush/40" },
} as const;

export type Tone = keyof typeof TONES;

type ModuleHref = (typeof MODULES)[number]["href"];

/** How each module looks: its icon, its tone, and whether it has content yet. */
export const MODULE_LOOK: Record<
  ModuleHref,
  { icon: ComponentType<SVGProps<SVGSVGElement>>; tone: Tone; ready: boolean }
> = {
  "/": { icon: HomeIcon, tone: "lavender", ready: true },
  "/finance": { icon: WalletIcon, tone: "mint", ready: false },
  "/calendar": { icon: CalendarIcon, tone: "lavender", ready: false },
  "/habits": { icon: SproutIcon, tone: "mint", ready: true },
  "/shopping": { icon: BasketIcon, tone: "peach", ready: true },
  "/wishlist": { icon: GiftIcon, tone: "blush", ready: false },
};
