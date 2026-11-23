import type { MessageTemplate } from '@/types';

interface RemoteComponent {
  type: string;
  format?: string;
  text?: string;
  buttons?: {
    type: string;
    text: string;
    url?: string;
    phone_number?: string;
  }[];
}

interface RemoteTemplate {
  id: string;
  name: string;
  language: string;
  status: string;
  components?: RemoteComponent[];
}

function hasSameContent(remote: RemoteTemplate, local: MessageTemplate) {
  const components = remote.components ?? [];
  const body = components.find((component) => component.type === 'BODY');
  const header = components.find((component) => component.type === 'HEADER');
  const footer = components.find((component) => component.type === 'FOOTER');
  const buttons =
    components.find((component) => component.type === 'BUTTONS')?.buttons ?? [];
  const localButtons = local.buttons ?? [];
  const text = (value?: string) => (value ?? '').replace(/\r\n/g, '\n');
  return (
    components.every(({ type }) =>
      ['BODY', 'HEADER', 'FOOTER', 'BUTTONS'].includes(type)
    ) &&
    Boolean(body) &&
    text(body?.text) === text(local.body_text) &&
    (header?.format?.toLowerCase() ?? '') === (local.header_type ?? '') &&
    text(header?.text) ===
      text(local.header_type === 'text' ? local.header_content : undefined) &&
    text(footer?.text) === text(local.footer_text) &&
    buttons.length === localButtons.length &&
    localButtons.every((button, index) => {
      const other = buttons[index];
      return (
        button.type === other.type &&
        button.text === other.text &&
        (button.type !== 'URL' || button.url === other.url) &&
        (button.type !== 'PHONE_NUMBER' ||
          button.phone_number === other.phone_number)
      );
    })
  );
}

async function* connectedCatalogPages(
  wabaId: string,
  accessToken: string,
  filters: Record<string, string>
) {
  const url = new URL(
    `https://graph.facebook.com/v25.0/${wabaId}/message_templates`
  );
  for (const [key, value] of Object.entries(filters))
    url.searchParams.set(key, value);
  url.searchParams.set('fields', 'id,name,language,status,components');
  url.searchParams.set('limit', '100');
  const signal = AbortSignal.timeout(15000);
  for (let page = 0; page < 20; page++) {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: 'no-store',
      signal,
    }).catch(() => null);
    const remote = (await response?.json().catch(() => null)) as
      | {
          data?: RemoteTemplate[];
          paging?: { next?: string; cursors?: { after?: string } };
        }
      | null
      | undefined;
    if (!response?.ok || !Array.isArray(remote?.data))
      throw new Error(
        'Não foi possível consultar o catálogo de templates na Meta. Confira a conexão do WhatsApp.'
      );

    yield remote.data;
    if (!remote.paging?.next) break;
    const after =
      remote.paging.cursors?.after ??
      new URL(remote.paging.next).searchParams.get('after');
    if (!after || after === url.searchParams.get('after') || page === 19)
      throw new Error(
        'Não foi possível concluir a consulta ao catálogo de templates da Meta.'
      );
    url.searchParams.set('after', after);
  }
}

function matchesTemplate(remote: RemoteTemplate, template: MessageTemplate) {
  return remote.name === template.name && remote.language === template.language;
}

function hasMatchingIdOrContent(
  remote: RemoteTemplate,
  template: MessageTemplate
) {
  return (
    String(remote.id) === String(template.meta_template_id) ||
    hasSameContent(remote, template)
  );
}

export async function listAvailableCampaignTemplates(
  templates: MessageTemplate[],
  wabaId: string,
  accessToken: string
): Promise<MessageTemplate[]> {
  const candidates = new Map<string, RemoteTemplate>();
  for await (const page of connectedCatalogPages(wabaId, accessToken, {})) {
    for (const remote of page) {
      if (remote.id && remote.status === 'APPROVED')
        candidates.set(`${remote.name}:${remote.language}`, remote);
    }
  }
  return templates.filter((template) => {
    if (template.status !== 'APPROVED') return false;
    const remote = candidates.get(`${template.name}:${template.language}`);
    return remote && hasMatchingIdOrContent(remote, template);
  });
}

export async function verifyCampaignTemplate(
  template: MessageTemplate,
  wabaId: string,
  accessToken: string
): Promise<MessageTemplate> {
  const filters = {
    name: template.name,
    ...(template.language ? { language: template.language } : {}),
  };
  let variant: RemoteTemplate | undefined;
  for await (const page of connectedCatalogPages(
    wabaId,
    accessToken,
    filters
  )) {
    variant = page.find((remote) => matchesTemplate(remote, template));
    if (variant) break;
  }

  const label = `${template.name} (${template.language ?? 'idioma não informado'})`;
  if (!variant)
    throw new Error(
      `${label} não aparece no catálogo da conta WhatsApp ${wabaId}, vinculada ao canal. Confira se essa é a conta selecionada no WhatsApp Manager ou escolha um template disponível para o canal.`
    );
  if (variant.status !== 'APPROVED')
    throw new Error(
      `A Meta retornou o status ${variant.status} para ${label} na conta WhatsApp do canal conectado.`
    );
  if (!variant.id)
    throw new Error(`A Meta não retornou o identificador de ${label}.`);
  if (!hasMatchingIdOrContent(variant, template))
    throw new Error(
      `A Meta aprovou ${label}, mas o conteúdo diverge do catálogo local. Sincronize os templates e revise o mapeamento da campanha.`
    );

  return { ...template, meta_template_id: String(variant.id) };
}
