# Colosos: El Mundo Errante — Fase 0

MMO-lite en el navegador. La civilización vive sobre el lomo de criaturas
colosales que caminan sobre un mar de niebla tóxica. Esta Fase 0 es el slice
vertical: el lomo del primer coloso, movimiento con feel, ciclo día/noche y
combate contra los lobos de niebla.

## Jugar en local

```bash
npm install
npm run dev        # abre http://localhost:5173
```

O con el build ya generado:

```bash
npm run preview    # sirve dist/ en http://localhost:4173
```

**Controles**: WASD moverte · Espacio saltar · Click izquierdo o J atacar ·
arrastrar el ratón para orbitar la cámara.

## Comandos

- `npm test` — suite Vitest (determinismo, terreno, movimiento, arquitectura)
- `npm run typecheck` — TypeScript estricto
- `npm run build` — build de producción
- `node scripts/shots.mjs` — capturas automatizadas (requiere build previo)

## Arquitectura

"Un sim, varios hosts" (heredado de World of ClaudeCraft): `src/sim/` es un
núcleo determinista a 20 Hz sin dependencias del navegador — misma semilla +
mismos inputs = mismo mundo, bit a bit. `src/render/` (Three.js) interpola y
dibuja; `src/ui/` escucha eventos. El multijugador de la Fase 4 será ejecutar
este mismo sim en un servidor Node.

| Ruta | Qué es |
|---|---|
| `src/sim/` | Núcleo determinista: terreno, movimiento, combate, IA |
| `src/render/` | Three.js: malla del lomo, día/noche, personajes, juice |
| `src/ui/` | HUD (marcos, números de daño, reloj) |
| `src/game/` | Hooks de audio (assets en Fase 2) |
| `tests/` | Vitest, incluida la paridad de determinismo |

Los números de tuning viven con nombre en `src/sim/types.ts` (movimiento,
combate, mobs) y las curvas del ciclo día/noche en `src/render/day_night.ts`.

## Créditos

Ver `ATTRIBUTIONS.md`: código derivado de World of ClaudeCraft (MIT, Levy
Street); modelos CC0 de KayKit y Quaternius.
