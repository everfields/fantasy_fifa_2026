import Link from "next/link";
import type { ReactNode } from "react";

import { requireAdmin } from "@/lib/auth/guards";

import { AdminNav } from "@/components/admin/AdminNav";

export const metadata = { title: "Admin · Mundial 26" };
export const dynamic = "force-dynamic";

/**
 * Admin chrome: a dark "control deck" sidebar (distinct from the player nav)
 * beside a light content area. `requireAdmin()` gates the entire /admin subtree
 * — non-admins are redirected before any page renders.
 */
export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const profile = await requireAdmin();

  return (
    <div className="min-h-screen bg-zinc-50 lg:grid lg:grid-cols-[17rem_1fr]">
      {/* Control-deck sidebar */}
      <aside className="sticky top-0 z-30 flex h-auto flex-col gap-6 border-b border-zinc-800 bg-zinc-950 px-4 py-5 text-zinc-100 lg:h-screen lg:border-b-0 lg:border-r">
        <div className="flex items-center gap-3">
          <span
            aria-hidden
            className="grid h-10 w-10 place-items-center rounded-xl bg-primary text-lg text-primary-foreground shadow-lg shadow-primary/20"
          >
            ⚙
          </span>
          <div className="leading-tight">
            <p className="text-sm font-black tracking-tight">
              Panel de Control
            </p>
            <p className="text-[11px] text-zinc-500">Mundial 26 · Admin</p>
          </div>
        </div>

        <AdminNav displayName={profile.display_name} />

        <div className="mt-auto hidden flex-col gap-2 border-t border-zinc-800 pt-4 lg:flex">
          <p className="px-1 text-[11px] uppercase tracking-wider text-zinc-600">
            Sesión
          </p>
          <p className="px-1 text-sm font-semibold text-zinc-200">
            {profile.display_name}
          </p>
          <Link
            href="/dashboard"
            className="rounded-lg px-1 py-1 text-sm text-zinc-400 transition-colors hover:text-primary"
          >
            ← Volver a la app
          </Link>
        </div>
      </aside>

      <main className="min-w-0 px-4 py-6 sm:px-8 sm:py-10">
        <div className="mx-auto max-w-5xl">{children}</div>
      </main>
    </div>
  );
}
