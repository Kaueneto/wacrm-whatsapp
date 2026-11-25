import type { ReactNode } from 'react';
import { LinkifyText } from '@/lib/inbox/linkify-text';

/** Render the supported WhatsApp inline markers as React nodes, never as HTML. */
export function WhatsAppFormattedText({ text, isAgent = false }: { text: string; isAgent?: boolean }) {
  function render(value: string, depth = 0): ReactNode {
    if (depth >= 8) return value;
    const pattern =
      /```([\s\S]+?)```|(?<![\p{L}\p{N}])\*([^\n*]+)\*|(?<![\p{L}\p{N}])_([^\n_]+)_|(?<![\p{L}\p{N}])~([^\n~]+)~/gu;
    const nodes: ReactNode[] = [];
    let offset = 0;
    for (const match of value.matchAll(pattern)) {
      if (match.index > offset)
        nodes.push(
          <LinkifyText
            key={`text-${offset}`}
            isAgent={isAgent}
            text={value.slice(offset, match.index)}
          />
        );
      const key = match.index;
      if (match[1] !== undefined)
        nodes.push(
          <code key={key} className="font-mono text-[.95em]">
            {match[1]}
          </code>
        );
      else if (match[2] !== undefined)
        nodes.push(<strong key={key}>{render(match[2], depth + 1)}</strong>);
      else if (match[3] !== undefined)
        nodes.push(<em key={key}>{render(match[3], depth + 1)}</em>);
      else nodes.push(<s key={key}>{render(match[4], depth + 1)}</s>);
      offset = match.index + match[0].length;
    }
    if (offset < value.length)
      nodes.push(
        <LinkifyText key={`text-${offset}`} text={value.slice(offset)} isAgent={isAgent} />
      );
    return nodes;
  }
  return <>{render(text)}</>;
}
