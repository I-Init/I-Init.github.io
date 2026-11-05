# I-Init project page

Project page for **I-Init: IMU-Only Initialization for Learning Inertial Odometry**,
to be served at <https://i-init.github.io>.
Built on the same Next.js + Tailwind template as the
[SSIO](https://github.com/SSIO-IMU/SSIO-IMU.github.io) project page.

```bash
corepack pnpm install
corepack pnpm dev      # http://localhost:3000
corepack pnpm build    # static export into docs/ (commit docs/)
```

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

Everything on the page comes from the paper, `public/I-Init.pdf`.

- **Figures** in `public/images/` are cropped from the PDF at 400 DPI. Figure numbers
  and captions follow the paper. They open in the viewer from
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
