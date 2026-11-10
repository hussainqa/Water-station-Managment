import {
  Activity,
  Factory,
  FilePlus,
  FileText,
  Gauge,
  LayoutDashboard,
  ListChecks,
  Wrench,
  type LucideIcon,
} from "lucide-react";

export type NavSection = "monitoring" | "assessment" | "reports";
export type NavId =
  | "dashboard"
  | "plants"
  | "indicators"
  | "newAssessment"
  | "assessments"
  | "problems"
  | "actions"
  | "reports";

export type NavItem = {
  id: NavId;
  href: string;
  icon: LucideIcon;
  section: NavSection;
  /** Present when the item is also a tab in the bottom bar (key under shell.tabs). */
  tab?: "dashboard" | "plants" | "assessments" | "problems" | "reports";
};

/** Order matters: sidebar, drawer and tab bar all follow it. */
export const NAV_ITEMS: readonly NavItem[] = [
  { id: "dashboard", href: "/dashboard", icon: LayoutDashboard, section: "monitoring", tab: "dashboard" },
  { id: "plants", href: "/plants", icon: Factory, section: "monitoring", tab: "plants" },
  { id: "indicators", href: "/indicators", icon: Gauge, section: "monitoring" },
  { id: "newAssessment", href: "/assessments/new", icon: FilePlus, section: "assessment" },
  { id: "assessments", href: "/assessments", icon: Activity, section: "assessment", tab: "assessments" },
  { id: "problems", href: "/problems", icon: ListChecks, section: "assessment", tab: "problems" },
  { id: "actions", href: "/actions", icon: Wrench, section: "assessment" },
  { id: "reports", href: "/reports", icon: FileText, section: "reports", tab: "reports" },
];

export const NAV_SECTIONS: readonly NavSection[] = ["monitoring", "assessment", "reports"];

/**
 * The href of the item that matches `pathname` (locale prefix already removed).
 * The longest match wins, so /assessments/new highlights "New assessment" and
 * /assessments/<id> highlights "Assessment results".
 */
export function activeHref(
  pathname: string,
  items: readonly { href: string }[] = NAV_ITEMS,
): string | null {
  let best: string | null = null;
  for (const { href } of items) {
    const matches = pathname === href || pathname.startsWith(`${href}/`);
    if (matches && (best === null || href.length > best.length)) best = href;
  }
  return best;
}
