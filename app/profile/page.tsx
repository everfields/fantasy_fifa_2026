import { Lock } from "lucide-react";

import { requireUser } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { AppShell } from "../_components/shell";
import { ProfileForm } from "./profile-form";

export const metadata = { title: "Perfil · Resiporra 26" };
export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const profile = await requireUser();
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <AppShell profile={profile}>
      <div className="mx-auto max-w-lg space-y-6">
        <div>
          <h1 className="text-2xl font-black tracking-tight">Tu perfil</h1>
          <p className="text-sm text-muted-foreground">
            Cambia tu apodo cuando quieras.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Datos de la cuenta</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <ProfileForm currentName={profile.display_name} />

            <div className="space-y-2">
              <Label htmlFor="email" className="flex items-center gap-1.5">
                Email
                <Lock className="h-3.5 w-3.5 text-muted-foreground" />
              </Label>
              <Input
                id="email"
                value={user?.email ?? ""}
                disabled
                readOnly
                className="max-w-xs"
              />
              <p className="text-xs text-muted-foreground">
                El email es tu identificador de acceso y no se puede cambiar.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
