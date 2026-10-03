"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { MODULES } from "@/lib/routes";
import { cn } from "@/lib/utils";

export function NavLinks() {
  const pathname = usePathname();

  return (
    <nav aria-label="Modules" className="flex flex-wrap gap-1">
      {MODULES.map(({ name, href }) => {
        const active = pathname === href;
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm transition-colors",
              active ? "bg-secondary font-medium" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {name}
          </Link>
        );
      })}
    </nav>
  );
}
