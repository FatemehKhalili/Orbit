import type { Metadata } from "next";

import { ModulePlaceholder } from "../module-placeholder";

export const metadata: Metadata = { title: "Calendar · Orbit" };

export default function CalendarPage() {
  return <ModulePlaceholder name="Calendar" purpose="See and plan time." />;
}
