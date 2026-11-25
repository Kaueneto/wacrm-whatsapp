# Consulta financeira UAU no atendimento

## Registro de atendimento com revisão (25/11/2026)

Contrato de retorno confirmado pelo usuário em teste no Postman: sucesso de `GravarAtendimento` retorna o número do atendimento. A integração agora reconhece diretamente um Int32 positivo, sua representação textual e o campo `Num_atd`, apresenta **Atendimento #N gravado no UAU** e persiste esse número em `attendance_id` (migration 099 aplicada) para devolvê-lo também em repetição idempotente. Um retorno numérico válido não depende mais de comparar o histórico para ser considerado sucesso. A conferência por leitura permanece apenas para formatos desconhecidos. Recusas explícitas continuam tendo precedência sobre um número eventualmente presente no mesmo objeto.

Comparação com o payload de teste: preservados envelope `atendimento`, canal 21, login em maiúsculas, cliente, categoria, descrição, flags e empresa/obra selecionadas. Quando não informados, `tipo_atd`, `produnid_atd`, `numper_atd` e `vlrmaoobra_atd` são omitidos em vez de receber strings vazias/zeros artificiais. Produto/personalização continuam pendentes de confirmação dos identificadores reais. A data de cadastro é gerada no momento do envio, com fuso explícito; o exemplo do Postman usa uma data fixa em UTC. Nenhum envio real foi reproduzido durante esta alteração.

Confirmação de sucesso ampliada: além de `{}` documentado e flags booleanas explícitas, retornos desconhecidos (por exemplo número/texto/objeto com ID) podem ser confirmados por consulta posterior do histórico da mesma pessoa. Antes de gravar, captura-se a lista de IDs existentes; depois de uma resposta 2xx desconhecida, exige-se um único ID novo com a mesma categoria, descrição, usuário e data próxima ao envio. Registros antigos e correspondências ambíguas não confirmam sucesso. A gravação nunca é repetida por esse processo. Quando confirmado por leitura, a resposta inclui o número do atendimento. Se não for possível obter evidência suficiente, o resultado continua incerto. Não se promete recuperar o formato de uma resposta antiga que não foi armazenada.

Login UAU normalizado com `trim().toUpperCase()` no salvamento, na leitura das preferências e na montagem dos campos `usrrespon_atd` e `usrcad_atd`. A interface também mostra/digita em maiúsculas. Assim, logins antigos em caixa mista são enviados em maiúsculas sem exigir novo cadastro.

Tipo de atendimento opcional por solicitação do usuário: a categoria volta a ser a primeira escolha, carrega ao abrir o formulário e independe do tipo. A opção padrão “Não informar” omite completamente `tipo_atd` do JSON, sem converter o campo vazio para zero ou enviar null. Um tipo escolhido explicitamente continua validado entre 0 e 4, inclusive preservando zero quando escolhido. Trocar a categoria limpa o tipo para evitar reaproveitar uma combinação anterior. Canal continua fixo em 21 — Telefone. A aceitação da omissão é determinada pelo UAU na próxima tentativa do usuário; não houve lançamento automático de teste.

Atualização vigente do canal: por confirmação explícita do usuário, todos os lançamentos passam a enviar `numccm_atd: 21`, correspondente ao cadastro **Telefone** no UAU. O perfil continua solicitando somente o login. Não foi criada uma categoria/canal no ERP nem realizado lançamento de teste. As anotações anteriores sobre omissão de canal abaixo são históricas e foram substituídas por essa definição.

Pesquisa de consulta de canais: o catálogo Swagger 1.0 da instalação foi obtido, mas não foram encontradas rotas com `canal` no nome, nem um endpoint específico confirmado para listar esse cadastro. A listagem de canais não foi implementada por suposição; o envio do código 21 independe dessa descoberta.

O financeiro passou a ser uma seção sempre aberta sob as tags, sem acordeão ou borda externa de cartão. Ao montar o contato, a interface consulta o backend, que primeiro verifica o acesso/vínculo e reaproveita snapshots em memória do servidor. Não há persistência no localStorage. A resposta agora informa `cacheStatus` (`hit`, `miss`, `refreshed`) para distinguir cache de consulta ao ERP. Atualização manual continua forçando consulta ao UAU; reinício/evicção do servidor ou consultas com falhas parciais podem exigir nova consulta.

