import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { EmptyState } from "@/components/empty-state";
import { BasketIcon } from "@/components/icons";
import { BasketIllustration } from "@/components/illustrations";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UnavailableCard } from "@/components/unavailable-card";
import { getSessionToken, requireUser } from "@/lib/auth";
import { LOGIN_PATH } from "@/lib/routes";
import { summarize } from "@/lib/shopping";
import { listShoppingItems } from "@/lib/shopping-api";

import { AddItemForm } from "./add-item-form";
import { ItemRow } from "./item-row";

export const metadata: Metadata = { title: "Shopping · Orbit" };

export default async function ShoppingPage() {
  const user = await requireUser();
  const token = await getSessionToken();
  const items = user && token ? await listShoppingItems(token) : null;
  if (items && !items.ok && items.error === "unauthenticated") redirect(LOGIN_PATH);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-8 lg:py-10">
      <PageHeader
        title="Shopping"
        description="Keep a shopping list."
        icon={BasketIcon}
        tone="peach"
      />

      {items?.ok ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Add an item</CardTitle>
            </CardHeader>
            <CardContent>
              <AddItemForm />
            </CardContent>
          </Card>

          <Card data-testid="shopping-list">
            <CardHeader className="grid-cols-[1fr_auto] items-center">
              <CardTitle>Your list</CardTitle>
              <Badge variant="warning">{summarize(items.data)}</Badge>
            </CardHeader>
            <CardContent className="px-3 sm:px-4">
              {items.data.length === 0 ? (
                <EmptyState
                  tone="peach"
                  illustration={<BasketIllustration />}
                  title="Your basket is empty"
                  className="mx-3 sm:mx-2"
                  data-testid="shopping-empty"
                >
                  Your shopping list is empty. Add the first item above and it will wait here for
                  you.
                </EmptyState>
              ) : (
                <ul className="flex flex-col gap-1">
                  {items.data.map((item) => (
                    <ItemRow key={item.id} item={item} />
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </>
      ) : (
        <UnavailableCard
          data-testid="shopping-unavailable"
          title="Your shopping list could not be loaded"
          description="Orbit could not reach its server. Try again in a moment."
        />
      )}
    </main>
  );
}
