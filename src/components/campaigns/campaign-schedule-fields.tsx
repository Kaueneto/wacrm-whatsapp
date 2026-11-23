'use client';

import { useId } from 'react';
import { CalendarClock } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import type { CampaignSchedule } from '@/lib/campaigns/definition';

const weekdays = [
  ['Dom', 'domingo'],
  ['Seg', 'segunda-feira'],
  ['Ter', 'terça-feira'],
  ['Qua', 'quarta-feira'],
  ['Qui', 'quinta-feira'],
  ['Sex', 'sexta-feira'],
  ['Sáb', 'sábado'],
] as const;
const weekdayList = new Intl.ListFormat('pt-BR');
const field = 'grid min-w-0 content-start gap-1.5 text-sm font-medium';
const control = 'h-9 min-w-0 w-full bg-background font-normal dark:scheme-dark';

function scheduleSummary(schedule: CampaignSchedule) {
  const time = schedule.time ? ` às ${schedule.time}` : '';
  switch (schedule.kind) {
    case 'once':
      return `Envio único na data inicial${time}.`;
    case 'daily':
      return `Todos os dias${time}.`;
    case 'interval':
      if (!schedule.days) return 'Informe o intervalo entre os envios.';
      return schedule.days === 1
        ? `Todos os dias${time}.`
        : `A cada ${schedule.days} dias${time}, a partir da data inicial.`;
    case 'weekly': {
      const days = weekdays
        .filter((_, day) => schedule.weekdays?.includes(day))
        .map(([, name]) => name);
      return days.length
        ? `Envio semanal em ${weekdayList.format(days)}${time}.`
        : 'Selecione os dias da semana para enviar.';
    }
    case 'monthly':
      return schedule.monthDay
        ? `Todo dia ${schedule.monthDay} do mês${time}.`
        : 'Informe o dia do mês para enviar.';
  }
}

export function CampaignScheduleFields({
  enabled,
  active,
  disabled,
  schedule,
  onEnabledChange,
  onActiveChange,
  onScheduleChange,
}: {
  enabled: boolean;
  active: boolean;
  disabled: boolean;
  schedule: CampaignSchedule;
  onEnabledChange: (enabled: boolean) => void;
  onActiveChange: (active: boolean) => void;
  onScheduleChange: (schedule: CampaignSchedule) => void;
}) {
  const id = useId();
  const update = (patch: Partial<CampaignSchedule>) =>
    onScheduleChange({ ...schedule, ...patch });

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <label
          htmlFor={`${id}-enabled`}
          className="border-border bg-muted/30 flex cursor-pointer items-center justify-between gap-4 rounded-lg border px-3 py-3 text-sm font-medium"
        >
          Configurar agendamento
          <Switch
            id={`${id}-enabled`}
            aria-label="Configurar agendamento"
            checked={enabled}
            disabled={disabled}
            onCheckedChange={onEnabledChange}
            className="data-[unchecked]:border-border"
          />
        </label>
        {enabled && (
          <label
            htmlFor={`${id}-active`}
            className="border-border bg-muted/30 flex cursor-pointer items-center justify-between gap-4 rounded-lg border px-3 py-3 text-sm font-medium"
          >
            Ativar programação ao salvar
            <Switch
              id={`${id}-active`}
              aria-label="Ativar programação ao salvar"
              checked={active}
              disabled={disabled}
              onCheckedChange={onActiveChange}
              className="data-[unchecked]:border-border"
            />
          </label>
        )}
      </div>
      {enabled && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <label className={field}>
              Frequência
              <select
                className={`${control} border-input focus-visible:ring-ring rounded-lg border px-2.5 focus-visible:ring-2 focus-visible:outline-none`}
                value={schedule.kind}
                onChange={(event) => {
                  const kind = event.target.value as CampaignSchedule['kind'];
                  const validDays =
                    Number.isInteger(schedule.days) &&
                    schedule.days >= 1 &&
                    schedule.days <= 365;
                  update({
                    kind,
                    days: kind !== 'interval' && !validDays ? 1 : schedule.days,
                  });
                }}
              >
                <option value="once">Envio único</option>
                <option value="daily">Diário</option>
                <option value="interval">A cada N dias</option>
                <option value="weekly">Semanal</option>
                <option value="monthly">Mensal</option>
              </select>
            </label>
            <label className={field}>
              Data inicial
              <Input
                className={control}
                type="date"
                value={schedule.startDate}
                onChange={(event) => update({ startDate: event.target.value })}
              />
            </label>
            <label className={field}>
              <span>
                Data de término{' '}
                <span className="text-muted-foreground font-normal">
                  (opcional)
                </span>
              </span>
              <Input
                className={control}
                type="date"
                min={schedule.startDate}
                value={schedule.endDate ?? ''}
                onChange={(event) => update({ endDate: event.target.value })}
              />
            </label>
            <label className={field}>
              Horário
              <Input
                className={control}
                type="time"
                value={schedule.time}
                onChange={(event) => update({ time: event.target.value })}
              />
            </label>
          </div>

          {schedule.kind === 'interval' && (
            <label className={`${field} max-w-48`}>
              Intervalo em dias
              <Input
                className={control}
                type="number"
                min={1}
                max={365}
                value={schedule.days || ''}
                onChange={(event) =>
                  update({ days: Number(event.target.value) })
                }
              />
            </label>
          )}
          {schedule.kind === 'weekly' && (
            <fieldset className="min-w-0">
              <legend className="mb-2 text-sm font-medium">
                Dias da semana
              </legend>
              <div className="flex flex-wrap gap-2">
                {weekdays.map(([short, name], day) => {
                  const selectedDays = schedule.weekdays ?? [];
                  const checked = selectedDays.includes(day);
                  return (
                    <label
                      key={name}
                      className="border-border bg-background hover:bg-muted has-data-[checked]:border-primary/40 has-data-[checked]:bg-primary/10 flex min-h-9 cursor-pointer items-center gap-2 rounded-lg border px-3 text-sm font-medium transition-colors"
                    >
                      <Checkbox
                        aria-label={name}
                        checked={checked}
                        disabled={disabled}
                        onCheckedChange={(selected) =>
                          update({
                            weekdays: selected
                              ? [...selectedDays, day]
                              : selectedDays.filter((value) => value !== day),
                          })
                        }
                      />
                      {short}
                    </label>
                  );
                })}
              </div>
            </fieldset>
          )}
          {schedule.kind === 'monthly' && (
            <label className={field}>
              Dia do mês
              <Input
                className={`${control} max-w-48`}
                type="number"
                min={1}
                max={31}
                value={schedule.monthDay ?? ''}
                onChange={(event) =>
                  update({
                    monthDay: event.target.value
                      ? Number(event.target.value)
                      : undefined,
                  })
                }
              />
              <span className="text-muted-foreground text-xs font-normal">
                A execução ocorre nos meses que têm esse dia.
              </span>
            </label>
          )}

          <label className={`${field} max-w-72`}>
            Fuso horário
            <Input
              className={control}
              value={schedule.timezone}
              onChange={(event) => update({ timezone: event.target.value })}
            />
          </label>
          <p
            role="status"
            className="border-primary/20 bg-primary/5 flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-sm"
          >
            <CalendarClock
              className="text-primary mt-0.5 size-4 shrink-0"
              aria-hidden
            />
            {scheduleSummary(schedule)}
          </p>
        </>
      )}
    </div>
  );
}
