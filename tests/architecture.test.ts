// Invariantes de arquitectura: src/sim/ no puede tocar el navegador ni
// fuentes de no-determinismo. Si esto falla, el multijugador de la Fase 4
// nace muerto. (Patrón heredado de WoC tests/architecture.test.ts.)

import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SIM_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'sim');

const BANNED_PATTERNS: Array<[RegExp, string]> = [
  [/from\s+['"]three['"]/, 'import de three'],
  [/from\s+['"]\.\.\/render/, 'import de render/'],
  [/from\s+['"]\.\.\/ui/, 'import de ui/'],
  [/from\s+['"]\.\.\/game/, 'import de game/'],
  [/\bMath\.random\s*\(/, 'Math.random (usa Rng)'],
  [/\bDate\.now\s*\(/, 'Date.now (usa el reloj del sim)'],
  [/\bperformance\.now\s*\(/, 'performance.now (usa el reloj del sim)'],
  [/\bdocument\./, 'acceso al DOM'],
  [/\bwindow\./, 'acceso a window'],
  [/\blocalStorage\b/, 'localStorage'],
];

describe('arquitectura: src/sim es puro y determinista', () => {
  const files = readdirSync(SIM_DIR).filter((f) => f.endsWith('.ts'));

  it('hay archivos de sim que escanear', () => {
    expect(files.length).toBeGreaterThan(4);
  });

  for (const file of files) {
    it(`${file} no usa APIs prohibidas`, () => {
      const src = readFileSync(join(SIM_DIR, file), 'utf8');
      for (const [pattern, label] of BANNED_PATTERNS) {
        expect(pattern.test(src), `${file}: ${label}`).toBe(false);
      }
    });
  }
});
