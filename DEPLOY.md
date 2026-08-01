# Publicar Colosos en internet

El juego es **100% estático**: no necesita servidor propio, base de datos ni
Node en el hosting. Todo lo que hay que subir es la carpeta `dist/`, que se
genera con:

```bash
npm run build
```

El build usa rutas relativas (`base: './'` en `vite.config.ts`), así que el
mismo `dist/` funciona en la raíz de un dominio, dentro de un subdirectorio y
dentro del iframe de itch.io sin tocar nada.

## Opción 1 — itch.io (la más natural para un juego)

La mejor para enseñárselo a amigos: se juega en el navegador desde la página
del juego, sin descargar nada.

1. Comprime el **contenido** de `dist/` en un zip (que `index.html` quede en la
   raíz del zip, no dentro de una carpeta).
2. En itch.io: *Dashboard* → *Create new project*.
3. **Kind of project**: `HTML`.
4. Sube el zip y marca **"This file will be played in the browser"**.
5. *Embed options*: tamaño del marco 1280 x 720, y activa **fullscreen button**.
6. *Visibility*: `Draft` mientras lo pruebas; los amigos pueden entrar con el
   enlace secreto que te da itch antes de publicarlo.

## Opción 2 — Netlify Drop (la más rápida, sin cuenta)

1. Entra en `app.netlify.com/drop`.
2. Arrastra la carpeta `dist/` a la página.
3. Te da una URL pública al instante (`algo-random.netlify.app`).

Para actualizar, vuelves a arrastrar. Con cuenta gratuita puedes fijar el
nombre del subdominio y conservar la URL entre versiones.

## Opción 3 — GitHub Pages (si quieres el código también público)

1. Sube el proyecto a un repositorio de GitHub.
2. *Settings* → *Pages* → *Source*: `GitHub Actions`.
3. Añade este flujo en `.github/workflows/deploy.yml`:

```yaml
name: deploy
on:
  push:
    branches: [main]
permissions:
  contents: read
  pages: write
  id-token: write
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npm run build
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist
  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
    steps:
      - uses: actions/deploy-pages@v4
```

Cada `git push` a `main` republica el juego solo.

## Opción 4 — Cloudflare Pages / Vercel

Conectas el repositorio y configuras:

- Comando de build: `npm run build`
- Directorio de salida: `dist`

## Notas

- **Peso**: el build ronda los 7 MB, casi todo modelos GLB. La primera carga
  tarda unos segundos; después queda en la caché del navegador.
- **Requisito del jugador**: un navegador con WebGL2 (cualquiera moderno).
  En móvil arranca, pero los controles son de teclado y ratón: de momento es
  un juego de ordenador.
- **HTTPS**: las tres opciones lo dan gratis, y hace falta si algún día
  añadimos audio con permisos o pantalla completa desde el móvil.