Migração 098 aplicada: HTTP 400/422 de validação e respostas com falha explícita são registradas como `rejected`, sem mensagem de possível gravação e sem reenvio automático. Timeout, falha de leitura ou confirmação desconhecida continuam `uncertain`. O usuário pode corrigir dados após uma recusa e iniciar deliberadamente nova tentativa, com novo identificador. Registros históricos incertos não são reclassificados por suposição.

Tipo agora vem antes da categoria; ao trocar o tipo a seleção de categoria é limpa. A API `ConsultarCategDeComentAtivas` foi testada com `tipo_atd` 0–4 tanto no corpo quanto na URL e devolveu as mesmas 17 categorias com workflow em todos os casos, portanto não se afirma que ela filtre por tipo nesta instalação. A consulta alternativa documentada `ConsultarCategoriaAtendimentoWeb` com `tipo_atend` retornou lista vazia para os tipos testados; não foi usada como substituta silenciosa da listagem geral. O endpoint exato com o filtro informado pelo usuário permanece a confirmar.

O erro sobre serviço refere-se à visão **Atend. web** em **CRM → Utilitários → Configurações de serviços**, segundo a documentação Globaltec. A configuração fornece usuário/canal e categorias padrão para o atendimento pela API quando campos são omitidos. Não é um serviço do Windows nem uma configuração de IA. A integração continua omitindo `numccm_atd` por instrução do usuário; não foram alteradas configurações globais do ERP nem criado atendimento durante a investigação.

Categorias para novos atendimentos agora são filtradas por `NumVcwf_CGer` positivo. A consulta à base retornou 27 categorias ativas, das quais 17 informam workflow e 10 não informam. O filtro é aplicado na listagem e repetido no servidor antes de reservar/enviar o lançamento; se o workflow for removido, a requisição é recusada localmente sem chamar `GravarAtendimento`. Isso verifica a existência do vínculo informado pela categoria, sem garantir a aplicabilidade do workflow à obra selecionada, que continua sendo validada pelo ERP.

Correção do diagnóstico de falhas: respostas HTTP não bem-sucedidas do ERP são consumidas com limite de tamanho, preservando status e mensagem de validação. Removido o `body.destroy()` antecipado que descartava o motivo e podia emitir `UND_ERR_ABORTED` sem tratamento. O frontend mantém o bloqueio de repetição durante o envio, mas só mostra o aviso de conferência após o término com erro. A criação não é repetida automaticamente; resultados incertos continuam reservados. O terminal registra somente status e tipo de falha, sem payload, CPF ou texto do atendimento. Não é possível recuperar retroativamente o corpo das respostas descartadas pelas versões anteriores.

Atualização por solicitação explícita do usuário: removido o campo de canal do Perfil e a exigência no endpoint de preferências. O envio de atendimento **omite completamente `numccm_atd`**, inclusive se houver um código salvo anteriormente. O Perfil guarda somente o login, usado em `usrrespon_atd` e `usrcad_atd`. A migration 097, aplicada no banco configurado, permite `channel_code` nulo sem apagar valores antigos. O aceite do lançamento sem canal ainda depende da resposta real do UAU; não foi realizado atendimento de teste no ERP.

Migration 096 aplicada no banco configurado em 25/11/2026, em transação, com registro em `supabase_migrations.schema_migrations` e recarga do schema PostgREST. Conferência posterior das duas tabelas pela API bem-sucedida, sem lançamento de atendimento no ERP.

A seleção de categoria agora oferece busca por código e nome, ignorando acentos/caixa e mantendo o código destacado. Por solicitação do usuário, a consulta financeira autorizada também retorna `document` com o CPF completo do vínculo já confirmado, para exibição formatada imediatamente ao lado do nome no modal. `documentMasked` permanece disponível para as outras visualizações. O documento completo passa pelos mesmos controles de acesso ao contato, conta e vínculo, com resposta `no-store`; não é incluído nos logs nem no prompt de resumo.

Ajuste do formulário: cliente destacado e contrato identificado por rótulos explícitos de código da empresa, código da obra, número da venda e unidades do contrato. O modal é mais largo e usa rolagem externa da janela em telas pequenas, sem área interna de rolagem do formulário. O período de mensagens só aparece ao acionar a geração por IA. A consulta de categorias é independente da leitura das preferências do usuário, para que uma falha nas preferências não oculte categorias válidas; erros e lista vazia aparecem junto ao campo. Uma consulta real, exclusivamente de categorias, retornou 27 categorias ativas durante esta verificação.

