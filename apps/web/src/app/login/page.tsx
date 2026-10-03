import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth";

import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in · Orbit" };

export default async function LoginPage() {
  // Already signed in with a valid session: nothing to do here.
  if ((await getCurrentUser()).state === "authenticated") redirect("/");

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-2xl">Orbit</CardTitle>
          <CardDescription>Sign in to keep life in orbit.</CardDescription>
        </CardHeader>
        <CardContent>
          <LoginForm />
        </CardContent>
      </Card>
    </main>
  );
}
