'use client';

import { Tab, TabGroup, TabList, TabPanel, TabPanels } from '@headlessui/react';
import clsx from 'clsx';
import { Check, Copy, FileText, Quote } from 'lucide-react';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import '@/lib/env';

import { covarianceTable, initializationTable, networkOnlyTable, odometryTable } from '@/data/results';

import AlignmentDemo from '@/components/demos/AlignmentDemo';
import Figure from '@/components/Figure';
import KatexSpan from '@/components/KaTeX';
import ArrowLink from '@/components/links/ArrowLink';
import UnderlineLink from '@/components/links/UnderlineLink';
import ResultsTable from '@/components/ResultsTable';

const HERO_FRAMES = [
  '/images/hero/euroc-v103-1.jpg',
  '/images/hero/euroc-v103-2.jpg',
  '/images/hero/euroc-v103-3.jpg',
  '/images/hero/euroc-v103-4.jpg',
];
// Matches the 10 s loop of .hero-frame in globals.css.
const HERO_FRAME_SECONDS = 2.5;

const EQUATIONS = {
  states: String.raw`\mathcal{X}^{\mathrm{init}} = \{\mathbf{g}^{b_0},\ \mathbf{v}_{b_0}^{b_0},\ \mathbf{b}_g\}`,
  velocityResidual: String.raw`\mathbf{r}_k^{\mathrm{init}} = \boldsymbol{\gamma}_{b_k}^{b_0}(\mathbf{b}_g)\,\hat{\mathbf{v}}_{b_k}^{b_k} - \bigl(\mathbf{v}_{b_0}^{b_0} + \mathbf{g}^{b_0}\Delta t_{0k} + \boldsymbol{\beta}_{b_k}^{b_0}(\mathbf{b}_g)\bigr)`,
  velocityObjective: String.raw`\begin{gathered}\min_{\mathbf{g}^{b_0},\,\mathbf{v}_{b_0}^{b_0}} \sum_{k=1}^{K} \bigl\|\mathbf{r}_k^{\mathrm{init}}\bigr\|_{\boldsymbol{\Sigma}_k^{\mathrm{init}}}^2, \\ \boldsymbol{\Sigma}_k^{\mathrm{init}} =\boldsymbol{\gamma}_{b_k}^{b_0}\boldsymbol{\Sigma}_k^{v}\bigl(\boldsymbol{\gamma}_{b_k}^{b_0}\bigr)^{\top} + \boldsymbol{\Sigma}_k^{\boldsymbol{\beta}}\end{gathered}`,
  rollPitchResidual: String.raw`\mathbf{r}_k^{\mathrm{rp}} = \mathbf{S}\,\mathbf{q}_k, \quad \mathbf{q}_k = \hat{\mathbf{R}}_{b_k}^{G_0}\bigl(\boldsymbol{\gamma}_{b_k}^{b_0}\bigr)^{\top}\mathbf{u}, \quad \mathbf{u} = \frac{\mathbf{g}^{b_0}}{\|\mathbf{g}^{b_0}\|}`,
  jointObjective: String.raw`\min_{\mathbf{g}^{b_0},\,\mathbf{v}_{b_0}^{b_0},\,\mathbf{b}_g} \sum_{k=1}^{K} \bigl\|\mathbf{r}_k^{\mathrm{init}}\bigr\|_{\boldsymbol{\Sigma}_k^{\mathrm{init}}}^2 + \sum_{k=1}^{K} \bigl\|\mathbf{r}_k^{\mathrm{rp}}\bigr\|_{\boldsymbol{\Sigma}_k^{\mathrm{rp}}}^2`,
};