As opções “Retornar ao cliente” e “Atendimento reincidente” enviam `retoraten_atd` (0/1) e `reincidente_atd` (boolean), com validação e participação no hash de idempotência. Segundo a documentação oficial de lançamento de atendimento, “Todas Unidades” amplia a lista de personalizações para seleção, independentemente do vínculo com o cliente; não é um comando de vínculo coletivo. Não foi adicionada uma flag inexistente para isso nem editor de texto rico.

A linha do tempo agora oferece **Novo atendimento UAU**, com descrição manual ou gerada por IA e confirmação antes de `Atendimento/GravarAtendimento`. Aplicar a migration `096_uau_attendance.sql` antes de usar. Em **Configurações → Perfil → Seus atendimentos no UAU**, cada usuário informa seu login UAU (sem senha) e o código do canal de comunicação WhatsApp. Esses valores são específicos à conta e à revisão da conexão; uma troca de conexão exige nova configuração. O login identifica o usuário nos campos de cadastro/responsável, sem substituir a autenticação da integração ou conceder permissões no ERP.

Categorias vêm de `Atendimento/ConsultarCategDeComentAtivas`. O normalizador mantém `Codigo_cger` como texto (inclusive zeros à esquerda), usa `Desc_cger`, exclui categorias inativas e descarta somente a linha CLR `System.*` do DataSet, preservando os registros de `MyTable`. O workflow da categoria pode gerar pendências ou ocorrências; a confirmação da tela informa esse efeito.

A geração consulta apenas os textos da conversa autorizada do contato, desde a data escolhida até o início da requisição: máximo de 31 dias, 100 mensagens e 48 mil caracteres. Datas e remetentes são incluídos. O usuário é avisado se o contexto foi limitado. Áudios, imagens, documentos e templates não são processados. O prompt é próprio de resumo, sem as instruções de resposta ao cliente nem a base de conhecimento, para não confundir orientações de cobrança com ações efetivamente realizadas. O consumo utiliza o provedor da conta e é contabilizado como `draft` no registro de uso existente.

Antes de gravar, o servidor confere acesso ao contato/conversa, vínculo UAU, revisão da conexão, categoria ativa e pertencimento do contrato à pessoa vinculada. Empresa e obra são do contrato selecionado. **Esta versão não envia `produnid_atd` nem `numper_atd`: o contrato atual guarda apenas a descrição da unidade; o retorno real dos identificadores ainda precisa ser validado.** A interface deixa explícito que a unidade não será vinculada. Não há inferência dos códigos a partir de quadra/lote.

Cada envio reserva um identificador no banco antes de chamar o ERP, com hash da solicitação e estados `pending`, `succeeded` ou `uncertain`. Uma disputa por identificador impede a segunda chamada. A criação nunca é repetida automaticamente, inclusive em HTTP 401. Em falha ou retorno não reconhecido, é necessária conferência no UAU: não há transação distribuída entre ERP e banco. O Swagger fornecido documenta `{}` como resposta de sucesso; não se promete o número do atendimento no retorno. Após sucesso, a linha do tempo é consultada novamente. Não foram realizados lançamentos reais durante o desenvolvimento.

Os cartões exibem em texto secundário o usuário de cadastro e, se diferente, o responsável. Os campos `UsrCad_atd` e `UsrRespon_atd` são preservados como logins. Quando existe mapeamento inequívoco de login UAU para um usuário da mesma conta/conexão, apresenta-se o nome do perfil; nos demais casos permanece o login recebido do ERP.

Implementada em 24/11/2026. Escopo: consulta individual e vínculo manual confirmado. Não implementa carteira coletiva, régua de cobrança ou emissão/alteração de boletos.

## Uso

1. Abrir uma conversa e o painel de detalhes do contato.
2. Expandir **Financeiro · UAU**. O componente só consulta o servidor quando aberto.
3. Informar um CPF válido e buscar. Conferir o nome, código e e-mail retornados antes de confirmar **Vincular este cliente**. Havendo mais de um cadastro, escolher explicitamente o correto.
4. Selecionar a venda por empresa, obra e número. Unidades de uma mesma venda são agrupadas; vendas com números iguais em outra empresa/obra não são misturadas.
5. Consultar vencidas, a vencer/hoje e recebimentos. O resumo sempre corresponde ao contrato selecionado, com data/hora da consulta e atualização manual.

