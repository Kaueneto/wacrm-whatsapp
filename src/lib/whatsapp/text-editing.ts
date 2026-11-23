export interface TextEdit {
  text: string;
  start: number;
  end: number;
}

export function insertText(
  text: string,
  start: number,
  end: number,
  insertion: string
): TextEdit {
  const position = start + insertion.length;
  return {
    text: text.slice(0, start) + insertion + text.slice(end),
    start: position,
    end: position,
  };
}

/** Fill the first unused positional variable without renumbering existing references. */
export function insertTemplateVariable(
  text: string,
  start: number,
  end: number
): TextEdit {
  const remaining = text.slice(0, start) + text.slice(end);
  const used = new Set(
    [...remaining.matchAll(/\{\{\s*(\d+)\s*\}\}/g)].map((match) =>
      Number(match[1])
    )
  );
  let next = 1;
  while (used.has(next)) next++;
  return insertText(text, start, end, `{{${next}}}`);
}

export function toggleTextFormat(
  text: string,
  start: number,
  end: number,
  marker: string
): TextEdit {
  const selected = text.slice(start, end);
  if (
    start >= marker.length &&
    text.slice(start - marker.length, start) === marker &&
    text.slice(end, end + marker.length) === marker
  ) {
    return {
      text:
        text.slice(0, start - marker.length) +
        selected +
        text.slice(end + marker.length),
      start: start - marker.length,
      end: end - marker.length,
    };
  }
  if (
    selected.length >= marker.length * 2 &&
    selected.startsWith(marker) &&
    selected.endsWith(marker)
  ) {
    return {
      text:
        text.slice(0, start) +
        selected.slice(marker.length, -marker.length) +
        text.slice(end),
      start,
      end: end - marker.length * 2,
    };
  }
  return {
    text: text.slice(0, start) + marker + selected + marker + text.slice(end),
    start: start + marker.length,
    end: end + marker.length,
  };
}
