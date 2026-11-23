import { displayTagColor } from '@/lib/contacts/tag-catalog';
import type { Tag } from '@/types';

export function ContactTagPills({ tags, limit = 3 }: { tags: readonly Tag[]; limit?: number }) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1">
      {tags.slice(0, limit).map(tag => {
        const color = displayTagColor(tag.color);
        return (
          <span key={tag.id} title={tag.name}
            className="inline-flex max-w-28 items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] leading-none"
            style={{ backgroundColor: `${color}24`, borderColor: `${color}55` }}>
            <span className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: color }} aria-hidden />
            <span className="truncate">{tag.name}</span>
          </span>
        );
      })}
      {tags.length > limit && <span className="text-[10px] text-muted-foreground">+{tags.length - limit}</span>}
    </div>
  );
}
