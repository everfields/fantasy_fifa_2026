"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import {
  CalendarDays,
  Gift,
  Home,
  Moon,
  Radar,
  Settings,
  Sun,
  Trophy,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

const LINKS = [
  { href: "/dashboard", label: "Inicio", icon: Home },
  { href: "/matches", label: "Partidos", icon: CalendarDays },
  { href: "/standings", label: "Clasificación", shortLabel: "Tabla", icon: Trophy },
  { href: "/bonus", label: "Bonus", icon: Gift },
  { href: "/tracker", label: "AI Tracker", icon: Radar },
];

export function Nav({
  displayName,
  isAdmin,
}: {
  displayName: string;
  isAdmin: boolean;
}) {
  const pathname = usePathname();
  const { resolvedTheme, setTheme } = useTheme();
  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-xl">
        <div className="container flex h-16 items-center gap-6">
          <Link href="/dashboard" className="flex items-center gap-2 font-black">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm">
              <span aria-hidden className="text-lg">⚽</span>
            </span>
            <span className="text-base tracking-tight">
              Resi<span className="text-primary">porra</span>
              <span className="ml-1 align-top text-[0.7em] font-bold text-muted-foreground">26</span>
            </span>
          </Link>

          <nav className="hidden flex-1 items-center gap-1 md:flex">
            {LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={cn(
                  "rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors",
                  isActive(l.href)
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                )}
              >
                {l.label}
              </Link>
            ))}
            {isAdmin && (
              <Link
                href="/admin"
                className={cn(
                  "rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors",
                  pathname.startsWith("/admin")
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                )}
              >
                Admin
              </Link>
            )}
          </nav>

          <div className="ml-auto flex items-center gap-3 md:ml-0">
            {isAdmin && (
              <Link
                href="/admin"
                aria-label="Admin"
                className={cn(
                  "grid h-9 w-9 place-items-center rounded-full transition-colors md:hidden",
                  pathname.startsWith("/admin")
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                )}
              >
                <Settings className="h-5 w-5" />
              </Link>
            )}
            <button
              type="button"
              aria-label="Cambiar tema"
              onClick={() =>
                setTheme(resolvedTheme === "dark" ? "light" : "dark")
              }
              className="grid h-9 w-9 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              <Sun className="h-5 w-5 dark:hidden" />
              <Moon className="hidden h-5 w-5 dark:block" />
            </button>
            <span className="hidden text-sm font-medium text-muted-foreground md:inline">
              {displayName}
            </span>
            <Button variant="outline" size="sm" onClick={signOut}>
              Salir
            </Button>
          </div>
        </div>
      </header>

      {/* Mobile bottom tab bar — app-like navigation. */}
      <nav
        aria-label="Navegación principal"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border/60 bg-background/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden"
      >
        <div className="grid h-16 grid-cols-5">
          {LINKS.map((l) => {
            const active = isActive(l.href);
            const Icon = l.icon;
            return (
              <Link
                key={l.href}
                href={l.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex flex-col items-center justify-center gap-1 text-[10px] font-semibold transition-colors",
                  active ? "text-primary" : "text-muted-foreground",
                )}
              >
                <span
                  className={cn(
                    "grid h-7 w-12 place-items-center rounded-full transition-colors",
                    active && "bg-primary/15",
                  )}
                >
                  <Icon className="h-5 w-5" strokeWidth={active ? 2.5 : 2} />
                </span>
                {l.shortLabel ?? l.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
