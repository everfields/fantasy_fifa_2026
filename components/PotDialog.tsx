"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { formatEur } from "@/lib/pot";

/** Discreet "Bote" button that reveals the two prizes on demand. */
export function PotDialog({
  winnerPrize,
  runnerUpPrize,
}: {
  winnerPrize: number;
  runnerUpPrize: number;
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          € Bote
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>El bote</DialogTitle>
          <DialogDescription>
            Aquí se juega por el orgullo; esto es solo el compromiso.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <div className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2">
            <span className="flex items-center gap-2 text-sm">
              <Badge>1º</Badge>
              <span className="font-medium">Ganador</span>
            </span>
            <span className="font-mono text-sm font-bold tabular-nums">
              {formatEur(winnerPrize)}
            </span>
          </div>
          <div className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2">
            <span className="flex items-center gap-2 text-sm">
              <Badge variant="secondary">2º</Badge>
              <span className="font-medium">Segundo</span>
            </span>
            <span className="font-mono text-sm font-bold tabular-nums">
              {formatEur(runnerUpPrize)}
            </span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
