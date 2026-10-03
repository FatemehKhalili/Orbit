import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SHOPPING_LIMITS, type ItemFields as Fields } from "@/lib/shopping";

/** Name, quantity and notes inputs, shared by the add and edit forms. */
export function ItemFields({ idPrefix, values }: { idPrefix: string; values?: Partial<Fields> }) {
  return (
    <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${idPrefix}-name`}>Item</Label>
        <Input
          id={`${idPrefix}-name`}
          name="name"
          defaultValue={values?.name}
          maxLength={SHOPPING_LIMITS.name}
          placeholder="Milk"
          required
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${idPrefix}-quantity`}>
          Quantity <span className="text-muted-foreground font-normal">(optional)</span>
        </Label>
        <Input
          id={`${idPrefix}-quantity`}
          name="quantity"
          defaultValue={values?.quantity}
          maxLength={SHOPPING_LIMITS.quantity}
          placeholder="2 l"
        />
      </div>
      <div className="flex flex-col gap-2 sm:col-span-2">
        <Label htmlFor={`${idPrefix}-notes`}>
          Notes <span className="text-muted-foreground font-normal">(optional)</span>
        </Label>
        <Textarea
          id={`${idPrefix}-notes`}
          name="notes"
          defaultValue={values?.notes}
          maxLength={SHOPPING_LIMITS.notes}
          rows={2}
        />
      </div>
    </div>
  );
}
