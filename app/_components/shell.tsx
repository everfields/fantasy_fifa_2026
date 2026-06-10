import type { ReactNode } from "react";

import type { Profile } from "@/lib/types";
import { Nav } from "./nav";

/**
 * Authenticated page chrome: sticky nav + a subtle "stadium turf" gradient
 * backdrop. Server component — pass the already-resolved `Profile` from a
 * guard so each page does a single auth round-trip.
 */
export function AppShell({
  profile,
  children,
}: {
  profile: Profile;
  children: ReactNode;
}) {
  return (
    <div className="relative min-h-screen">
      {/* Atmosphere: turf-green wash up top fading into the page. */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(60rem_40rem_at_50%_-10rem,hsl(var(--primary)/0.16),transparent_70%)]"
      />
      <Nav displayName={profile.display_name} isAdmin={profile.role === "admin"} />
      <main className="container py-5 sm:py-8">{children}</main>
    </div>
  );
}
