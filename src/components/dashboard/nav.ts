import type { ElementType } from "react";
import {
  LayoutDashboard,
  BookOpen,
  ClipboardList,
  Layers,
  Receipt,
  Users,
  ShoppingBag,
  LifeBuoy,
  MessagesSquare,
  Mail,
  Award,
  UsersRound,
  UserRound,
  ShieldCheck,
  History,
  Smartphone,
} from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: ElementType;
  /** Shows an unread count: support replies, or community notifications. */
  badge?: "support" | "community";
  /** Extra words the header search matches on, beyond the label. */
  keywords?: string;
}

/** The sidebar's pages for each dashboard. Shared by the sidebar and the search page. */
export const NAV: Record<"learner" | "admin", { section: string; items: NavItem[] }> = {
  learner: {
    section: "Learning",
    items: [
      { label: "My learning", href: "/learn", icon: BookOpen, keywords: "modules lessons progress home" },
      { label: "Community", href: "/community", icon: UsersRound, badge: "community", keywords: "groups feed events members" },
      { label: "Certificates", href: "/learn/certificates", icon: Award, keywords: "certificate cpd download verify" },
      { label: "Programmes", href: "/programmes", icon: ShoppingBag, keywords: "courses enrol enroll plans tiers pay" },
      { label: "Support", href: "/support", icon: LifeBuoy, badge: "support", keywords: "help chat contact" },
      { label: "Profile", href: "/account", icon: UserRound, keywords: "account name photo whatsapp settings" },
    ],
  },
  admin: {
    section: "Manage",
    items: [
      { label: "Overview", href: "/admin", icon: LayoutDashboard, keywords: "dashboard home" },
      { label: "Programmes", href: "/admin/programs", icon: Layers, keywords: "courses tiers plans" },
      { label: "Question banks", href: "/admin/question-banks", icon: ClipboardList, keywords: "questions quiz assessment" },
      { label: "Learners", href: "/admin/learners", icon: Users, keywords: "students enrolments" },
      { label: "Payments", href: "/admin/payments", icon: Receipt, keywords: "paystack transactions revenue" },
      { label: "Certificates", href: "/admin/certificates", icon: Award, keywords: "templates issued cpd" },
      { label: "Community", href: "/admin/community", icon: UsersRound, keywords: "groups posts moderation" },
      { label: "Support", href: "/admin/support", icon: MessagesSquare, badge: "support", keywords: "help chat tickets" },
      { label: "Emails", href: "/admin/emails", icon: Mail, keywords: "email campaigns send templates" },
      { label: "Android app", href: "/admin/android-app", icon: Smartphone, keywords: "apk mobile phone download app update release" },
      { label: "Team", href: "/admin/team", icon: ShieldCheck, keywords: "admins staff roles" },
      { label: "Activity log", href: "/admin/activity", icon: History, keywords: "audit history changes who did what records" },
    ],
  },
};
