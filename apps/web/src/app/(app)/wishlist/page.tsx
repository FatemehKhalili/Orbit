import type { Metadata } from "next";

import { ModulePlaceholder } from "../module-placeholder";

export const metadata: Metadata = { title: "Wishlist · Orbit" };

export default function WishlistPage() {
  return <ModulePlaceholder name="Wishlist" purpose="Collect things you want, for yourself or as gift ideas." />;
}
