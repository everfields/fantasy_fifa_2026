"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

/** Admin control-deck navigation. Each entry links to a sub-page of /admin. */
const SECTIONS: { href: string; label: string; icon: string; desc: string }[] = [
  { href: "/admin", label: "Resumen", icon: "▣", desc: "Vista general" },
  { href: "/admin/scoring", label: "Puntuación", icon: "◎", desc: "Reglas y jokers" },
  { href: "/admin/matches", label: "Partidos", icon: "⚽", desc: "Resultados y locks" },
  { href: "/admin/bonus", label: "Bonus", icon: "★", desc: "Preguntas extra" },
  { href: "/admin/users", label: "Jugadores", icon: "◴", desc: "Roles y jokers" },
  { href: "/admin/pot", label: "Bote", icon: "€", desc: "Pagos y reparto" },
  { href: "/admin/recalc", label: "Recalcular", icon: "⟳", desc: "Preview + confirmar" },
  { href: "/admin/audit", label: "Auditoría", icon: "❒", desc: "Registro de cambios" },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AdminNav({ displayName }: { displayName: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Auto-collapse the mobile menu whenever the user navigates to a section.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const current =
    SECTIONS.find((s) => isActive(pathname, s.href)) ?? SECTIONS[0];

  return (
    <div className="flex flex-col gap-2">
      {/* Mobile: compact bar showing the current section; tap to expand the full menu */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="Abrir menú de admin"
        className="flex items-center gap-3 rounded-lg bg-white/5 px-3 py-2 text-left lg:hidden"
      >
        <span
          aria-hidden
          className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-primary text-sm text-primary-foreground"
        >
          {current.icon}
        </span>
        <span className="flex min-w-0 flex-1 flex-col leading-tight">
          <span className="truncate text-sm font-semibold">{current.label}</span>
          <span className="truncate text-[11px] text-zinc-500">
            Admin · {displayName}
          </span>
        </span>
        <span
          aria-hidden
          className={cn(
            "text-zinc-500 transition-transform",
            open && "rotate-180",
          )}
        >
          ▾
        </span>
      </button>

      <nav
        className={cn("flex-col gap-1", open ? "flex" : "hidden", "lg:flex")}
      >
        {SECTIONS.map((s) => {
          const active = isActive(pathname, s.href);
          return (
            <Link
              key={s.href}
              href={s.href}
              className={cn(
                "group flex items-center gap-3 rounded-lg px-3 py-2.5 transition-all",
                active
                  ? "bg-primary/15 text-primary ring-1 ring-inset ring-primary/30"
                  : "text-zinc-400 hover:bg-white/5 hover:text-zinc-100",
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "grid h-7 w-7 shrink-0 place-items-center rounded-md text-sm transition-colors",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "bg-white/5 text-zinc-400 group-hover:text-zinc-100",
                )}
              >
                {s.icon}
              </span>
              <span className="flex min-w-0 flex-col leading-tight">
                <span className="truncate text-sm font-semibold">{s.label}</span>
                <span className="truncate text-[11px] text-zinc-500">
                  {s.desc}
                </span>
              </span>
            </Link>
          );
        })}

        <Link
          href="/dashboard"
          className="mt-1 rounded-lg px-3 py-2 text-sm text-zinc-400 transition-colors hover:text-primary lg:hidden"
        >
          ← Volver a la app
        </Link>
      </nav>
    </div>
  );
}
