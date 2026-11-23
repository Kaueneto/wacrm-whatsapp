# Atendimento: departamentos, equipes e permissões

A operação usa Administrador → Supervisor → Atendente. O proprietário (`owner`) continua sendo o responsável técnico pela titularidade da empresa, com acesso administrativo. O perfil legado `viewer` é preservado para não promover usuários automaticamente, mas deixa de aparecer nos novos convites e na seleção de perfis.

## Uso

No menu Usuários e equipes (`/organization`), exclusivo de administradores, a aba Usuários e convites permite convidar usuários e definir seus perfis. A aba Estrutura apresenta Empresa → Departamentos → Equipes, com as pessoas dentro de cada equipe. Uma equipe pertence a um departamento; usuários podem integrar várias equipes. Um supervisor acompanha todas as equipes nas quais foi incluído com esse perfil. Links antigos para Configurações → Membros redirecionam para a nova área.

Departamentos e equipes podem ser criados ou editados no mapa. Arrastar uma pessoa para uma equipe abre a confirmação do vínculo: mover da origem ou manter a origem e adicionar outra equipe. Os mesmos comandos estão disponíveis no menu de cada pessoa, sem exigir arrastar. Mover usa uma RPC transacional, restrita a administradores, que adiciona o destino e remove a origem em uma única operação. Atendimentos na origem voltam à fila pelo trigger existente. Reposicionar os cartões altera apenas o arranjo visual da sessão; não cria vínculos nem altera os perfis. A migration 070 habilita a movimentação atômica.

A área tem carregamento antecipado pelo menu, fallback de carregamento e indicador de navegação. As duas abas preservam os componentes já visitados e alternam localmente, sem uma nova navegação ao servidor a cada clique. O mapa e a lista de usuários são carregados em módulos separados. Isso melhora o retorno visual e evita recargas entre abas, mas não elimina o tempo de autenticação, rede ou compilação em desenvolvimento.

Na caixa de entrada, o botão Equipe direciona a conversa para uma equipe e, opcionalmente, um responsável. Sem responsável, a conversa fica na fila da equipe. Administradores podem direcionar qualquer conversa da empresa; supervisores só podem movimentar conversas entre equipes sob sua responsabilidade. Atendentes não alteram a distribuição e só leem/respondem conversas atribuídas a eles. Conversas antigas sem equipe permanecem disponíveis à administração e ao responsável atual.

O passo Atribuir conversa nas automações aceita uma equipe de destino. A atribuição específica exige um integrante válido. O rodízio considera somente atendentes online com heartbeat nos últimos 90 segundos, escolhendo quem foi direcionado há mais tempo; a seleção é serializada por empresa no banco. Sem atendente online, o atendimento permanece sem responsável. A opção de fila permite encaminhar diretamente à supervisão. A entrada de um atendente online, sozinha, ainda não dispara uma nova distribuição da fila; o supervisor distribui ou uma nova execução da automação reavalia a conversa.

No fluxograma, a transferência segue essas mesmas regras: “Aguardar na fila” não atribui um responsável, mesmo com um único atendente na equipe. O administrador ou supervisor distribui esse atendimento pela caixa de entrada. Para atribuição automática, selecionar rodízio entre atendentes online ou atendente específico. O formulário apresenta uma explicação conforme a opção escolhida. Um teste PostgreSQL reproduz a equipe com um único atendente online e confirma a diferença entre fila e rodízio, incluindo a visibilidade de cada perfil.

O cabeçalho do fluxograma apresenta a última edição gravada com data e hora local do navegador, separada do indicador de alterações não salvas. A migration 086 adiciona `flows.last_edited_at` e um trigger para salvamentos e mudanças de status. A atualização dos contadores de execução não altera essa data. O editor lê o valor retornado pela API após salvar ou ativar/pausar. Para fluxos anteriores à migração, a data aparece a partir do próximo salvamento, pois `updated_at` também era alterado por execuções e não permite reconstruir a última edição com segurança. Migration aplicada ao banco configurado após conferir a versão 085; coluna, valor padrão e trigger confirmados, sem alterar fluxos ou conversas existentes.

## Transferência do fluxo para IA — 23/11/2026

O nó terminal **Transferir para IA** utiliza o assistente ativo e a base de conhecimento da conta. Configura uma equipe para eventual atendimento humano, mensagem inicial, orientações internas específicas daquele caminho, nota interna para o atendente, distribuição humana (fila ou rodízio entre atendentes online) e mensagem de encaminhamento. A seleção da equipe mantém o departamento de destino; no rodízio sem pessoas online, o atendimento fica na fila dessa equipe. Não utiliza o atendente global de fallback da IA quando ele poderia desviar a conversa para outro departamento.

Ao chegar ao nó, o menu envia a mensagem inicial e termina sua execução. As próximas mensagens de texto são atendidas pela IA. A sessão explícita não depende da resposta automática geral estar ligada, mas exige o assistente ativo e uma chave configurada. Durante a sessão, o webhook suspende novas entradas no menu e automações por conteúdo para evitar respostas duplicadas. As orientações do nó complementam o contexto geral; a nota interna acompanha o encaminhamento humano e não é enviada como mensagem ao cliente.

A migration 088 adiciona o tipo de nó, o contexto da sessão e RPCs exclusivas do servidor para iniciar/finalizar a passagem. As funções preservam o escopo da empresa e da equipe e não substituem um responsável humano existente. Encaminhamentos repetidos não atribuem outra pessoa nem reenviam a mensagem de transferência. Pedidos de intervenção, limite de respostas, indisponibilidade de configuração e falhas de geração encaminham à equipe. A intervenção manual pelo banner continua pausando a IA.

