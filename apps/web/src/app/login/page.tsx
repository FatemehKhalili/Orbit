import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { OrbitLogo } from "@/components/orbit-logo";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth";

import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in · Orbit" };

export default async function LoginPage() {
  // Already signed in with a valid session: nothing to do here.
  if ((await getCurrentUser()).state === "authenticated") redirect("/");

  return (
    <main className="relative flex flex-1 items-center justify-center overflow-hidden px-4 py-16">
      <OrbitBackdrop />
      <div className="relative flex w-full max-w-sm flex-col items-center gap-6">
        <OrbitLogo size="lg" />
        <Card className="w-full gap-6 py-8">
          <CardHeader className="justify-items-center px-8 text-center">
            <CardTitle className="text-2xl">Welcome back</CardTitle>
            <CardDescription>Sign in to keep life in orbit.</CardDescription>
          </CardHeader>
          <CardContent className="px-8">
            <LoginForm />
          </CardContent>
        </Card>
        <p className="text-muted-foreground text-center text-xs">
          Your own little corner for money, time, habits and lists.
        </p>
      </div>
    </main>
  );
}

/** Soft concentric rings and a few pastel moons behind the sign-in card. */
function OrbitBackdrop() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 flex items-center justify-center"
    >
      <div className="border-lavender/35 absolute size-[34rem] rounded-full border" />
      <div className="border-lavender/25 absolute size-[48rem] rounded-full border border-dashed" />
      <div className="border-blush/20 absolute size-[64rem] rounded-full border" />
      <div className="motion-safe:animate-orbit absolute size-[34rem]">
        <span className="bg-blush absolute top-1/2 -left-2 size-4 rounded-full" />
      </div>
      <div className="motion-safe:animate-orbit absolute size-[48rem] [animation-duration:60s] [animation-direction:reverse]">
        <span className="bg-mint absolute top-0 left-1/2 size-3 rounded-full" />
      </div>
      <span className="bg-peach absolute top-[18%] right-[22%] size-2 rounded-full" />
      <div className="bg-lavender-soft absolute size-[22rem] rounded-full opacity-70 blur-3xl" />
    </div>
  );
}
