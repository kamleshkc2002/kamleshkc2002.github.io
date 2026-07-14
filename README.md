# kamleshkc2002.github.io

Personal website for Kamlesh Chhetty, built with Astro and hosted on GitHub Pages.

## Local development

Use Node 22.12.0 or newer. If your version manager supports it, `.node-version` selects the expected runtime.

```sh
npm install
npm run dev
```

Then open the local URL printed by Astro.

## Build

```sh
npm run build
npm run preview
```

The static site builds to `dist/`. GitHub Actions publishes that directory to GitHub Pages.

## Flight search worker

The vacation planner's flight-search API lives in `services/flight-search-worker` and is deployed separately as a Cloudflare Worker.
