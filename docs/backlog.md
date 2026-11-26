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

## BL-003 — Carteira centralizada e régua de cobrança integrada ao UAU

- **Registrado em:** 23/11/2026.
- **Status:** planejamento retomado após a reunião com Laércio relatada em 25/11/2026; sincronização coletiva e automações ainda não implementadas.
- **Detalhamento:** [carteira, régua, trilha e Kanban](architecture/carteira-regua-cobranca.md), com os pontos recuperados da reunião, limites da integração atual e sequência proposta de entregas.
- **Objetivo:** apresentar contratos por cliente, empresa, empreendimento/obra e venda, com situação financeira, dias em atraso e histórico das etapas de cobrança.
- **Origem dos dados:** avaliar consulta geral cadastrada no UAU e executada pela API já integrada, ou endpoints nativos que atendam à descoberta e atualização da carteira. Validar parâmetros, retornos, paginação e permissões na versão instalada.
- **Sincronização:** carga inicial e atualização diária em lotes, identificando contratos pela conexão UAU + empresa + obra + venda. Preservar histórico local e indicar a última atualização. A ausência em uma consulta de inadimplentes não comprova pagamento; reconciliar pagamentos, cancelamentos e consultas incompletas antes de alterar a situação.
- **Régua:** etapas configuráveis de mensagens e tarefas de ligação, com deduplicação por contrato e ciclo de cobrança, pausa por acordo e encaminhamento jurídico conforme regras explícitas da empresa. Conferir a situação financeira antes de executar cada cobrança e definir como tratar contratos já atrasados na carga inicial, sem disparar todas as etapas passadas.
- **Detalhes e linha do tempo:** contatos, contratos/unidades, parcelas a receber, vencidas e recebidas; mensagens de cobrança, documentos, ligações registradas e eventual integração de atendimentos do UAU, distinguindo notas internas de lançamentos no ERP.
- **Identificação:** aproveitar o código da pessoa e CPF/CNPJ importados para sugerir ou estabelecer vínculos com contatos; exigir conferência em telefones compartilhados ou associações conflitantes.
- **Separação de escopo:** esta proposta é o painel coletivo de cobrança. A consulta individual na conversa — informar CPF/CNPJ, localizar a pessoa, selecionar uma venda e visualizar parcelas pela API — é uma funcionalidade distinta e pode ser desenvolvida antes deste painel.

## BL-004 — Lançar atendimentos no UAU pela plataforma

- **Registrado em:** 24/11/2026.
- **Status:** backlog por solicitação do responsável; não implementar nesta etapa.
- Permitir criar um atendimento no contexto do cliente vinculado e enviá-lo ao UAU.
- Validar o endpoint de inclusão, campos obrigatórios, categorias, responsável e permissões na versão instalada.
- Distinguir explicitamente nota interna de atendimento enviado ao UAU, com confirmação de envio, identificador retornado e atualização da linha do tempo.
- Prever deduplicação, falhas e tentativas para evitar atendimentos duplicados, além de auditoria por usuário/conta e invalidação do cache após sucesso.

## BL-005 — Preparar atendimento UAU completo com IA para revisão

- **Registrado em:** 25/11/2026.
- **Status:** ideia registrada no backlog; implementação futura.
- **Objetivo:** evoluir a geração atual de descrição para entregar o formulário de atendimento já preenchido, deixando ao usuário a conferência, eventuais ajustes e a confirmação de envio.
- **Entrada:** adicionar um botão ao lado das ações atuais de atendimento/IA, com rótulo provisório **Preparar atendimento com IA**.
- **Contexto:** carregar as mensagens da conversa no período considerado, o cliente vinculado e o contrato selecionado. Informar ao usuário o período e eventuais limitações do contexto; não presumir conteúdo de mídias sem processamento disponível.
- **Opções do UAU:** consultar as categorias com workflow e os tipos de atendimento disponíveis na conexão da empresa. Validar a compatibilidade entre categoria, tipo e empreendimento conforme as consultas suportadas pela instalação, sem inventar códigos ou presumir que a consulta geral de categorias filtre por tipo.
- **Preenchimento pela IA:** gerar a descrição factual do que foi conversado e realizado, sugerir a categoria mais adequada e, quando houver compatibilidade confirmada, o tipo de atendimento. Sugerir retorno ao cliente e reincidência apenas quando sustentados pelo contexto. Preservar os dados confirmados do cliente/contrato, o login UAU do usuário e o canal configurado na integração.
- **Ambiguidade:** se não houver evidência suficiente ou opção compatível confirmada, destacar o campo para escolha do usuário; manter o tipo sem informar quando apropriado. Não apresentar uma escolha incerta como configuração validada.
- **Revisão e envio:** abrir o formulário editável com as sugestões preenchidas. Gerar/preparar o atendimento não o grava no ERP; o lançamento ocorre somente após o usuário conferir e clicar para enviar, reaproveitando a validação, a proteção contra duplicidade e a confirmação já existentes.
- **Critério de aceite:** o usuário consegue solicitar a preparação, receber descrição e classificação sugeridas com base no contexto e nas opções reais do UAU, corrigir o necessário e confirmar o lançamento em uma única revisão.

## BL-006 — Produtividade, SLA e avaliação dos atendimentos

- **Registrado em:** 25/11/2026, após relato da reunião com Laércio.
- **Status:** planejamento; métricas, metas e modalidade de avaliação a confirmar.
- Relatórios e gráficos por período, empresa/obra, departamento/equipe e responsável, com volume, tarefas, pendências e conclusões.
- Separar SLA (primeira resposta, retorno, resolução e cumprimento de metas) de avaliação de qualidade/satisfação. Confirmar se a avaliação será dada pelo cliente, pelo supervisor ou por ambos.
- Definir horário útil, pausas, início/fim dos relógios e tratamento de transferências; preservar autoria e responsabilidade histórica.
- Relatórios de inadimplência associados à BL-003: saldo vencido, faixas de atraso, evolução, pagamentos confirmados, promessas e casos jurídicos, com cobertura e data de sincronização visíveis.
- **Detalhamento:** [carteira, régua e indicadores](architecture/carteira-regua-cobranca.md).