const datasets = [
  { name: 'EuRoC', logo: '/images/logos/EuRoC_logo.png', platform: 'Micro aerial vehicle', split: 'Evaluated on MH02, MH04, V101, V103, and V202.' },
  { name: 'Blackbird', logo: '/images/logos/BlackBird_logo.png', platform: 'Aggressive indoor quadrotor flights', split: '75 training, 9 test, and 10 evaluation flights.' },
  { name: 'TLIO', logo: '/images/logos/TLIO_logo.png', platform: 'Head-mounted device, pedestrian motion', split: 'Published split and evaluation protocol.' },
];

function FindingBlock({
  idx,
  title,
  setup,
  results,
  note,
  below,
  children,
}: {
  idx: number;
  title: string;
  setup: ReactNode;
  results: ReactNode[];
  note: ReactNode;
  below?: ReactNode;
  children: ReactNode;
}) {
  return (
    <article className='border-t border-gray-200 py-12'>
      <h2 className='pb-4 text-gray-800'>
        <span className='text-primary-600'>Finding {idx}:</span> {title}
      </h2>
      <div>
        <p className='pb-3 text-lg'>{setup}</p>
        <ul className='list-disc space-y-2 pb-4 pl-6 text-lg'>
          {results.map((result, i) => (
            <li key={i}>{result}</li>
          ))}
        </ul>
        <p className='rounded-r-lg border-l-4 border-primary-500 bg-primary-50 px-4 py-3 text-base leading-relaxed'>
          <strong className='text-primary-700'>Note:</strong> {note}
        </p>
      </div>
      <div className='min-w-0 pt-8'>{children}</div>
      {below && <div className='pt-8'>{below}</div>}
    </article>
  );
}

// Numbers follow the paper and sit outside the formula, which scrolls on its own if it has to.
function Equation({ tex, number }: { tex: string; number: number }) {
  return (
    <div className='flex items-center gap-2 text-gray-800'>
      <KatexSpan tex={tex} display className='min-w-0 flex-1 text-xs sm:text-base lg:text-lg' />
      <span className='shrink-0 text-sm md:text-base'>({number})</span>
    </div>
  );
}

