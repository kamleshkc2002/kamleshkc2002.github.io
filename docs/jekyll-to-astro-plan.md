# Jekyll to Astro Migration Plan

## Goal

Replace the Ruby/Jekyll site build with an Astro static build while keeping the existing public URLs, visual design, vacation planner behavior, and Cloudflare Worker service intact.

## Branches

- `kc/jekyll-to-astro-plan`: migration plan only.
- `kc/jekyll-to-astro-site`: implementation branch based on the plan branch.

## Approach

1. Add an Astro project at the repository root.
2. Move Jekyll layout responsibilities into Astro layouts/components:
   - shared `<head>` metadata
   - site navigation
   - script/style loading
   - page shell classes
3. Preserve public routes:
   - `/`
   - `/vacation-planner/`
   - `/cv.pdf`
   - `/favicon.ico`
   - `/css/*`
   - `/js/*`
   - `/font-awesome/*`
   - `/fonts/*`
4. Keep the vacation planner JavaScript modular and browser-native for the first migration.
5. Move static runtime assets into `public/` so Astro copies them directly.
6. Keep Sass source in `src/styles/` and let Astro/Vite compile CSS.
7. Remove Jekyll-only files after the Astro equivalent is in place.
8. Add a GitHub Pages workflow that builds Astro and publishes `dist`.
9. Keep `services/flight-search-worker` as an independent Worker package.

## Verification

- Install root Node dependencies.
- Run `npm run build`.
- Confirm generated files in `dist/` include `index.html`, `vacation-planner/index.html`, assets, CV, favicon, and planner JS.
- Run `npm run preview` locally if Node is available.
- Run the Worker tests from `services/flight-search-worker` separately.

## Notes

- The current environment used for migration does not provide `node` or `npm`, so build verification may need to run on a machine with Node installed.
- The Worker already has its own `package.json`, tests, and deployment config; the root Astro migration should not merge those concerns.
