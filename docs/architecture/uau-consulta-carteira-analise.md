# Análise da consulta de inadimplência por venda

Consulta fornecida pelo responsável em 25/11/2026, intitulada **Inadimplência por
Empresa e Obra (Inadimplência da Venda)**. Análise estática do SQL anexado; não foi
executado no ERP e não há amostra de retorno validada nesta etapa.

O catálogo fornecido posteriormente identifica essa consulta como **código 44**,
origem **1 — Personalizado**, status ativo. Esses dados permitem selecionar a
consulta existente na integração; os parâmetros e a execução ainda precisam de validação.

## Conclusão

Boa base para descobrir contratos inadimplentes e carregar parcelas vencidas.
Não é uma carteira completa de contratos nem uma extração de pagamentos por parcela.
Deve compor a sincronização com reconciliação financeira e controle de completude.

## Mapeamento encontrado

| Saída SQL | Origem/uso proposto |
| --- | --- |
| CodEmpresa, NomeEmpresa | Empresa UAU e descrição |
| CodObra, NomeObra | Obra UAU e descrição; código como texto |
| Venda, DataVenda, Chave | Contrato e data; chave empresa/obra/venda |
| Cliente, NomeCliente, CpfCnpj | Pessoa associada à venda para emissão de boleto |
| ChaveParcela | Empresa/obra/venda/tipo/número/número geral |
| NumParc, NumParcGer, TipoParc | Identificadores separados da parcela |
| Vencimento, Prorrogacao | Data_Prc e DataPror_Prc, preservadas separadamente |
| DiasAtraso, TipoFiltroData | Atraso dependente do parâmetro escolhido |
| ValorParcela, Multa, JurosAtr, CorrecaoAtr, Outros | Componentes do cálculo ERP |
| ValorTotal, DataCalculo | ValParcela_Crc e DataCalc_Crc; valor calculado e referência |
| ValorParcelaRecebe | Soma de recebimentos agrupados por venda, sem recorte de período |
| Total_Ven | Total da venda, repetido em cada linha da parcela/pessoa |
| CodProduto, Person, Identificador | Produto, personalização e unidade quando há um item |
| StatusCobranca_Ven | Status de cobrança da venda, não categoria do atendimento |
| Distrato | Indicação derivada da existência em VendaDistrato; validar significado operacional |

As chaves devem ser isoladas por organização e origem UAU estável. CPF, telefone
ou nome não substituem as chaves financeiras. Manter os campos individuais, além
das chaves textuais, para auditoria e conferência com endpoints existentes.

## Parâmetros e classificação

`TipoFiltroData = 1` usa vencimento original, conforme regra acordada para o CRM.
`TipoFiltroData = 0` usa prorrogação e pode retirar do conjunto uma dívida antiga
quando a prorrogação é hoje ou futura, mesmo que o original esteja vencido.

`FiltroTipo = 0` seleciona vendas pela quantidade de dias de atraso;
`FiltroTipo = 1` seleciona pela quantidade de parcelas vencidas. Não confundir
esse último com faixas de dias para o Kanban.

`AtrasoInicio`/`AtrasoTermino` continuam selecionando vendas no HAVING, mesmo com
`SomentePeriodo = 0`. Esse último controla um filtro adicional das parcelas no
WHERE final; não desliga o filtro de elegibilidade da venda. Para descobrir a
carteira não limitar a extração somente a uma faixa da régua.

`ConsideraCusta` afeta quais tipos contam para selecionar a venda e calcular seu
atraso; `VisualizarCusta` afeta a exibição das parcelas. Definir ambos e manter a
regra de envelhecimento consistente com os tipos participantes, mesmo que outras
custas sejam exibidas na tela.

Os demais filtros incluem EmpresaObra, Venda, StatusCobranca, RestringirStatus,
BuscarDistrato e Ocorrencia. Qualquer exclusão pode retirar um contrato sem
pagamento: ausência não autoriza classificá-lo como regularizado.

O cálculo de DiasAtraso usa GETDATE() no servidor SQL. Validar o fuso e preferir
uma referência de execução explícita/coerente para os lotes. Não misturar datas
de referência diferentes dentro da mesma fotografia da carteira.

## Limitações para o acompanhamento automático

