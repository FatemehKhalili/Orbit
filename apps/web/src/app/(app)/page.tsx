import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import type { ReactNode } from "react";

import { EmptyState } from "@/components/empty-state";
import { ArrowForwardIcon, BasketIcon, SproutIcon } from "@/components/icons";
import { SeedlingIllustration } from "@/components/illustrations";
import { MODULE_LOOK, TONES, type Tone } from "@/components/modules";
import { Badge, BadgeDot } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { checkApiHealth, type ApiHealth } from "@/lib/api-health";
import { getSessionToken, requireUser } from "@/lib/auth";
import {
  allDoneToday,
  countDoneToday,
  formatLongDate,
  weekActivity,
  type DayActivity,
} from "@/lib/habits";
import { getTime, listHabits } from "@/lib/habits-api";
import { LOGIN_PATH, MODULES } from "@/lib/routes";
import { countToBuy } from "@/lib/shopping";
import { listShoppingItems } from "@/lib/shopping-api";
import { cn } from "@/lib/utils";

const API_STATUS: Record<
  ApiHealth["state"],
  { label: string; detail: string; variant: "success" | "warning" | "destructive" }
> = {
  online: { label: "Online", detail: "API and database are reachable.", variant: "success" },
  degraded: {
    label: "Degraded",
    detail: "API is up but cannot reach the database.",
    variant: "warning",
  },
  offline: { label: "Offline", detail: "The API did not respond.", variant: "destructive" },
  unconfigured: { label: "Not configured", detail: "Set ORBIT_API_URL.", variant: "warning" },
};

