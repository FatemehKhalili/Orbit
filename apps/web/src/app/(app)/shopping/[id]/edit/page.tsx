import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getSessionToken, requireUser } from "@/lib/auth";
import { LOGIN_PATH } from "@/lib/routes";
import { getShoppingItem } from "@/lib/shopping-api";

import { EditItemForm } from "./edit-item-form";

export const metadata: Metadata = { title: "Edit item · Shopping · Orbit" };

export default async function EditItemPage({ params }: PageProps<"/shopping/[id]/edit">) {
  const { id } = await params;
  const user = await requireUser();
  const token = await getSessionToken();
  // The API returns only the signed-in owner's own item; anything else is "not found".
  const result = user && token ? await getShoppingItem(token, id) : null;
  if (result && !result.ok && result.error === "unauthenticated") redirect(LOGIN_PATH);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-10">
      <h1 className="text-3xl font-semibold tracking-tight">Shopping</h1>
      {result?.ok ? (
        <Card>
          <CardHeader>
            <CardTitle>Edit item</CardTitle>
          </CardHeader>
          <CardContent>
            <EditItemForm item={result.data} />
          </CardContent>
        </Card>
      ) : (
        <Card className="max-w-lg" data-testid="shopping-item-missing">
          <CardHeader>
            <CardTitle>
              {result?.ok === false && result.error !== "unavailable"
                ? "This item does not exist"
                : "This item could not be loaded"}
            </CardTitle>
            <CardDescription>
              {result?.ok === false && result.error !== "unavailable"
                ? "It may have been deleted."
                : "Orbit could not reach its server. Try again in a moment."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/shopping" className={buttonVariants({ variant: "outline" })}>
              Back to the list
            </Link>
          </CardContent>
        </Card>
      )}
    </main>
  );
}
