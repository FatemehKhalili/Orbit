import Link from "next/link";

import { ArrowBackIcon } from "@/components/icons";
import { buttonVariants } from "@/components/ui/button";
import { UnavailableCard } from "@/components/unavailable-card";
import type { ApiError } from "@/lib/api-client";

/** The event could not be shown: gone (or someone else's), or the API is unreachable. */
export function EventMissing({ error }: { error: ApiError | null }) {
  const gone = error !== null && error !== "unavailable";
  return (
    <UnavailableCard
      data-testid="event-missing"
      title={gone ? "This event does not exist" : "This event could not be loaded"}
      description={
        gone ? "It may have been deleted." : "Orbit could not reach its server. Try again in a moment."
      }
    >
      <Link href="/calendar" className={buttonVariants({ variant: "outline" })}>
        <ArrowBackIcon />
        Back to the calendar
      </Link>
    </UnavailableCard>
  );
}
