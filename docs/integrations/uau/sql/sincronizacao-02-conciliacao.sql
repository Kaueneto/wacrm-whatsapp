-- CARTEIRA OCTA v1 - leitura para homologacao no UAU. Nao altera dados nem envia mensagens.
-- SQL Server 2016+ para FOR JSON PATH; lista de contratos recebida em XML.
-- Uma linha por contrato. Colecoes JSON evitam multiplicar valores por unidade/recebimento.
-- Valores base e componentes confirmados sao separados. Nao somar totais repetidos.
-- Parametros: EmpresaObra e ContratosXml (lista dos contratos acompanhados).
-- Retorna uma linha mesmo que a venda nao esteja mais nas fontes atuais.
-- Sem corte por data: inclui saldos futuros e permite detectar recebimentos removidos por estorno.
;WITH Configuracao AS (
    SELECT CAST(GETDATE() AS date) AS DataReferencia, GETDATE() AS DataHoraConsulta
), Escopo AS (
    SELECT DISTINCT Empresa, Obra FROM fn_ListEmpObr(<EmpresaObra>, ',')
), ListaContratos AS (
    SELECT CAST(<ContratosXml> AS xml) AS Lista
), Solicitados AS (
    SELECT DISTINCT
        N.Contrato.value('(@empresa)[1]', 'int') AS CodEmpresa,
        N.Contrato.value('(@obra)[1]', 'varchar(50)') AS CodObra,
        N.Contrato.value('(@venda)[1]', 'int') AS Venda
    FROM ListaContratos AS L
    CROSS APPLY L.Lista.nodes('/contratos/contrato') AS N(Contrato)
), Alvos AS (
    SELECT S.CodEmpresa, S.CodObra, S.Venda FROM Solicitados AS S
    WHERE EXISTS (SELECT 1 FROM Escopo AS E WHERE E.Empresa = S.CodEmpresa AND E.Obra = S.CodObra)
)