1. A origem filtra ContasReceber com atraso maior que zero e seleciona apenas
   vendas inadimplentes. Não retorna a carteira adimplente nem parcelas futuras;
   desaparecimento não identifica pagamento, cancelamento ou renegociação.
2. TotalRecebido agrupa Recebidas por venda. Não expõe identificador de recebimento,
   parcela baixada, data do pagamento ou período. Não determina cumprimento de
   promessa nem recuperação mensal. Os componentes com sufixo Conf também exigem
   conferir sua semântica antes de tratar a soma como recebimento confirmado.
3. ValorParcelaRecebe e Total_Ven repetem por parcela e pessoa. Não somar essas
   colunas linha a linha para obter totais da carteira.
4. VendaClientes é filtrada por EmiteBoleto_CVen = 1, podendo incluir vários
   recebedores por venda. TipoCliente é um texto fixo '0 - Titular'; não prova
   titularidade. FiltroParc indica se Cliente_CVen coincide com Cliente_Ven.
   Separar obrigações financeiras de participantes/destinatários para não duplicar
   saldo nem escolher automaticamente o telefone errado.
5. O INNER JOIN ContasReceberCalc exige cálculo existente; não há filtro explícito
   garantindo DataCalc_Crc atual. Conferir atualização, unicidade e cobertura dessa
   tabela ao executar por API. Parcela sem cálculo pode desaparecer, e várias
   referências de cálculo podem produzir mais de uma linha da mesma obrigação.
   DataCalculo deve ser validada antes de apresentar valores como atuais.
6. O SQL contém joins de ocorrências, mas não projeta seus identificadores ou
   descrições. Com várias ocorrências vinculadas, NOT LIKE aplicado por linha não
   comprova a ausência da ocorrência em todo o contrato. Conferir os filtros por
   ocorrência/status antes de reaproveitá-los como regra operacional.
7. A extração mostra produto/personalização somente quando Qtde_Itv = 1. Nos demais
   casos retorna VÁRIOS. Não converter esse marcador em número nem inferir uma
   unidade. Para vários itens, consultar uma relação separada de unidades da venda.

## Produto e personalização

O próprio SQL evidencia a relação:

- CodProduto vem de Produto_Itv, ligado a UnidadePer.Prod_Unid.
- Person vem de CodPerson_Itv, ligado a UnidadePer.NumPer_Unid.

Isso fornece uma fonte candidata para os campos produnid_atd e numper_atd discutidos
no lançamento de atendimento. Validar os valores e o vínculo da unidade na versão
da API antes de preencher esses campos. Não deduzir IDs a partir de quadra/lote.

## Próximo passo

1. Usar o código 44, personalizado, e confirmar parâmetros efetivos da execução.
2. Validar retorno em empresa/obra piloto, incluindo possível multiplicidade de
   pessoas, parcelas, ocorrências, itens e datas de cálculo.
3. Usar esta extração como descoberta de inadimplentes, com escopo sem cortes
   acidentais de faixa. Adaptar uma cópia específica de sincronização se necessário,
   preservando o relatório existente.
4. Complementar com abertas, recebidas por parcela e estados/manutenções para os
   contratos acompanhados. Os endpoints por venda já integrados podem conferir
   casos; avaliar extração em lote para o volume da carteira.
5. Persistir eventos e ciclos sem apagar os contratos que saem da lista; conciliar
   pagamentos parciais/integrais, renegociação e estorno antes de automatizar ações.

Nenhuma SQL alterada foi cadastrada ou executada no UAU nesta análise.

## Consultas complementares identificadas no catálogo

O catálogo contém descrições e trechos truncados de SQL; estes não substituem a
avaliação dos SQLs completos nem comprovam a cobertura das consultas.

| Código | Descrição | Motivo da avaliação |
| --- | --- | --- |
| 21 | BUSCA PARCELAS RECEBIDAS E A RECEBER | Primeira prioridade: ligação entre obrigação aberta, parcela e recebimento |
| 23 | CONTAS RECEBIDAS POR PERIODO | Primeira prioridade: datas, valores e chaves para reconciliação e gráficos |
| 20 | BUSCA INFORMAÇÕES DE QUANDO HOUVE A MANUTENÇÃO | Distinguir manutenção, cancelamento e transformação da dívida |
| 29 | Busca as vendas renegociadas | Conferir histórico e vínculos após renegociação |
| 56 | Gerenciamento de atendimento | Mapear atendimentos, responsáveis e categorias para a visão operacional |
| 99 | Execução do PROUAU | O trecho projeta datas de ContasReceberCalc; avaliar referência do cálculo sem tomar isso como prova de completude |
| 125 | Dados completos da venda e do distrato | Complementar encerramentos, devoluções e distratos |
| 63 | Inadimplência por Parcela com filtro por ocorrência | Comparar granularidade e filtro com a consulta 44, se necessário |

