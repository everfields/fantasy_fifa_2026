import Link from "next/link";

import { login } from "../actions";
import { AuthForm } from "../auth-form";

export const metadata = { title: "Entrar · Resiporra 26" };

export default function LoginPage() {
  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <span className="text-sm font-semibold uppercase tracking-widest text-primary">
          Bienvenido de vuelta
        </span>
        <h2 className="text-3xl font-black tracking-tight">Entra a la porra</h2>
        <p className="text-muted-foreground">
          Tus pronósticos te esperan.
        </p>
      </div>

      <AuthForm mode="login" action={login} />

      <p className="text-sm text-muted-foreground">
        ¿Aún no juegas?{" "}
        <Link
          href="/signup"
          className="font-semibold text-primary underline-offset-4 hover:underline"
        >
          Crea tu cuenta
        </Link>
      </p>
    </div>
  );
}