SELECT
    1 AS VersaoContratoDados,
    'CONCILIACAO' AS TipoRegistro,
    A.CodEmpresa, E.Desc_emp AS NomeEmpresa,
    A.CodObra, O.Descr_obr AS NomeObra, A.Venda,
    CAST(A.CodEmpresa AS varchar(20)) + '_' + A.CodObra + '_' + CAST(A.Venda AS varchar(20)) AS ChaveContrato,
    CASE WHEN V.QuantidadeFontesVenda > 0 THEN 1 ELSE 0 END AS ContratoLocalizado,
    V.QuantidadeFontesVenda, V.QuantidadeClientesNasFontes,
    V.CodCliente, P.Nome_pes AS NomeCliente, V.DataCancelamentoEncontrada,
    COALESCE((SELECT I.Produto AS CodProduto, I.Personalizacao AS NumPersonalizacao,
        PS.Descricao_psc AS DescricaoProduto, U.Identificador_unid AS Unidade
     FROM (
         SELECT IV.Produto_Itv AS Produto, IV.CodPerson_Itv AS Personalizacao
         FROM ItensVenda AS IV
         WHERE IV.Empresa_Itv = A.CodEmpresa AND IV.Obra_Itv = A.CodObra AND IV.NumVend_Itv = A.Venda
         UNION
         SELECT IR.Produto_Itr, IR.CodPerson_Itr FROM ItensRecebidas AS IR
         WHERE IR.Empresa_Itr = A.CodEmpresa AND IR.Obra_Itr = A.CodObra AND IR.NumVend_Itr = A.Venda
     ) AS I
     LEFT JOIN PrdSrv AS PS ON PS.NumProd_psc = I.Produto
     LEFT JOIN UnidadePer AS U ON U.Empresa_unid = A.CodEmpresa AND U.Obra_unid = A.CodObra
         AND U.Prod_unid = I.Produto AND U.NumPer_unid = I.Personalizacao
     FOR JSON PATH, INCLUDE_NULL_VALUES), N'[]') AS UnidadesJson,
    COALESCE((SELECT C.Tipo_prc AS TipoParcela, PAR.Descricao_par AS DescricaoTipoParcela,
        C.NumParc_prc AS NumeroParcela, C.NumParcGer_prc AS NumeroGeralParcela,
        C.Status_prc AS StatusParcelaUAU, C.Origem_prc AS OrigemParcelaUAU,
        C.Data_prc AS VencimentoOriginal, C.DataPror_prc AS Prorrogacao,
        C.Valor_prc AS ValorBaseAbertoUAU
     FROM ContasReceber AS C
     LEFT JOIN Parcelas AS PAR ON PAR.Tipo_par = C.Tipo_prc
     WHERE C.Empresa_prc = A.CodEmpresa AND C.Obra_prc = A.CodObra AND C.NumVend_prc = A.Venda
       
     ORDER BY C.Data_prc, C.Tipo_prc, C.NumParc_prc, C.NumParcGer_prc
     FOR JSON PATH, INCLUDE_NULL_VALUES), N'[]') AS ParcelasAbertasJson,
    COALESCE((SELECT R.Tipo_Rec AS TipoParcela, R.NumParc_Rec AS NumeroParcela, R.NumParcGer_Rec AS NumeroGeralParcela,
        R.NumReceb_Rec AS NumeroRecebimento, R.ParcType_Rec AS TipoRecebimentoUAU, R.Status_Rec AS StatusRecebimentoUAU,
        R.DataVenci_Rec AS VencimentoOriginal, R.Data_Rec AS DataRecebimentoUAU,
        R.OrigParc_Rec AS OrigemParcelaUAU,
        R.Valor_Rec, R.ValorConf_Rec, R.VlMulta_Rec, R.VlMultaConf_Rec, R.VlJuros_Rec, R.VlJurosConf_Rec,
        R.VlCorrecao_Rec, R.VlCorrecaoConf_Rec, R.VlCorrecaoAtr_Rec, R.VlCorrecaoAtrConf_Rec,
        R.VlJurosParc_Rec, R.VlJurosParcConf_Rec, R.VlAcres_Rec, R.VlAcresConf_Rec,
        R.VlTaxaBol_Rec, R.VlTaxaBolConf_Rec, R.VlDesconto_Rec, R.VlDescontoConf_Rec,
        R.ValDescontoCusta_rec, R.ValDescontoCustaConf_rec,
        R.ValDescontoImposto_rec, R.ValDescontoImpostoConf_rec,
        R.ValDescontoCondicional_rec, R.ValDescontoCondicionalConf_rec
     FROM Recebidas AS R
     WHERE R.Empresa_rec = A.CodEmpresa AND R.Obra_Rec = A.CodObra AND R.NumVend_Rec = A.Venda
     ORDER BY R.NumReceb_Rec, R.Tipo_Rec, R.NumParc_Rec, R.NumParcGer_Rec, R.ParcType_Rec
     FOR JSON PATH, INCLUDE_NULL_VALUES), N'[]') AS RecebimentosJson,
    COALESCE((SELECT D.StatusAprov_vdd AS StatusAprovacaoDistratoUAU,
        D.DataCad_vdd AS DataCadastroDistratoUAU, D.DataAprov_vdd AS DataAprovacaoDistratoUAU
     FROM VendaDistrato AS D
     WHERE D.Empresa_vdd = A.CodEmpresa AND D.Obra_vdd = A.CodObra AND D.NumVend_vdd = A.Venda
     FOR JSON PATH, INCLUDE_NULL_VALUES), N'[]') AS DistratosJson,
    COALESCE((SELECT H.Num_vhist AS NumeroHistorico, H.DataMnt_vhist AS DataManutencaoUAU,
        H.TipoMnt_vhist AS TipoManutencaoUAU
     FROM VendaHist AS H
     WHERE H.Empresa_vhist = A.CodEmpresa AND H.Obra_vhist = A.CodObra AND H.NumVend_vhist = A.Venda
     ORDER BY H.Num_vhist
     FOR JSON PATH, INCLUDE_NULL_VALUES), N'[]') AS ManutencoesJson,
    'TODAS_ABERTAS' AS EscopoParcelas,
    CAST(0 AS bit) AS EnvioAutomaticoAutorizado,
    CFG.DataReferencia AS DataReferenciaAtraso,
    CFG.DataHoraConsulta AS DataHoraConsultaServidorUAU
FROM Alvos AS A
CROSS JOIN Configuracao AS CFG
LEFT JOIN Empresas AS E ON E.Codigo_emp = A.CodEmpresa
LEFT JOIN Obras AS O ON O.Empresa_obr = A.CodEmpresa AND O.Cod_obr = A.CodObra
OUTER APPLY (
    SELECT COUNT_BIG(*) AS QuantidadeFontesVenda, COUNT(DISTINCT F.CodCliente) AS QuantidadeClientesNasFontes,
        CASE WHEN COUNT(DISTINCT F.CodCliente) = 1 AND COUNT_BIG(F.CodCliente) = COUNT_BIG(*) THEN MAX(F.CodCliente) END AS CodCliente,
        MAX(F.DataCancelamento) AS DataCancelamentoEncontrada
    FROM (
        SELECT V.Cliente_Ven AS CodCliente, V.DataCancel_Ven AS DataCancelamento
        FROM Vendas AS V
        WHERE V.Empresa_Ven = A.CodEmpresa AND V.Obra_Ven = A.CodObra AND V.Num_Ven = A.Venda
        UNION ALL
        SELECT V.Cliente_VRec, V.DataCancel_VRec FROM VendasRecebidas AS V
        WHERE V.Empresa_VRec = A.CodEmpresa AND V.Obra_VRec = A.CodObra AND V.Num_VRec = A.Venda
    ) AS F
) AS V
LEFT JOIN Pessoas AS P ON P.Cod_pes = V.CodCliente
ORDER BY A.CodEmpresa, A.CodObra, A.Venda;