A consulta 73, intitulada carteira a receber a partir do mês atual, pode auxiliar
em previsões; o recorte sugerido pelo título não deve ser presumido como cobertura
de todas as parcelas antigas vencidas. As consultas de recebidas específicas de
empresas/empreendimentos não devem virar uma fonte geral sem revisão de filtros.

## Consulta própria e validação proposta

O responsável concorda em preparar uma SQL específica da plataforma e comparar o
retorno com o esperado. A primeira análise será dos SQLs completos 21 e 23;
20/29 complementam os casos de renegociação e alteração da venda.

Preparar consultas de leitura com escopo explícito por empresa/obra e data de
referência. Validar primeiro uma amostra controlada: dívida aberta, recebimento
integral/parcial, promessa, renegociação, estorno e distrato. Conferir unicidade das
chaves, total por contrato, referências de cálculo e recebimentos sem duplicação.

Manter contratos, parcelas e eventos de recebimento em granularidades distintas;
não forçar todos os dados em um join que multiplique valores. Uma extração única
só será adotada se preservar essa granularidade e permitir reconciliação confiável.

A integração atual executa consultas gerais cadastradas pelo identificador e seus
parâmetros; ela não é um console de SQL arbitrário. Uma SQL nova precisa ser testada
na ferramenta autorizada do UAU/SQL Server e cadastrada com novo código antes de
ser consumida pela API. Preservar a consulta 44 e as demais integrações existentes.

Atualização: recebidos os SQLs completos 21 e 23. Foram preparados
[rascunhos de extração para homologação](../integrations/uau/sql/README.md), sem
cadastro ou execução no ERP. Os pontos abaixo registram a análise desses modelos.

## Consultas 21 e 23 — SQLs completos recebidos

A consulta 21 confirma o uso de ContasReceber e Recebidas e seus identificadores
de empresa, obra, venda, número/tipo/número geral da parcela. Entretanto:

- É filtrada por NumVenda, não uma extração coletiva pronta.
- A coluna Valor representa Valor_prc em abertas, mas uma composição de principal,
  encargos e descontos nas recebidas. Não agregar como a mesma grandeza.
- O UNION elimina linhas iguais nos campos projetados. Como NumReceb_Rec não é
  retornado, recebimentos distintos com os mesmos demais campos podem se fundir.
- TotalParcelas é uma contagem derivada de uma projeção que omite NumParcGer;
  não usar como chave nem assumir que represente todas as obrigações distintas.
- Não retorna prorrogação das abertas nem discrimina todos os componentes recebidos.

A consulta 23 revela NumReceb_Rec e ParcType_Rec como componentes candidatos da
identidade do recebimento. O modelo confirma a necessidade de chave composta e
de registro por evento. Exige revisão antes de virar fonte geral:

- Usa apenas componentes monetários com sufixo Conf na expressão Valor, diferente
  da consulta 21. A semântica financeira desses campos ainda deve ser validada.
- ItensRecebidas é ligada pela venda, não por uma alocação monetária do recebimento
  a cada unidade; vendas com vários itens podem multiplicar a mesma linha financeira.
- RecebePgtoDiv não inclui empresa no ON apresentado. Verificar o escopo e a
  unicidade dessas chaves na instalação. O SQL 29 recebido depois confirma
  RecebePgtoDiv.Empresa_Rpd. Pagamentos/divisões também podem introduzir multiplicidade.
- Há INNER JOIN de pagamento, depósito, itens e unidade: recebimentos sem esses
  vínculos desaparecem. A ligação de UnidadePer também precisa conferir obra.
- Exclui Depositos.Banco_Dep = 1001. Confirmar o significado desse banco; não
  transformar a exclusão desse relatório em regra geral fixa da plataforma.
