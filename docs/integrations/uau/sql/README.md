# Extracoes candidatas da carteira

Rascunhos de leitura preparados em 25/11/2026 com os campos encontrados nas
consultas 21, 23 e 44 fornecidas pelo responsavel. Nao foram executados, homologados
ou cadastrados no UAU. Nao estao ligados a campanhas, rotas ou workers.

- `carteira-parcelas-abertas.sql`: posicao das parcelas em ContasReceber, incluindo
  vencidas, a vencer e prorrogadas, por empresa/obra.
- `carteira-recebimentos.sql`: linhas de Recebidas no periodo, preservando numero,
  tipo, identificadores da parcela e componentes monetarios sem agregacao.

Os parametros e o mapeamento de implantacao serao configurados pela organizacao,
sem regras fixas da Castel. Esses arquivos extraem fatos financeiros; nao retornam
um estado vigente e homologado do contrato. A coleta de contratos/status e uma
dependencia obrigatoria antes de qualquer cobranca automatica. Vendas distratadas
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
6. Sao duas leituras separadas: podem ocorrer alteracoes entre elas. Registrar a
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

Proximos SQLs de referencia: 20 (manutencoes) e 29 (renegociacoes). A finalidade
do banco 1001, excluido pela consulta 23, tambem precisa ser confirmada pela equipe.