O vínculo é salvo para os próximos atendimentos. Alterar ou desvincular não altera o cadastro no ERP. Telefones/e-mail exibidos são do UAU; o número e o nome do contato do WhatsApp não são sobrescritos.

## Integração verificada

Os caminhos e campos de requisição foram conferidos no Swagger `1.0/swagger` da conexão já cadastrada. A primeira implementação usou apenas a documentação. O diagnóstico posterior usou o contato que já estava vinculado pela equipe, somente em leitura, sem registrar CPF, valores ou conteúdo dos atendimentos nos logs.

| Método | Corpo enviado |
| --- | --- |
| `Pessoas/ConsultarPessoasPorCPFCNPJ` | `cpf_cnpj`, `status: 2` |
| `Pessoas/ConsultarTelefones` | `Numero` — código da pessoa |
| `Venda/ConsultarUnidadesCompradasPorCPFCNPJ` | `CpfCnpj` |
| `Venda/BuscarParcelasAReceber` | `empresa`, `obra`, `num_ven`, `data_calculo` (hoje em UTC−03:00), `valor_presente: false` |
| `Venda/BuscarParcelasRecebidas` | `empresa`, `obra`, `num_ven` |
| `Atendimento/ConsultarAtendimentoPorPessoa` | `codigo_pessoa` — identidade UAU confirmada pelo CPF |

