import { cn } from '@/lib/utils';
import type { CampaignSchedule } from '@/lib/campaigns/definition';
import { campaignScheduleCanActivate } from '@/lib/campaigns/schedule';

const statuses = {
  running: ['Disparo em andamento', 'border-violet-500/30 bg-violet-500/10 text-violet-800 dark:text-violet-300'],
  active: ['Programação ativa', 'border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300'],
  paused: ['Programação pausada', 'border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300'],
  expired: ['Programação sem próxima data', 'border-orange-500/30 bg-orange-500/10 text-orange-800 dark:text-orange-300'],
  manual: ['Execução manual', 'border-sky-500/30 bg-sky-500/10 text-sky-800 dark:text-sky-300'],
} as const;

export function CampaignStatusBadge({ active, unfinished, schedule }: {
  active: boolean;
  unfinished: boolean;
  schedule: CampaignSchedule | null;
}) {
  const status = unfinished ? 'running' : !schedule ? 'manual' : active ? 'active'
    : campaignScheduleCanActivate(schedule) ? 'paused' : 'expired';
  const [label, color] = statuses[status];
  return (
    <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-medium', color)}>
      <span className="size-1.5 rounded-full bg-current" aria-hidden />
      {label}
    </span>
  );
}
