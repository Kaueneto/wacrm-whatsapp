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

Nenhuma nova SQL foi preparada com campos presumidos, executada ou cadastrada nesta
etapa; falta receber os modelos completos das consultas complementares.
