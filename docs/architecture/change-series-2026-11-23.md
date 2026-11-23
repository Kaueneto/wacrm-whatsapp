# Série de evolução do CRM — 23/11/2026

## Origem e estratégia de versionamento

- Branch de origem: `navegacao-lateral`.
- Commit de origem: `209b5ad8d19102cbb2d46ff9b597490d892e92c1`.
- Branch de organização: `codex/organizar-evolucao-crm`.
- Inventário inicial: 247 arquivos modificados, novos ou excluídos; nenhum arquivo estava previamente staged.
- Preservação local: inventário com hashes, cópias dos arquivos e patch binário em `.runtime/commit-audit/`, ignorado pelo Git. Esse material é local e não substitui backup externo.
- Não foram feitos push, merge, rebase ou alterações na branch de origem. Não foram alteradas configurações remotas ou enviadas mensagens reais para validar esta série.

Os commits formam uma série integrada. Banco, tipos opcionais, traduções e paletas compartilhadas antecedem as funcionalidades consumidoras. O campo de contexto de IA nos tipos é introduzido junto do módulo correspondente, sem regravar o arquivo de trabalho. A validação registrada abaixo refere-se ao conjunto final, não a cada commit intermediário isoladamente. Para aproveitar somente uma funcionalidade em outra branch, conferir suas dependências antes de selecionar commits.

Uma branch por assunto, partindo da mesma base, exigiria duplicar ou separar mudanças compartilhadas em tipos, traduções, permissões, campanhas e webhooks. Por isso foi escolhida uma branch de integração com commits separados. Branches de lançamento ou de novas funcionalidades podem partir do resultado final conforme a necessidade.

## Mapa da série

<!-- COMMIT-MAP:START -->
| Ordem | Commit | Assunto | Arquivos no commit |
| --- | --- | --- | --- |
| 1 | `e858329228` | feat(db): consolidar migrations de atendimento, campanhas e integracoes | 23 |
| 2 | `73b8f25132` | chore(core): preparar traducoes e dependencias das novas funcionalidades | 8 |
| 3 | `2a0585d3a9` | fix(theme): alinhar modo escuro e contraste dos chips semanticos | 6 |
| 4 | `eccc22be5d` | feat(organization): editar usuarios e reforcar escopo de atendimento | 13 |
| 5 | `c437d6b4ae` | feat(ai): integrar Gemini e transferencia entre fluxos e humanos | 37 |
| 6 | `7c7a78b312` | feat(import): importar contatos e publicos de campanhas com modelos CSV e XLSX | 7 |
| 7 | `8a96401acd` | feat(uau): configurar conexao e preparar campanhas por consultas do ERP | 13 |
| 8 | `65b36aaff3` | feat(templates): organizar catalogo e editor com variaveis e formatacao | 27 |
| 9 | `01961ec40f` | feat(campaigns): editar campanhas e controlar agendamento e execucao | 22 |
| 10 | `a4f6cf4e8d` | feat(costs): detalhar custos e resultados dos disparos WhatsApp | 19 |
| 11 | `361e7f6479` | feat(webhooks): persistir eventos e recuperar processamento interrompido | 22 |
| 12 | `d0e7422e36` | feat(contacts): centralizar tags e sincronizar etiquetas dos atendimentos | 10 |
| 13 | `c77ebc4945` | feat(inbox): melhorar painel de contato, filtros e atualizacao das conversas | 7 |
| 14 | `7afede7cbf` | feat(chat): adicionar menu morph e controles diretos de audio | 7 |
| 15 | `4e17dc7415` | feat(dashboard): apresentar indicadores por perfil e periodo | 16 |
| 16 | `c7644c56cf` | feat(navigation): reorganizar menu lateral e acessos das configuracoes | 9 |
| 17 | `3f2d774948` | test(currency): respeitar configuracao regional do ambiente | 1 |
| 18 | `14cda28aef` | chore(editor): configurar remote do GitHub no VS Code | 1 |
| 19 | Commit final deste documento | docs: registrar arquitetura, validacao e mapa dos commits | 4 |
<!-- COMMIT-MAP:END -->

A série cobre **251 caminhos únicos**: os 247 iniciais, a documentação desta entrega, o teste de integridade de integração, a migration 094 e a correção de portabilidade do teste monetário. O arquivo de tipos é atualizado em duas etapas para introduzir o contexto de fluxo junto do módulo correspondente. A soma por commit pode exceder os caminhos únicos.

## Escopo funcional

### Usuários, equipes e acesso

Edição de nome, perfil e equipes pela lista de usuários; departamentos e múltiplas equipes visíveis. Escopo de atendimento por perfil e departamento, roteamento para fila ou atendente e contexto de atribuição nas notificações. O acesso às novas páginas e APIs segue as permissões do workspace.

### IA e fluxogramas

Provedor Gemini, compatibilidade de esquemas, nó de agente de IA, instruções por fluxo e transferência para atendimento humano. Aguardar na fila não atribui automaticamente ao único integrante de uma equipe. O cabeçalho do fluxo distingue edição não salva da última edição persistida com data e hora; tipos de nós legados são preservados.

### Webhooks e armazenamento

Eventos validados são persistidos antes do ACK e processados com deduplicação, leases e checkpoints. O worker independente permite retomar eventos após interrupção. Eventos antigos completam o histórico sem disparar fluxos retroativamente; efeitos externos ambíguos ficam para revisão. Painel de saúde e verificação do callback ajudam a identificar falhas do túnel ou do worker.

