"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

const LINKS = [
  { href: "/dashboard", label: "Inicio" },
  { href: "/matches", label: "Partidos" },
  { href: "/standings", label: "Clasificación" },
  { href: "/bonus", label: "Bonus" },
  { href: "/chat", label: "Chat" },
];

export function Nav({
  displayName,
  isAdmin,
}: {
  displayName: string;
  isAdmin: boolean;
}) {
  const pathname = usePathname();

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-xl">
      <div className="container flex h-16 items-center gap-6">
        <Link href="/dashboard" className="flex items-center gap-2 font-black">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm">
            <span aria-hidden className="text-lg">⚽</span>
          </span>
          <span className="hidden text-base tracking-tight sm:inline">
            Mundial<span className="text-primary">26</span>
          </span>
        </Link>

        <nav className="flex flex-1 items-center gap-1 overflow-x-auto">
          {LINKS.map((l) => {
            const active =
              pathname === l.href || pathname.startsWith(`${l.href}/`);
            return (
              <Link
                key={l.href}
                href={l.href}
                className={cn(
                  "rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                )}
              >
                {l.label}
              </Link>
            );
          })}
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

        <div className="flex items-center gap-3">
          <span className="hidden text-sm font-medium text-muted-foreground md:inline">
            {displayName}
          </span>
          <Button variant="outline" size="sm" onClick={signOut}>
            Salir
          </Button>
        </div>
      </div>
    </header>
  );
}
