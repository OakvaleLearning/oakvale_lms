import { MailCheck, Users } from "lucide-react";
import { ButtonLink } from "@/components/ui/Button";
import { EmptyState } from "@/components/dashboard/ui";

/** Shown instead of the community to learners who haven't paid (or confirmed their email) yet. */
export function NotAMember({ unverified = false }: { unverified?: boolean }) {
  if (unverified) {
    return (
      <EmptyState
        icon={MailCheck}
        title="Confirm your email to join"
        action={<ButtonLink href="/verify-email?next=/community">Confirm my email</ButtonLink>}
      >
        The community is for enrolled learners with a confirmed email address.
      </EmptyState>
    );
  }
  return (
    <EmptyState icon={Users} title="Join a programme to access the community" action={<ButtonLink href="/enroll">Browse programmes</ButtonLink>}>
      Once you enrol, you&apos;re added to the Oakvale Community and your programme&apos;s group automatically. Meet other
      learners, join live sessions and get support from the Oakvale team.
    </EmptyState>
  );
}