Referências complementares: [integração UAUWeb](https://ajuda.globaltec.com.br/virtuau/integracao-uauweb-com-sites-de-clientes-para-integracao-utilizando-a-uauapi-api-rest-clique-aqui/) e [dados de vendas](https://ajuda.globaltec.com.br/virtuau/uau-venda/). Exemplos de versões SOAP não devem ser usados para inferir a capitalização dos parâmetros REST; prevalece o Swagger instalado.

O parser aceita tabelas JSON, JSON serializado e DataSets XML. DTD e entidades externas são rejeitados. O cadastro pode conter credenciais do portal no retorno bruto: o servidor seleciona somente código, nome e e-mail e não encaminha campos como login/senha. Os tipos de retorno não documentados geram erro, não saldo zero.

## Significado dos valores

- Em aberto: `ValorReaj` retornado pelo UAU para a venda selecionada e a data de cálculo de hoje, sem cálculo a valor presente. `Valor_Prc` é exibido separadamente como valor base. Correção, juros da parcela, juros de atraso, multa e desconto de antecipação são componentes informativos: não são somados novamente a `ValorReaj`. Campos ausentes permanecem desconhecidos, sem assumir zero.
- Vencida: data anterior à data corrente de `America/Sao_Paulo`. Parcela com vencimento hoje permanece em **A vencer / hoje**.
- Recebimentos: valor principal `Valor_rec`, com componentes `VlCorrecao_rec`, `VlJurosParc_rec`, `VlJuros_rec`, `VlMulta_rec` e `VlDesconto_rec` em colunas separadas; podem existir vários recebimentos parciais da mesma parcela. A interface não anuncia que cada registro corresponde a uma parcela quitada nem soma esses valores como saldo contábil líquido de juros/descontos.
- Valores monetários são normalizados para centavos inteiros antes da soma.
- Se uma consulta financeira falhar ou retornar formato inesperado, a seção correspondente fica indisponível com aviso. Telefones, parcelas em aberto e recebimentos têm tratamento de erro independente.
- Não se conclui que o contrato inteiro está adimplente/quitado apenas porque uma lista de parcelas está vazia. A interface não executa cobrança ou baixa financeira.

## Persistência e acesso

A migration **095** cria `contact_uau_links` com CPF cifrado, identidade UAU, conta, contato, autor e revisão da conexão. O par contato/conta é uma chave estrangeira composta para impedir vínculo cruzado. Não salva cópia do financeiro ou de todos os dados da pessoa. A mesma migration atualiza a proteção de convites para preservar dados de integração.

A tabela só pode ser lida/escrita pelo serviço backend; `anon` e `authenticated` não recebem acesso direto. Cada operação da API exige perfil de atendente ou superior e consulta o contato com o cliente Supabase da sessão, respeitando RLS de equipe/atribuição e a conta do usuário, antes de acessar o vínculo pelo serviço. Credenciais da integração continuam restritas aos administradores.

`GET/POST/PUT/DELETE /api/integrations/uau/contacts/[contactId]/finance` fazem carga/consulta, busca/atualização, confirmação do vínculo e desvinculação. CPF vai no corpo JSON, nunca na URL. As respostas financeiras usam `Cache-Control: no-store` e a rota tem limite por usuário/conta. Nenhum método de escrita financeira do ERP é permitido pelo executor dessa funcionalidade.

O código da pessoa é conferido novamente contra o documento armazenado; a venda escolhida precisa constar da lista atual do CPF. Uma troca da configuração UAU invalida o vínculo pela revisão da conexão, exigindo nova confirmação. As consultas de uma requisição usam a mesma revisão e renovam a sessão uma vez em caso de HTTP 401.

## Implantação e validação

Em **24/11/2026**, aplicadas ao banco configurado as migrations **094** (proteção de convites, pendente da série anterior) e **095**, depois de conferir que o histórico terminava na 093, executar testes PostgreSQL isolados e fazer dry-run transacional com rollback. A aplicação registrou o histórico de migrations e recarregou o esquema da API. Confirmado `authenticated` sem SELECT e `service_role` com SELECT na tabela do vínculo. Nenhum registro de cliente, contrato ou parcela do UAU foi alterado.

Validação do conjunto: **192 arquivos de teste, 1.980 testes aprovados**, TypeScript aprovado, lint dos novos arquivos sem erros e build de produção aprovado. O componente de contato mantém um aviso anterior de uso de imagem. A primeira execução do build encerrou na coleta de páginas sem causa registrada, depois de compilar e conferir tipos; a repetição isolada concluiu. A conferência visual autenticada não foi realizada nesta execução; a leitura real foi validada posteriormente usando o vínculo já confirmado pela equipe.

Cobertura: CPF/dígitos verificadores, XML/JSON, credenciais omitidas, múltiplas unidades e vendas, datas no fuso brasileiro, recebimentos parciais, falhas parciais, contrato fora do CPF, papéis e RLS do contato, CPF cifrado, revisão de conexão, tabela sem acesso de navegador, chave de conta e cascata de exclusão do contato.

Permissões dos seis métodos precisam estar habilitadas para o usuário de integração UAU. A validação real usa somente o contato já vinculado pela equipe; nenhum CPF foi escolhido por tentativa ou extraído de campanhas.

## Visualização ampliada, tabelas e atendimentos

A seta para a esquerda no cabeçalho expande o painel somente sobre a área do chat; a lista de conversas continua visível no desktop. O chat permanece montado para preservar sincronização e rascunhos. A seta para a direita no mesmo cabeçalho retorna à conversa. Ao escolher outra conversa na lista, a visualização ampliada acompanha o contato selecionado. Nome e número aparecem primeiro; tags sempre exibem seus nomes nessa visualização e precedem Financeiro UAU; os três totais ficam lado a lado. As abas mostram tabelas com parcela, tipo, vencimento, atraso, valor e, nos recebimentos, data de recebimento. Em painéis estreitos, há rolagem horizontal da tabela.

A linha do tempo combina notas locais e atendimentos UAU por data de criação, com chaves distintas e identificação visível da origem. Atendimentos exibem número, categoria, descrição expansível e encerramento quando informado. Novas notas continuam locais: nenhuma escrita de atendimento é enviada ao ERP. A consulta de atendimentos é independente das consultas financeiras e tem seu próprio aviso de falha.

O retorno instalado de parcelas abertas é um array direto de vendas; o formato documentado `{Vendas}` também é aceito. Tabelas legadas podem conter uma linha de tipos CLR (`System.*`): somente essa linha é descartada; os registros reais de `MyTable` são preservados. Uma tabela contendo apenas metadados é um resultado vazio válido, não uma consulta indisponível. A leitura de diagnóstico reconheceu 54 parcelas abertas e 0 recebimentos para a venda consultada, sem alterar o UAU.

Validação após estes ajustes: **193 arquivos, 1.987 testes aprovados**, TypeScript e build de produção aprovados. Lint sem erros (avisos anteriores de imagem e import não usado). O endpoint de atendimentos respondeu sem registros para o contato vinculado; a mistura de registros reais e linha de tipos foi coberta com dados sintéticos baseados no formato enviado.

## Consulta detalhada por venda

Substituída a consulta resumida `Recebiveis/ParcelasECobrancasDoCliente` por `Venda/BuscarParcelasAReceber`, após conferir o Swagger instalado e o formato anexado pela equipe. O request é montado exclusivamente com a empresa/obra/venda confirmada para o CPF; registros retornados de outra venda são rejeitados. Conforme regra confirmada pela equipe em 25/11/2026, o vencimento original `Data_Prc` determina a data exibida, a ordenação, os dias de atraso e a classificação entre vencidas e a vencer; `DataPror_Prc` não altera essa classificação. O escopo do cache foi versionado para descartar snapshots calculados pela regra anterior. A descrição da parcela e o índice de reajuste também são selecionados, sem encaminhar o cadastro bruto. Os valores calculados continuam sendo os retornados pelo UAU.

`valor_presente` fica desativado na consulta normal, pois o Swagger descreve `true` como um cálculo específico a valor presente. O cálculo financeiro é feito pelo UAU. Recebimentos continuam em `Venda/BuscarParcelasRecebidas`. A validação de leitura do vínculo atual retornou 171 parcelas a receber, 57 recebimentos e 8 atendimentos, sem registrar documentos, valores ou descrições de clientes no log.

A visualização ampliada usa a largura disponível para as parcelas, com a linha do tempo abaixo em vez de disputar uma coluna lateral. O código do cadastro UAU aparece em destaque; telefones e e-mail do ERP usam badges com identificação de telefone principal quando disponível. A tabela pode crescer até 60% da altura da janela nessa visualização.

## Cache das consultas financeiras

Resultados completos são reutilizados em memória no processo do servidor. Não há gravação de parcelas em localStorage, sessionStorage ou IndexedDB. O cache global desse processo limita-se a 50 snapshots e 16 MiB de JSON UTF-8 serializado; o uso real de RAM inclui o overhead do runtime. Entradas menos usadas são descartadas primeiro e respostas individuais acima do orçamento não são guardadas. Os limites evitam crescimento indefinido.

Cada snapshot é separado por conta, usuário, contato, pessoa UAU, revisão da integração e hash do documento cifrado. Cada acesso continua validando perfil, RLS do contato, vínculo existente e revisão atual da conexão no banco, mesmo quando evita a consulta ao ERP. Troca de vínculo/configuração impede reutilizar snapshots anteriores. Cache não altera o cabeçalho HTTP no-store nem persiste cópias financeiras no banco.

GET reutiliza a última venda consultada; POST com action select reaproveita uma venda já consultada e carrega uma venda ainda ausente. POST com action refresh invalida os snapshots daquele escopo e força a leitura UAU. Requisições simultâneas normais são agrupadas; uma leitura antiga em andamento não sobrescreve uma atualização manual. Respostas com falhas parciais não são guardadas. A data de consulta permanece a original do snapshot e o texto de cálculo se refere a essa data, não implicitamente ao dia atual.

A reutilização vale enquanto a entrada existir nesse processo. Reiniciar o servidor, trocar de instância, atingir o limite ou mudar o vínculo pode exigir nova leitura. Em produção com várias instâncias, esse cache não é compartilhado; Redis pode ser adotado se for necessário reaproveitamento consistente entre instâncias.

Cobertura inclui isolamento de escopo, seleção de venda, LRU, orçamento por bytes UTF-8, respostas grandes, cópias independentes, deduplicação, atualização concorrente, falhas parciais e bloqueio de dados cacheados após perda de acesso, remoção de vínculo ou troca de revisão.

## Ajustes visuais e e-mail UAU

Na visualização ampliada, etiquetas usam o fundo inteiro na cor cadastrada, texto com contraste calculado e cantos discretos. O código da pessoa aparece acima do nome no mesmo bloco de identidade. Alterar vínculo e desvincular ficam junto ao cabeçalho Financeiro UAU. Descrição, código do tipo e índice ficam na mesma linha da tabela.

Confirmado no cadastro UAU consultado que o campo de e-mail é `Email_pes` e está preenchido. O normalizador prioriza esse campo, mantém compatibilidade com `email` e trata vazio ou texto null como ausência. O e-mail é exibido com os demais contatos do ERP. A versão da chave de cache foi incrementada para não reaproveitar respostas anteriores sem esse campo.

A expansão passa a animar a largura do painel sobre a área do chat (350ms), preservando a lista lateral. O chat continua montado e fica sem interação durante a visualização ampliada. O recolhimento percorre a transição inversa. Redução de movimento do sistema é respeitada; o redimensionamento manual não recebe atraso de animação.

O envio de novos atendimentos ao UAU continua fora desta implementação e foi registrado em BL-004 no backlog. Validação deste ajuste: 55 testes direcionados aprovados, build com TypeScript aprovado e lint sem erros.
