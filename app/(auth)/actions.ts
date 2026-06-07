"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

const credentials = z.object({
  email: z.string().trim().email("Introduce un email válido."),
  password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres."),
});

const signupSchema = credentials.extend({
  displayName: z
    .string()
    .trim()
    .min(2, "El nombre debe tener al menos 2 caracteres.")
    .max(40, "El nombre es demasiado largo."),
});

export type AuthState = { error: string | null };

function fieldErrorMessage(error: z.ZodError): string {
  return error.errors[0]?.message ?? "Datos no válidos.";
}

export async function login(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const parsed = credentials.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: fieldErrorMessage(parsed.error) };

  const supabase = createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { error: "Email o contraseña incorrectos." };

  redirect("/dashboard");
}

export async function signup(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const parsed = signupSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    displayName: formData.get("displayName"),
  });
  if (!parsed.success) return { error: fieldErrorMessage(parsed.error) };

  const { email, password, displayName } = parsed.data;
  const supabase = createClient();

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      // Stored on auth.users.raw_user_meta_data; a DB trigger creates the
      // matching `profiles` row (display_name, default role 'player').
      data: { display_name: displayName },
    },
  });

  if (error) {
    return {
      error:
        error.message?.toLowerCase().includes("registered") ||
        error.message?.toLowerCase().includes("already")
          ? "Ese email ya está registrado."
          : "No se pudo crear la cuenta. Inténtalo de nuevo.",
    };
  }

  redirect("/dashboard");
}
