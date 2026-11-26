-- DIAGNOSTICO NO SQL SERVER DO UAU: executar este arquivo inteiro no SSMS.
-- Nao e uma consulta geral pronta para cadastrar na API.
-- Le apenas tabelas do ERP; grava resultados somente em tabelas temporarias da sessao.
-- Nao altera vendas, baixas, boletos ou regras, nem envia mensagens.
-- Homologacao pendente. Os conjuntos NAO sao necessariamente uma fotografia atomica.
-- Sem NOLOCK: nao ler dados nao confirmados. Uma leitura pode aguardar operacoes do ERP.
-- Comece pelo empreendimento piloto e confira o plano/tempo antes de ampliar.
-- As datas abaixo sao exemplos e usam o calendario/horario da base, a confirmar.

SET NOCOUNT ON;

DECLARE @Empresa int = 900;                 -- EXEMPLO: alterar para a empresa do teste
DECLARE @Obra nvarchar(50) = N'00001';       -- EXEMPLO: preservar zeros e codigo exato
DECLARE @DataInicio datetime2 = '2026-11-01T00:00:00';
DECLARE @DataFimExclusivo datetime2 = '2026-12-01T00:00:00';
DECLARE @QuantidadeAmostra int = 20;
DECLARE @InicioExecucao datetime2 = SYSDATETIME();
DECLARE @DataReferencia date = CAST(@InicioExecucao AS date);

-- Para TODAS as empresas, defina @Empresa = NULL e @Obra = NULL explicitamente.
-- Para todas as obras de uma empresa, mantenha @Empresa e defina @Obra = NULL.
-- O periodo filtra somente RECEBIMENTOS e MANUTENCOES.
-- Vendas, abertas e distratos nao tem corte de data, faixa, banco ou aprovacao.
IF @Empresa IS NULL AND @Obra IS NOT NULL
    THROW 50001, 'Informe empresa para filtrar uma obra; ou NULL nas duas para toda a base.', 1;
IF @DataInicio IS NULL OR @DataFimExclusivo IS NULL OR @DataInicio >= @DataFimExclusivo
    THROW 50002, 'Informe um periodo valido com fim exclusivo maior que o inicio.', 1;
IF @QuantidadeAmostra IS NULL OR @QuantidadeAmostra < 1 OR @QuantidadeAmostra > 1000
    THROW 50003, 'QuantidadeAmostra deve estar entre 1 e 1000.', 1;

-- Permite repetir o diagnostico na mesma janela; remove apenas suas tabelas temporarias.
IF OBJECT_ID('tempdb..#DiagnosticoVendas') IS NOT NULL DROP TABLE #DiagnosticoVendas;
IF OBJECT_ID('tempdb..#DiagnosticoAbertas') IS NOT NULL DROP TABLE #DiagnosticoAbertas;
IF OBJECT_ID('tempdb..#DiagnosticoRecebimentos') IS NOT NULL DROP TABLE #DiagnosticoRecebimentos;
IF OBJECT_ID('tempdb..#DiagnosticoManutencoes') IS NOT NULL DROP TABLE #DiagnosticoManutencoes;
IF OBJECT_ID('tempdb..#DiagnosticoDistratos') IS NOT NULL DROP TABLE #DiagnosticoDistratos;

SELECT @Empresa AS EmpresaFiltro, @Obra AS ObraFiltro,
    @DataInicio AS InicioRecebimentosManutencoes,
    @DataFimExclusivo AS FimExclusivoRecebimentosManutencoes,
    @InicioExecucao AS InicioNoServidorSQL, @DataReferencia AS DataReferenciaAtraso;

-- Vendas: materializado uma vez para resumo e amostra.
WITH FontesVenda AS (
    SELECT
        CAST('Vendas' AS varchar(20)) AS OrigemVenda,
        V.Empresa_Ven AS CodEmpresa,
        V.Obra_Ven AS CodObra,
        V.Num_Ven AS Venda,
        V.Cliente_Ven AS CodCliente,
        V.Data_Ven AS DataVenda,
        V.DataCancel_Ven AS DataCancelamentoUAU,
        V.ValorTot_Ven AS ValorVendaUAU
    FROM Vendas AS V

    UNION ALL

    SELECT
        CAST('VendasRecebidas' AS varchar(20)),
        V.Empresa_VRec,
        V.Obra_VRec,
        V.Num_VRec,
        V.Cliente_VRec,
        V.Data_VRec,
        V.DataCancel_VRec,
        V.ValorTot_VRec
    FROM VendasRecebidas AS V
)
SELECT
    F.OrigemVenda,
    F.CodEmpresa,
    F.CodObra,
    F.Venda,
    F.CodCliente,
    F.DataVenda,
    F.DataCancelamentoUAU,
    F.ValorVendaUAU,
    CAST(F.CodEmpresa AS varchar(20)) + '_' + F.CodObra + '_'
        + CAST(F.Venda AS varchar(20)) AS ChaveContrato
