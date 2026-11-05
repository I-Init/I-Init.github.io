import katex from 'katex';

import 'katex/dist/katex.min.css';

import { cn } from '@/lib/utils';

type KatexSpanProps = { tex: string; display?: boolean; className?: string };

// Rendered during the static export, so equations are in the HTML and a bad formula fails the build.
export default function KatexSpan({ tex, display = false, className }: KatexSpanProps) {
  return (
    <span
      className={cn(display && 'block overflow-x-auto overflow-y-hidden', className)}
      dangerouslySetInnerHTML={{ __html: katex.renderToString(tex, { displayMode: display, throwOnError: true }) }}
    />
  );
}
