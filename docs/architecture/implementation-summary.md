# Registro das alterações — campanhas e worker

Data: 18/11/2026. Base: fork WaCRM, commit `6dbeb5b`.

## Problema e resultado

O navegador enviava os lotes e persistia o resultado de cada destinatário. Fechar a aba podia abandonar os disparos. A criação pela API e a recuperação usavam tarefas `after()`, limitadas à duração da requisição.

Agora a interface solicita uma execução persistente e acompanha seu progresso. Um worker independente do Next.js reivindica os destinatários no PostgreSQL, envia pela API oficial da Meta e salva os resultados. Campanhas representam a definição reutilizável; cada disparo representa uma execução, com seu próprio público e histórico.

## Motor de envio

- Fila em `broadcast_jobs` e campos operacionais em `broadcast_recipients`, sem apagar as tabelas ou o histórico existentes.
- Criação transacional do disparo, destinatários e job, com chave de deduplicação da solicitação do wizard.
- Snapshot de telefone, nome, template, variáveis e remetente para cada execução.
- Claims com lease e token de posse; um slot por número compartilha o controle entre campanhas e workers.
- Timeout HTTP de 30 segundos, lease de 90 segundos e cadência inicial conservadora de um pedido por segundo por remetente.
- Backoff para throttling explícito, com até cinco tentativas. Falhas definitivas ficam visíveis por destinatário.
- Falhas de rede, respostas ambíguas e perda do processo durante envio ficam como resultado incerto, sem reenvio automático.
- Pausa, retomada e cancelamento dos pendentes. Mensagens já aceitas pela Meta ainda podem ser entregues.
- Retry manual cria outro disparo ligado ao original, apenas com falhas confirmadas elegíveis. Executar novamente recalcula o público.

Principais arquivos: `src/lib/campaigns/worker.ts`, `prepare.ts`, `definition.ts`, `scripts/campaign-worker.ts`, `src/hooks/use-broadcast-sending.ts` e rotas de broadcast.

## Campanhas, público e agenda

- Nova área `/campaigns`, com listagem, criação, detalhes e histórico de execuções; Disparos permanece na sidebar.
- Título, descrição, template, mapeamento de variáveis, mídia e fonte do público.
- Público por todos os contatos, etiquetas, campo personalizado ou CSV, com fotografia por execução e deduplicação de telefones.
- Envio único, diário ou a cada N dias, com horário e fuso IANA.
- Uma campanha não inicia outra execução enquanto possuir job pendente, em processamento ou pausado.
- Recorrências perdidas colapsam em uma execução atrasada; o horário originalmente devido fica no histórico.
- Pausar a programação é uma ação separada de pausar um disparo.

Principais arquivos: `src/app/(dashboard)/campaigns/`, `src/app/api/campaigns/` e `src/lib/campaigns/schedule.ts`.

## Acompanhamento e webhooks

- Progresso percentual de processamento na lista e nos detalhes, separado dos indicadores de entrega e leitura.
- Exibição de aceites pela Meta, estados incertos, cancelados e disponibilidade recente do worker.
- Estimativa aproximada após cinco destinatários processados, sujeita a pausas e limites da Meta.
- Cartões, funil, filtros e exportação preservados. Tabela paginada em 100 destinatários; exportação completa sob demanda.
- Buffer deduplicado de status por sete dias para eventos recebidos antes da persistência do wamid; replay protegido por trava por mensagem.
- A assinatura do webhook e o processamento existente de mensagens recebidas foram preservados.

Principais arquivos: `src/components/broadcasts/queue-panel.tsx`, páginas de Disparos e `src/app/api/whatsapp/webhook/route.ts`.

## Revisão da interface de criação

- Template permanentemente presente na lateral em telas amplas.
- Abas de Público, Personalização e Programação acessíveis em qualquer ordem, sem exigir Avançar.
- Título, descrição, resumo e salvamento acessíveis fora das abas.
- Preservação dos dados ao trocar de aba e validação final de público, variáveis, mídia e programação.
- Nomes longos quebram linha dentro dos cartões, sem sobreposição com as categorias ou cartões vizinhos.
- Componentes compartilhados mantêm a navegação original nos disparos avulsos.

