# Backlog do produto

## BL-001 — Avaliar notificações a clientes por email

- **Registrado em:** 18/11/2026.
- **Status:** ideia registrada; sem implementação autorizada.
- **Prioridade:** futura, após estabilização dos fluxos principais de WhatsApp, atendimento e campanhas.
- **Objetivo:** avaliar email como canal adicional de comunicação e notificação de clientes, com histórico vinculado ao CRM.
- **Contexto do pedido:** o responsável levantou a hipótese de que email possa ser adequado para notificações com efeitos jurídicos. Essa hipótese não está validada; não tratar email comum como comprovação automática de notificação, recebimento, leitura ou validade jurídica.

### Avaliação futura

- Validar com assessoria jurídica os casos de uso, contratos e requisitos aplicáveis, inclusive quando forem necessários outros meios de notificação ou serviços específicos de comprovação.
- Definir evidências necessárias, sua integridade e retenção: conteúdo enviado, destinatário, data/hora, identificadores do provedor e eventos disponíveis. Separar aceite pelo provedor, entrega técnica, leitura e confirmação do destinatário.
- Avaliar provedor de envio, autenticação de domínio (SPF/DKIM/DMARC), entregabilidade, devoluções, limites e custos.
- Definir remetentes e permissões por organização, modelos de mensagem, preferências de contato e tratamento de dados pessoais.
- Integrar os registros à linha do tempo do cliente e prever fila persistente, deduplicação, tentativas e auditoria.

### Resultado esperado da avaliação

Proposta técnica e jurídica revisável com escopo inicial, limitações das evidências, custos e critérios de aceite antes de decidir pela implementação.

## BL-002 — Ocorrências e pendências no atendimento

- **Registrado em 22/11/2026.**
- Evoluir a linha do tempo de notas do contato para registrar ocorrências que precisam de acompanhamento.
- Exibir um ícone de cadeado na Caixa de Entrada de WhatsApp da plataforma quando o contato tiver uma pendência aberta. Remover o indicador assim que todas as pendências forem resolvidas.
- Definir antes da implementação quem pode abrir e resolver ocorrências, quais dados entram no histórico e em quais pontos da conversa o indicador deve aparecer.
