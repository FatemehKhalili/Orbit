import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { HABIT_LIMITS, type HabitFields as Fields } from "@/lib/habits";

/** Name and notes inputs, shared by the add and edit forms. */
export function HabitFields({ idPrefix, values }: { idPrefix: string; values?: Partial<Fields> }) {
  return (
    <div className="grid gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${idPrefix}-name`}>Habit</Label>
        <Input
          id={`${idPrefix}-name`}
          name="name"
          defaultValue={values?.name}
          maxLength={HABIT_LIMITS.name}
          placeholder="Read for 20 minutes"
          required
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${idPrefix}-notes`}>
          Notes <span className="text-muted-foreground font-normal">(optional)</span>
        </Label>
        <Textarea
          id={`${idPrefix}-notes`}
          name="notes"
          defaultValue={values?.notes}
          maxLength={HABIT_LIMITS.notes}
          rows={2}
        />
      </div>
    </div>
  );
}
