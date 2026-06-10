"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import {
  BookOpen,
  CalendarDays,
  Gift,
  Globe,
  Home,
  Menu,
  Moon,
  Radar,
  Settings,
  Sun,
  Trophy,
  X,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

const LINKS = [
  { href: "/dashboard", label: "Inicio", icon: Home },
  { href: "/matches", label: "Partidos", icon: CalendarDays },
  { href: "/standings", label: "Clasificación", icon: Trophy },
  { href: "/mundial", label: "Mundial", icon: Globe },
  { href: "/bonus", label: "Bonus", icon: Gift },
  { href: "/tracker", label: "AI Tracker", icon: Radar },
  { href: "/rules", label: "Reglas", icon: BookOpen },
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
  const [open, setOpen] = useState(false);
  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

  // Auto-hide the drawer on navigation and on Escape.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-xl">
        <div className="container flex h-16 items-center gap-3 md:gap-6">
          <button
            type="button"
            aria-label="Abrir menú"
            aria-expanded={open}
            onClick={() => setOpen(true)}
            className="grid h-9 w-9 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground md:hidden"
          >
            <Menu className="h-5 w-5" />
          </button>

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

      {/* Mobile drawer — auto-hidden sidebar with every section. */}
      <div
        className={cn("fixed inset-0 z-50 md:hidden", open ? "" : "pointer-events-none")}
        aria-hidden={!open}
      >
        <div
          className={cn(
            "absolute inset-0 bg-black/50 transition-opacity duration-200",
            open ? "opacity-100" : "opacity-0",
          )}
          onClick={() => setOpen(false)}
        />
        <aside
          role="dialog"
          aria-label="Navegación principal"
          className={cn(
            "absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col gap-1 border-r border-border bg-background p-4 shadow-xl transition-transform duration-200",
            open ? "translate-x-0" : "-translate-x-full",
          )}
        >
          <div className="mb-2 flex items-center justify-between">
            <span className="flex items-center gap-2 font-black">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-primary-foreground">
                <span aria-hidden>⚽</span>
              </span>
              <span className="tracking-tight">
                Resi<span className="text-primary">porra</span>
              </span>
            </span>
            <button
              type="button"
              aria-label="Cerrar menú"
              onClick={() => setOpen(false)}
              className="grid h-9 w-9 place-items-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {LINKS.map((l) => {
            const active = isActive(l.href);
            const Icon = l.icon;
            return (
              <Link
                key={l.href}
                href={l.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors",
                  active
                    ? "bg-primary/15 text-primary"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                )}
              >
                <Icon className="h-5 w-5" strokeWidth={active ? 2.5 : 2} />
                {l.label}
              </Link>
            );
          })}

          {isAdmin && (
            <Link
              href="/admin"
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors",
                pathname.startsWith("/admin")
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground",
              )}
            >
              <Settings className="h-5 w-5" />
              Admin
            </Link>
          )}

          <div className="mt-auto border-t border-border pt-3">
            <p className="px-3 text-sm font-medium text-muted-foreground">
              {displayName}
            </p>
          </div>
        </aside>
      </div>
    </>
  );
}
