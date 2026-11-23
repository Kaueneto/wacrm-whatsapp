'use client';

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { displayTagColor } from '@/lib/contacts/tag-catalog';
import { cn } from '@/lib/utils';
import type { Tag } from '@/types';

function labelTextColor(color: string) {
  const [red, green, blue] = [1, 3, 5].map((offset) => {
    const channel = Number.parseInt(color.slice(offset, offset + 2), 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue > 0.179 ? '#000' : '#fff';
}

export function ConversationTagLabels({ tags, expanded, onToggle }: {
  tags: readonly Tag[];
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-1.5">
      {tags.map((tag) => {
        const color = displayTagColor(tag.color);
        return (
          <Tooltip key={tag.id}>
            <TooltipTrigger render={
              <button type="button" aria-label={tag.name} aria-pressed={expanded}
                onClick={onToggle}
                className={cn(
                  "flex h-6 w-max min-w-[min(3.5rem,100%)] items-center rounded-full motion-safe:transition-[max-width] motion-safe:duration-250 motion-safe:ease-out focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring",
                  expanded ? "max-w-[min(11rem,100%)]" : "max-w-[min(3.5rem,100%)]",
                )}
              />
            }>
              <span className={cn(
                "flex w-full min-w-0 items-center rounded-full px-2.5 text-[10px] leading-none font-semibold uppercase motion-safe:transition-[height] motion-safe:duration-250 motion-safe:ease-out",
                expanded ? "h-[18px]" : "h-2",
              )} style={{ backgroundColor: color, color: labelTextColor(color) }}>
                <span aria-hidden="true" className={cn(
                  "truncate motion-safe:transition-opacity motion-safe:duration-150",
                  expanded ? "opacity-100 motion-safe:delay-75" : "opacity-0",
                )}>{tag.name}</span>
              </span>
            </TooltipTrigger>
            <TooltipContent className="break-words whitespace-normal">{tag.name}</TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}