export default async function DashboardPage() {
  // Check the API on every request rather than once at build time.
  await connection();
  const user = await requireUser();
  const token = await getSessionToken();
  const [health, time, habits, items] = await Promise.all([
    checkApiHealth(),
    user && token ? getTime(token) : null,
    user && token ? listHabits(token) : null,
    user && token ? listShoppingItems(token) : null,
  ]);
  if (
    [time, habits, items].some(
      (result) => result && !result.ok && result.error === "unauthenticated",
    )
  ) {
    redirect(LOGIN_PATH);
  }
  const status = API_STATUS[health.state];
  const today = time?.ok ? time.data.today : null;
  const habitList = habits?.ok ? habits.data : null;
  const itemList = items?.ok ? items.data : null;

  const doneToday = today && habitList ? countDoneToday(habitList, today) : 0;
  const toBuy = itemList ? countToBuy(itemList) : 0;

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-8 lg:px-8 lg:py-10">
      <header className="from-lavender-soft via-card to-blush-soft relative overflow-hidden rounded-[2rem] border bg-linear-to-br px-6 py-8 shadow-card sm:px-8">
        <div className="relative z-[1] flex max-w-md flex-col gap-2">
          {today && (
            <p className="text-lavender-ink text-sm font-semibold" data-testid="dashboard-today">
              {formatLongDate(today)}
            </p>
          )}
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Hello{user ? `, ${user.displayName}` : ""}
          </h1>
          <p className="text-muted-foreground">
            Keep life in orbit. Here is how things look today.
          </p>
        </div>
        <HeroPlanet />
      </header>

      <section aria-label="At a glance" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <MetricCard
          href="/habits"
          tone="mint"
          icon={<SproutIcon />}
          label="Habits today"
          value={habitList && today ? `${doneToday} of ${habitList.length}` : "–"}
          detail={
            !habitList || !today
              ? "Could not be loaded right now."
              : habitList.length === 0
                ? "Plant your first habit."
                : allDoneToday(habitList, today)
                  ? "All done. Lovely work!"
                  : `${habitList.length - doneToday} still to go.`
          }
          progress={habitList?.length ? doneToday / habitList.length : null}
        />
        <MetricCard
          href="/shopping"
          tone="peach"
          icon={<BasketIcon />}
          label="Shopping list"
          value={itemList ? `${toBuy} to buy` : "–"}
          detail={
            !itemList
              ? "Could not be loaded right now."
              : itemList.length === 0
                ? "Your list is empty."
                : `${itemList.length - toBuy} already in the basket.`
          }
          progress={itemList?.length ? (itemList.length - toBuy) / itemList.length : null}
        />
        <Card className="gap-3 sm:col-span-2 lg:col-span-1" data-testid="api-status">
          <CardHeader>
            <CardTitle className="flex items-center justify-between gap-2 text-base">
              Backend
              <Badge variant={status.variant}>
                <BadgeDot
                  className={health.state === "online" ? "motion-safe:animate-pulse" : ""}
                />
                {status.label}
              </Badge>
            </CardTitle>
            <CardDescription>{status.detail}</CardDescription>
          </CardHeader>
          <CardContent className="text-muted-foreground text-xs">
            Checked server-side via{" "}
            <code className="bg-sunken rounded-md px-1.5 py-0.5">/health/ready</code>.
          </CardContent>
        </Card>
      </section>

      <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
        <Card>
          <CardHeader>
            <CardTitle>This week</CardTitle>
            <CardDescription>Habits checked off on each of the last seven days.</CardDescription>
          </CardHeader>
          <CardContent>
            {habitList && today ? (
              habitList.length === 0 ? (
                <EmptyState
                  tone="mint"
                  illustration={<SeedlingIllustration />}
                  title="Your week will bloom here"
                >
                  Add a habit and check it off; each day fills up as you go.{" "}
                  <Link
                    href="/habits"
                    className="text-primary font-semibold underline-offset-4 hover:underline"
                  >
                    Start a habit
                  </Link>
                </EmptyState>
              ) : (
                <WeekChart days={weekActivity(habitList, today)} total={habitList.length} />
              )
            ) : (
              <p className="text-muted-foreground text-sm">
                Your habits could not be loaded right now.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Your orbit</CardTitle>
            <CardDescription>Everything Orbit looks after, circling you.</CardDescription>
          </CardHeader>
          <CardContent>
            <OrbitDiagram />
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

function MetricCard({
  href,
  tone,
  icon,
  label,
  value,
  detail,
  progress,
}: {
  href: string;
  tone: Tone;
  icon: ReactNode;
  label: string;
  value: string;
  detail: string;
  progress: number | null;
}) {
  return (
    <Link
      href={href}
      className="group bg-card relative flex flex-col gap-4 overflow-hidden rounded-3xl border p-6 shadow-card transition-all duration-300 hover:-translate-y-1 hover:shadow-lift focus-visible:-translate-y-1"
    >
      <span
        aria-hidden
        className={cn(
          "absolute -end-8 -top-8 size-28 rounded-full opacity-70 transition-transform duration-500 group-hover:scale-125",
          TONES[tone].soft,
        )}
      />
      <div className="relative flex items-center justify-between gap-3">
        <span className="text-muted-foreground text-sm font-semibold">{label}</span>
        <span
          className={cn(
            "flex size-10 items-center justify-center rounded-2xl text-xl transition-transform duration-300 group-hover:rotate-[-8deg]",
            TONES[tone].soft,
            TONES[tone].ink,
          )}
        >
          {icon}
        </span>
      </div>
      <div className="relative flex flex-col gap-1">
        <span className="font-display text-3xl font-bold tracking-tight">{value}</span>
        <span className="text-muted-foreground text-sm">{detail}</span>
      </div>
      <div className="relative flex items-center gap-3">
        <div
          className="bg-sunken h-2 flex-1 overflow-hidden rounded-full"
          role={progress === null ? undefined : "progressbar"}
          aria-label={progress === null ? undefined : label}
          aria-valuemin={progress === null ? undefined : 0}
          aria-valuemax={progress === null ? undefined : 100}
          aria-valuenow={progress === null ? undefined : Math.round(progress * 100)}
        >
          <div
            className={cn("h-full rounded-full transition-[width] duration-700", TONES[tone].fill)}
            style={{ width: `${Math.round((progress ?? 0) * 100)}%` }}
          />
        </div>
        <ArrowForwardIcon className="text-muted-foreground size-4 transition-transform duration-300 group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5" />
      </div>
    </Link>
  );
}

/** Seven soft bars, one per day; today's is peach. */
function WeekChart({ days, total }: { days: DayActivity[]; total: number }) {
  return (
    <ol
      className="flex h-48 items-end gap-2 sm:gap-3"
      aria-label="Habits done per day, last seven days"
    >
      {days.map((day) => {
        const share = total ? day.done / total : 0;
        return (
          <li key={day.day} className="flex h-full flex-1 flex-col items-center gap-2">
            <span className="sr-only">
              {day.label}
              {day.isToday ? " (today)" : ""}: {day.done} of {total} done
            </span>
            <span aria-hidden className="text-muted-foreground text-xs font-semibold tabular-nums">
              {day.done}
            </span>
            <div
              aria-hidden
              className="bg-sunken relative flex w-full max-w-12 flex-1 items-end overflow-hidden rounded-xl"
            >
              <div
                className={cn(
                  "w-full rounded-xl transition-[height] duration-700",
                  day.isToday ? "bg-peach" : "bg-mint",
                  day.done === 0 && "opacity-0",
                )}
                style={{ height: `${Math.max(share * 100, day.done ? 12 : 0)}%` }}
              />
            </div>
            <span
              aria-hidden
              className={cn(
                "flex flex-col items-center text-xs leading-tight",
                day.isToday ? "text-peach-ink font-bold" : "text-muted-foreground",
              )}
            >
              {day.weekday}
              <span className="font-semibold">{day.dayOfMonth}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function HeroPlanet() {
  return (
    <svg
      viewBox="0 0 200 140"
      aria-hidden
      className="pointer-events-none absolute end-2 -bottom-4 hidden h-44 sm:block rtl:-scale-x-100"
    >
      <ellipse
        cx="110"
        cy="78"
        rx="84"
        ry="24"
        transform="rotate(-14 110 78)"
        fill="none"
        stroke="var(--primary)"
        strokeOpacity="0.18"
        strokeWidth="2"
        strokeDasharray="2 7"
        strokeLinecap="round"
      />
      <circle cx="110" cy="78" r="36" fill="var(--lavender)" fillOpacity="0.55" />
      <path
        d="M88 62a28 28 0 0 1 18-12"
        stroke="var(--card)"
        strokeWidth="5"
        strokeLinecap="round"
        fill="none"
        opacity="0.7"
      />
      <ellipse
        cx="110"
        cy="78"
        rx="62"
        ry="15"
        transform="rotate(-14 110 78)"
        fill="none"
        stroke="var(--primary)"
        strokeOpacity="0.35"
        strokeWidth="3"
      />
      <circle cx="176" cy="42" r="8" fill="var(--blush)" />
      <circle cx="38" cy="30" r="3" fill="var(--peach)" />
      <circle cx="60" cy="118" r="2" fill="var(--mint)" />
    </svg>
  );
}

function OrbitDiagram() {
  const radius = 40; // percent of the container, from the centre

  return (
    <div
      className="relative mx-auto aspect-square w-full max-w-xs"
      aria-label="Orbit modules"
      role="group"
    >
      <div className="border-border-strong absolute inset-[10%] rounded-full border-2 border-dashed" />
      {/* A tiny moon travelling the ring. */}
      <div aria-hidden className="motion-safe:animate-orbit absolute inset-[10%]">
        <span className="bg-blush ring-card absolute top-0 left-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2" />
      </div>
      <div className="bg-lavender-soft text-lavender-ink absolute top-1/2 left-1/2 flex size-22 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full font-display text-sm font-bold shadow-[inset_-8px_-8px_0_0_rgb(255_255_255/0.25)]">
        You
      </div>
      <ul>
        {MODULES.map(({ name, href }, index) => {
          const angle = (index / MODULES.length) * 2 * Math.PI - Math.PI / 2;
          const { icon: Icon, tone } = MODULE_LOOK[href];
          return (
            <li
              key={href}
              className="absolute -translate-x-1/2 -translate-y-1/2"
              style={{
                left: `${50 + radius * Math.cos(angle)}%`,
                top: `${50 + radius * Math.sin(angle)}%`,
              }}
            >
              <Link
                href={href}
                className={cn(
                  "bg-card flex items-center gap-1.5 rounded-full border py-1 ps-1 pe-2.5 text-xs font-semibold shadow-soft transition-all duration-200 hover:-translate-y-0.5 hover:shadow-card",
                )}
              >
                <span
                  className={cn(
                    "flex size-5 items-center justify-center rounded-full text-[0.8rem]",
                    TONES[tone].soft,
                    TONES[tone].ink,
                  )}
                >
                  <Icon />
                </span>
                {name}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