export default function HomePage() {
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'error'>('idle');

  useEffect(() => {
    if (copyStatus !== 'copied') return;
    const timeout = window.setTimeout(() => setCopyStatus('idle'), 2000);
    return () => window.clearTimeout(timeout);
  }, [copyStatus]);

  const textColor = 'text-gray-600';
  const bgColor = 'bg-white';
  const maskColor = 'bg-white/75';
  const secondaryBgColor = 'bg-gray-100';
  const hlTextColor = 'text-primary-600';
  const linkIconClass = 'h-5 w-5 shrink-0 md:h-6 md:w-6';
  const resourceLinkClass =
    'h-14 justify-center gap-2 rounded-lg border border-solid border-gray-300 bg-white/60 px-3 text-sm [&>svg:last-child]:hidden md:mt-6 md:h-auto md:gap-1 md:rounded-none md:border-x-0 md:border-t-0 md:border-dotted md:border-dark md:bg-transparent md:px-0 md:text-lg md:[&>svg:last-child]:block';
  const citation_bibtex = `@misc{huang2026iinit,
      title={I-Init: IMU-Only Initialization for Learning Inertial Odometry},
      author={Weison Huang and Xiang Fei and Junyi Geng and Wenshan Wang and Sebastian Scherer and Yuheng Qiu},
      year={2026},
}`;
  return (
    <main>
      <section className={clsx('bg-black', textColor, 'relative flex min-h-screen flex-col items-center justify-center overflow-hidden')}>
        <div aria-hidden='true' className='pointer-events-none absolute inset-0 z-0'>
          {HERO_FRAMES.map((src, i) => (
            <img
              key={src}
              src={src}
              alt=''
              className='hero-frame'
              style={{ animationDelay: `${(i - HERO_FRAMES.length) * HERO_FRAME_SECONDS}s` }}
            />
          ))}
        </div>
        <div className={clsx('pointer-events-none absolute inset-0 z-10', maskColor)} />
        <div className='layout z-20 relative flex flex-1 flex-col items-center justify-center px-4 py-12 text-center'>
          <h1 className='mb-6 mt-4 text-[clamp(1.75rem,8vw,3rem)] leading-[1.15] tracking-tight md:mb-4 md:text-5xl md:leading-[1.1]'>
            <span className='md:whitespace-nowrap'>
              I-Init: <span className={hlTextColor}>I</span>MU-Only <span className={hlTextColor}>Init</span>ialization
            </span>{' '}
            <span className='md:block md:whitespace-nowrap'>for Learning Inertial Odometry</span>
          </h1>
          <div className='container pb-6'>
            <div className='text-[15px] leading-7 md:text-lg md:leading-[1.75] [&>span]:inline-block [&>span]:whitespace-nowrap [&_sup]:ml-0.5 [&_sup]:text-[0.65em]'>
              <span>Weison Huang<sup>1</sup>,</span>{' '}
              <span>Xiang Fei<sup>1</sup>,</span>{' '}
              <span>Junyi Geng<sup>2</sup>,</span>{' '}
              <span>Wenshan Wang<sup>1</sup>,</span>{' '}
              <span><UnderlineLink href='https://theairlab.org/team/sebastian/' className='font-normal'>Sebastian Scherer</UnderlineLink><sup>1</sup>,</span>{' '}
              <span><UnderlineLink href='https://haleqiu.github.io/' className='font-normal'>Yuheng Qiu</UnderlineLink><sup>1,3</sup></span>
            </div>
          </div>
          {/* Add arXiv, GitHub, and Hugging Face buttons here once they exist; their icons are in public/svg/. */}
          <div className='grid w-full max-w-sm grid-cols-2 gap-3 md:flex md:max-w-none md:justify-center md:gap-8'>
            <ArrowLink className={resourceLinkClass} href='/I-Init.pdf' openNewTab icon={<FileText aria-hidden='true' className={linkIconClass} />}>
              Paper
            </ArrowLink>
            <ArrowLink className={resourceLinkClass} href='#citation' icon={<Quote aria-hidden='true' className={linkIconClass} />}>
              BibTeX
            </ArrowLink>
          </div>
        </div>
        <div className='relative z-20 flex w-full flex-wrap items-end justify-start gap-x-5 gap-y-2 px-3 pb-3 text-left text-base leading-relaxed text-gray-700 md:text-lg [&>span]:whitespace-nowrap [&_sup]:mr-1 [&_sup]:text-[0.7em]'>
          <span><sup>1</sup>Carnegie Mellon University</span>
          <span><sup>2</sup>Penn State University</span>
          <span><sup>3</sup>Amazon FAR</span>
          <span className='ml-auto hidden text-sm text-gray-600 lg:inline'>Background: EuRoC V1_03, t = 0 to 2.5 s, mean angular velocity 60.3 °/s</span>
        </div>
      </section>

      <section className={clsx(bgColor, textColor)}>
        <div className='layout py-12'>
          <h2 className='text-left pb-4'>Abstract</h2>
          <p className='text-pretty text-base leading-[1.75] md:text-lg md:leading-[1.75]'>
            State initialization is essential for robotic navigation and simultaneous localization and mapping (SLAM).
            Conventional initialization methods fuse inertial measurements with exteroceptive sensors, such as cameras and LiDAR.
            However, these sensors can become unreliable under aggressive motion or poor geometric conditions.
            Inertial odometry (IO) estimates motion using only inertial measurement units (IMUs), eliminating dependence on exteroceptive sensors.
            However, existing learning-based IO methods typically assume access to ground-truth initial states, leaving the initialization problem largely unexplored.
            This assumption limits their applicability to real-world deployment.
            To bridge this gap, we present I-Init, an IMU-only initialization method that estimates the initial velocity, gravity direction, and gyroscope bias for learning-based inertial odometry.
            I-Init leverages a unified Transformer-based Motion Network for both initialization and odometry.
            The network predictions provide constraints for initial state estimation without exteroceptive sensors.
            On EuRoC, I-Init achieves comparable gravity-direction estimation accuracy to the visual-inertial VINS-Mono initializer, with a 95% initialization success rate compared to 51% for VINS-Mono.
            Experiments on EuRoC, Blackbird, and TLIO demonstrate state-of-the-art inertial odometry performance.
            We demonstrate that odometry initialized with our IMU-only initialization is very close to the ground-truth initialization.
          </p>
          <div className='mt-8'>
            <Figure
              img_src='/images/fig1_overview.png'
              alt='Top: four EuRoC V1_03 frames under aggressive rotation, with success rates of 51% for VINS-Mono and 95% for I-Init. Bottom: conventional initialization from IMU preintegration, camera, and LiDAR, compared with I-Init from IMU preintegration and a unified network.'
              title='IMU-only initialization'
              width={2732}
              height={1179}
              caption='Conventional methods fuse the IMU with cameras or LiDAR. I-Init needs only IMU measurements and learned velocity.'
              idx={1}
            />
          </div>
        </div>
      </section>

      <section id='video' aria-labelledby='video-title' className={clsx(bgColor, textColor)}>
        <div className='layout border-t border-gray-200 py-12'>
          <h2 id='video-title' className='pb-4'>Video</h2>
          <video
            controls
            playsInline
            preload='metadata'
            poster='/videos/i-init-explainer-poster.jpg'
            width={2560}
            height={1440}
            aria-label='I-Init explainer video'
            className='block h-auto w-full rounded-xl border border-gray-200 bg-black shadow-sm'
          >
            <source src='/videos/i-init-explainer.mp4' type='video/mp4' />
            Your browser cannot play this video. <a href='/videos/i-init-explainer.mp4'>Download it (MP4, 19 MB)</a>.
          </video>
        </div>
      </section>

      <section id='methods' aria-labelledby='methods-title' className={clsx(secondaryBgColor, textColor)}>
        <div className='layout py-12'>
          <h2 id='methods-title' className='pb-4'>Methods</h2>
          <p className='text-lg'>I-Init has three components:</p>
          <ol className='text-lg list-decimal ml-12 pb-6'>
            <li className='pt-2'>
              <span className={hlTextColor}>Motion Network.</span> Predicts body-frame velocity, roll &amp; pitch, and their uncertainties from raw IMU. It needs no attitude input, so it works from the first window.
            </li>
            <li className='pt-2'>
              <span className={hlTextColor}>IMU-only initializer.</span> Aligns these predictions with IMU preintegration to estimate <KatexSpan tex={EQUATIONS.states} />.
            </li>
            <li className='pt-2'>
              <span className={hlTextColor}>Uncertainty-aware EKF.</span> Fuses IMU propagation with the network&apos;s velocity, weighted by the predicted covariance.
            </li>
          </ol>
          <Figure
            img_src='/images/fig2_pipeline.png'
            alt='Left: raw IMU feeds the IO Motion Network and optional AirIMU; their outputs drive I-Init joint optimization and an EKF with propagation and velocity updates. Right: a ResNet and six Transformer layers encode accelerometer and gyroscope samples, and four decoder heads output velocity, rotation, and their covariances.'
            title='Overview of I-Init and the Motion Network architecture'
            width={2698}
            height={748}
            caption={<><b>(a)</b> The initializer and the EKF share the Motion Network&apos;s predictions; AirIMU is optional. <b>(b)</b> Motion Network.</>}
            idx={2}
          />
          <div className='grid gap-6 pt-8 lg:grid-cols-2'>
            <article className='min-w-0 rounded-2xl bg-white p-4 shadow-sm md:p-6'>
              <h3 className='pb-2 text-gray-800'>Velocity alignment</h3>
              <p>
                The IMU alone cannot recover initial velocity or gravity. The network&apos;s velocity does not drift, so it supplies the reference:
                at each key-frame, the predicted velocity rotated into the first body frame should match the preintegrated velocity.
              </p>
              <Equation tex={EQUATIONS.velocityResidual} number={8} />
              <p>The <i>vel</i> variant fixes <KatexSpan tex={String.raw`\mathbf{b}_g = \mathbf{0}`} /> and solves for gravity and initial velocity by Gauss&ndash;Newton, starting from the network&apos;s guess:</p>
              <Equation tex={EQUATIONS.velocityObjective} number={9} />
            </article>
            <article className='min-w-0 rounded-2xl bg-white p-4 shadow-sm md:p-6'>
              <h3 className='pb-2 text-gray-800'>Roll &amp; pitch aiding (+rp)</h3>
              <p>A gyroscope bias makes the preintegrated rotation drift away from the network&apos;s roll &amp; pitch, which do not drift. This residual measures the drift:</p>
              <Equation tex={EQUATIONS.rollPitchResidual} number={10} />
              <p>It is zero when <KatexSpan tex={String.raw`\mathbf{q}_k`} /> is vertical. The <i>+rp</i> variant adds it to (9) and, with raw IMU, also estimates the bias:</p>
              <Equation tex={EQUATIONS.jointObjective} number={11} />
              <p className='text-base'>With AirIMU correction, the bias is already compensated and stays at zero.</p>
            </article>
          </div>
          <p className='figure-caption'>
            <KatexSpan tex={String.raw`\boldsymbol{\gamma}, \boldsymbol{\beta}`} />: preintegrated rotation and velocity. <KatexSpan tex={String.raw`\hat{\mathbf{v}}, \hat{\mathbf{R}}`} />: network predictions. <KatexSpan tex={String.raw`\boldsymbol{\Sigma}_k`} />: covariance weights.
          </p>
          <p className='mt-6 rounded-r-lg border-l-4 border-primary-500 bg-primary-50 px-4 py-3 text-base leading-relaxed'>
            <strong className='text-primary-700'>One network, two window lengths:</strong> the convolutional stem (kernel 16, stride 8) gives one token per key-frame and accepts any input length,
            so the same weights serve the 1024-sample odometry windows and the shorter initialization windows.
          </p>
        </div>
      </section>

      <section id='demo' aria-labelledby='demo-title' className={clsx(bgColor, textColor)}>
        <div className='layout py-12'>
          <h2 id='demo-title' className='pb-4'>Interactive Demo</h2>
          <p className='text-lg'>
            A toy 3-D simulation of the initializer that runs in your browser. The IMU data and network predictions are synthetic; real results are in the <a href='#results' className='font-medium text-primary-700 underline decoration-primary-300 underline-offset-2 hover:decoration-primary-700'>Evaluation</a>.
          </p>
          <div className='pt-8'>
            <AlignmentDemo />
          </div>
        </div>
      </section>

      <section id='results' aria-labelledby='results-title' className={clsx(bgColor, textColor)}>
        <div className='layout border-t border-gray-200 pt-12 pb-12'>
          <h2 id='results-title' className='pb-4'>Evaluation</h2>
          <p className='text-lg'>
            We compare IMU-only with visual-inertial initialization on EuRoC, and odometry under IMU-only versus oracle (ground-truth) initialization on three datasets.
            IMU-only runs use <span className={hlTextColor}>no ground truth at inference</span>.
          </p>
          <ul className='grid gap-4 pt-6 md:grid-cols-3'>
            {datasets.map((dataset) => (
              <li key={dataset.name} className='flex items-center gap-3 rounded-2xl border border-gray-200 p-4'>
                <img src={dataset.logo} alt='' className='h-12 w-12 shrink-0 object-contain' />
                <div className='min-w-0'>
                  <h3 className='text-xl text-gray-800'>{dataset.name}</h3>
                  <p className='text-base'>{dataset.platform}. {dataset.split}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section id='findings' aria-label='Findings' className={clsx(bgColor, textColor)}>
        <div className='layout'>
          <FindingBlock
            idx={1}
            title='IMU-only initialization can be more reliable than visual-inertial initialization'
            setup={<>2.5 s EuRoC segments. Success: gravity-direction error below 5° and velocity RMSE below 0.5 m/s.</>}
            results={[
              <>I-Init:+rp with AirIMU succeeds on <span className={hlTextColor}>95%</span> of segments versus <span className={hlTextColor}>51%</span> for VINS-Mono, with lower gravity error (1.445° vs. 1.611°).</>,
              <>Above 40°/s, VINS-Mono succeeds on at most 12% of segments per cell; I-Init on 62&ndash;100%.</>,
            ]}
            note={<>VINS-Mono has lower velocity RMSE (0.169 vs. 0.267 m/s). I-Init is least reliable above 1.1 m/s.</>}
            below={
              <ResultsTable
                idx='I'
                title='Initialization on EuRoC'
                data={initializationTable}
                caption={<>SR: success rate. Bold: best per column. <i>vel</i> solves (9); <i>+rp</i> adds (10) and, with raw IMU, estimates the bias. <i>Network Init</i> is the unrefined network estimate.</>}
              />
            }
          >
            <Figure
              img_src='/images/fig3_success_heatmap.png'
              alt='Heatmaps of initialization success rate by speed and angular speed on EuRoC. VINS-Mono falls to near zero above 40 degrees per second, while I-Init stays between 62 and 100 percent in the same cells.'
              title='Initialization success across motion regimes on EuRoC'
              width={1317}
              height={652}
              caption={<>VINS-Mono (left) and I-Init <i>vel</i> with AirIMU (right). Blank cells have no segments.</>}
              idx={3}
            />
          </FindingBlock>

          <FindingBlock
            idx={2}
            title='Gyroscope bias is the dominant error source of IMU-only alignment'
            setup={<>An uncompensated bias corrupts the preintegrated rotation and distorts the gravity estimate.</>}
            results={[
              <>With raw IMU, <i>vel</i> succeeds on only 13% of segments, below Network Init (25%).</>,
              <><i>+rp</i> estimates the bias, halving the gravity error (6.05° to 3.04°) and raising success to <span className={hlTextColor}>86%</span>. Its bias-magnitude error is 4.63%, versus 7.18% for VINS-Mono.</>,
              <>With AirIMU, <i>vel</i> and <i>+rp</i> both reach <span className={hlTextColor}>95%</span>.</>,
            ]}
            note={<>We use T = 2.5 s: shorter windows carry little motion, and with AirIMU the velocity error and success rate level off around 2.5&ndash;3.0 s.</>}
          >
            <Figure
              img_src='/images/fig4_window_length.png'
              alt='Three line plots against initialization window from 0.5 to 5 seconds. With raw IMU, the vel variant degrades as the window grows while +rp stays stable. With AirIMU correction, the two variants nearly overlap and perform best.'
              title='Roll &amp; pitch aiding and initialization window length on EuRoC'
              width={2356}
              height={765}
              caption={<>With raw IMU, <i>+rp</i> also estimates the gyroscope bias; with AirIMU, the bias is fixed at zero.</>}
              idx={4}
            />
          </FindingBlock>

          <FindingBlock
            idx={3}
            title='IMU-only initialization preserves odometry accuracy'
            setup={<>The goal is to match the same EKF under oracle initialization. IMU-only runs are aligned only in initial heading and position.</>}
            results={[
              <>With I-Init:+rp, ATE stays <span className={hlTextColor}>within 0.07 m</span> of oracle initialization on all three datasets.</>,
              <>Refinement lowers ATE relative to Network Init everywhere, e.g. 3.06 to 2.91 m on EuRoC.</>,
              <>Without attitude input, our EKF has the lowest oracle ATE on EuRoC and TLIO.</>,
            ]}
            note={<>AirIO EKF is more accurate on Blackbird (2.33 vs. 2.76 m).</>}
          >
            <TabGroup>
              <TabList aria-label='Odometry result tables' className='mb-3 flex flex-wrap gap-2'>
                {['With EKF', 'Network only'].map((view) => (
                  <Tab
                    key={view}
                    className={({ selected }) => clsx(
                      'rounded-full border px-5 py-2 font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600',
                      selected
                        ? 'border-primary-600 bg-primary-600 text-white'
                        : 'border-gray-300 bg-white hover:border-primary-600 hover:text-primary-600'
                    )}
                  >
                    {view}
                  </Tab>
                ))}
              </TabList>
              <TabPanels>
                <TabPanel>
                  <ResultsTable
                    idx='II'
                    title='Inertial odometry accuracy: ATE (m) and AVE (m/s)'
                    data={odometryTable}
                    caption={<>Bold: lowest per column, including ties. † Oracle initialization. Our EKF uses AirIMU-corrected propagation; <i>vel</i> and <i>+rp</i> also use AirIMU-corrected preintegration with the bias fixed at zero.</>}
                  />
                </TabPanel>
                <TabPanel>
                  <ResultsTable
                    idx='IV'
                    title='Network-only inertial odometry accuracy: ATE (m) and AVE (m/s)'
                    data={networkOnlyTable}
                    caption={<>Oracle initialization, no EKF. Bold: lowest per column, including ties. I-Init lowers AirIO&apos;s ATE by 15%, 7%, and 37%, although AirIO&apos;s network also receives attitude.</>}
                  />
                </TabPanel>
              </TabPanels>
            </TabGroup>
          </FindingBlock>

          <FindingBlock
            idx={4}
            title='Learned uncertainty is essential for fusing learned velocity with IMU propagation'
            setup={<>The Motion Network&apos;s R and AirIMU&apos;s Q are each set to identity or to their learned values; nothing else changes.</>}
            results={[
              <>Learning both gives the lowest ATE and AVE on every dataset.</>,
              <>Learned Q with identity R raises both errors everywhere, up to <span className={hlTextColor}>59.6 m</span> ATE on Blackbird.</>,
            ]}
            note={<>The filter weighs velocity against propagation by the ratio of R to Q, so both must be learned.</>}
          >
            <ResultsTable
              idx='III'
              title='Learned measurement and propagation covariances in the EKF'
              data={covarianceTable}
              caption={<>Check: learned. Cross: identity. Oracle initialization. Bold: lowest per column.</>}
            />
          </FindingBlock>
        </div>
      </section>

      <section id='citation' className={clsx(bgColor, textColor)}>
        <div className='layout border-t border-gray-200 pt-4 pb-48'>
          <div className='mt-12 mb-4 flex items-center justify-between gap-3'>
            <h2>Citation</h2>
            <button
              type='button'
              aria-label='Copy BibTeX citation'
              title={copyStatus === 'copied' ? 'Copied!' : 'Copy citation'}
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(citation_bibtex);
                  setCopyStatus('copied');
                } catch {
                  setCopyStatus('error');
                }
              }}
              className='flex h-10 w-10 items-center justify-center rounded-md border border-gray-300 hover:bg-gray-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600'
            >
              {copyStatus === 'copied' ? <Check aria-hidden='true' className='h-5 w-5' /> : <Copy aria-hidden='true' className='h-5 w-5' />}
            </button>
          </div>
          <p role='status' className={copyStatus === 'error' ? 'mb-2 text-sm text-red-700' : 'sr-only'}>
            {copyStatus === 'copied' ? 'Citation copied to clipboard.' : copyStatus === 'error' ? 'Unable to copy. Please select and copy the citation below.' : ''}
          </p>
          <pre className='whitespace-pre-wrap text-sm leading-relaxed md:text-base'>{citation_bibtex}</pre>
        </div>
      </section>
    </main>
  );
}
