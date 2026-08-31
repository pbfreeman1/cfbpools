"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type NavLinkItem =
  | { href: string; label: string; disabled?: boolean; action?: undefined }
  | { action: () => void | Promise<void>; label: string; href?: undefined; disabled?: undefined };

export default function MobileNav({ links }: { links: NavLinkItem[] }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <div className="md:hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
        className="relative z-50 flex h-9 w-9 items-center justify-center rounded-md text-ink transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400"
      >
        {open ? (
          <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6" aria-hidden="true">
            <path
              d="M6 6l12 12M18 6L6 18"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
            />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6" aria-hidden="true">
            <path
              d="M4 7h16M4 12h16M4 17h16"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
            />
          </svg>
        )}
      </button>

      <div
        className={`fixed inset-0 z-40 flex flex-col items-center justify-center gap-8 bg-app transition-opacity duration-150 ${
          open ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
        }`}
      >
        {links.map((link) =>
          link.action ? (
            <form key={link.label} action={link.action}>
              <button
                type="submit"
                className="relative font-display text-3xl uppercase tracking-wide text-ink transition after:absolute after:-bottom-1 after:left-0 after:h-0.5 after:w-0 after:bg-gold-400 after:transition-all after:duration-200 hover:text-gold-400 hover:after:w-full focus-visible:text-gold-400 focus-visible:outline-none focus-visible:after:w-full"
              >
                {link.label}
              </button>
            </form>
          ) : link.disabled ? (
            <span
              key={link.label}
              className="font-display text-3xl uppercase tracking-wide text-muted"
              title="Coming soon"
            >
              {link.label}
            </span>
          ) : (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              className="relative font-display text-3xl uppercase tracking-wide text-ink transition after:absolute after:-bottom-1 after:left-0 after:h-0.5 after:w-0 after:bg-gold-400 after:transition-all after:duration-200 hover:text-gold-400 hover:after:w-full focus-visible:text-gold-400 focus-visible:outline-none focus-visible:after:w-full"
            >
              {link.label}
            </Link>
          )
        )}
      </div>
    </div>
  );
}
