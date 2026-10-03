import type { Metadata } from "next";

import { ModulePlaceholder } from "../module-placeholder";

export const metadata: Metadata = { title: "Finance · Orbit" };

export default function FinancePage() {
  return <ModulePlaceholder name="Finance" purpose="Track money in and out." />;
}
