'use client';

import { Tab, TabGroup, TabList, TabPanel, TabPanels } from '@headlessui/react';
import clsx from 'clsx';
import { Check, Copy, FileText, Quote } from 'lucide-react';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import '@/lib/env';

import { covarianceTable, initializationTable, networkOnlyTable, odometryTable } from '@/data/results';

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
      <div className='grid items-center gap-8 lg:grid-cols-[2fr_3fr] lg:gap-12'>
        <div>
          <h2 className='pb-4 text-gray-800'>
            <span className='text-primary-600'>Finding {idx}:</span> {title}
          </h2>
          <p className='pb-3 text-lg'>{setup}</p>
          <ul className='list-disc space-y-2 pb-4 pl-6 text-lg'>
            {results.map((result, i) => (
              <li key={i}>{result}</li>
            ))}
          </ul>
          <p className='rounded-r-lg border-l-4 border-primary-500 bg-primary-50 px-4 py-3 text-sm leading-relaxed'>
            <strong className='text-primary-700'>Note:</strong> {note}
          </p>
        </div>
        <div className='min-w-0'>{children}</div>
      </div>
      {below && <div className='pt-8'>{below}</div>}
    </article>
  );
}

// Numbers follow the paper and sit outside the formula, which scrolls on its own if it has to.
function Equation({ tex, number }: { tex: string; number: number }) {
  return (
    <div className='flex items-center gap-2 text-gray-800'>
      <KatexSpan tex={tex} display className='min-w-0 flex-1 text-xs sm:text-base' />
      <span className='shrink-0 text-sm'>({number})</span>
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
          <p className='max-w-[58rem] text-pretty text-base leading-[1.75] md:text-lg md:leading-[1.75]'>
            State initialization is essential for robotic navigation and simultaneous localization and mapping (SLAM).
            Conventional initialization methods fuse inertial measurements with exteroceptive sensors, such as cameras and LiDAR.
            However, these sensors can become unreliable under aggressive motion or poor geometric conditions.
            Inertial odometry (IO) estimates motion using only inertial measurement units (IMUs), eliminating dependence on exteroceptive sensors.
            However, existing learning-based IO methods typically assume access to ground-truth initial states, leaving the initialization problem largely unexplored.
            This assumption limits their applicability to real-world deployment.
            To bridge this gap, we present <b>I-Init</b>, an IMU-only initialization method that estimates the initial velocity, gravity direction, and gyroscope bias for learning-based inertial odometry.
            I-Init leverages a unified Transformer-based <b>Motion Network</b> for both initialization and odometry.
            The network predictions provide constraints for initial state estimation without exteroceptive sensors.
            On EuRoC, I-Init achieves comparable gravity-direction estimation accuracy to the visual-inertial VINS-Mono initializer, with a 95% initialization success rate compared to 51% for VINS-Mono.
            Experiments on EuRoC, Blackbird, and TLIO demonstrate state-of-the-art inertial odometry performance.
            We demonstrate that odometry initialized with our IMU-only initialization is very close to the ground-truth initialization.
          </p>
          <div className='mt-8'>
            <h3 className='mb-4 text-left text-2xl font-semibold'>
              Initialization Without Exteroceptive Sensors
            </h3>
            <Figure
              img_src='/images/fig1_overview.png'
              alt='Top: four EuRoC V1_03 frames under aggressive rotation, with success rates of 51% for VINS-Mono and 95% for I-Init. Bottom: conventional initialization from IMU preintegration, camera, and LiDAR, compared with I-Init from IMU preintegration and a unified network.'
              title='IMU-only initialization'
              width={2732}
              height={1179}
              caption='The conventional method estimates the initial state through multi-sensor fusion. In contrast, I-Init initializes the gravity direction, initial velocity, and gyroscope bias using only IMU measurements and learned velocity predictions without exteroceptive sensing. On the EuRoC dataset, I-Init achieves a 95% initialization success rate, compared with only 51% for the visual-inertial VINS-Mono baseline.'
              idx={1}
            />
          </div>
        </div>
      </section>

      <section id='methods' aria-labelledby='methods-title' className={clsx(secondaryBgColor, textColor)}>
        <div className='layout py-12'>
          <h2 id='methods-title' className='pb-4'>Methods</h2>
          <p className='text-lg'>I-Init estimates motion from IMU measurements alone with three components:</p>
          <ol className='max-w-[58rem] text-lg list-decimal ml-12 pb-6'>
            <li className='pt-2'>
              <span className={hlTextColor}>Motion Network.</span> A Transformer predicts body-frame velocity, roll &amp; pitch, and their uncertainties from a window of raw IMU samples. It takes no attitude or other state estimate as input, so it operates from the first IMU window onward.
            </li>
            <li className='pt-2'>
              <span className={hlTextColor}>IMU-only initializer.</span> Aligning the network&apos;s predictions with IMU preintegration estimates the gravity direction, initial velocity, and gyroscope bias, <KatexSpan tex={EQUATIONS.states} />.
            </li>
            <li className='pt-2'>
              <span className={hlTextColor}>Uncertainty-aware EKF.</span> The estimated state initializes an EKF that fuses IMU propagation with velocity predictions from the same network, weighted by their predicted covariance.
            </li>
          </ol>
          <Figure
            img_src='/images/fig2_pipeline.png'
            alt='Left: raw IMU feeds the IO Motion Network and optional AirIMU; their outputs drive I-Init joint optimization and an EKF with propagation and velocity updates. Right: a ResNet and six Transformer layers encode accelerometer and gyroscope samples, and four decoder heads output velocity, rotation, and their covariances.'
            title='Overview of I-Init and the Motion Network architecture'
            width={2698}
            height={748}
            caption={<><b>(a)</b> The initializer and the EKF share the Motion Network&apos;s predictions; AirIMU correction is optional. <b>(b)</b> The Motion Network maps an IMU window to body-frame velocity, roll &amp; pitch, and their uncertainties.</>}
            idx={2}
          />
          <div className='grid gap-6 pt-8 lg:grid-cols-2'>
            <article className='min-w-0 rounded-2xl bg-white p-4 shadow-sm md:p-6'>
              <h3 className='pb-2 text-gray-800'>Velocity alignment</h3>
              <p>
                An IMU alone cannot determine the initial velocity or the gravity direction, because integration propagates both from unknown initial values.
                The network supplies the missing reference: each velocity prediction is computed from a window of measurements rather than accumulated by integration, so its error does not grow with time.
                At each key-frame, the predicted velocity rotated into the first body frame should equal the preintegrated velocity:
              </p>
              <Equation tex={EQUATIONS.velocityResidual} number={8} />
              <p>Without roll &amp; pitch aiding, we fix <KatexSpan tex={String.raw`\mathbf{b}_g = \mathbf{0}`} /> and solve for gravity and initial velocity by Gauss&ndash;Newton, from an initial guess provided by the network:</p>
              <Equation tex={EQUATIONS.velocityObjective} number={9} />
            </article>
            <article className='min-w-0 rounded-2xl bg-white p-4 shadow-sm md:p-6'>
              <h3 className='pb-2 text-gray-800'>Roll &amp; pitch aiding (+rp)</h3>
              <p>
                A gyroscope bias makes the preintegrated rotation drift, so the gravity direction it propagates to each key-frame departs from the roll &amp; pitch predicted by the network, which does not drift.
                This residual measures the departure and thereby constrains the bias:
              </p>
              <Equation tex={EQUATIONS.rollPitchResidual} number={10} />
              <p>If the two agree, <KatexSpan tex={String.raw`\mathbf{q}_k`} /> is parallel to the vertical axis, and its two horizontal components, which <KatexSpan tex={String.raw`\mathbf{S}`} /> selects, vanish. The +rp variant adds these residuals to the velocity objective and, with raw IMU, also estimates the bias:</p>
              <Equation tex={EQUATIONS.jointObjective} number={11} />
              <p className='text-sm'>
                With AirIMU correction, the learned corrections already compensate the gyroscope bias, so the residual bias stays fixed at zero.
              </p>
            </article>
          </div>
          <p className='figure-caption'>
            <KatexSpan tex={String.raw`\boldsymbol{\gamma}`} /> and <KatexSpan tex={String.raw`\boldsymbol{\beta}`} /> are the rotation and velocity preintegration increments, <KatexSpan tex={String.raw`\hat{\mathbf{v}}`} /> and <KatexSpan tex={String.raw`\hat{\mathbf{R}}`} /> are network predictions, and <KatexSpan tex={String.raw`\boldsymbol{\Sigma}_k`} /> weights each residual by its propagated or predicted covariance.
          </p>
          <p className='mt-6 rounded-r-lg border-l-4 border-primary-500 bg-primary-50 px-4 py-3 text-sm leading-relaxed'>
            <strong className='text-primary-700'>One network, two window lengths:</strong> a residual one-dimensional convolution with kernel size 16 and stride 8 embeds 1024 six-channel IMU samples into 127 tokens, one per key-frame, followed by 6 pre-norm attention blocks with 6 heads each and four two-layer MLP heads of width 128.
            Because the convolutional stem and the sinusoidal encodings accept inputs of any length, the same weights process both the 1024-sample odometry windows and the shorter initialization windows.
          </p>
        </div>
      </section>

      <section id='results' aria-labelledby='results-title' className={clsx(bgColor, textColor)}>
        <div className='layout pt-12 pb-12'>
          <h2 id='results-title' className='pb-4'>Evaluation</h2>
          <p className='max-w-[58rem] text-lg'>
            We compare IMU-only initialization with visual-inertial initialization on EuRoC, and test whether odometry with IMU-only initialization retains the accuracy of the same EKF under oracle initialization on three datasets.
            Oracle initialization supplies the ground-truth initial state; IMU-only initialization estimates it with I-Init and uses <span className={hlTextColor}>no ground-truth input at inference</span>.
          </p>
          <ul className='grid gap-4 pt-6 md:grid-cols-3'>
            {datasets.map((dataset) => (
              <li key={dataset.name} className='flex items-center gap-3 rounded-2xl border border-gray-200 p-4'>
                <img src={dataset.logo} alt='' className='h-12 w-12 shrink-0 object-contain' />
                <div className='min-w-0'>
                  <h3 className='text-xl text-gray-800'>{dataset.name}</h3>
                  <p className='text-sm'>{dataset.platform}. {dataset.split}</p>
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
            setup={<>We evaluate on 2.5 s segments from the EuRoC evaluation sequences. A segment succeeds when the gravity-direction error is below 5° and the velocity RMSE is below 0.5 m/s.</>}
            results={[
              <>I-Init:+rp with AirIMU correction succeeds on <span className={hlTextColor}>95%</span> of segments, compared with <span className={hlTextColor}>51%</span> for VINS-Mono, with a lower average gravity-direction error (1.445° versus 1.611°).</>,
              <>Above 40°/s, VINS-Mono succeeds on at most 12% of the segments in any cell and on none above 55°/s; in the same cells, I-Init succeeds on 62&ndash;100%.</>,
              <>VINS-Mono also fails on most near-stationary segments (9% below 0.1 m/s), where I-Init succeeds on 90%.</>,
            ]}
            note={<>VINS-Mono attains a lower velocity RMSE (0.169 versus 0.267 m/s). I-Init is least reliable above 1.1 m/s, dropping to 57&ndash;75% in several cells and to 0% in the cell combining 1.3&ndash;2.7 m/s with 30&ndash;40°/s, in which VINS-Mono also fails.</>}
            below={
              <ResultsTable
                idx='I'
                title='Initialization on EuRoC'
                data={initializationTable}
                caption={<>Velocity RMSE, gravity-direction error, and success rate (SR) at a nominal initialization duration of 2.5 s. Bold values indicate the best result in each column across all methods. <i>vel</i> solves (9) from learned velocity alone; <i>+rp</i> adds the roll &amp; pitch residual (10) and estimates gyroscope bias for raw IMU. <i>Network Init</i> returns the unrefined network estimate.</>}
              />
            }
          >
            <Figure
              img_src='/images/fig3_success_heatmap.png'
              alt='Heatmaps of initialization success rate by speed and angular speed on EuRoC. VINS-Mono falls to near zero above 40 degrees per second, while I-Init stays between 62 and 100 percent in the same cells.'
              title='Initialization success across motion regimes on EuRoC'
              width={1317}
              height={652}
              caption={<>Matched 2.5 s segments from the five evaluation sequences are binned by speed and angular speed. Each cell reports the success rate of VINS-Mono (left) and I-Init (<i>vel</i> with AirIMU correction, right); blank cells contain no segments. Success requires a gravity-direction error below 5° and a velocity RMSE below 0.5 m/s.</>}
              idx={3}
            />
          </FindingBlock>

          <FindingBlock
            idx={2}
            title='Gyroscope bias is the dominant error source of IMU-only alignment'
            setup={<>An uncompensated bias corrupts the preintegrated rotation, which misaligns the predicted velocities and distorts the gravity estimate. Whether learned by AirIMU or estimated by +rp, bias compensation is essential.</>}
            results={[
              <>With raw IMU, <i>vel</i> succeeds on only 13% of segments, fewer than the unrefined Network Init (25%).</>,
              <>Estimating the bias through the roll &amp; pitch residuals halves the gravity-direction error, from 6.048° to 3.042°, and raises the success rate to <span className={hlTextColor}>86%</span>. The estimated bias magnitude deviates from the reference by 4.63%, compared with 7.18% for VINS-Mono.</>,
              <>With AirIMU correction, <i>vel</i> and <i>+rp</i> both reach <span className={hlTextColor}>95%</span> success, so the roll &amp; pitch residuals add little once the bias is compensated.</>,
            ]}
            note={<>The window length trades motion information against accumulated bias. At T = 0.5 s, gravity-direction errors are approximately 4&ndash;5°; with AirIMU correction, the velocity error and success rate saturate around T = 2.5&ndash;3.0 s. We therefore use T = 2.5 s as a practical compromise between initialization delay and accuracy.</>}
          >
            <Figure
              img_src='/images/fig4_window_length.png'
              alt='Three line plots against initialization window from 0.5 to 5 seconds. With raw IMU, the vel variant degrades as the window grows while +rp stays stable. With AirIMU correction, the two variants nearly overlap and perform best.'
              title='Roll &amp; pitch aiding and initialization window length on EuRoC'
              width={2356}
              height={765}
              caption={<>Gravity-direction error (left), body-frame velocity error (middle), and success rate (right) for initialization windows ranging from 0.5 to 5.0 s. With raw IMU, <i>+rp</i> also jointly estimates gyroscope bias; with AirIMU correction, residual bias is fixed to zero. The curves for I-Init:<i>vel</i> and I-Init:<i>+rp</i> nearly overlap when AirIMU correction is used.</>}
              idx={4}
            />
          </FindingBlock>

          <FindingBlock
            idx={3}
            title='IMU-only initialization preserves odometry accuracy'
            setup={<>The goal is not to outperform the oracle, but to match the same EKF under oracle initialization. IMU-only runs are aligned only in initial heading and position, with no trajectory fitting, scale correction, or roll &amp; pitch alignment.</>}
            results={[
              <>Odometry with I-Init:+rp reaches an ATE of 2.91, 2.79, and 1.35 m on EuRoC, Blackbird, and TLIO, <span className={hlTextColor}>within 0.07 m</span> of oracle initialization on every dataset.</>,
              <>Refinement reduces the ATE relative to Network Init on all three datasets, for example from 3.06 to 2.91 m on EuRoC.</>,
              <>Without attitude input, the Motion Network remains competitive: among oracle-initialized EKF variants, ours attains the lowest ATE on EuRoC (2.97 m) and TLIO (1.35 m).</>,
            ]}
            note={<>AirIO EKF remains more accurate on Blackbird (2.33 versus 2.76 m). Without an EKF, I-Init attains the lowest ATE on all three datasets, while AirIO attains a lower AVE on EuRoC (0.286 versus 0.360 m/s).</>}
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
                    caption={<>The initial state is supplied by ground truth (Oracle) or estimated by IMU-only initialization. Both protocols use the same scoring intervals. Bold values indicate the lowest error in each column across all methods, including ties. † Uses oracle initialization. Our EKF runs use AirIMU-corrected propagation. With IMU-only initialization, the <i>vel</i> and <i>+rp</i> variants also use AirIMU-corrected preintegration, with residual gyroscope bias fixed to zero.</>}
                  />
                </TabPanel>
                <TabPanel>
                  <ResultsTable
                    idx='IV'
                    title='Network-only inertial odometry accuracy: ATE (m) and AVE (m/s)'
                    data={networkOnlyTable}
                    caption={<>All methods use oracle initialization and integrate their network predictions without an EKF. Bold values indicate the lowest error in each column, including ties. I-Init reduces the ATE of AirIO, whose network additionally receives an attitude estimate, by 15%, 7%, and 37% on EuRoC, Blackbird, and TLIO, respectively.</>}
                  />
                </TabPanel>
              </TabPanels>
            </TabGroup>
          </FindingBlock>

          <FindingBlock
            idx={4}
            title='Learned uncertainty is essential for fusing learned velocity with IMU propagation'
            setup={<>We independently set the measurement-noise covariance R of the Motion Network and the propagation-noise covariance Q of AirIMU to identity matrices or to their learned values. All other components remain fixed, so the comparison isolates the effect of uncertainty weighting.</>}
            results={[
              <>Using learned values for both covariances yields the lowest ATE and AVE on all three datasets.</>,
              <>Learning only one does not consistently help: learned Q with identity R increases both errors on every dataset, reaching an ATE of <span className={hlTextColor}>59.6 m</span> on Blackbird.</>,
            ]}
            note={<>The filter balances velocity measurements against IMU propagation through the relative scale of R and Q, so the two covariances are effective only when both are learned.</>}
          >
            <ResultsTable
              idx='III'
              title='Learned measurement and propagation covariances in the EKF'
              data={covarianceTable}
              caption={<>A check marks a learned covariance and a cross an identity covariance. All variants use oracle initialization, AirIMU-corrected IMU measurements, network velocity predictions, and scoring; only the choices of R and Q change. Bold values indicate the lowest error in each column.</>}
            />
          </FindingBlock>
        </div>
      </section>

      <section id='limitations' aria-labelledby='limitations-title' className={clsx(secondaryBgColor, textColor)}>
        <div className='layout py-12'>
          <h2 id='limitations-title' className='pb-4'>Limitations</h2>
          <ul className='list-disc space-y-2 pl-6 text-lg'>
            <li>As in visual-inertial odometry, global yaw and position remain unobservable.</li>
            <li>Over a short window, the accelerometer bias is coupled with gravity and is therefore not estimated.</li>
            <li>Estimating all three gyroscope-bias components requires rotation within the window.</li>
            <li>The learned motion may degrade outside the training distribution.</li>
          </ul>
          <p className='pt-4 text-lg'>
            Future work will investigate cross-platform generalization of the Motion Network and the stability of EKF fusion with learned velocity measurements.
          </p>
        </div>
      </section>

      <section id='citation' className={clsx(bgColor, textColor)}>
        <div className='layout pt-4 pb-48'>
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
          <pre className='whitespace-pre-wrap text-sm leading-relaxed'>{citation_bibtex}</pre>
        </div>
      </section>
    </main>
  );
}
