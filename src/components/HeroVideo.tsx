'use client';

import clsx from 'clsx';
import { useEffect, useRef } from 'react';

/**
 * Muted, looping clip in the hero card; it fills its positioned parent, cropped (`cover`) or letterboxed (`contain`).
 * Playback starts from script so that visitors who prefer reduced motion never see it move, and never download it.
 * They, and browsers that block autoplay (for example iOS in Low Power Mode), see the poster instead.
 */
export default function HeroVideo({ src, poster, fit = 'cover' }: { src: string; poster: string; fit?: 'cover' | 'contain' }) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = ref.current;
    if (!video || !window.matchMedia) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => {
      if (reduce.matches) {
        video.pause();
        return;
      }
      // React does not render `muted` into server HTML, and browsers only autoplay muted video.
      video.muted = true;
      video.play().catch(() => undefined);
    };
    sync();
    reduce.addEventListener('change', sync);
    return () => reduce.removeEventListener('change', sync);
  }, []);

  return (
    <video
      ref={ref}
      muted
      loop
      playsInline
      disablePictureInPicture
      preload='none'
      poster={poster}
      tabIndex={-1}
      aria-hidden='true'
      className={clsx('absolute inset-0 h-full w-full', fit === 'cover' ? 'object-cover' : 'object-contain')}
    >
      <source src={src} type='video/mp4' />
    </video>
  );
}
