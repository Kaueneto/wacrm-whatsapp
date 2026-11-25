import type { SVGProps } from 'react';
import { OCTA_SYMBOL_PATH } from '@/lib/brand';
import { cn } from '@/lib/utils';

export function OctaMark({ strokeWidth = 16, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="77 26 361 481"
      width="361"
      height="481"
      fill="none"
      aria-hidden="true"
      {...props}
    >
      <path d={OCTA_SYMBOL_PATH} stroke="currentColor" strokeWidth={strokeWidth} strokeLinejoin="round" />
    </svg>
  );
}

export function OctaLogo({
  compact = false,
  className,
  markClassName,
  wordmarkClassName,
  strokeWidth = 24,
}: {
  compact?: boolean;
  className?: string;
  markClassName?: string;
  wordmarkClassName?: string;
  strokeWidth?: number;
}) {
  return (
    <span className={cn('inline-flex shrink-0 items-center gap-3', className)}>
      <OctaMark className={cn('h-10 w-auto shrink-0', markClassName)} strokeWidth={strokeWidth} />
      <span className={compact ? 'sr-only' : cn('font-semibold tracking-[0.22em]', wordmarkClassName)}>
        OCTA
      </span>
    </span>
  );
}
