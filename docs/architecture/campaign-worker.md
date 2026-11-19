# Campanhas e fila de disparos — primeira implementação

Campanha guarda objetivo, definição do público, template, personalização e agenda. Cada execução cria um `broadcasts` independente e uma fotografia em `broadcast_recipients`. Disparos avulsos continuam disponíveis. As tabelas existentes e o histórico não são apagados.

## Executar localmente

1. Aplicar as migrations aditivas 061–064 com a CLI Supabase, depois de revisar o dry-run. Nenhum disparo antigo é enfileirado automaticamente.
2. Manter o Next rodando com `npm run dev`.
3. Validar conexão sem enviar: `npm run worker:check`.
4. Em outro terminal, iniciar `npm run worker:campaigns`. Fechar a aba do CRM não interrompe esse processo. Desligar o terminal/computador interrompe o worker; os itens pendentes permanecem no banco.
5. Criar uma campanha em `/campaigns/new` ou usar `/broadcasts/new`. Campanhas são salvas com programação desativada por padrão. Ativar a programação ou clicar em Executar agora autoriza o enfileiramento.

Em produção, `docker compose --env-file .env.local up --build -d` também inicia o serviço `campaign-worker`, com reinício automático. Pode hospedar a aplicação web separadamente, mas o worker precisa de processo persistente com acesso ao mesmo Supabase e à Meta. Não usar `after()`/cron HTTP como substituto do worker.

O worker usa somente `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` e `ENCRYPTION_KEY` já existentes. Nenhuma credencial nova é necessária. Tokens Meta continuam criptografados no banco e são descriptografados apenas no servidor. `tsx` executa o TypeScript no processo independente.

## Semântica e recuperação

- `dispatch_state`: queued, sending, accepted, failed, unknown ou cancelled. `accepted_at` indica aceite HTTP pela Meta; `status` e timestamps de envio/entrega/leitura são atualizados pelos webhooks.
- Cada claim usa uma lease UUID com 90 segundos, fence no resultado e trava por número remetente. O timeout HTTP é de 30 segundos. Lease expirada vira unknown; nunca há retry automático de uma requisição que possa ter sido aceita.
- Um worker reiniciado continua os itens queued. Itens sending cujo processo desapareceu ficam unknown até reconciliação operacional; priorizamos não duplicar, sem prometer exactly-once em uma API externa sem chave idempotente.
- Throttling explícito recebe backoff exponencial a partir de 30 segundos, no máximo cinco tentativas. Falha definitiva vira failed (dead-letter visível). Falhas de rede, retorno sem message ID ou HTTP 5xx ficam unknown. Não reenviar cegamente.
- Limite inicial conservador de um pedido por segundo por remetente, compartilhado entre os workers e campanhas através de `broadcast_sender_slots`. `interval_ms` é configuração operacional do servidor, mínimo 100 ms; só elevar após verificar capacidade, coexistência, qualidade e limites reais da conta/número. Throughput não substitui limite de destinatários ou as regras de marketing. 429/códigos de limite suspendem o remetente pelo período de backoff.
- Cada claim é um pequeno lote de um item. Isso reduz o raio de incerteza e permite pausa entre mensagens. É uma base conservadora, ainda não um benchmark para o volume empresarial pretendido.
- Pausar impede novos claims; um pedido já em andamento pode ser aceito. Cancelar marca os itens ainda não iniciados; mensagens aceitas não podem ser recolhidas.
- Retry manual cria outro disparo, ligado pelo `parent_broadcast_id`, somente com falhas confirmadas. Resultados unknown e contatos removidos não entram. Executar novamente recalcula o público atual.
- Template, telefone, nome e valores são congelados em cada disparo; trocar a conexão não redireciona uma fila antiga a outro número. O template é validado na WABA atual ao preparar uma execução da interface.
- `request_key` evita que a repetição da mesma solicitação do wizard duplique a fila. A criação do pai, destinatários e job é uma transação SQL.

## Programação

Envio único, diário ou a cada N dias, em horário e fuso IANA. A agenda preserva o dia de referência e calcula datas locais; recorrências vencidas colapsam em uma execução atrasada e a próxima fica no futuro. O mesmo campaign_id não possui dois jobs não finalizados. Uma campanha com disparo pausado também bloqueia a próxima execução. Campanhas distintas podem usar a fila, mas o slot do remetente é compartilhado. A campanha pausada suspende apenas execuções futuras; o disparo corrente tem controle separado.

Públicos atuais: todos os contatos, etiquetas, campo personalizado e CSV. Importação resolve contatos e elimina telefones repetidos no snapshot. CSV mantém a lista explicitamente importada; filtros/etiquetas são recalculados. A fonte externa UAU não é implementada nesta etapa. Ela deverá retornar o público elegível, e não será criada uma regra financeira local para identificar pagamentos.

