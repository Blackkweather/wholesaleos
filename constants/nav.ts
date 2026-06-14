import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Bot,
  Radar,
  Search,
  KanbanSquare,
  Clock,
  MessageSquareText,
  Users,
  Calculator,
  Settings,
  BarChart3,
  ListChecks,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/command", label: "Command Center", icon: ListChecks },
  { href: "/executive", label: "Executive", icon: BarChart3 },
  { href: "/agent", label: "Command", icon: Bot },
  { href: "/find", label: "Find Deals", icon: Radar },
  { href: "/lookup", label: "Lookup", icon: Search },
  { href: "/deals", label: "Pipeline", icon: KanbanSquare },
  { href: "/follow-ups", label: "Follow-Ups", icon: Clock },
  { href: "/sms", label: "SMS Hub", icon: MessageSquareText },
  { href: "/buyers", label: "Buyers", icon: Users },
  { href: "/calculator", label: "Calculator", icon: Calculator },
  { href: "/settings", label: "Settings", icon: Settings },
];

/** Five primary destinations for the mobile bottom bar. */
export const MOBILE_NAV: NavItem[] = [
  { href: "/dashboard", label: "Home", icon: LayoutDashboard },
  { href: "/agent", label: "Command", icon: Bot },
  { href: "/deals", label: "Pipeline", icon: KanbanSquare },
  { href: "/find", label: "Find", icon: Radar },
  { href: "/buyers", label: "Buyers", icon: Users },
];
