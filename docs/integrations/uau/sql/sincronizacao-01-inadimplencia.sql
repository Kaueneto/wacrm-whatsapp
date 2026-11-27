-- CARTEIRA OCTA v1 - leitura para homologacao no UAU. Nao altera dados nem envia mensagens.
-- SQL Server 2016+ para FOR JSON PATH; lista de contratos recebida em XML.
-- Uma linha por contrato. Colecoes JSON evitam multiplicar valores por unidade/recebimento.
-- Valores base e componentes confirmados sao separados. Nao somar totais repetidos.
-- Parametros: EmpresaObra, MinimoDiasAtraso, Pagina (inicia em 1), TamanhoPagina.
-- Inclui evidencias de bloqueio: distratados/cancelados NAO sao liberados para cobranca.
;WITH Configuracao AS (
    SELECT CAST(GETDATE() AS date) AS DataReferencia, GETDATE() AS DataHoraConsulta,
        CAST(<MinimoDiasAtraso> AS int) AS MinimoDiasAtraso
), Escopo AS (
    SELECT DISTINCT Empresa, Obra FROM fn_ListEmpObr(<EmpresaObra>, ',')
), Alvos AS (
    SELECT C.Empresa_prc AS CodEmpresa, C.Obra_prc AS CodObra, C.NumVend_prc AS Venda
    FROM ContasReceber AS C
    CROSS JOIN Configuracao AS CFG
    WHERE EXISTS (SELECT 1 FROM Escopo AS E WHERE E.Empresa = C.Empresa_prc AND E.Obra = C.Obra_prc)
      AND C.Valor_prc > 0
      AND C.Data_prc < DATEADD(DAY, 1 - CFG.MinimoDiasAtraso, CAST(CFG.DataReferencia AS datetime))
      AND CFG.MinimoDiasAtraso >= 1
    GROUP BY C.Empresa_prc, C.Obra_prc, C.NumVend_prc
    ORDER BY C.Empresa_prc, C.Obra_prc, C.NumVend_prc
    OFFSET ((CAST(<Pagina> AS int) - 1) * CAST(<TamanhoPagina> AS int)) ROWS
    FETCH NEXT CAST(<TamanhoPagina> AS int) ROWS ONLY
)

SELECT
    1 AS VersaoContratoDados,
    'INADIMPLENCIA' AS TipoRegistro,
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
       AND C.Valor_prc > 0 AND C.Data_prc < DATEADD(DAY, 1 - CFG.MinimoDiasAtraso, CAST(CFG.DataReferencia AS datetime))
     ORDER BY C.Data_prc, C.Tipo_prc, C.NumParc_prc, C.NumParcGer_prc
     FOR JSON PATH, INCLUDE_NULL_VALUES), N'[]') AS ParcelasAbertasJson,
    CAST('[]' AS nvarchar(max)) AS RecebimentosJson,
    COALESCE((SELECT D.StatusAprov_vdd AS StatusAprovacaoDistratoUAU,
        D.DataCad_vdd AS DataCadastroDistratoUAU, D.DataAprov_vdd AS DataAprovacaoDistratoUAU
     FROM VendaDistrato AS D
     WHERE D.Empresa_vdd = A.CodEmpresa AND D.Obra_vdd = A.CodObra AND D.NumVend_vdd = A.Venda
     FOR JSON PATH, INCLUDE_NULL_VALUES), N'[]') AS DistratosJson,
    CAST('[]' AS nvarchar(max)) AS ManutencoesJson,
    'SOMENTE_VENCIDAS' AS EscopoParcelas,
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
