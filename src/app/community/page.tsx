import type { Metadata } from "next";
import { Bell, Settings } from "lucide-react";
import { requireSession } from "@/lib/auth";
import { isStorageConfigured } from "@/lib/storage";
import { listPosts } from "@/lib/community/feed";
import { getMe, loadCommunity } from "@/lib/community/viewer";
import { ButtonLink } from "@/components/ui/Button";
import { PageHeader } from "@/components/dashboard/ui";
import { Feed } from "@/components/community/Feed";
import { NotAMember } from "@/components/community/NotAMember";
import { GroupList, UpcomingEvents } from "@/components/community/Sidebar";
import { ProfilePrompt } from "@/components/community/ProfilePrompt";

export const metadata: Metadata = { title: "Community" };

export default async function CommunityHome() {
  const session = await requireSession("/community");
  const { groups, unverified } = await loadCommunity(session);

  if (groups.length === 0) {
    return (
      <div className="mx-auto max-w-5xl space-y-10">
        <PageHeader eyebrow="Community" title="Oakvale Community" />
        <NotAMember unverified={unverified} />
      </div>
    );
  }

  const [me, feed] = await Promise.all([getMe(session), listPosts(session, {})]);
  const firstName = session.name.split(" ")[0];

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <PageHeader
        eyebrow="Community"
        title={`Hello, ${firstName}`}
        description="What's new across your groups. Share a win, ask a question, or help a fellow learner."
        actions={
          <>
            <ButtonLink href="/community/notifications" variant="outline" size="sm">
              <Bell className="size-4" /> Notifications
            </ButtonLink>
            <ButtonLink href="/community/settings" variant="ghost" size="sm" aria-label="Community settings">
              <Settings className="size-4" />
            </ButtonLink>
          </>
        }
      />

      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0">
          <Feed
            me={me}
            groups={groups.map((g) => ({ id: g.id, name: g.name }))}
            initialPosts={feed.posts}
            initialCursor={feed.nextCursor}
            canAnnounce={session.role === "ADMIN"}
            uploadsEnabled={isStorageConfigured()}
            showGroup
          />
        </div>
        <aside className="space-y-4 lg:sticky lg:top-8">
          {!me.avatar && !me.headline && <ProfilePrompt />}
          <GroupList groups={groups} />
          <UpcomingEvents groupIds={groups.map((g) => g.id)} userId={session.userId} />
        </aside>
      </div>
    </div>
  );
}
