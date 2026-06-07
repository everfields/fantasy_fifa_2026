import type { ReactNode } from "react";

/**
 * Split-screen auth chrome: a bold "stadium" panel on the left and the form on
 * the right. Public — no auth round-trip (middleware already lets these
 * through, and redirects logged-in users to /dashboard).
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Brand / atmosphere panel. */}
      <div className="relative hidden overflow-hidden bg-primary text-primary-foreground lg:block">
        <div
          aria-hidden
          className="absolute inset-0 bg-[radial-gradient(40rem_30rem_at_20%_10%,rgba(255,255,255,0.22),transparent_60%)]"
        />
        <div
          aria-hidden
          className="absolute inset-0 opacity-[0.07] [background-image:repeating-linear-gradient(90deg,#fff_0_2px,transparent_2px_72px)]"
        />
        <div className="relative flex h-full flex-col justify-between p-12">
          <div className="flex items-center gap-3 text-2xl font-black tracking-tight">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-white/15 text-3xl backdrop-blur">
              ⚽
            </span>
            Mundial 26
          </div>
          <div className="space-y-4">
            <h1 className="max-w-md text-5xl font-black leading-[1.05] tracking-tight">
              La porra del Mundial.
              <br />
              Demuestra quién manda.
            </h1>
            <p className="max-w-sm text-lg text-primary-foreground/80">
              Pronostica cada partido, gasta tus jokers con cabeza y escala la
              clasificación entre amigos.
            </p>
          </div>
          <p className="text-sm text-primary-foreground/70">
            FIFA World Cup 2026 · Grupo privado
          </p>
        </div>
      </div>

      {/* Form panel. */}
      <div className="flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-sm">{children}</div>
      </div>
    </div>
  );
}