## Eventos, segurança e limites conhecidos

`record_broadcast_status` mantém buffer deduplicado de sete dias para eventos que chegam antes de o worker salvar o wamid. A gravação do aceite e o replay usam a mesma trava por mensagem; eventos duplicados ou atrasados não regridem entregues/lidos. A assinatura do webhook existente continua obrigatória. A entrada geral do webhook ainda usa `after()` para seu processamento: transformar toda a entrada em inbox durável é uma evolução separada, necessária para resistência total à queda entre o ACK e o processamento.

RPCs de claim/finalização/enfileiramento são restritas a service_role. Campanhas/jobs têm RLS de leitura por conta; rotas de escrita exigem agent+. A proteção de navegação inclui `/campaigns`; a proteção efetiva permanece no servidor e no banco. A migration 062 preserva o bloqueio de mudança de conta quando já existem dados de campanhas.

O endpoint legado `POST /api/whatsapp/broadcast` passa a retornar **202 + broadcast_id**, em vez de resultados síncronos por telefone. `/api/v1/broadcasts` também usa a fila. Integrações que consumiam a resposta antiga devem acompanhar o disparo. O cap de 1.000 destinatários por chamada da API pública é preservado; o wizard não depende desse endpoint.

Não executar disparos reais como teste automatizado. Testes de banco usam PostgreSQL embarcado isolado; testes HTTP usam mocks. Ainda validar com uma campanha operacional autorizada: fechar navegador, reiniciar worker, pausar/retomar e observar entrega/leitura reais. Docker e throughput de grande escala dependem de validação no ambiente de hospedagem.

## Validação em 18/11/2026

- Migrations 061–064 aplicadas ao Supabase configurado após dry-run; campanhas e jobs confirmados vazios antes de iniciar o worker. O horário original de execuções atrasadas fica em `broadcasts.scheduled_at`.
- `npm run worker:check` passou sem executar envios. Worker local iniciado em segundo plano; heartbeat confirmado no banco e log inicial sem erros em `.runtime/`. Esse processo local não é um serviço com reinício no boot; após reiniciar a máquina, rodar novamente ou usar Docker Compose.
- Build passou; typecheck passou. Lint: zero erros e os mesmos 40 avisos preexistentes.
- Suíte completa: 1.747 testes passaram e três falharam em `currency.test.ts`, as mesmas diferenças de locale já registradas no baseline. Os 21 testes novos de fila, worker e calendário passaram. Um teste adicional de sobreposição/avanço atômico da agenda também passou na execução isolada posterior (22 testes novos no total).
- Smoke HTTP sem sessão: `/campaigns` redireciona ao login (307); `/api/campaigns` e consulta de fila retornam 401.
- Sem envio real nesta implementação. Na revisão posterior da interface, a criação de campanhas foi inspecionada no navegador autenticado: nomes longos contidos nos cartões, template sempre visível na lateral e acesso direto às abas de Programação e Personalização. O teste operacional de fechamento da aba fica para o próximo disparo autorizado do operador.

### Revisão da criação de campanhas

A criação passou de etapas sequenciais para abas livres de Público, Personalização e Programação. O seletor de templates permanece na lateral em telas amplas; título, descrição e resumo ficam acessíveis independentemente da aba ativa. Os dados permanecem montados ao alternar abas, e a validação final verifica público, variáveis, mídia e programação ao salvar. Os componentes compartilhados mantêm a navegação original por padrão para os disparos avulsos.

Os nomes de templates usam quebra de linha e limites de largura para não invadir outros cartões. A revisão passou por typecheck, lint dos componentes alterados (zero erros e um aviso preexistente) e build. Não houve migration nem alteração do worker nessa revisão visual.

## Continuidade e rollback

Campanhas e Disparos continuam separados na navegação. Os cartões, funil, filtros e exportação foram preservados; o detalhe pagina 100 destinatários e exporta o conjunto completo sob demanda. Há contador incremental de processamento na listagem e estimativa aproximada no detalhe após cinco destinatários processados.

Para interromper a operação, pausar a programação e os disparos e encerrar o worker. Não reaplicar a versão antiga do loop do navegador contra jobs em andamento: ele não conhece as leases da fila. Preservar as tabelas/snapshots para retomar; rollback operacional não deve apagar histórico nem reenviar estados unknown.

Próximos incrementos: editar definições de campanhas já salvas, seleção manual de contatos, etiquetas na importação em lote, escopo explícito do catálogo por WABA (a validação de envio já bloqueia modelos da conta antiga), inbox durável para toda a entrada de webhooks e benchmark/tuning com volume representativo. O aviso de coexistência nas configurações permanece uma correção separada.