INTO #DiagnosticoVendas
FROM FontesVenda AS F
WHERE (@Empresa IS NULL OR F.CodEmpresa = @Empresa)
  AND (@Obra IS NULL OR F.CodObra = @Obra);


-- Abertas: materializado uma vez para resumo e amostra.
SELECT
    C.Empresa_prc AS CodEmpresa,
    C.Obra_prc AS CodObra,
    C.NumVend_prc AS Venda,
    C.NumParc_prc AS NumParc,
    C.NumParcGer_prc AS NumParcGer,
    C.Tipo_prc AS TipoParc,
    C.Data_prc AS VencimentoOriginal,
    C.DataPror_prc AS Prorrogacao,
    C.Valor_prc AS ValorBaseAbertoUAU,
    CAST(C.Empresa_prc AS varchar(20)) + '_' + C.Obra_prc + '_'
        + CAST(C.NumVend_prc AS varchar(20)) AS ChaveContrato,
    CAST(C.Empresa_prc AS varchar(20)) + '_' + C.Obra_prc + '_'
        + CAST(C.NumVend_prc AS varchar(20)) + '_' + C.Tipo_prc + '_'
        + CAST(C.NumParc_prc AS varchar(20)) + '_'
        + CAST(C.NumParcGer_prc AS varchar(20)) AS ChaveParcela
INTO #DiagnosticoAbertas
FROM ContasReceber AS C
WHERE (@Empresa IS NULL OR C.Empresa_prc = @Empresa)
  AND (@Obra IS NULL OR C.Obra_prc = @Obra);


-- Recebimentos: materializado uma vez para resumo e amostra.
SELECT
    R.Empresa_rec AS CodEmpresa,
    R.Obra_Rec AS CodObra,
    R.NumVend_Rec AS Venda,
    R.NumParc_Rec AS NumParc,
    R.NumParcGer_Rec AS NumParcGer,
    R.Tipo_Rec AS TipoParc,
    R.ParcType_Rec AS TipoRecebimentoUAU,
    R.NumReceb_Rec AS NumeroRecebimento,
    R.DataVenci_Rec AS VencimentoOriginal,
    R.Data_Rec AS DataRecebimentoUAU,
    R.Valor_Rec,
    R.ValorConf_Rec,
    R.VlCorrecao_Rec,
    R.VlCorrecaoConf_Rec,
    R.VlCorrecaoAtr_Rec,
    R.VlCorrecaoAtrConf_Rec,
    R.VlMulta_Rec,
    R.VlMultaConf_Rec,
    R.VlJurosParc_Rec,
    R.VlJurosParcConf_Rec,
    R.VlJuros_Rec,
    R.VlJurosConf_Rec,
    R.VlAcres_Rec,
    R.VlAcresConf_Rec,
    R.VlTaxaBol_Rec,
    R.VlTaxaBolConf_Rec,
    R.VlDesconto_Rec,
    R.VlDescontoConf_Rec,
    R.ValDescontoCusta_Rec,
    R.ValDescontoCustaConf_Rec,
    R.ValDescontoImposto_Rec,
    R.ValDescontoImpostoConf_Rec,
    R.ValDescontoCondicional_Rec,
    R.ValDescontoCondicionalConf_Rec,
    CAST(R.Empresa_rec AS varchar(20)) + '_' + R.Obra_Rec + '_'
        + CAST(R.NumVend_Rec AS varchar(20)) AS ChaveContrato,
    CAST(R.Empresa_rec AS varchar(20)) + '_' + R.Obra_Rec + '_'
        + CAST(R.NumVend_Rec AS varchar(20)) + '_' + R.Tipo_Rec + '_'
        + CAST(R.NumParc_Rec AS varchar(20)) + '_'
        + CAST(R.NumParcGer_Rec AS varchar(20)) AS ChaveParcela
INTO #DiagnosticoRecebimentos
FROM Recebidas AS R
WHERE (@Empresa IS NULL OR R.Empresa_rec = @Empresa)
  AND (@Obra IS NULL OR R.Obra_Rec = @Obra)
  AND R.Data_Rec >= @DataInicio
  AND R.Data_Rec < @DataFimExclusivo;


