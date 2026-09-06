"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MOBILE_NAV, isActive } from "@/lib/navigation";
import { Icon } from "@/components/ui/Icons";
import { usePreferences } from "@/components/providers/PreferencesProvider";

/**
 * Floating bottom bar. Every target is at least 44 px tall, sits above the home
 * indicator, and stays reachable with one thumb.
 */
export default function MobileNav() {
  const pathname = usePathname();
  const { sound } = usePreferences();

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:hidden"
      aria-label="Mobiilinavigaatio"
    >
      <ul className="mx-auto flex max-w-md items-stretch justify-between gap-0.5 rounded-2xl border border-[var(--line)] bg-[color-mix(in_oklab,var(--color-obsidian-880)_92%,transparent)] p-1.5 shadow-[0_18px_44px_-16px_rgba(0,0,0,0.9)] backdrop-blur-xl">
        {MOBILE_NAV.map((item) => {
          const active = isActive(pathname, item);
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                onClick={() => sound("navigate")}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-[48px] flex-col items-center justify-center gap-1 rounded-xl px-1 py-1.5 transition-colors duration-200 ${
                  active
                    ? "bg-[color-mix(in_oklab,var(--color-emerald-500)_14%,transparent)] text-[var(--color-emerald-400)]"
                    : "text-[var(--text-faint)]"
                }`}
              >
                <Icon name={item.icon} size={19} />
                <span className="text-[10px] font-semibold leading-none">{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
