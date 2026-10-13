import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { EVENT_LIMITS, type EventFields as Fields } from "@/lib/calendar";

const OPTIONAL = <span className="text-muted-foreground font-normal">(optional)</span>;

/**
 * Title, days, times and notes, shared by the add and edit forms. Ticking "All day" hides
 * the time inputs with CSS alone, so the form works the same without JavaScript; any
 * times left in them are ignored for an all-day event.
 */
export function EventFields({ idPrefix, values }: { idPrefix: string; values?: Partial<Fields> }) {
  const id = (name: string) => `${idPrefix}-${name}`;

  return (
    <div className="grid gap-4 has-[[name=allDay]:checked]:[&_[data-event-time]]:hidden">
      <div className="flex flex-col gap-2">
        <Label htmlFor={id("title")}>Event</Label>
        <Input
          id={id("title")}
          name="title"
          defaultValue={values?.title}
          maxLength={EVENT_LIMITS.title}
          placeholder="Dentist"
          required
        />
      </div>
      <label className="flex items-center gap-2.5 self-start text-sm font-semibold">
        <input
          type="checkbox"
          name="allDay"
          defaultChecked={Boolean(values?.allDay)}
          className="accent-primary size-4.5"
        />
        All day
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor={id("start-day")}>Starts on</Label>
          <Input
            id={id("start-day")}
            name="startDay"
            type="date"
            defaultValue={values?.startDay}
            required
          />
        </div>
        <div className="flex flex-col gap-2" data-event-time>
          <Label htmlFor={id("start-time")}>At</Label>
          <Input id={id("start-time")} name="startTime" type="time" defaultValue={values?.startTime} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor={id("end-day")}>Ends on {OPTIONAL}</Label>
          <Input id={id("end-day")} name="endDay" type="date" defaultValue={values?.endDay} />
        </div>
        <div className="flex flex-col gap-2" data-event-time>
          <Label htmlFor={id("end-time")}>Until {OPTIONAL}</Label>
          <Input id={id("end-time")} name="endTime" type="time" defaultValue={values?.endTime} />
        </div>
      </div>
      <p className="text-muted-foreground -mt-2 text-sm">
        Leave the end empty for something on one day, or at one moment.
      </p>
      <div className="flex flex-col gap-2">
        <Label htmlFor={id("notes")}>Notes {OPTIONAL}</Label>
        <Textarea
          id={id("notes")}
          name="notes"
          defaultValue={values?.notes}
          maxLength={EVENT_LIMITS.notes}
          rows={2}
        />
      </div>
    </div>
  );
}