-- Manutencoes: materializado uma vez para resumo e amostra.
SELECT
    H.Empresa_vhist AS CodEmpresa,
    H.Obra_vhist AS CodObra,
    H.NumVend_vhist AS Venda,
    H.Num_vhist AS NumeroHistorico,
    H.DataMnt_vhist AS DataManutencaoUAU,
    H.TipoMnt_vhist AS TipoManutencaoUAU,
    CASE H.TipoMnt_vhist
        WHEN 0 THEN 'Cancelar Venda'
        WHEN 1 THEN 'Renegociar Contrato'
        WHEN 2 THEN 'Cessao de Direito'
        WHEN 3 THEN 'Simulacao de Distrato'
        WHEN 4 THEN 'Alterar parametros da venda'
        WHEN 5 THEN 'Alterar juros em parcelas price'
        WHEN 6 THEN 'Acerto final'
        WHEN 7 THEN 'Renegociacao pendente'
        WHEN 8 THEN 'Cessao de direito pendente'
        WHEN 9 THEN 'Renegociacao pendente com emissao de boleto'
        ELSE 'Tipo nao mapeado - conferir no UAU'
    END AS DescricaoReferencia,
    CAST(H.Empresa_vhist AS varchar(20)) + '_' + H.Obra_vhist + '_'
        + CAST(H.NumVend_vhist AS varchar(20)) AS ChaveContrato,
    CAST(H.Empresa_vhist AS varchar(20)) + '_' + H.Obra_vhist + '_'
        + CAST(H.NumVend_vhist AS varchar(20)) + '_'
        + CAST(H.Num_vhist AS varchar(20)) AS ChaveHistoricoCandidata
INTO #DiagnosticoManutencoes
FROM VendaHist AS H
WHERE (@Empresa IS NULL OR H.Empresa_vhist = @Empresa)
  AND (@Obra IS NULL OR H.Obra_vhist = @Obra)
  AND H.DataMnt_vhist >= @DataInicio
  AND H.DataMnt_vhist < @DataFimExclusivo;


-- Distratos: materializado uma vez para resumo e amostra.
SELECT
    D.Empresa_vdd AS CodEmpresa,
    D.Obra_vdd AS CodObra,
    D.NumVend_vdd AS Venda,
    D.DataCad_vdd AS DataCadastroDistratoUAU,
    D.DataAprov_vdd AS DataAprovacaoDistratoUAU,
    D.StatusAprov_vdd AS StatusAprovacaoDistratoUAU,
    D.EmpresaProc_vdd AS EmpresaProcessoDistrato,
    D.ObraProc_vdd AS ObraProcessoDistrato,
    D.NumProc_vdd AS NumeroProcessoDistrato,
    CAST(D.Empresa_vdd AS varchar(20)) + '_' + D.Obra_vdd + '_'
        + CAST(D.NumVend_vdd AS varchar(20)) AS ChaveContrato
INTO #DiagnosticoDistratos
FROM VendaDistrato AS D
WHERE (@Empresa IS NULL OR D.Empresa_vdd = @Empresa)
  AND (@Obra IS NULL OR D.Obra_vdd = @Obra);

