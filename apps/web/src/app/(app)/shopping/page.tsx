import type { Metadata } from "next";

import { ModulePlaceholder } from "../module-placeholder";

export const metadata: Metadata = { title: "Shopping · Orbit" };

export default function ShoppingPage() {
  return <ModulePlaceholder name="Shopping" purpose="Keep shopping lists." />;
}