- qtdParcelas é ROW_NUMBER sobre o resultado, não uma quantidade por parcela
  nem identificador estável. Não resolve duplicidades introduzidas pelos joins.
- BETWEEN sobre Data_Rec exige conferir horários do limite final. Os rascunhos
  usam início inclusivo e fim exclusivo para explicitar essa fronteira.

Os rascunhos separam abertas e recebidas, preservam componentes e não usam joins
de unidades/depósitos para definir os fatos financeiros. Isso ainda não comprova
pagamento efetivo, integridade do snapshot ou estado ativo da venda. Faltam a
validação real, semântica dos tipos, cobertura de alterações retroativas e dados
de manutenção/renegociação/estado vigente, incluindo bloqueio de distratadas.

## Consultas 20 e 29 — SQLs completos recebidos

### Consulta 20

Consulta VendaHist por empresa/obra, venda e tipos de manutenção. A coluna
TipoMnt_VHist classifica ações históricas; não é automaticamente o status atual.
O CASE fornecido termina em 9 e não tem ELSE: tipos posteriores/desconhecidos não
devem ser descartados nem considerados seguros para cobrança por falta de rótulo.

- 0: cancelar venda; validar o efeito vigente e eventuais eventos posteriores.
- 1: renegociar contrato.
- 2: cessão de direito; não assumir que o mesmo comprador continua responsável.
- 3: simulação de distrato, diferente de distrato efetivado.
- 7/8/9: pendências de renegociação/cessão, não equivalem a eventos concluídos.

QtdeParcelasPagas conta linhas de Recebidas apenas para tipos 2/8, sem recorte pela
data da manutenção, contagem distinta da obrigação ou comprovação de classificação
financeira. Não é uma medida geral de parcelas quitadas no momento do evento.

### Consulta 29

O SQL revela VendaHist.Num_vhist e DataMnt_vhist e a relação de ContasReceberHist
com o evento por NumVhist_prc = Num_vhist, além de empresa/obra/venda. Isso permite
investigar snapshots de parcelas em uma manutenção. A extração deve conservar esse
identificador nativo e validar sua unicidade/estabilidade.

O relatório exige ajustes para ser usado como fonte de sincronização:

- codManut é ROW_NUMBER gerado sobre linhas enriquecidas; não é ID persistente.
- Filtra TipoMnt = 1, portanto não cobre sozinho as pendências e outros eventos
  necessários para interromper/reavaliar a cobrança.
- Faz joins de itens/unidades/pessoa atuais ou recebidos; pode multiplicar eventos
  ou omitir histórico cujo contrato não apareça nessas origens. Enriquecer separado.
- Confirma Empresa_Rpd no join de RecebePgtoDiv, mas omite NumReceb_Rpd, conhecido
  pela consulta 23. Sem a identidade completa do recebimento/divisão, pode associar
  várias linhas da mesma parcela e repetir valores.
- SUM(PercentValor_Rpd) precisa de validação do significado/unidade desse campo.
  COUNT(*) após divisões não equivale necessariamente ao número de parcelas.
- vlrTotRecebido consulta recebimentos cuja Data_Rec é anterior/igual à manutenção;
  não é o valor recuperado por essa renegociação. vlrTotReceber usa snapshot
  histórico e não pode ser apresentado como saldo aberto de hoje.
- A ligação de UnidadePer precisa considerar também a obra, além dos demais IDs.
- BETWEEN precisa de limites com horário conferidos; os rascunhos usam fim exclusivo.

Preparado `carteira-manutencoes.sql`, sem joins multiplicadores e com campos
explícitos. O evento é identificado pelo conjunto candidato empresa/obra/venda/
número do histórico; inclui tipos desconhecidos para revisão. Ainda falta homologar
o retorno e confirmar a fonte de **estado vigente** do contrato/distrato efetivo.
Nenhuma dessas consultas autoriza cobrança só porque uma parcela ainda está aberta.

## Teste de baixa relatado em 26/11/2026

O responsável executou a baixa da parcela empresa 900/obra 00001/venda 1/tipo E/
número 1/número geral 1. Depois, a consulta detalhada de vencidas retornou vazia.
O registro fornecido de Recebidas possui os mesmos identificadores e vencimento
18/11/2026, NumReceb_Rec = 6 e Data_Rec = 26/11/2026.

