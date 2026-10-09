"use client";

import Link from "next/link";
import { useActionState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { IDLE } from "@/lib/shopping";
import type { ShoppingItem } from "@/lib/shopping-api";
import { cn } from "@/lib/utils";

import { deleteItem, toggleItem } from "./actions";
import { FormMessage } from "./form-message";

/** One item: check it off, edit it or delete it. Each control is its own small form. */
export function ItemRow({ item }: { item: ShoppingItem }) {
  const [toggleState, toggle, toggling] = useActionState(toggleItem, IDLE);
  const [deleteState, remove, deleting] = useActionState(deleteItem, IDLE);
  // While the change is on its way, show where it is going.
  const checked = toggling ? !item.checked : item.checked;
  const failure = [toggleState, deleteState].find((state) => state.status === "error");

  return (
    <li className="flex flex-col gap-1 py-3" data-testid="shopping-item" data-checked={checked}>
      <div className="flex items-start gap-3">
        <form action={toggle} data-testid={`toggle-item-${item.id}`}>
          <input type="hidden" name="id" value={item.id} />
          <input type="hidden" name="checked" value={String(!item.checked)} />
          <button
            type="submit"
            disabled={toggling || deleting}
            aria-label={`Mark “${item.name}” as ${item.checked ? "not bought" : "bought"}`}
            className={cn(
              "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded border text-xs transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
              checked ? "bg-primary text-primary-foreground border-primary" : "hover:bg-secondary",
            )}
          >
            {checked ? "✓" : ""}
          </button>
        </form>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn("break-words", checked && "text-muted-foreground line-through")}
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
        <div className="flex shrink-0 items-center gap-1">
          <Link
            href={`/shopping/${item.id}/edit`}
            className={buttonVariants({ variant: "ghost", size: "sm" })}
            aria-label={`Edit “${item.name}”`}
          >
            Edit
          </Link>
          <form action={remove} data-testid={`delete-item-${item.id}`}>
            <input type="hidden" name="id" value={item.id} />
            <Button
              type="submit"
              variant="ghost"
              size="sm"
              disabled={deleting}
              aria-label={`Delete “${item.name}”`}
              className="text-destructive"
            >
              {deleting ? "Deleting…" : "Delete"}
            </Button>
          </form>
        </div>
      </div>
      {failure && <FormMessage state={failure} />}
    </li>
  );
}
