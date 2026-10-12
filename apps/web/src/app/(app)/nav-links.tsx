"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

import { MODULE_LOOK, TONES } from "@/components/modules";
import { isActiveModule, MODULES } from "@/lib/routes";
import { cn } from "@/lib/utils";

export function NavLinks() {
  const pathname = usePathname();
  const list = useRef<HTMLUListElement>(null);

  // On phones the modules scroll sideways: keep the current one in view.
  useEffect(() => {
    list.current
      ?.querySelector('[aria-current="page"]')
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [pathname]);

  return (
    <nav aria-label="Modules">
      <ul
        ref={list}
        className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-0.5 [scrollbar-width:none] lg:mx-0 lg:flex-col lg:gap-1 lg:overflow-visible lg:px-0"
      >
        {MODULES.map(({ name, href }) => {
          const active = isActiveModule(pathname, href);
          const { icon: Icon, tone, ready } = MODULE_LOOK[href];
          return (
            <li key={href} className="shrink-0">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "group flex items-center gap-2.5 rounded-full py-1.5 ps-1.5 pe-3.5 text-sm font-medium transition-all duration-200 lg:rounded-2xl lg:py-2 lg:ps-2",
                  active
                    ? "bg-sidebar-active text-foreground shadow-soft font-semibold"
                    : "text-sidebar-foreground/80 hover:bg-sidebar-active/70 hover:text-foreground",
                )}
              >
                <span
                  className={cn(
                    "flex size-7 shrink-0 items-center justify-center rounded-full text-base transition-transform duration-200 group-hover:scale-110 lg:size-8 lg:rounded-xl",
                    active ? [TONES[tone].soft, TONES[tone].ink] : "text-muted-foreground",
                  )}
                >
                  <Icon />
                </span>
                {name}
                {!ready && (
                  <span className="bg-peach-soft text-peach-ink ms-auto hidden rounded-full px-2 py-0.5 text-[0.6875rem] font-semibold lg:inline">
                    soon
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