Essa fila não recupera mensagens nunca entregues ao endpoint. O histórico textual e metadados do chat são salvos no banco. Anexos próprios e recebidos espelhados ocupam Storage; a retenção do payload bruto do webhook não apaga mensagens ou anexos. As condições de operação e retenção estão em [setup-and-credentials.md](./setup-and-credentials.md).

### Campanhas, importações e UAU

Criação e edição unificadas, agendamento, escolha de departamento, identificação do remetente, revisão do público e controle de execução. CSV com decodificação e mapeamento melhores; leitura de XLSX e modelo público com dados fictícios. Conexão UAU configurável, consultas parametrizadas, prévia de dados, mapeamento de telefones e variáveis e identificação de conflitos. Parâmetros sensíveis da definição são cifrados.

Campanhas guardam a definição e os dados necessários ao disparo. Não foi implementada a cópia irrestrita de todas as colunas retornadas pelo ERP. As consultas são executadas novamente na preparação dos disparos.

### Templates

Área dedicada em Campanhas, tabela e cartões, título local destacado e identificador Meta secundário. Status de revisão exibido como “Em análise”. Edição de metadados, sincronização e verificações de compatibilidade com o catálogo conectado. Corpo com variável posicional inserida no cursor, numeração sem repetição, negrito, itálico, tachado, monoespaçado, emojis e prévia formatada sem HTML arbitrário.

### Painel, custos, contatos e chat

Indicadores por perfil e período, supervisão e atendimento, detalhamento de custos e resultados de disparos. O contexto de custo acompanha categoria e canal; estimativas não constituem faturamento oficial da Meta. Tags centralizadas e sincronizadas entre contatos e conversas, painel lateral de contato redimensionável e alternativa mobile.

Menu morph reutilizável com teclado, fechamento e colisão de viewport. Botões fechados mantêm aspecto discreto. Envio à direita, microfone direto, ondas geradas a partir do áudio, pausa/retomada, descarte e envio direto. As cores do chat têm paletas próprias para claro/escuro; chips semânticos não dependem do acento escolhido. As variantes `dark:` reconhecem o atributo `data-mode` usado pela aplicação.

## Banco e operação

- Migrations versionadas nesta série: **073–094**, em ordem crescente. Não foram reescritas migrations históricas já existentes na base.
- A migration **094** foi criada durante a auditoria: aceitar um convite não pode excluir uma conta que ainda possua credenciais UAU ou eventos persistidos de webhook. Há teste com PostgreSQL isolado para os dois bloqueios e para o ingresso permitido de uma conta vazia.
- **A 094 não foi aplicada ao banco remoto nesta organização de commits.** Conferir o histórico do ambiente, realizar dry-run e aplicar apenas as versões faltantes antes de disponibilizar o código.
- O estado remoto das migrations anteriores não foi reauditado nesta etapa. Registros de aplicações anteriores permanecem nos documentos de arquitetura correspondentes.
- Produção precisa do servidor, do processamento de campanhas e do processamento de webhooks disponíveis de forma contínua. Comandos: `npm run worker:campaigns`, `npm run worker:webhooks` e seus modos de verificação.
- O ambiente de desenvolvimento continua usando túnel. Domínio fixo, hospedagem definitiva, backups e alertas externos precisam de configuração própria de infraestrutura.

## Validação executada

| Verificação | Resultado |
| --- | --- |
| `vitest run --maxWorkers=4` | **188 arquivos de teste, 1.957 testes aprovados** |
| `tsc --noEmit` | Aprovado |
| Lint dos 212 arquivos de código incluídos na auditoria | **0 erros, 14 avisos** |
| `npm run build` | Build de produção aprovado com Next.js 16.3.8 |
| Modelo XLSX público | Conferido; cabeçalho e exemplo fictício, sem lista real de clientes |

Na primeira execução completa, três expectativas monetárias presumiam separador de milhar americano; os testes foram ajustados para o locale do ambiente sem mudar o comportamento da aplicação. O teste de integridade de convites encontrou as tabelas novas que motivaram a migration 094. Um teste de webhook excedeu cinco segundos com a concorrência padrão; a repetição completa limitada a quatro workers passou sem aumentar o timeout nem alterar a lógica do webhook.

O build ainda avisa sobre a depreciação do Edge Runtime. Os avisos de lint incluem dependências de hooks, imports não usados e uso de imagens. Não foram ocultados ou tratados como erros corrigidos nesta série. Logs locais: `.runtime/commit-audit-tests.log`, `.runtime/commit-audit-types.log`, `.runtime/commit-audit-lint.log` e `.runtime/commit-audit-build.log`.

A revisão visual autenticada completa e o teste real do microfone não fazem parte dessa validação automatizada. As limitações de acesso ao navegador registradas nas etapas anteriores não foram consideradas aprovação visual.

## Ideias discutidas que NÃO estão implementadas

- Vincular contato manualmente por CPF/CNPJ à pessoa no UAU e persistir essa identificação.
- Exibir contratos, unidades, resumo financeiro e parcelas recebidas/em aberto na conversa.
- Registrar e sincronizar atendimentos do UAU na linha do tempo de notas.
- Associar pessoas e contratos automaticamente aos contatos a partir das consultas de campanha.
- Estruturar múltiplos canais/contas Meta e filtrar a disponibilidade de templates por canal.
- Transformar o Kanban comercial em quadro de etapas de atendimento ou remover o módulo comercial.
- Enviar telegramas pelos Correios ou disponibilizar uma funcionalidade com promessa de validade jurídica.

Essas propostas exigem desenho e implementação próprios. Não devem ser anunciadas como funcionalidades entregues por esta série.
