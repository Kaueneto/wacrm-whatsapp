'use client';
import { useEffect, useId, useRef } from 'react';
import { LocateFixed, PencilLine } from 'lucide-react';
import { stageRange, type CollectionStage } from '@/lib/collections/setup';
import { cn } from '@/lib/utils';

function rangeLabel(stages: CollectionStage[], index: number) {
  const stage = stages[index];
  if (!Number.isInteger(stage.fromDay) || stage.fromDay < 1)
    return 'Defina o dia';
  if (
    (index > 0 && stage.fromDay <= stages[index - 1].fromDay) ||
    (index < stages.length - 1 && stage.fromDay >= stages[index + 1].fromDay)
  )
    return 'Revisar ordem dos dias';
  return stageRange(stages, index);
}
export function RuleJourney({
  stages,
  currentStageId,
  selectedStageId,
  onSelect,
  mode = 'position',
}: {
  stages: CollectionStage[];
  currentStageId?: string;
  selectedStageId?: string;
  onSelect?: (id: string) => void;
  mode?: 'position' | 'editor';
}) {
  const gradientId = useId().replace(/:/g, '');
  const viewport = useRef<HTMLDivElement>(null),
    drawing = useRef<HTMLDivElement>(null);
  const currentIndex = stages.findIndex((stage) => stage.id === currentStageId);
  const selected = stages.find((stage) => stage.id === selectedStageId);
  const selectedIndex = stages.findIndex(
    (stage) => stage.id === selectedStageId
  );
  const width = stages.length * 160;
  const point = (i: number) => ({ x: i * 160 + 80, y: i % 2 ? 82 : 50 });
  useEffect(() => {
    if (selectedIndex < 0 || !viewport.current || !drawing.current) return;
    viewport.current.scrollTo({
      left: Math.max(
        0,
        ((selectedIndex + 0.5) * drawing.current.clientWidth) / stages.length -
          viewport.current.clientWidth / 2
      ),
    });
  }, [selectedIndex, stages.length]);
  function path(last: number) {
    if (last < 0) return '';
    const start = point(0);
    let value = 'M ' + start.x + ' ' + start.y;
    for (let i = 1; i <= last; i++) {
      const a = point(i - 1),
        b = point(i),
        middle = (a.x + b.x) / 2;
      value +=
        ' C ' +
        middle +
        ' ' +
        a.y +
        ', ' +
        middle +
        ' ' +
        b.y +
        ', ' +
        b.x +
        ' ' +
        b.y;
    }
    return value;
  }
  return (
    <div
      ref={viewport}
      className="mt-2 overflow-x-auto px-2 motion-safe:scroll-smooth"
      aria-label="Mapa das faixas de atraso"
    >
      <div ref={drawing} className="relative h-48" style={{ minWidth: width }}>
        <svg
          aria-hidden
          className="pointer-events-none absolute inset-0 size-full"
          viewBox={'0 0 ' + width + ' 192'}
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient id={gradientId}>
              <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.2" />
              <stop
                offset="100%"
                stopColor="var(--primary)"
                stopOpacity="0.85"
              />
            </linearGradient>
          </defs>
          <path
            d={path(stages.length - 1)}
            fill="none"
            stroke="var(--border)"
            strokeWidth="2"
            strokeDasharray="5 6"
          />
          <path
            d={path(currentIndex)}
            fill="none"
            stroke={'url(#' + gradientId + ')'}
            strokeWidth="3"
          />
        </svg>
        <ol className="absolute inset-0 flex">
          {stages.map((stage, i) => {
            const active = i === currentIndex;
            const viewing = selected?.id === stage.id;
            return (
              <li key={stage.id} className="min-w-0 flex-1">
                <button
                  type="button"
                  aria-current={
                    active && mode === 'position' ? 'step' : undefined
                  }
                  aria-pressed={viewing}
                  aria-label={
                    'Visualizar ' +
                    stage.name +
                    ', ' +
                    rangeLabel(stages, i) +
                    (active
                      ? mode === 'editor'
                        ? ', etapa em edição'
                        : ', faixa atual'
                      : '')
                  }
                  onClick={() => onSelect?.(stage.id)}
                  className="group focus-visible:ring-primary/50 flex h-full w-full flex-col items-center rounded-xl px-3 text-center outline-none focus-visible:ring-2 focus-visible:ring-inset"
                  style={{ paddingTop: point(i).y - 20 }}
                >
                  <span
                    className={cn(
                      'relative flex size-10 shrink-0 items-center justify-center rounded-2xl border text-xs font-semibold transition-colors',
                      active
                        ? 'bg-primary text-primary-foreground border-primary shadow-[0_0_0_6px_var(--primary-soft),0_0_24px_var(--primary-soft-2)]'
                        : viewing
                          ? 'border-primary/40 bg-primary/10 text-primary'
                          : 'bg-card border-border text-muted-foreground group-hover:border-primary/30 group-hover:text-primary'
                    )}
                  >
                    {active ? (
                      mode === 'editor' ? (
                        <PencilLine className="size-4" />
                      ) : (
                        <LocateFixed className="size-4" />
                      )
                    ) : (
                      String(i + 1).padStart(2, '0')
                    )}
                  </span>
                  <span
                    className={cn(
                      'mt-3 line-clamp-2 min-h-8 text-[11px] leading-4 font-medium',
                      active && 'text-primary'
                    )}
                  >
                    {stage.name || 'Nova etapa'}
                  </span>
                  <span className="text-muted-foreground mt-1 text-[10px]">
                    {rangeLabel(stages, i)}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
