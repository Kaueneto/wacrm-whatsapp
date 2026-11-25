# Carteira, régua de cobrança e painel de atendimento

Registro da reunião com Laércio relatada em 25/11/2026. Recupera os pontos lembrados
pelo responsável e propõe a arquitetura para detalhamento. Não cria tabelas,
consultas SQL, automações, mensagens ou lançamentos no UAU.

## Pontos recuperados da reunião

- Centralizar o atendimento com dados de cliente, contrato, empreendimento,
  parcelas e histórico, reduzindo a necessidade de abrir o UAU nas tarefas cobertas.
- Cadastrar réguas reutilizáveis, com aplicação por empresa e obra. A redução da
  quantidade de regras não elimina as exceções entre empreendimentos.
- Exibir trilha de cobrança, Kanban por etapa e uma visão dos atendimentos segundo
  a classificação UAU. Confirmar quais cadastros foram chamados de ocorrências;
  categoria, ocorrência e pendência não são automaticamente o mesmo conceito.
- Preservar o cliente, pagamentos e ciclos encerrados quando sai da inadimplência.
- Mostrar exposição financeira, evolução do atraso, recuperação e acompanhamento
  jurídico, além de responsáveis e próximas ações.

## Situação atual conferida no código

`src/lib/campaigns/prepare.ts` executa a consulta configurada no público da campanha.
O retorno prepara destinatários; o histórico do disparo não é uma carteira financeira
permanente e não comprova pagamentos.

`src/lib/uau/contact-finance.ts` consulta parcelas abertas e recebidas por
empresa/obra/venda. Os snapshots do painel individual ficam no cache do servidor;
não constituem um histórico financeiro durável.

Reaproveitar conexão, autenticação, execução de consultas, normalizadores e padrões
do worker persistente. A sincronização da carteira terá configuração, estado,
auditoria e execução próprios, independentes da existência de uma campanha.

## Fonte de dados e reconciliação

Inspecionar o SQL existente de carteira antes de decidir se deve ser adaptado ou
substituído. Não há endpoint novo confirmado por este planejamento.

Contrato mínimo proposto para a extração:

| Informação | Finalidade |
| --- | --- |
| Organização do CRM e origem UAU estável | Isolar bases e evitar colisões |
| Código da pessoa | Identificar o cadastro ERP; telefone não é chave financeira |
| Empresa, obra e venda | Identificar o contrato; preservar códigos de obra como texto |
| Identificador estável da parcela no ERP | Reconhecer a mesma obrigação entre sincronizações |
| Tipo, número e origem da parcela | Apoiar reconciliação de grupos e renegociações |
| Vencimento original e eventual prorrogação | Preservar ambas; a classificação atual usa o original |
| Principal, saldo e valor atualizado com data de cálculo | Separar grandezas e não somar encargos duas vezes |
| Identificadores, datas e valores de recebimentos | Confirmar pagamentos parciais, totais e estornos |
| Situação da venda/parcela e manutenções disponíveis | Distinguir pagamento, cancelamento e renegociação |

Uma extração de vencidas pode descobrir casos, mas não explica sozinha por que
uma parcela saiu da lista. Reconciliar abertas, recebidas e manutenções dos
contratos já acompanhados, inclusive quando não retornam na lista de inadimplentes.
Preferir extrações em lote; usar endpoints individuais já integrados para conferir
exceções. Paginação e incrementos por data de alteração dependem da instalação;
não presumir esses recursos nem consultar toda a carteira ao abrir uma tela.

Fluxo proposto:

1. Extrair por escopo, em execução independente da campanha.
2. Validar formato, escopo, duplicidades e completude dos lotes.
3. Atualizar a posição atual e registrar mudanças, preservando eventos anteriores.
4. Reconciliar ausências com evidência financeira correspondente.
5. Atualizar régua e indicadores a partir da situação conhecida.
6. Mostrar última consulta bem-sucedida e problemas de sincronização.

Ausência no retorno gera **pendência de reconciliação**, não pagamento presumido.
Recebimento parcial não encerra toda a dívida. Relacionar obrigações anteriores e
novas na renegociação, sem contabilizar troca de parcelas como dinheiro recuperado.
Estornos podem reabrir saldo. Falha ou extração incompleta não deve encerrar casos,
zerar totais ou autorizar cobrança com dados desatualizados.

