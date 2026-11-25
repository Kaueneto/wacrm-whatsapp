/** Prefix only human-authored content that WhatsApp allows us to edit. */
export function agentSignatureName(fullName: string): string {
  return fullName
    .replace(/[\r\n*_~`]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function withAgentSignature(text: string, fullName: string): string {
  const name = agentSignatureName(fullName);
  if (!name || !text.trim()) return text;
  const header = `*${name}*\n`;
  const body = text.startsWith(header) ? text.slice(header.length).replace(/^\n+/, '') : text;
  return `${header}\n${body}`;
}
