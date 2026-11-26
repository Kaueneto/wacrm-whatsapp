# Extracoes candidatas da carteira

## Teste direto no SQL Server

Executar `diagnostico-carteira-sqlserver.sql` inteiro no SSMS conectado ao banco
UAU. E um unico arquivo com varios resultados, nao uma consulta geral pronta para API.
No inicio, configurar empresa, obra, periodo dos eventos e quantidade da amostra.
Os valores 900/00001 sao exemplos do empreendimento de teste ja citado pelo
responsavel; conferir antes de executar. NULL em empresa e obra abrange toda a base;
NULL so em obra abrange todas as obras da empresa informada.

O script le as tabelas do ERP e materializa resultados apenas em tabelas temporarias
da sessao. Devolve escopo efetivo, contagens por conjunto, contratos distintos,
resumo do valor base aberto/vencido, possiveis duplicidades, estados de aprovacao
dos distratos, amostras e duracao total. Nao altera dados persistentes nem cobra.
Pode consumir recursos/aguardar outras operacoes: comecar pelo escopo piloto.

Recebimentos e manutencoes usam o periodo configurado. Vendas, abertas e distratos
nao sao limitados por periodo. Valor base bruto nao e valor atualizado nem saldo
aprovado para cobranca: o resumo inclui registros pendentes de validar o contrato.
Leituras separadas nao garantem uma fotografia atomica. Registrar erros e nao
interpretar retorno incompleto como ausencia de divida/pagamento/distrato.

Sem execucao real nesta preparacao. As contagens medem registros; tamanho de
resposta API e desempenho de producao precisam de medicao posterior.

## Rascunhos para consultas cadastradas

Rascunhos de leitura preparados em 25/11/2026 com os campos encontrados nas
consultas 20, 21, 23, 29, 44 e 125 fornecidas pelo responsavel. Nao foram executados, homologados
ou cadastrados no UAU. Nao estao ligados a campanhas, rotas ou workers.

- `carteira-parcelas-abertas.sql`: posicao das parcelas em ContasReceber, incluindo
  vencidas, a vencer e prorrogadas, por empresa/obra.
- `carteira-recebimentos.sql`: linhas de Recebidas no periodo, preservando numero,
  tipo, identificadores da parcela e componentes monetarios sem agregacao.
- `carteira-manutencoes.sql`: eventos de VendaHist no periodo, com numero nativo
  do historico, data e tipo. Nao substitui a fonte do estado vigente do contrato.
- `carteira-vendas.sql`: fontes Vendas/VendasRecebidas, pessoa e data de cancelamento,
  sem esconder vendas por ausencia de parcelas. Preserva a origem das linhas.
- `carteira-distratos.sql`: datas, aprovacao e referencia do processo em VendaDistrato,
  sem filtro de periodo/aprovacao que retire bloqueios antigos.

Os parametros e o mapeamento de implantacao serao configurados pela organizacao,
sem regras fixas da Castel. Esses arquivos extraem fatos e evidencias do contrato;
a classificacao de estado vigente ainda nao foi homologada. A reconciliacao de
contratos/status e uma dependencia obrigatoria antes de cobranca automatica. Vendas distratadas
nao podem receber cobranca, mesmo quando importadas para consulta e historico.

Os marcadores `<...>` seguem a consulta geral UAU e precisam ser cadastrados como
parametros. Para teste autorizado no SQL Server, substituir por literais/variaveis
tipadas conforme a ferramenta. Nao concatenar entradas livres do navegador.
Confirmar o formato de EmpresaObra pela configuracao existente, sem adivinhar.

## Limites intencionais

1. O valor base de ContasReceber nao e um saldo atualizado com encargos. A consulta
   44/endpoints calculados continuam necessarios para comparar essa grandeza.
2. A chave da parcela combina empresa, obra, venda, tipo, numero e numero geral.
   Chave candidata do recebimento acrescenta NumeroRecebimento e TipoRecebimentoUAU;
   comprovar unicidade e estabilidade na base. NumReceb sozinho nao e chave global.
3. Recebidas precisa de classificacao antes de virar pagamento/recuperacao. Validar
   *_Conf, outros componentes, ParcType_Rec, renegociacao, estornos e banco 1001.
4. Data_Rec pode ser data de negocio, nao a data de ultima alteracao. Um filtro por
   periodo nao captura sozinho recebimentos retroativos nem mudancas em linhas
   antigas. A estrategia de reconsulta e reconciliacao ainda precisa ser definida.
