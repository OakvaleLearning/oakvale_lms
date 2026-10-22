import type { CommunityEvent } from "@prisma/client";
import { ActionForm, Field, Input, Switch, Textarea } from "@/components/admin/forms";
import { EVENT_TZ_LABEL, toEventInput } from "@/lib/community/shared";

type Action = (prev: { error?: string; ok?: boolean } | undefined, fd: FormData) => Promise<{ error?: string; ok?: boolean } | undefined>;

/** Create or edit an event (admins). Times are entered in Nigerian time (WAT). */
export function EventForm({ action, event, submitLabel }: { action: Action; event?: CommunityEvent; submitLabel: string }) {
  return (
    <ActionForm action={action} submitLabel={submitLabel} footerClassName="justify-end">
      <Field label="Title">
        <Input name="title" required maxLength={140} defaultValue={event?.title} placeholder="e.g. Live Q&A: Safe moving and handling" />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={`Starts (${EVENT_TZ_LABEL})`}>
          <Input name="startsAt" type="datetime-local" required defaultValue={toEventInput(event?.startsAt)} />
        </Field>
        <Field label={`Ends (${EVENT_TZ_LABEL})`} optional>
          <Input name="endsAt" type="datetime-local" defaultValue={toEventInput(event?.endsAt)} />
        </Field>
      </div>
      <Field label="Meeting link" optional hint="Zoom, Google Meet or Teams. Only members of the group can see it.">
        <Input name="meetingUrl" type="url" defaultValue={event?.meetingUrl ?? ""} placeholder="https://meet.google.com/…" />
      </Field>
      <Field label="Location" optional hint="Leave empty for online-only events.">
        <Input name="location" maxLength={200} defaultValue={event?.location} placeholder="e.g. Oakvale Training Centre, Lagos" />
      </Field>
      <Field label="Description" optional>
        <Textarea name="description" rows={5} maxLength={5000} defaultValue={event?.description} placeholder="What the session covers and who it's for" />
      </Field>
      {!event && <Switch name="notify" defaultChecked label="Notify members" description="Everyone in the group gets an in-app notification." />}
    </ActionForm>
  );
}
