# ADR-0016: Maillot azul + consistencia visual y de lenguaje en las clasificaciones

- **Date:** 2026-06-12
- **Status:** Accepted
- **Supersedes:** — (extiende 0014 y 0015)

## Context

Las clasificaciones ciclistas (ADR-0014) y la meta volante por posiciones (ADR-0015) se
construyeron por separado y se notaba: terminología mezclada («Jugador» en Regularidad y
RankingTable vs «Corredor» en Pelotón y Montaña), chrome distinto por tablero (cabeceras,
footers explicativos, tamaños de fila), y la meta volante marcaba a sus ganadores con un `★`
ad-hoc sin identidad propia. Además, en móvil la página `/standings` gastaba la primera línea
en un `<h1>Clasificación` + botón «€ Bote» — cabecera de escritorio en una pantalla pequeña.

## Decision

1. **Maillot azul** — nuevo `MaillotKey: "azul"`: lo viste **todo corredor que haya GANADO al
   menos una ronda de meta volante** (mejor `round_points` entre los `round_awards` de la ronda;
   empate pleno → todos los empatados lo visten). Varios corredores pueden llevarlo a la vez —
   a diferencia del resto de maillots de líder. Se calcula en `assignMaillots`
   (`roundAwards?: RoundAward[]`, puro, testeado) y aparece en la general y en la leyenda
   automáticamente. El azul es el color identidad de la meta volante (chips de ronda, premios,
   footer del tablero).
2. **Terminología: «corredor», nunca «jugador»** en toda UI de clasificaciones
   (boards + RankingTable). El admin (`components/admin/*`) conserva «jugador» — no es tema ciclista.
3. **Consistencia visual entre tableros:** `initials()` y `RankBadge` compartidos en
   `components/classifications.tsx` (acento temático por tablero: ámbar general/meta-live,
   rojo montaña, verde regularidad, azul meta volante); misma anatomía de fila
   (RankBadge h-7 · Avatar h-8 · nombre + badge «Tú» · número grande a la derecha); cabecera
   de tablero con su MaillotBadge; footer explicativo «adosado» (patrón de Regularidad);
   empty states idénticos.
4. **Móvil mobile-oriented en `/standings`:** el `<h1>Clasificación` se oculta en móvil
   (los Tabs son lo primero); el botón «€ Bote» desaparece — los premios viven ahora en una
   sección «El bote» de `/rules` (solo si `winnerPrize > 0`). `PotDialog.tsx` eliminado.

5. **Coche Aston Martin (safety car)** — *añadido el mismo día*: el **antepenúltimo y el
   penúltimo** de la general llevan un icono de monoplaza Aston Martin (verde `#069f8d` +
   franja lima `#cedc00`, halo; ~30px, mayor que los maillots para que se lea el livery) —
   el safety car les pisa la rueda. El **último NO** lo lleva: viste solo el farolillo rojo.
   Puro en `assignAstons(general)` (≥4 corredores y líder con puntos > 0); badge `AstonBadge`
   en `components/classifications.tsx`; renderizado en `PelotonBoard` + leyenda.

## Alternatives considered

- **Azul solo para el líder acumulado de meta volante** — rechazado: el usuario pidió
  explícitamente premiar «a cada ganador de meta volante»; en ciclismo la meta volante premia
  el sprint puntual, no una general.
- **«Jugador» como término global** — rechazado: rompe la metáfora ciclista que ya domina
  la general y la montaña.

## Consequences

- `MaillotKey` tiene 7 valores; cualquier `Record<MaillotKey, …>` exhaustivo debe incluir `azul`.
- `assignMaillots` acepta `roundAwards` (opcional, back-compat); `/standings` se lo pasa.
- El bote ya no se ve en `/standings`; la fuente para jugadores es `/rules`.
- Sin cambios de DB ni de recalc: todo es derivado en render.

## Changes landed

- **Contract:** `lib/types.ts` — `MaillotKey` += `"azul"`.
- **Code:** `lib/classifications/maillots.ts` (+spec), `components/MaillotBadge.tsx`,
  `components/classifications.tsx` (nuevo), `components/{MetaVolanteBoard,PelotonBoard,MontanaBoard,RegularityBoard,RankingTable}.tsx`,
  `components/PotDialog.tsx` (eliminado), `app/standings/page.tsx`, `app/rules/page.tsx`.
- **Docs:** `CLAUDE.md` actualizado; este ADR añadido.
