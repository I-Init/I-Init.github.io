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
- **Hero teaser** is a card under the title, never behind text, built from the explainer's
  "Under fast rotation" scene (0:31 to 0:54) as two clips so the card can take any shape:
  - `hero-euroc-cameras.mp4`: the two EuRoC camera views, a seamless 6.9 s loop
    (0:31.30 to 0:38.20). The card crops it to fit.
  - `hero-success-rate.mp4`: the success-rate chart (I-Init vs VINS-Mono by angular speed)
    drawing in, then holding for 2.6 s. The 16.6 s loop fades from and to white. The card
    letterboxes it so it always shows whole.

  The hero is one screen tall. The card spans the same width as the sections below and takes
  the height left under the text, up to the clips' shape; phones show the chart only. Both
  clips play muted through `src/components/HeroVideo.tsx`. Visitors who prefer reduced
  motion get the posters and never download the clips. Keep `format=yuv420p` last: the white
  fades otherwise switch the output to 4:4:4, which Safari and most phones cannot play. To
  recut them from `public/videos/`:
  ```bash
  ffmpeg -ss 31.3 -t 6.9 -i i-init-explainer.mp4 -an -vf "fps=30,crop=852:1092:105:278,scale=600:-2:flags=lanczos,format=yuv420p" -c:v libx264 -preset slow -crf 30 -movflags +faststart hero-euroc-cameras.mp4
  ffmpeg -i hero-euroc-cameras.mp4 -frames:v 1 -q:v 3 hero-euroc-cameras-poster.jpg
  ffmpeg -ss 40.5 -t 14 -i i-init-explainer.mp4 -an -vf "setpts=PTS-STARTPTS,fps=30,crop=1546:906:965:405,scale=1280:-2:flags=lanczos,tpad=stop_mode=clone:stop_duration=2.6,fade=t=in:st=0:d=0.5:color=white,fade=t=out:st=16.0:d=0.6:color=white,format=yuv420p" -c:v libx264 -preset slow -crf 28 -movflags +faststart hero-success-rate.mp4
  ffmpeg -ss 15 -i hero-success-rate.mp4 -frames:v 1 -q:v 3 hero-success-rate-poster.jpg
  ```
- **Earlier hero backdrop** (`hero-trajectories.mp4`, not used at the moment) is the explainer's
  "Full pipeline, IMU only" scene (1:41 to 2:00): I-Init initialized odometry drawing over
  ground truth on EuRoC, Blackbird and TLIO. It is played 1.5× faster, with the title, legend
  and labels cropped out and the brightness inverted (hue kept), as a 14.6 s loop for a dark
  hero. To recut it from `public/videos/` (the explainer's last frame, from 2:00.8, is black,
  so the input stops at 2:00.7):
  ```bash
  LUT="lutyuv=y=minval+(maxval-minval)*exp(0.7*log((maxval-clipval)/(maxval-minval)+1e-9))"
  VF="setpts=(PTS-STARTPTS)/1.5,fps=30,drawbox=x=1430:y=130:w=1130:h=95:color=white:t=fill,crop=2560:775:0:170,pad=2880:1620:160:422:color=white,scale=1920:1080:flags=lanczos,tpad=stop_mode=clone:stop_duration=1.5,format=yuv420p,$LUT,fade=t=in:st=0:d=0.5,fade=t=out:st=14.0:d=0.6"
  ffmpeg -ss 101 -t 19.7 -i i-init-explainer.mp4 -an -vf "$VF" -c:v libx264 -preset slow -crf 26 -movflags +faststart hero-trajectories.mp4
  ffmpeg -ss 13.6 -i hero-trajectories.mp4 -frames:v 1 -q:v 3 hero-trajectories-poster.jpg
  ```

## Before going public

- Add arXiv, GitHub, and Hugging Face buttons next to the Paper button in
  `src/app/page.tsx`; their icons are already in `public/svg/`.
- Update the BibTeX entry in `src/app/page.tsx` once the paper has an arXiv ID or venue.
- Only Sebastian Scherer and Yuheng Qiu have homepage links so far.
