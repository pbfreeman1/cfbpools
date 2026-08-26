"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_GROUPS: { label: string; items: { href: string; label: string }[] }[] = [
  { label: "Overview", items: [{ href: "/admin", label: "Dashboard" }] },
  {
    label: "Survivor",
    items: [
      { href: "/admin/survivor/results", label: "Results" },
      { href: "/admin/survivor/entries", label: "Entries" },
      { href: "/admin/survivor/bonus", label: "Bonus Weeks" },
    ],
  },
  {
    label: "Pick'em",
    items: [
      { href: "/admin/pickem/week", label: "Week Setup" },
      { href: "/admin/pickem/exclusions", label: "Exclusions" },
    ],
  },
  {
    label: "Site",
    items: [
      { href: "/admin/users", label: "Users" },
      { href: "/admin/email", label: "Email" },
      { href: "/admin/system", label: "System" },
      { href: "/admin/audit", label: "Audit Log" },
      { href: "/admin/season", label: "Season" },
    ],
  },
];

export default function AdminNav() {
  const pathname = usePathname();

  return (
    <nav className="no-scrollbar flex gap-5 overflow-x-auto px-4 py-3 md:flex-col md:gap-5 md:overflow-visible md:py-2">
      {NAV_GROUPS.map((group) => (
        <div
          key={group.label}
          className="flex flex-shrink-0 items-center gap-2 md:flex-col md:items-stretch md:gap-1"
        >
          <span className="hidden text-xs font-semibold uppercase tracking-wide text-muted md:mb-1 md:block">
            {group.label}
          </span>
          {group.items.map((item) => {
            const active =
              pathname === item.href ||
              (item.href !== "/admin" && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition ${
                  active ? "bg-gold-500 text-app" : "text-ink hover:bg-surface-hover"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