## Banco, autorização e operação

| Migration | Mudança |
|---|---|
| `061_campaign_queue.sql` | Campanhas, fila, snapshots, leases, slots por remetente, buffer de status, heartbeat e RPCs. |
| `062_campaign_account_integrity.sql` | Inclui campanhas e jobs na proteção de integridade ao aceitar convites e mudar de conta. |
| `063_campaign_progress.sql` | Contador incremental de processamento e proteção dos campos da fila contra escrita direta pelo navegador. |
| `064_campaign_schedule_audit.sql` | Preserva o horário original das execuções programadas atrasadas. |

RPCs operacionais restritas a service_role; leitura de campanhas e jobs protegida por RLS da conta. Rotas de escrita exigem agent+. `/campaigns` incluída na proteção de navegação.

Adicionados `worker:campaigns` e `worker:check`, Dockerfile específico e serviço no Docker Compose. `tsx` executa o worker; PGlite é dependência de desenvolvimento para testes SQL isolados. O worker reutiliza as credenciais Supabase e a chave de criptografia existentes. Nenhum segredo real deve ser versionado.

As migrations 061–064 foram aplicadas ao Supabase configurado após dry-run. Nenhum disparo antigo foi automaticamente enfileirado. O worker local foi iniciado e seu heartbeat foi conferido; esse processo de desenvolvimento precisa ser reiniciado após desligar a máquina.

## Validação registrada

- Build e typecheck passaram, inclusive após a revisão por abas.
- Lint completo do motor: zero erros e 40 avisos preexistentes. Revisão visual: lint dos quatro componentes com zero erros e um aviso preexistente.
- Suíte completa do motor: 1.747 testes passaram; três falhas preexistentes em `currency.test.ts` por diferença de locale.
- 22 testes novos passaram em execuções completas/isoladas: fila PostgreSQL, leases, deduplicação, pausa/cancelamento, recuperação de envio incerto, buffer de eventos, throttling, troca de remetente, permissões e calendário com fuso.
- Teste SQL adicional confirmou bloqueio de sobreposição e avanço atômico da programação, preservando o atraso no histórico.
- `worker:check` passou; heartbeat no banco e acesso anônimo negado às APIs foram verificados.
- Inspeção autenticada da tela confirmou quebra de nomes, seleção persistente do template e troca livre de abas, sem salvar campanha ou enviar mensagens.

Não houve teste automatizado de envios reais, benchmark de grande volume ou validação do container Docker neste ambiente. Os testes reais de integração WhatsApp feitos anteriormente pelo operador não equivalem à homologação operacional do novo motor.

## Compatibilidade e pendências

O endpoint legado `POST /api/whatsapp/broadcast` agora retorna 202 com o identificador do disparo, em vez de resultados síncronos por telefone. Integrações devem acompanhar a execução. A API pública mantém o limite de 1.000 destinatários por chamada; o wizard usa sua própria rota de enfileiramento.

Ainda pendentes: teste operacional de fechar a aba e reiniciar worker, teste de carga e ajuste de capacidade, inbox durável para toda a entrada de webhooks, correção do indicador de coexistência, separação explícita dos templates por WABA na listagem, edição de campanhas e integração UAU. A verificação de envio já bloqueia templates que não pertencem à WABA ativa.

O diagnóstico inicial, o guia de credenciais e o backlog de email também são preservados como documentação deste trabalho. Logs como `lint.log`, `mcp-build.log` e `migrations-apply.log` são evidências locais, ignoradas pelo Git e mantidas no computador. O código de migrations `.sql`, os testes, lockfile e instruções de reprodução são versionados; logs brutos não são necessários para reproduzir a alteração.

Operação e recuperação: [campaign-worker.md](campaign-worker.md). Configuração: [setup-and-credentials.md](setup-and-credentials.md). Diagnóstico original: [current-state.md](current-state.md).