5. Contratos, pessoas e unidades devem ser enriquecidos separadamente, preservando
   todas as unidades sem multiplicar fatos financeiros. Abertas e recebidas nao
   descobrem sozinhas contratos sem parcelas e seu estado de cancelamento.
6. Sao leituras separadas: podem ocorrer alteracoes entre elas. Registrar a
   execucao, validar completude e reconferir divergencias antes de mudar o ciclo.
7. Nao ha paginacao/incremental implementados. Validar volume, limites da resposta,
   particionamento e ausencia de truncamento antes de ampliar para toda a carteira.

## Conferencia no empreendimento piloto

- Comparar contagem de parcelas e totais da mesma grandeza com a tela UAU.
- Conferir unicidade da chave financeira e possiveis duplicidades de recebimento.
- Observar casos de parcial com saldo ainda aberto, pagamento integral,
  renegociacao, estorno, cancelamento e promessa com prorrogacao futura.
- Conferir valores brutos/corrigidos/confirmados sem somar conceitos diferentes.
- Testar o inicio inclusivo e o fim exclusivo do periodo, com horarios reais.
- Distinguir retorno vazio completo de consulta falha, truncada ou fora de escopo.
- Definir como capturar alteracoes retroativas e eliminacoes antes de automatizar.

Os SQLs 20 e 29 foram recebidos e analisados. Tipo 3 na consulta 20 e simulacao de
distrato; nao classificar automaticamente como venda efetivamente distratada.
O filtro da consulta 29 retorna apenas TipoMnt = 1, sem cobrir todos os tipos de
pendencia. Usar Num_vhist, e nao o ROW_NUMBER denominado codManut, como componente
da chave candidata. O numero e a unicidade precisam ser conferidos na base.

A consulta 29 confirma RecebePgtoDiv.Empresa_Rpd, faltante no join da consulta 23.
Ja a 29 omite NumReceb_Rpd no seu join, embora esse campo apareca na 23. Se houver
uso dessas divisoes, conferir todas as chaves incluindo empresa e recebimento;
nao somar valores ou contar parcelas apos joins potencialmente multiplicadores.

Pendentes: homologacao do estado atual/cancelamento/distrato efetivo e codigos;
semantica financeira dos recebimentos e finalidade do banco 1001. O historico
filtrado por periodo nao prova ausencia de cancelamento anterior ao periodo nem
reativacao. Validar carga inicial e revisao de eventos retroativos. DataMnt nao
e necessariamente um marcador de ultima alteracao tecnica.

## Conferencia de vendas e distratos (consulta 125)

A consulta 125 confirmou as colunas DataCancel_Ven/DataCancel_VRec e
VendaDistrato.StatusAprov_vdd, DataCad_vdd e DataAprov_vdd. O CASE fornecido rotula
0 como nao aprovado e 1 como aprovado; confirmar com registros reais na instalacao.

- Conferir formatos de ausencia de cancelamento: NULL, eventual data sentinela e
  conflitos entre fontes. Nao considerar qualquer data nao nula como cancelamento
  sem essa verificacao. Nao concluir que ausencia de registro significa venda ativa
  se a extracao estiver incompleta ou o escopo for diferente.
- Venda com cancelamento vigente confirmado fica bloqueada. Distrato aprovado
  sem cancelamento compativel e caso de bloqueio preventivo/reconciliacao, nao uma
  venda automaticamente liberada. Nao aprovado/simulacao nao equivale a efetivado;
  definir tratamento da pendencia antes de permitir contatos automaticos.
- Se a mesma venda ocorrer em ambas as fontes, preservar e comparar as evidencias;
  nao escolher silenciosamente uma origem nem duplicar o contrato/saldo.
- Confirmar multiplicidade e identidade de registros VendaDistrato. Datas ou
  ROW_NUMBER nao devem ser inventados como identificador global permanente.
- Conferir ao menos venda ativa sem distrato, simulacao/pendencia, distrato
  aprovado/cancelado e possivel reativacao ou conflito, incluindo saldo residual.
- Publicar a classificacao somente apos reconciliar lotes compativeis e completos.
  A exclusao de envios deve ser reavaliada antes do disparo, inclusive para a fila.

Esses rascunhos permitem iniciar a homologacao sem outro relatorio completo.
Precisam ser cadastrados em novos codigos de consulta para consumo pela API.