Valores fornecidos: Valor_Rec = 0, ValorConf_Rec = 660, VlMultaConf_Rec = 13,20,
VlJurosConf_Rec = 1,74. Esses componentes somam 674,94 e coincidem com o cálculo
anterior apresentado. Logo, ler somente Valor_Rec perderia o principal deste caso.
Status_Rec = 1 e ParcType_Rec = E são campos de Recebidas com domínio próprio;
não aplicar a legenda de Status_Prc a eles. A descrição nativa de ContasReceber
foi fornecida pelo responsável: Status_Prc 0 = Normal, 1 = Recebimento.

O resultado é compatível com a baixa relatada e comprova a necessidade de guardar
a trilha fora da consulta de inadimplentes. Ainda conferir ausência de saldo residual
da mesma chave e saldo vencido total do contrato; consulta vazia não prova, sozinha,
quitação nem que todos os eventos financeiros já foram reconciliados. Se a única
parcela vencida foi integralmente recebida e restam futuras, regularizar o ciclo
sem classificar o contrato inteiro como quitado. Esses resultados não homologam
pagamento parcial, renegociação, estorno ou exclusão de distratos.

Preparado `teste-baixa-parcela-900-00001.sql`: aberta por chave, recebimentos sem
agregação, resumo do contrato e metadados dos domínios de Recebidas. Nenhuma nova
baixa ou execução no banco UAU foi realizada pelo assistente.

## Consulta 125 — evidências de distrato e cancelamento

SQL completo recebido em 25/11/2026. Traz os campos que permitem preparar a
reconciliação com a situação da venda:

| Campo | Origem confirmada pelo SQL |
| --- | --- |
| DataCadastroDistrato | VendaDistrato.DataCad_vdd |
| DataAprovacaoDistrato | VendaDistrato.DataAprov_vdd |
| StatusDistrato | StatusAprov_vdd; CASE fornecido: 0 não aprovado, 1 aprovado |
| DataCancelamento | Vendas.DataCancel_Ven ou VendasRecebidas.DataCancel_VRec |
| Empresa/obra/venda | Identidade do contrato do distrato |
| Processo do distrato | EmpresaProc_vdd, ObraProc_vdd, NumProc_vdd |

Esses campos são evidências diferentes: existência de registro, aprovação do
distrato e cancelamento não devem ser tratados como equivalentes sem homologação.
Também não equivalem à simulação do histórico TipoMnt = 3 da consulta 20.

A consulta é um relatório detalhado por venda, não a fonte mínima para bloqueio:

- Parte de VendaDistrato, portanto não comprova situação dos contratos sem registro.
- Filtra uma venda. Para coleta, escopo por empresa/obra e identificação completa,
  incluindo distratos antigos, sem exigir que a data esteja no período do painel.
- O INNER JOIN às fontes de venda pode esconder distratos sem correspondência atual.
  A extração mínima deve preservar VendaDistrato sem esse join obrigatório.
- UNION ALL de Vendas/VendasRecebidas, itens, documentos e dependentes pode multiplicar
  a venda e repetir valores agregados. Não somar os totais desse relatório por linha.
- A consulta reconhece que o filtro de dependente para cônjuge ainda não está definido.
  Esses dados pessoais não são necessários para decidir elegibilidade da cobrança.
- StatusUnidade se refere à unidade, que pode ter outro histórico de negociação;
  não substitui o estado do contrato original nem sua data de cancelamento.
- ReceitaDistrato e DiferencaDistrato são fórmulas do relatório; não adotar como
  receita recuperada ou resultado financeiro sem definir sua semântica com a equipe.

Preparados `carteira-vendas.sql` e `carteira-distratos.sql` com campos explícitos,
sem joins de unidade/pessoa e sem exclusões fixas por aprovação. Não normalizam
automaticamente datas sentinela, conflitos, reativações ou tipos desconhecidos.

A próxima etapa passa a ser homologação dos rascunhos em casos reais, sem precisar
pedir outro relatório completo: conferir venda ativa, simulação/pendência e distrato
aprovado/cancelado, além de pagamento parcial, integral e renegociação. Ainda não há
retornos validados, novas consultas cadastradas ou execução desses SQLs no ERP.
