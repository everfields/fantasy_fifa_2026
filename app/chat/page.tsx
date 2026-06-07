import { requireUser } from "@/lib/auth/guards";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Avatar,
  AvatarFallback,
} from "@/components/ui/avatar";

import { AppShell } from "../_components/shell";

export const metadata = { title: "Chat · Mundial 26" };

// Static placeholder shoutbox. The realtime wiring is intentionally deferred.
//
// TODO(realtime): replace these seed messages with a Supabase `messages` table
// + RLS (members read all, insert own). On the client, subscribe via
//   createClient().channel('shoutbox').on('postgres_changes', ...)
// for live appends, and post through a `sendMessage` server action. Keep this
// component's markup; only swap the data source + form action.
const SEED = [
  {
    name: "El Mister",
    text: "Brasil 3-0 fijo, lo apunto y lo firmo ✍️",
    when: "hace 5 min",
    me: false,
  },
  {
    name: "Laura GD",
    text: "Vais a llorar cuando España gane el grupo 🇪🇸",
    when: "hace 12 min",
    me: false,
  },
  {
    name: "Tú",
    text: "Gasto el joker en el Argentina-Francia, avisados quedáis 🃏",
    when: "hace 1 min",
    me: true,
  },
];

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

export default async function ChatPage() {
  const profile = await requireUser();

  return (
    <AppShell profile={profile}>
      <div className="mx-auto max-w-2xl space-y-6">
        <header className="space-y-1">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-black tracking-tight sm:text-4xl">
              Chat del grupo
            </h1>
            <Badge variant="secondary">Beta</Badge>
          </div>
          <p className="text-muted-foreground">
            Pique sano antes de cada jornada. (Tiempo real próximamente.)
          </p>
        </header>

        <Card className="flex h-[28rem] flex-col">
          <CardHeader className="border-b">
            <CardTitle className="text-base">Shoutbox</CardTitle>
          </CardHeader>
          <CardContent className="flex-1 space-y-4 overflow-y-auto py-5">
            {SEED.map((m, i) => (
              <div
                key={i}
                className={`flex items-end gap-2.5 ${
                  m.me ? "flex-row-reverse" : ""
                }`}
              >
                <Avatar className="h-8 w-8">
                  <AvatarFallback>{initials(m.name)}</AvatarFallback>
                </Avatar>
                <div className={`max-w-[75%] ${m.me ? "text-right" : ""}`}>
                  <div
                    className={`inline-block rounded-2xl px-4 py-2 text-sm ${
                      m.me
                        ? "rounded-br-sm bg-primary text-primary-foreground"
                        : "rounded-bl-sm bg-secondary text-secondary-foreground"
                    }`}
                  >
                    {m.text}
                  </div>
                  <p className="mt-1 px-1 text-xs text-muted-foreground">
                    {m.name} · {m.when}
                  </p>
                </div>
              </div>
            ))}
          </CardContent>
          <div className="border-t p-3">
            {/* TODO(realtime): wire to a sendMessage server action + optimistic
                append. Disabled until the messages table + Realtime land. */}
            <form className="flex items-center gap-2" aria-disabled>
              <Input
                placeholder="Escribe algo… (próximamente)"
                disabled
                aria-label="Mensaje"
              />
              <Button type="button" disabled>
                Enviar
              </Button>
            </form>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
