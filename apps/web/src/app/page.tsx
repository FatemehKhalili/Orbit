import { connection } from "next/server";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { checkApiHealth, type ApiHealth } from "@/lib/api-health";

// The MVP modules, shown as placeholders until each one is built.
const MODULES = ["Dashboard", "Finance", "Calendar", "Habits", "Shopping", "Wishlist"];

const API_STATUS: Record<ApiHealth["state"], { label: string; detail: string; ok: boolean }> = {
  online: { label: "Online", detail: "API and database are reachable.", ok: true },
  degraded: { label: "Degraded", detail: "API is up but cannot reach the database.", ok: false },
  offline: { label: "Offline", detail: "The API did not respond.", ok: false },
  unconfigured: { label: "Not configured", detail: "Set ORBIT_API_URL.", ok: false },
};

export default async function HomePage() {
  // Check the API on every request rather than once at build time.
  await connection();
  const health = await checkApiHealth();
  const status = API_STATUS[health.state];

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center gap-12 px-4 py-16">
      <header className="text-center">
        <h1 className="text-4xl font-semibold tracking-tight">Orbit</h1>
        <p className="text-muted-foreground mt-2">Keep life in orbit.</p>
      </header>

      <OrbitDiagram />

      <Card className="w-full max-w-sm" data-testid="api-status">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            Backend
            <Badge variant={status.ok ? "default" : "destructive"}>{status.label}</Badge>
          </CardTitle>
          <CardDescription>{status.detail}</CardDescription>
        </CardHeader>
        <CardContent className="text-muted-foreground text-xs">
          Checked server-side via <code>/health/ready</code>.
        </CardContent>
      </Card>
    </main>
  );
}

function OrbitDiagram() {
  const radius = 42; // percent of the container, from the centre

  return (
    <div className="relative aspect-square w-full max-w-sm" aria-label="Orbit modules">
      <div className="absolute inset-[8%] rounded-full border border-dashed" />
      <div className="bg-primary text-primary-foreground absolute top-1/2 left-1/2 flex size-24 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-sm font-medium">
        You
      </div>
      <ul>
        {MODULES.map((name, index) => {
          const angle = (index / MODULES.length) * 2 * Math.PI - Math.PI / 2;
          return (
            <li
              key={name}
              className="absolute -translate-x-1/2 -translate-y-1/2"
              style={{
                left: `${50 + radius * Math.cos(angle)}%`,
                top: `${50 + radius * Math.sin(angle)}%`,
              }}
            >
              <Badge variant="secondary" className="px-3 py-1 text-sm" title="Coming soon">
                {name}
              </Badge>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
