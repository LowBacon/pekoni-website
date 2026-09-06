"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { NAV_GROUPS, isActive } from "@/lib/navigation";
import { hasRole, type Role } from "@/lib/enums";
import { Icon } from "@/components/ui/Icons";
import { usePreferences } from "@/components/providers/PreferencesProvider";
import Wordmark from "./Wordmark";

/**
 * Desktop navigation. Deliberately quiet — a hairline column that recedes into
 * the page so the environment behind it stays the loudest thing on screen.
 */
export default function Sidebar({
  role,
  dailyAvailable,
}: {
  role: string;
  dailyAvailable: boolean;
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const { sound } = usePreferences();

  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem("pekoni.sidebar") === "collapsed");
    } catch {
      /* ignore */
    }
  }, []);

  // The main column reserves the sidebar's width from this attribute, so the
  // collapse animation is one CSS transition instead of a React-driven reflow.
  useEffect(() => {
    document.documentElement.dataset.sidebar = collapsed ? "collapsed" : "open";
  }, [collapsed]);

  const toggle = () => {
    setCollapsed((current) => {
      const next = !current;
      try {
        window.localStorage.setItem("pekoni.sidebar", next ? "collapsed" : "open");
      } catch {
        /* ignore */
      }
      return next;
    });
    sound("click");
  };

  const groups = NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => !item.role || hasRole(role, item.role as Role)),
  })).filter((group) => group.items.length > 0);

  return (
    <aside
      className="fixed inset-y-0 left-0 z-40 hidden flex-col border-r border-[var(--line-soft)] bg-[color-mix(in_oklab,var(--color-obsidian-900)_82%,transparent)] backdrop-blur-xl transition-[width] duration-300 ease-[var(--ease-decel)] lg:flex"
      style={{ width: collapsed ? "var(--sidebar-w-collapsed)" : "var(--sidebar-w)" }}
      aria-label="Päänavigaatio"
    >
      <div className={`flex h-[var(--topbar-h)] items-center ${collapsed ? "justify-center px-3" : "px-5"}`}>
        <Wordmark compact={collapsed} size="sm" />
      </div>

      <nav className="hide-scrollbar flex-1 overflow-y-auto px-3 pb-4">
        {groups.map((group) => (
          <div key={group.id} className="mb-5">
            {group.label && !collapsed && (
              <p className="eyebrow px-3 pb-2 pt-1 text-[10px]">{group.label}</p>
            )}
            {group.label && collapsed && <div className="rule mx-2 my-3" />}
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const active = isActive(pathname, item);
                const showBadge = item.badge === "daily" && dailyAvailable;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={() => sound("navigate")}
                      title={collapsed ? item.label : undefined}
                      aria-current={active ? "page" : undefined}
                      className={`mb-navlink group relative flex min-h-[42px] items-center gap-3 rounded-[10px] px-3 text-sm font-medium transition-colors duration-200 ${
                        active
                          ? "bg-[color-mix(in_oklab,var(--color-emerald-500)_12%,transparent)] text-[var(--text)]"
                          : "text-[var(--text-muted)] hover:bg-[color-mix(in_oklab,var(--color-frost-100)_5%,transparent)] hover:text-[var(--text-dim)]"
                      } ${collapsed ? "justify-center px-0" : ""}`}
                    >
                      <span className="relative shrink-0">
                        <Icon
                          name={item.icon}
                          size={18}
                          className={active ? "text-[var(--color-emerald-400)]" : ""}
                        />
                        {showBadge && (
                          <span
                            className="absolute -right-0.5 -top-0.5 size-1.5 rounded-full bg-[var(--color-amber-400)]"
                            aria-hidden="true"
                          />
                        )}
                      </span>
                      {!collapsed && <span className="truncate">{item.label}</span>}
                      {!collapsed && showBadge && (
                        <span className="ml-auto rounded-full bg-[color-mix(in_oklab,var(--color-amber-500)_16%,transparent)] px-1.5 py-0.5 text-[10px] font-bold text-[var(--color-amber-400)]">
                          Uusi
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-[var(--line-soft)] p-3">
        <button
          type="button"
          onClick={toggle}
          className={`flex min-h-[40px] w-full items-center gap-2.5 rounded-[10px] px-3 text-[13px] font-medium text-[var(--text-faint)] transition-colors hover:bg-[color-mix(in_oklab,var(--color-frost-100)_5%,transparent)] hover:text-[var(--text-dim)] ${
            collapsed ? "justify-center px-0" : ""
          }`}
          aria-label={collapsed ? "Laajenna navigaatio" : "Kutista navigaatio"}
        >
          <Icon name={collapsed ? "chevronRight" : "chevronLeft"} size={16} />
          {!collapsed && <span>Kutista</span>}
        </button>
      </div>
    </aside>
  );
}
