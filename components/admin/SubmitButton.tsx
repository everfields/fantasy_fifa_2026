"use client";

import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import type { ButtonProps } from "@/components/ui/button";

/** A submit button that disables itself and shows a label while pending. */
export function SubmitButton({
  children,
  pendingLabel = "Guardando…",
  ...props
}: ButtonProps & { pendingLabel?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} {...props}>
      {pending ? pendingLabel : children}
    </Button>
  );
}
