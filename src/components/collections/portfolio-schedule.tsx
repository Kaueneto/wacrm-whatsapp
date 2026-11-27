'use client';

import { CalendarClock } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  nextPortfolioSync,
  type PortfolioSchedule,
} from '@/lib/collections/schedule';
import type { PortfolioSetup } from '@/lib/collections/setup';

export function PortfolioScheduleFields({
  setup,
  onChange,
  disabled,
}: {
  setup: PortfolioSetup;
  onChange: (setup: PortfolioSetup) => void;
  disabled: boolean;
}) {
  const schedule = setup.schedule;
  const update = (patch: Partial<PortfolioSchedule>) =>
    onChange({ ...setup, schedule: { ...schedule, ...patch } });
  let next: string | null = null;
  try {
    next = nextPortfolioSync({
      ...setup,
      schedule: { ...schedule, enabled: true },
    });
  } catch {
    /* Incomplete form shows no preview. */
  }
  const selectClass =
    'border-input bg-background h-10 w-full rounded-xl border px-3 text-sm';
  function setCount(count: number) {
    if (!Number.isInteger(count) || count < 1 || count > 12) return;
    const times = setup.times.slice(0, count);
    for (let hour = 8; times.length < count; hour++) {
      const candidate = `${String(hour % 24).padStart(2, '0')}:00`;
      if (!times.includes(candidate)) times.push(candidate);
    }
    onChange({ ...setup, times });
  }
  return (
    <fieldset
      disabled={disabled}
      className="bg-card border-border space-y-6 rounded-xl border p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <CalendarClock className="text-primary size-4" />
            Agendamento da sincronização
          </h2>
          <p className="text-muted-foreground mt-1 text-xs">
            Atualize a carteira automaticamente com o escopo salvo na aba
            Configuração.
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            checked={schedule.enabled}
            onChange={(e) => update({ enabled: e.target.checked })}
            className="accent-primary size-4"
          />
          Ativar agendamento
        </label>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="sync-frequency">Frequência</Label>
          <select
            id="sync-frequency"
            className={selectClass}
            value={schedule.kind}
            onChange={(e) =>
              update({ kind: e.target.value as PortfolioSchedule['kind'] })
            }
          >
            <option value="daily">Todos os dias</option>
            <option value="interval">A cada N dias</option>
            <option value="weekly">Dias da semana</option>
            <option value="monthly">Todo mês</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="sync-start">Data inicial</Label>
          <Input
            id="sync-start"
            className="h-10"
            type="date"
            value={schedule.startDate}
            onChange={(e) => update({ startDate: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="sync-timezone">Fuso horário</Label>
          <select
            id="sync-timezone"
            className={selectClass}
            value={setup.timezone}
            onChange={(e) => onChange({ ...setup, timezone: e.target.value })}
          >
            {[
              ...new Set([
                setup.timezone,
                'America/Sao_Paulo',
                'America/Manaus',
                'America/Cuiaba',
                'America/Rio_Branco',
                'UTC',
              ]),
            ].map((zone) => (
              <option key={zone} value={zone}>
                {zone}
              </option>
            ))}
          </select>
        </div>
        {schedule.kind === 'interval' && (
          <div className="space-y-1.5">
            <Label htmlFor="sync-interval">Repetir a cada (dias)</Label>
            <Input
              id="sync-interval"
              className="h-10"
              type="number"
              min={1}
              max={365}
              value={schedule.days || ''}
              onChange={(e) => update({ days: Number(e.target.value) })}
            />
          </div>
        )}
        {schedule.kind === 'monthly' && (
          <div className="space-y-1.5">
            <Label htmlFor="sync-month-day">Dia do mês</Label>
            <select
              id="sync-month-day"
              className={selectClass}
              value={schedule.monthDay}
              onChange={(e) => update({ monthDay: Number(e.target.value) })}
            >
              {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                <option key={day} value={day}>
                  {day === 1 ? '1 — início do mês' : day}
                </option>
              ))}
            </select>
            {schedule.monthDay > 28 && (
              <p className="text-muted-foreground text-xs">
                Meses sem esse dia serão pulados.
              </p>
            )}
          </div>
        )}
      </div>
      {schedule.kind === 'weekly' && (
        <div className="space-y-2">
          <p className="text-xs font-medium">Dias da semana</p>
          <div className="flex flex-wrap gap-2">
            {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map(
              (label, day) => (
                <label
                  key={day}
                  className="border-border flex items-center gap-2 rounded-lg border px-3 py-2 text-xs"
                >
                  <input
                    type="checkbox"
                    checked={schedule.weekdays.includes(day)}
                    onChange={(e) =>
                      update({
                        weekdays: e.target.checked
                          ? [...schedule.weekdays, day]
                          : schedule.weekdays.filter((d) => d !== day),
                      })
                    }
                  />
                  {label}
                </label>
              )
            )}
          </div>
        </div>
      )}
      <div className="border-border space-y-4 border-t pt-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold">Horários de execução</h3>
            <p className="text-muted-foreground mt-1 text-xs">
              Quantas vezes executar em cada dia da programação?
            </p>
          </div>
          <select
            aria-label="Quantidade de execuções por dia"
            className={`${selectClass} max-w-40`}
            value={setup.times.length}
            onChange={(e) => setCount(Number(e.target.value))}
          >
            {Array.from({ length: 12 }, (_, i) => i + 1).map((count) => (
              <option key={count} value={count}>
                {count} {count === 1 ? 'vez por dia' : 'vezes por dia'}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-4">
          {setup.times.map((time, index) => (
            <div key={index} className="space-y-1.5">
              <Label htmlFor={`sync-time-${index}`}>{index + 1}º horário</Label>
              <Input
                id={`sync-time-${index}`}
                className="h-10"
                type="time"
                value={time}
                onChange={(e) =>
                  onChange({
                    ...setup,
                    times: setup.times.map((old, i) =>
                      i === index ? e.target.value : old
                    ),
                  })
                }
              />
            </div>
          ))}
        </div>
      </div>
      <div className="bg-muted/30 rounded-lg p-3 text-xs">
        <p className="font-medium">
          {schedule.enabled
            ? 'Agendamento será aplicado ao salvar.'
            : 'Agendamento desativado — importação manual disponível.'}
        </p>
        {next && (
          <p className="text-muted-foreground mt-1">
            {schedule.enabled
              ? 'Próxima execução prevista'
              : 'Prévia da próxima execução'}
            :{' '}
            {new Intl.DateTimeFormat('pt-BR', {
              dateStyle: 'short',
              timeStyle: 'short',
              timeZone: setup.timezone,
            }).format(new Date(next))}
          </p>
        )}
        <p className="text-muted-foreground mt-1">
          A sincronização atualiza dados da carteira. Ela não envia mensagens de
          cobrança.
        </p>
      </div>
    </fieldset>
  );
}
