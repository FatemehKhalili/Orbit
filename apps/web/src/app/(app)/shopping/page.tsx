import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-10">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">Shopping</h1>
        <p className="text-muted-foreground mt-1">Keep a shopping list.</p>
      </header>

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
            <CardHeader>
              <CardTitle>Your list</CardTitle>
              <CardDescription>{summarize(items.data)}</CardDescription>
            </CardHeader>
            <CardContent>
              {items.data.length === 0 ? (
                <p className="text-muted-foreground text-sm" data-testid="shopping-empty">
                  Your shopping list is empty. Add the first item above.
                </p>
              ) : (
                <ul className="divide-y">
                  {items.data.map((item) => (
                    <ItemRow key={item.id} item={item} />
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </>
      ) : (
        <Card className="max-w-lg" data-testid="shopping-unavailable">
          <CardHeader>
            <CardTitle>Your shopping list could not be loaded</CardTitle>
            <CardDescription>
              Orbit could not reach its server. Try again in a moment.
            </CardDescription>
          </CardHeader>
        </Card>
      )}
    </main>
  );
}
