"use client";

import Link from "next/link";
import { useActionState } from "react";

import { FormMessage } from "@/components/form-message";
import { CheckIcon, PencilIcon, TrashIcon } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { IDLE } from "@/lib/shopping";
import type { ShoppingItem } from "@/lib/shopping-api";
import { cn } from "@/lib/utils";

import { deleteItem, toggleItem } from "./actions";

/** One item: check it off, edit it or delete it. Each control is its own small form. */
export function ItemRow({ item }: { item: ShoppingItem }) {
  const [toggleState, toggle, toggling] = useActionState(toggleItem, IDLE);
  const [deleteState, remove, deleting] = useActionState(deleteItem, IDLE);
  // While the change is on its way, show where it is going.
  const checked = toggling ? !item.checked : item.checked;
  const failure = [toggleState, deleteState].find((state) => state.status === "error");

  return (
    <li
      className="hover:bg-sunken/70 flex flex-col gap-1 rounded-2xl px-3 py-3 transition-colors"
      data-testid="shopping-item"
      data-checked={checked}
    >
      <div className="flex items-start gap-3">
        <form action={toggle} data-testid={`toggle-item-${item.id}`}>
          <input type="hidden" name="id" value={item.id} />
          <input type="hidden" name="checked" value={String(!item.checked)} />
          <button
            type="submit"
            disabled={toggling || deleting}
            aria-label={`Mark “${item.name}” as ${item.checked ? "not bought" : "bought"}`}
            className={cn(
              "flex size-6 shrink-0 items-center justify-center rounded-full border-2 transition-all duration-200 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card active:scale-90",
              checked
                ? "bg-mint border-mint text-mint-foreground"
                : "border-border-strong bg-card hover:border-mint hover:bg-mint-soft",
            )}
          >
            {checked && <CheckIcon className="motion-safe:animate-pop size-3.5" />}
          </button>
        </form>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                "font-medium break-words transition-colors",
                checked && "text-muted-foreground decoration-blush line-through decoration-2",
              )}
              data-testid="shopping-item-name"
            >
              {item.name}
            </span>
            {item.quantity && <Badge variant="secondary">{item.quantity}</Badge>}
          </div>
          {item.notes && (
            <p className="text-muted-foreground text-sm break-words whitespace-pre-line">
              {item.notes}
            </p>
          )}
        </div>
        <div className="-my-1 flex shrink-0 items-center gap-0.5">
          <Link
            href={`/shopping/${item.id}/edit`}
            className={buttonVariants({ variant: "ghost", size: "sm" })}
            aria-label={`Edit “${item.name}”`}
          >
            <PencilIcon />
            <span className="hidden sm:inline">Edit</span>
          </Link>
          <form action={remove} data-testid={`delete-item-${item.id}`}>
            <input type="hidden" name="id" value={item.id} />
            <Button
              type="submit"
              variant="destructive"
              size="sm"
              disabled={deleting}
              aria-label={`Delete “${item.name}”`}
            >
              <TrashIcon />
              <span className="hidden sm:inline">{deleting ? "Deleting…" : "Delete"}</span>
            </Button>
          </form>
        </div>
      </div>
      {failure && <FormMessage state={failure} />}
    </li>
  );
}
