# I-Init project page

Project page for **I-Init: IMU-Only Initialization for Learning Inertial Odometry**,
to be served at <https://i-init.github.io>.
Built on the same Next.js + Tailwind template as the
[SSIO](https://github.com/SSIO-IMU/SSIO-IMU.github.io) project page.

```bash
corepack pnpm install
corepack pnpm dev      # http://localhost:3000, builds into .next/
corepack pnpm build    # static export into docs/ (commit docs/)
```

Only `pnpm build` writes to `docs/`. `next.config.js` picks the output folder by phase, so
`pnpm dev` (and `pnpm lint`, whose ESLint cache goes to `.next/cache/eslint/`) can run at
any time, even during a build, without touching the published site.

To preview the exported site, serve `docs/` from its root, for example
`python -m http.server --directory docs 8000`. Opening `docs/index.html` directly
does not work because asset paths are absolute.

## Publishing

The repository starts private. GitHub Pages cannot serve a private repository on
GitHub Free, so the site goes live in two steps:

1. Settings → General → Danger Zone → Change repository visibility → Public.
2. Settings → Pages → Deploy from a branch → `main`, folder `/docs`.

Because the repository is named `I-Init.github.io` under the `I-Init` organization,
the site is then served at the root of <https://i-init.github.io>. Making the
repository public also publishes `public/I-Init.pdf`.

## Content sources

Everything on the page comes from the paper, `public/I-Init.pdf`, except the
interactive demo. The abstract is verbatim; the rest of the text, including figure and
table captions, is condensed from the paper and leaves out what the figures already show.

- **Interactive demo** in `src/components/demos/AlignmentDemo.tsx` runs a toy
  simulation from `src/lib/demo/init-sim.ts` in the browser: a body moving and rotating
  in 3-D, synthetic IMU data with a gyroscope bias, and a simulated Motion Network, with
  equations (8)–(11) solved by Gauss–Newton. Unlike the paper's solver, it adds a weak
  3 °/s prior on the bias, because the component along gravity is barely observable in
  the toy. Its numbers are synthetic and illustrate the method; the page says so. Charts
  are hand-drawn SVG through `src/components/demos/Plot.tsx`.
- **Video** in `public/videos/` is the ICRA explainer (`ICRA_video_20MB.mp4`, copied
  unchanged: H.264/AAC, 2560×1440, 2 min, 19 MB, index at the start so it streams).
  The poster is its title card at 1 s, extracted with
  `ffmpeg -ss 1 -i i-init-explainer.mp4 -frames:v 1 -vf scale=1280:-2 -q:v 3 i-init-explainer-poster.jpg`.
- **Figures** in `public/images/` are cropped from the PDF at 400 DPI. Figure numbers
  follow the paper. They open in the viewer from
  `src/components/ExpandableImage.tsx`.
- **Tables** live in `src/data/results.tsx` and render through
  `src/components/ResultsTable.tsx`. A trailing `*` marks a value the paper sets in
  bold. Table numbers follow the paper; Table IV is the paper's appendix and appears
  under the “Network only” tab of Finding 3.
- **Equations** in `src/app/page.tsx` keep the paper's numbering. KaTeX renders them
  during the static export, so a malformed formula fails the build.
- **Hero backdrop** in `public/images/hero/` is the four EuRoC V1_03 frames embedded in
  Figure 1, crossfading in a 10 s loop (`.hero-frame` in `src/styles/globals.css`).
  Reduced-motion preferences show the first frame only.

## Before going public

- Add arXiv, GitHub, and Hugging Face buttons next to the Paper button in
  `src/app/page.tsx`; their icons are already in `public/svg/`.
- Update the BibTeX entry in `src/app/page.tsx` once the paper has an arXiv ID or venue.
- Only Sebastian Scherer and Yuheng Qiu have homepage links so far.
