# ADR-0017: Clasificaciones Extremadura y Monars (maillots de peña)

- **Date:** 2026-06-14
- **Status:** Accepted
- **Supersedes:** — (amplía ADR-0014 y ADR-0016)

## Context

Las clasificaciones ciclistas (ADR-0014) ya incluían maillots de roster fijo por email: el
`blanco` (mejor joven, 3 corredores) y el `arcoíris` (campeón previo, 1 corredor), resueltos en
servidor vía `profile_emails()`. La peña pidió dos sub-clasificaciones "de mote" más, cada una con
su propio maillot y su pestaña, siguiendo exactamente el patrón del `blanco`:

- **Extremadura** — al mejor corredor procedente de Extremadura.
- **Monars** — al mejor corredor de la familia Monar.

## Decision

Dos maillots nuevos de **roster fijo**, idénticos en mecánica al `blanco`: el maillot lo viste el
corredor **mejor situado de la general** cuyo email pertenece al roster (siempre que haya algún
miembro presente, aunque tenga 0 puntos; desempate por `created_at`, ya implícito en `sortGeneral`).
Un corredor puede vestir varios a la vez.

Rosters (por email, en `lib/classifications/config.ts`):

- **Extremadura** (`MAILLOT_EXTREMADURA_EMAILS`): AlexP y su representante, Raúl Lucía, Nacho C,
  JM, nandonandez.
- **Monars** (`MAILLOT_MONARS_EMAILS`): Pablo M.H, El Monar verdadero, Fer MM.

Diseño de los maillots (SVG inline, colores fijos en ambos temas, `components/MaillotBadge.tsx`):

- **extremadura** — bandera de Extremadura: tres bandas horizontales verde / blanco / negro.
- **monars** — bandera de Canarias: tres bandas verticales blanco / azul / amarillo, con una **"M"**
  blanca (borde azul oscuro) superpuesta en el centro.

UI: dos pestañas nuevas en `/standings`, **después de "Jóvenes"** (orden: General · Montaña ·
Regularidad · Jóvenes · **Extremadura · Monars** · Meta volante · Evolución). Cada una es un
`RankingTable` filtrado al roster y re-rankeado 1..n, con `BoardHeader` canónico. Se ocultan si el
mapa de emails está vacío (RPC no disponible), igual que Jóvenes.

## Alternatives considered

- **Solo maillot en la general, sin pestaña** — rechazado: rompe la simetría con Jóvenes y no deja
  ver la sub-clasificación completa.
- **Roster por user_id / nick** — rechazado: los nicks cambian y se re-siembran; el email es la
  clave estable (mismo criterio que ADR-0014). Los emails **nunca** salen del servidor.

## Consequences

- `MaillotKey` += `extremadura | monars`. Aparecen en la leyenda de la general cuando hay portador
  (vía `presentMaillots`), igual que el resto.
- Sin cambios de DB ni de recalc: todo se deriva en render de datos ya puntuados (clasificaciones
  puras, sin I/O).
- Si un corredor de un roster cambia de email, actualizar la constante en `config.ts`.

## Changes landed

- **Contract:** `lib/types.ts` — `MaillotKey` += `extremadura`, `monars`.
- **Code:** `lib/classifications/config.ts` (rosters), `index.ts` (re-export),
  `maillots.ts` (`awardBestRosterMember` refactor + dos picks), `components/MaillotBadge.tsx`
  (labels, gradientes, overlay "M"), `app/standings/page.tsx` (dos pestañas + filtrado por roster).
- **Tests:** `lib/classifications/maillots.spec.ts` — picks de extremadura/monars y ausencia sin roster.
- **Docs:** `CLAUDE.md` (línea de maillots fijos); este ADR; fila en `docs/decisions/README.md`.
