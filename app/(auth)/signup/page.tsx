import Link from "next/link";

import { signup } from "../actions";
import { AuthForm } from "../auth-form";

export const metadata = { title: "Crear cuenta · Resiporra 26" };

export default function SignupPage() {
  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <span className="text-sm font-semibold uppercase tracking-widest text-primary">
          Únete al grupo
        </span>
        <h2 className="text-3xl font-black tracking-tight">Crea tu cuenta</h2>
        <p className="text-muted-foreground">
          Elige tu nombre de jugador y a competir.
        </p>
      </div>

      <AuthForm mode="signup" action={signup} />

      <p className="text-sm text-muted-foreground">
        ¿Ya tienes cuenta?{" "}
        <Link
          href="/login"
          className="font-semibold text-primary underline-offset-4 hover:underline"
        >
          Entra aquí
        </Link>
      </p>
    </div>
  );
}