Validação: 423 testes selecionados passaram, além de TypeScript, lint sem erros (um aviso preexistente no webhook) e build de produção. Migrations 088–089 aplicadas; permissões das RPCs confirmadas exclusivas de `service_role`. A 089 preserva o tipo legado `http_fetch` encontrado no schema remoto; a 088 também o aceita em instalações que já possuam esses nós. O teste PostgreSQL mantém uma linha legada durante a aplicação e confirma sua preservação. A validação ponta a ponta com Gemini e WhatsApp reais permanece para o teste operacional.

## Proteções do atendimento

- Políticas RLS restritivas limitam conversas, mensagens, contatos e notas ao escopo de atendimento, mesmo com consultas diretas ao Supabase.
- Supervisores não recebem administração de usuários, integrações, campanhas, automações, fluxos ou credenciais. As rotas de operações administrativas também exigem administrador.
- Triggers validam integrantes, impedem alterações de roteamento por atendentes e registram as transferências. Remover um integrante retorna suas conversas à fila; mudar de empresa limpa os vínculos anteriores.
- O proxy de mídia da Meta exige uma mensagem acessível ao usuário. Listagens de Storage também respeitam os anexos acessíveis e os uploads próprios. Novos uploads de atendimento ficam em `account-<id>/users/<user-id>/`.
- Os URLs públicos de anexos já usados pelo aplicativo continuam sendo links acessíveis a quem os possui. Revogar também links conhecidos exige uma migração adicional para mídia privada e URLs assinados; a restrição da listagem não torna esses URLs privados.
- A caixa de entrada recarrega a lista a cada 15 segundos enquanto visível para remover conversas cuja transferência retirou o acesso. O servidor aplica a restrição imediatamente nas consultas seguintes.

As migrations 065–069 devem ser aplicadas em ordem. A 065 adiciona o valor de enum e precisa concluir sua transação antes da 066. A 069 impede aceitar um convite que excluiria uma conta com departamentos ou equipes cadastrados. Não altera a titularidade nem atribui automaticamente equipes às conversas existentes.

## Validação

Testes PostgreSQL isolados executam as migrations 065–068 e verificam acesso por responsável/equipe, transferências, referências de outra empresa, remoção de integrantes, rodízio, fila sem atendentes online e escopo de Storage. Testes de aplicação verificam perfis, rotas e autorização do proxy de mídia. Não enviam mensagens reais nem criam usuários no Supabase hospedado.

Em 19/11/2026, migrations 065–069 aplicadas ao Supabase configurado após dry-run. A primeira aplicação expirou na 066 e foi conferida antes de retomar: apenas a 065 estava gravada, sem tabelas parcialmente criadas ou transações ativas. A retomada concluiu as demais migrations. A conferência remota confirmou versão 069, quatro tabelas de atendimento com RLS, 27 políticas restritivas e a RPC de roteamento executável pelo servidor, sem permissão para usuários autenticados. Build de produção e 304 testes selecionados passaram; lint dos arquivos alterados não apresentou erros, com avisos preexistentes. A validação visual e o teste de uso com um supervisor e um atendente permanecem pendentes; o serviço de controle do navegador não respondeu nesta sessão e o smoke HTTP local expirou sem resposta.

Próximas evoluções: capacidade simultânea por atendente, expediente por equipe, redistribuição contínua das filas, solicitação de transferência pelo atendente, indicadores da supervisão e migração de anexos para acesso privado.

## Edição na lista de usuários — 22/11/2026

A aba Usuários mostra departamentos e equipes de cada pessoa, incluindo múltiplos vínculos e a indicação de ausência de equipe. O botão Editar abre nome, perfil e equipes agrupadas por departamento, sem precisar abrir a Estrutura. O e-mail de acesso aparece somente para consulta. O perfil do próprio administrador e o do proprietário permanecem protegidos; seus nomes e equipes podem ser editados. Alterações na Estrutura atualizam a lista, e alterações nos usuários atualizam a Estrutura.

A migration 085 adiciona `edit_account_member`, que valida administração, empresa, perfis protegidos e equipes e grava tudo em uma transação. Remover uma equipe devolve os atendimentos à fila pelo trigger existente; o formulário informa esse efeito antes de salvar. Aplicada ao banco configurado após conferir a versão 084; confirmado acesso da função para `authenticated` e bloqueio para `anon`. Nenhum cadastro ou vínculo real foi alterado para validar a funcionalidade.

Validação: 37 testes de API e PostgreSQL passaram, além de TypeScript, lint dos componentes/rotas alterados e build de produção. O primeiro build encontrou bloqueio de permissão do sandbox ao gerar standalone; a execução fora do sandbox concluiu. A revisão visual autenticada permanece pendente.

## Organização visual — 20/11/2026

A área dedicada de Usuários e equipes substitui a gestão dentro das configurações. A migration 070 foi aplicada depois do dry-run e de testes reais de PostgreSQL para movimentação, bloqueio de supervisores e preservação dos vínculos em caso de erro. Build e 315 testes selecionados passaram. O lint não encontrou erros; permanece um aviso anterior de dependência no efeito da visão geral de configurações.

A revisão visual autenticada permanece pendente: o navegador de teste chegou ao login e a prévia isolada com dados fictícios não pôde ser acessada por falha de conexão local. Não foram criados usuários nem alterados vínculos reais para fazer a validação. A melhoria de navegação foi implementada, mas ainda não houve medição da latência no navegador autenticado.
