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
});
