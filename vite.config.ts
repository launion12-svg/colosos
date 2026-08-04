import { defineConfig } from 'vite';

export default defineConfig({
  // Rutas RELATIVAS en el build: así el mismo `dist/` funciona tal cual en la
  // raíz de un dominio (Netlify, Cloudflare), en un subdirectorio (GitHub
  // Pages) y dentro del iframe de itch.io, sin recompilar para cada destino.
  base: './',
  build: {
    // los GLB y el bundle ya pesan lo suyo; sin aviso de tamaño
    chunkSizeWarningLimit: 1500,
  },
  test: {
    // Buena parte de la suite no son tests unitarios sino partidas enteras
    // simuladas a 20 Hz. En mi máquina la más lenta ronda medio segundo, pero
    // el corredor de CI es bastante más flojo y con el límite de 5 s por
    // defecto la compilación se cayó por tiempo, no por un fallo real.
    testTimeout: 30000,
  },
});
