import Link from "next/link";

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
    <div className="flex flex-1 flex-col">
      <header className="border-b">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex flex-wrap items-center gap-4">
            <Link href="/" className="font-semibold tracking-tight">
              Orbit
            </Link>
            <NavLinks />
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-muted-foreground" data-testid="current-user">
              {user.displayName}
            </span>
            <form action={logout}>
              <Button type="submit" variant="outline" size="sm">
                Sign out
              </Button>
            </form>
          </div>
        </div>
      </header>
      {children}
    </div>
  );
}

function ApiUnavailable() {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <Card className="w-full max-w-sm" data-testid="api-unavailable">
        <CardHeader>
          <CardTitle>Orbit is offline</CardTitle>
          <CardDescription>
            The web app could not reach the Orbit API to check your session. Try again in a
            moment.
          </CardDescription>
        </CardHeader>
      </Card>
    </main>
  );
}
