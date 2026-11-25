/** Extract bounded business validation text, never an HTML error page or an entire response dump. */
export function uauErrorDetail(input: unknown, secrets: string[] = []): string {
  const parts: string[] = [];
  const add = (value: unknown) => {
    if (typeof value === 'string' && value.trim()) parts.push(value.trim());
  };
  if (typeof input === 'string') {
    if (/^\s*(?:<!doctype|<html|\{|\[)/i.test(input)) return '';
    add(input);
  } else if (input && typeof input === 'object' && !Array.isArray(input)) {
    const row = input as Record<string, unknown>;
    for (const key of ['Mensagem', 'Descricao', 'Message', 'message']) add(row[key]);
    if (typeof row.error === 'string') add(row.error);
    else if (row.error && typeof row.error === 'object') add((row.error as Record<string, unknown>).message);
    if (Array.isArray(row._ListaErros)) row._ListaErros.slice(0, 6).forEach(add);
    if (row.ModelState && typeof row.ModelState === 'object')
      for (const [field, errors] of Object.entries(row.ModelState).slice(0, 6)) {
        if (Array.isArray(errors)) for (const error of errors.slice(0, 3))
          if (typeof error === 'string') add(`${field}: ${error}`);
      }
    if (!parts.length && typeof row.Detalhe === 'string') add(row.Detalhe.split(/\r?\n/)[0]);
  }
  let text = [...new Set(parts)].join(' · ').replace(/[\x00-\x1f\x7f]/g, ' ');
  for (const secret of secrets.filter(Boolean).sort((a, b) => b.length - a.length))
    text = text.split(secret).join('[oculto]');
  text = text.replace(/Bearer\s+[\w.+/~=-]+/gi, 'Bearer [oculto]');
  return text.slice(0, 600);
}
