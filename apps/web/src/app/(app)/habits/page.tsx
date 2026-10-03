import type { Metadata } from "next";

import { ModulePlaceholder } from "../module-placeholder";

export const metadata: Metadata = { title: "Habits · Orbit" };

export default function HabitsPage() {
  return <ModulePlaceholder name="Habits" purpose="Build and track routines." />;
}