A documentação UAU confirma a geração de novas parcelas a partir de saldo devedor
ou principal: [Assistente de Renegociação — Globaltec](https://ajuda.globaltec.com.br/virtuau/assistente-de-renegociacao/).

Recuperar histórico anterior à implantação depende da disponibilidade de extração
retroativa. Separar a data do evento no ERP da data em que o CRM o identificou;
não inventar etapas passadas a partir da primeira fotografia.

## Políticas por empresa e obra

Proposta: regra padrão da organização, substituição por empresa e exceção por
empresa/obra. Um contrato deve ter uma regra aplicável sem ambiguidade, com
prioridade e vigência explícitas. Validar conflitos ao salvar.

Definir etapas, faixas de dias, responsáveis/equipes, modelos de mensagem, tarefas,
frequência, horários, pausas e critérios de conclusão. Versionar as regras:
mudanças não reescrevem o passado nem disparam retroativamente ações anteriores.

Exemplo ilustrativo, sujeito à decisão da empresa:

| Dias de atraso | Etapa |
| --- | --- |
| 0–2 | Observação, sem cobrança por esta régua |
| 3–9 | Contato inicial |
| 10–19 | Acompanhamento |
| 20–29 | Negociação |
| 30–44 | Cobrança intensificada |
| 45–59 | Preparação para análise jurídica |
| 60 ou mais | Elegível para avaliação jurídica |

As faixas não podem se sobrepor. Proposta para idade da dívida por contrato: maior
atraso entre parcelas vencidas com saldo efetivamente aberto, pelo vencimento
original. Separar etapa financeira calculada de situação operacional: em contato,
aguardando retorno, promessa de pagamento, contestação, acordo ou análise jurídica.

Promessa não equivale a pagamento nem elimina a faixa financeira; definir pausa
e retomada de mensagens. Elegibilidade por idade gera alerta/tarefa; encaminhamento
jurídico efetivo exige decisão autorizada da equipe.

## Kanban e trilha

Unidade proposta do card financeiro: **contrato em um ciclo de cobrança**. Um cliente
pode ter dois contratos em etapas diferentes. A visão do cliente agrega históricos
sem misturar empresas/obras/vendas ou duplicar a exposição financeira.

- Cobrança: colunas por etapa, com filtros por empresa, obra, equipe, responsável
  e situação operacional.
- Atendimento: cartões de atendimentos/ocorrências segundo o cadastro UAU que for
  validado. Relacionar ao contrato e ciclo com identificadores confirmados.
  Vários atendimentos não multiplicam o saldo do contrato.
- Card: pessoa, contrato/unidade, empresa/obra, saldo, parcelas em atraso, maior
  atraso, responsável, última interação e próxima ação.
- Detalhe: resumo financeiro, trilha cronológica, conversas, tarefas, acordos e
  atendimentos UAU, com origem e última sincronização visíveis.
- Arrastar um cartão não altera vencimento ou pagamento no ERP. Mudanças
  operacionais permitidas devem ser explícitas e auditadas; faixas financeiras
  calculadas não devem ser manipuladas livremente para contradizer o saldo.

Categorias UAU podem ser associadas às etapas e ações; não precisam definir a régua.
O workflow pode gerar outros atendimentos e pendências:
[Controle de Pendências — Globaltec](https://ajuda.globaltec.com.br/virtuau/controle-de-pendencias/).

## Histórico, indicadores e isolamento

Persistir posição atual, execuções de sincronização, eventos financeiros observados,
ciclos de cobrança, transições e ações realizadas. Usar chaves estáveis e deduplicação
para reprocessar lotes sem repetir eventos, tarefas e mensagens. A configuração é
por organização; regras da Castel não viram constantes para outros clientes.

Indicadores propostos: contratos/clientes com saldo vencido sem duplicação;
principal e valor atualizado vencido separados e datados; distribuição por atraso,
empresa/obra e equipe; recebimentos efetivos no período; regularizações confirmadas;
promessas abertas, vencidas e cumpridas; elegíveis para jurídico e efetivamente
encaminhados; pontualidade, reincidência e duração dos atrasos observados.

Não apresentar renegociação como receita recuperada ou pontuação preditiva de risco
sem modelo validado. Informar cobertura histórica e situação da sincronização.

## Entregas e confirmações pendentes

1. Validar SQL/retornos com atraso, pagamento integral, pagamento parcial,
   renegociação e estorno; conferir chaves e valores no UAU.
2. Implementar sincronização persistente e carteira em lista com reconciliação,
   isolamento por organização e indicadores conferidos com o ERP. Sem mensagens
   automáticas nesta primeira entrega.
3. Cadastrar políticas por empresa/obra e apresentar trilha e Kanban financeiro.
4. Acrescentar tarefas, responsáveis, promessas e visão de atendimento UAU validada.
5. Integrar ações à fila/campanhas, reconferindo saldo antes do envio e respeitando
   pausas. A carga inicial não dispara em cascata todas as etapas antigas.

Confirmar: SQL e código da consulta existente; cadastro chamado de ocorrência;
regras efetivas por empreendimento; frequência da sincronização; tratamento de
acordos/contestações e encaminhamento jurídico; histórico recuperável.
Exemplos deste documento não são regras aprovadas.