-- VOLUME: linhas fisicas e contratos distintos em cada conjunto.
-- Recebimentos/manutencoes sao apenas do periodo; os demais sao posicao atual.
SELECT 'carteira-vendas' AS Conjunto,
    (SELECT COUNT_BIG(*) FROM #DiagnosticoVendas) AS QuantidadeLinhas,
    (SELECT COUNT_BIG(*) FROM (SELECT CodEmpresa, CodObra, Venda FROM #DiagnosticoVendas GROUP BY CodEmpresa, CodObra, Venda) AS Contratos) AS ContratosDistintos
UNION ALL
SELECT 'carteira-parcelas-abertas' AS Conjunto,
    (SELECT COUNT_BIG(*) FROM #DiagnosticoAbertas) AS QuantidadeLinhas,
    (SELECT COUNT_BIG(*) FROM (SELECT CodEmpresa, CodObra, Venda FROM #DiagnosticoAbertas GROUP BY CodEmpresa, CodObra, Venda) AS Contratos) AS ContratosDistintos
UNION ALL
SELECT 'carteira-recebimentos' AS Conjunto,
    (SELECT COUNT_BIG(*) FROM #DiagnosticoRecebimentos) AS QuantidadeLinhas,
    (SELECT COUNT_BIG(*) FROM (SELECT CodEmpresa, CodObra, Venda FROM #DiagnosticoRecebimentos GROUP BY CodEmpresa, CodObra, Venda) AS Contratos) AS ContratosDistintos
UNION ALL
SELECT 'carteira-manutencoes' AS Conjunto,
    (SELECT COUNT_BIG(*) FROM #DiagnosticoManutencoes) AS QuantidadeLinhas,
    (SELECT COUNT_BIG(*) FROM (SELECT CodEmpresa, CodObra, Venda FROM #DiagnosticoManutencoes GROUP BY CodEmpresa, CodObra, Venda) AS Contratos) AS ContratosDistintos
UNION ALL
SELECT 'carteira-distratos' AS Conjunto,
    (SELECT COUNT_BIG(*) FROM #DiagnosticoDistratos) AS QuantidadeLinhas,
    (SELECT COUNT_BIG(*) FROM (SELECT CodEmpresa, CodObra, Venda FROM #DiagnosticoDistratos GROUP BY CodEmpresa, CodObra, Venda) AS Contratos) AS ContratosDistintos;

-- ABERTAS POR EMPRESA/OBRA: valor base, NAO valor atualizado com encargos.
-- Inclui vendas cujo estado ainda precisa ser reconciliado: nao e total elegivel para cobranca.
SELECT CodEmpresa, CodObra, COUNT_BIG(*) AS ParcelasAbertas,
    SUM(CASE WHEN VencimentoOriginal < @DataReferencia THEN CAST(1 AS bigint) ELSE 0 END) AS ParcelasVencidasPorData,
    SUM(CASE WHEN VencimentoOriginal >= @DataReferencia THEN CAST(1 AS bigint) ELSE 0 END) AS ParcelasHojeOuFuturas,
    SUM(CASE WHEN VencimentoOriginal IS NULL THEN CAST(1 AS bigint) ELSE 0 END) AS ParcelasSemVencimento,
    SUM(CAST(ValorBaseAbertoUAU AS decimal(28, 6))) AS ValorBaseAbertoBruto,
    SUM(CASE WHEN VencimentoOriginal < @DataReferencia THEN CAST(ValorBaseAbertoUAU AS decimal(28, 6)) ELSE 0 END) AS ValorBaseVencidoBruto
FROM #DiagnosticoAbertas
GROUP BY CodEmpresa, CodObra
ORDER BY CodEmpresa, CodObra;

-- DUPLICIDADES/CONFLITOS: candidatos a chave, sem eliminar linhas silenciosamente.
SELECT CodEmpresa, CodObra, Venda, COUNT_BIG(*) AS LinhasEntreFontes
FROM #DiagnosticoVendas
GROUP BY CodEmpresa, CodObra, Venda HAVING COUNT_BIG(*) > 1;

SELECT CodEmpresa, CodObra, Venda, TipoParc, NumParc, NumParcGer, COUNT_BIG(*) AS Repeticoes
FROM #DiagnosticoAbertas
GROUP BY CodEmpresa, CodObra, Venda, TipoParc, NumParc, NumParcGer HAVING COUNT_BIG(*) > 1;

SELECT CodEmpresa, CodObra, Venda, TipoParc, NumParc, NumParcGer,
    NumeroRecebimento, TipoRecebimentoUAU, COUNT_BIG(*) AS Repeticoes
FROM #DiagnosticoRecebimentos
GROUP BY CodEmpresa, CodObra, Venda, TipoParc, NumParc, NumParcGer,
    NumeroRecebimento, TipoRecebimentoUAU HAVING COUNT_BIG(*) > 1;

-- Evidencias de distrato: nao reduzir aprovado/cancelado/pendente a um unico flag.
SELECT StatusAprovacaoDistratoUAU, COUNT_BIG(*) AS Registros
FROM #DiagnosticoDistratos GROUP BY StatusAprovacaoDistratoUAU;

-- AMOSTRAS: resultado completo fica nas tabelas temporarias, sem enviar dados para fora.
SELECT TOP (@QuantidadeAmostra) * FROM #DiagnosticoVendas ORDER BY CodEmpresa, CodObra, Venda, OrigemVenda;
SELECT TOP (@QuantidadeAmostra) * FROM #DiagnosticoAbertas ORDER BY CodEmpresa, CodObra, Venda, VencimentoOriginal, TipoParc, NumParc, NumParcGer;
SELECT TOP (@QuantidadeAmostra) * FROM #DiagnosticoRecebimentos ORDER BY CodEmpresa, CodObra, Venda, DataRecebimentoUAU, NumeroRecebimento, TipoParc, NumParc, NumParcGer;
SELECT TOP (@QuantidadeAmostra) * FROM #DiagnosticoManutencoes ORDER BY CodEmpresa, CodObra, Venda, DataManutencaoUAU, NumeroHistorico;
SELECT TOP (@QuantidadeAmostra) * FROM #DiagnosticoDistratos ORDER BY CodEmpresa, CodObra, Venda, DataCadastroDistratoUAU;

SELECT @InicioExecucao AS InicioNoServidorSQL, SYSDATETIME() AS FimNoServidorSQL,
    DATEDIFF(millisecond, @InicioExecucao, SYSDATETIME()) AS DuracaoTotalMs;

-- Para exportar tudo, execute separadamente SELECT * FROM #DiagnosticoAbertas etc.
-- Nao execute exportacoes integrais antes de conferir o volume e os campos pessoais.
-- Contagens sao estimativa de registros. Tamanho de JSON/tempo da API depende do
-- envelope/serializacao, indices e infraestrutura; medir depois no retorno real.
