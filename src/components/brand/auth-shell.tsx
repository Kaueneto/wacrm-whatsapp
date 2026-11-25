import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { OctaLogo } from '@/components/brand/octa-logo';
import { ModeToggle } from '@/components/layout/mode-toggle';
import styles from './auth-shell.module.css';

export function AuthShell({ children }: { children: ReactNode }) {
  const t = useTranslations('Brand');

  return (
    <div className={`${styles.shell} bg-background grid min-h-svh lg:grid-cols-[3fr_2fr]`}>
      <aside
        aria-label="OCTA"
        className="border-border/40 bg-background text-foreground relative isolate hidden overflow-hidden border-r px-12 py-20 lg:flex lg:items-center lg:justify-center"
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10 bg-emerald-500/[0.02]"
        />
        <div
          aria-hidden="true"
          className={`pointer-events-none absolute inset-0 -z-10 ${styles.tentacles}`}
        />
        <div className="relative flex max-w-lg flex-col items-start gap-7">
          <OctaLogo
            className="gap-7 xl:gap-9"
            markClassName="h-24 text-primary xl:h-28"
            wordmarkClassName="text-4xl font-medium tracking-[0.38em] xl:text-5xl"
            strokeWidth={20}
          />
          <p className="text-muted-foreground text-lg font-light tracking-wide xl:text-2xl">
            {t('connect')} {t('centralize')}{' '}
            <span className="text-primary font-normal">{t('simplify')}</span>
          </p>
        </div>
      </aside>
      <main className="bg-background relative flex min-w-0 flex-col items-center justify-center px-6 py-12 sm:px-12">
        <ModeToggle className="absolute right-4 top-4 z-10 size-11 focus-visible:outline-2 focus-visible:outline-ring sm:right-8 sm:top-8" />
        <OctaLogo
          className="text-foreground mb-12 lg:hidden"
          markClassName="text-primary"
          wordmarkClassName="text-xl"
        />
        <div className="w-full max-w-sm">{children}</div>
      </main>
    </div>
  );
}
