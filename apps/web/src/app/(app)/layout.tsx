import Link from "next/link";

import { CloudIllustration } from "@/components/illustrations";
import { DownloadIcon, LogOutIcon } from "@/components/icons";
import { OrbitLogo } from "@/components/orbit-logo";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth";

import { logout } from "./actions";
import { NavLinks } from "./nav-links";

// The signed-in part of Orbit. Pages also call requireUser() themselves, because a
// layout is not re-rendered on client-side navigation.
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  if (!user) return <ApiUnavailable />;

  return (
    <div className="mx-auto flex w-full max-w-[88rem] flex-1 flex-col lg:flex-row lg:gap-2 lg:p-4">
      {/* Phones: a top bar with the modules in a scrolling row. Wide screens: a sidebar. */}
      <aside className="bg-sidebar/85 text-sidebar-foreground sticky top-0 z-10 flex shrink-0 flex-wrap items-center gap-x-3 gap-y-3 border-b px-4 pt-3 pb-3 backdrop-blur-md lg:top-4 lg:h-[calc(100dvh-2rem)] lg:w-64 lg:flex-col lg:flex-nowrap lg:items-stretch lg:gap-6 lg:rounded-[2rem] lg:border lg:px-4 lg:py-6 lg:shadow-card">
        <Link
          href="/"
          aria-label="Orbit, dashboard"
          className="order-1 me-auto rounded-2xl lg:me-0 lg:px-2"
        >
          <OrbitLogo />
        </Link>

        <div className="order-3 w-full lg:order-2">
          <NavLinks />
        </div>

        <div className="order-2 flex items-center gap-1.5 lg:order-3 lg:mt-auto lg:flex-col lg:items-stretch lg:gap-3 lg:rounded-3xl lg:border lg:bg-card lg:p-3 lg:shadow-soft">
          <div className="flex items-center gap-2.5 lg:px-1">
            <span
              aria-hidden
              className="bg-lavender-soft text-lavender-ink ring-card flex size-9 shrink-0 items-center justify-center rounded-full font-bold ring-2"
            >
              {initial(user.displayName)}
            </span>
            <span
              className="sr-only truncate text-sm font-semibold sm:not-sr-only"
              data-testid="current-user"
            >
              {user.displayName}
            </span>
          </div>
          <div className="flex items-center gap-1 lg:flex-col lg:items-stretch">
            {/* A plain link, not <Link>: a file download must never be prefetched. */}
            <a
              href="/account/export"
              className="text-muted-foreground hover:bg-secondary hover:text-secondary-foreground flex size-9 items-center justify-center gap-2 rounded-full text-sm font-medium transition-colors lg:h-9 lg:w-auto lg:justify-start lg:px-3"
              data-testid="export-link"
            >
              <DownloadIcon className="size-4 shrink-0" />
              <span className="sr-only lg:not-sr-only">Download my data</span>
            </a>
            <form action={logout} className="contents">
              <Button
                type="submit"
                variant="ghost"
                size="sm"
                className="text-muted-foreground size-9 px-0 lg:h-9 lg:w-auto lg:justify-start lg:px-3"
              >
                <LogOutIcon className="rtl:-scale-x-100" />
                <span className="sr-only lg:not-sr-only">Sign out</span>
              </Button>
            </form>
          </div>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}

/** The first letter of a name, for the avatar. */
function initial(name: string): string {
  return Array.from(name.trim())[0]?.toLocaleUpperCase() ?? "?";
}

function ApiUnavailable() {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <Card className="w-full max-w-sm items-center text-center" data-testid="api-unavailable">
        <div className="text-lavender-ink bg-lavender-soft flex size-20 items-center justify-center rounded-full text-5xl">
          <CloudIllustration />
        </div>
        <CardHeader className="justify-items-center">
          <CardTitle>Orbit is offline</CardTitle>
          <CardDescription>
            The web app could not reach the Orbit API to check your session. Try again in a moment.
          </CardDescription>
        </CardHeader>
      </Card>
    </main>
  );
}
