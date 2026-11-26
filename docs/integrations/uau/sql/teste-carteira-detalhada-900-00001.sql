-- MAPEAMENTO DA CARTEIRA: SQL Server 2016+ (usa FOR JSON PATH).
-- Executar inteiro no banco UAU. Somente leitura, nenhuma cobranca/baixa/emissao.
-- Uma linha por parcela aberta; unidades, participantes e telefones em JSON.
-- Empresa/obra prontas para o teste. Campos baseados nos SQLs/retornos fornecidos.
-- Sem SELECT *: campos financeiros e identidades possuem nomes explicitos.
-- Nao homologado no servidor UAU. Nao e ainda o contrato de dados de producao.

SET NOCOUNT ON;
DECLARE @Empresa int = 900;
DECLARE @Obra varchar(5) = '00001';
DECLARE @MinimoDiasAtraso int = 1;
DECLARE @MostrarBloqueadas bit = 1; -- 1 = exibir tambem para conferir motivo, SEM autorizar envio
DECLARE @DataHoraConsulta datetime = GETDATE();
DECLARE @DataReferencia date = CAST(@DataHoraConsulta AS date);

;WITH FontesVenda AS (
    SELECT CAST('Vendas' AS varchar(20)) AS Origem,
        V.Empresa_Ven AS Empresa, V.Obra_Ven AS Obra, V.Num_Ven AS Venda,
        V.Cliente_Ven AS Cliente, V.Data_Ven AS DataVenda,
        V.DataCancel_Ven AS DataCancelamento,
        V.ValorTot_Ven AS ValorVenda
    FROM Vendas AS V
    WHERE V.Empresa_Ven = @Empresa AND V.Obra_Ven = @Obra
    UNION ALL
    SELECT CAST('VendasRecebidas' AS varchar(20)),
        V.Empresa_VRec, V.Obra_VRec, V.Num_VRec, V.Cliente_VRec,
        V.Data_VRec, V.DataCancel_VRec, V.ValorTot_VRec
    FROM VendasRecebidas AS V
    WHERE V.Empresa_VRec = @Empresa AND V.Obra_VRec = @Obra
), Contratos AS (
    SELECT Empresa, Obra, Venda, COUNT_BIG(*) AS QuantidadeRegistrosVenda,
        COUNT(DISTINCT Cliente) AS QuantidadeClientesNasFontes,
        COUNT_BIG(Cliente) AS QuantidadeClientesPreenchidos,
        CASE WHEN COUNT(DISTINCT Cliente) = 1 AND COUNT_BIG(Cliente) = COUNT_BIG(*)
            THEN MAX(Cliente) END AS Cliente,
        MIN(DataVenda) AS MenorDataVenda, MAX(DataVenda) AS MaiorDataVenda,
        MAX(DataCancelamento) AS DataCancelamentoEncontrada,
        MIN(ValorVenda) AS MenorValorVenda, MAX(ValorVenda) AS MaiorValorVenda,
        MAX(CASE WHEN Origem = 'Vendas' THEN 1 ELSE 0 END) AS EncontradaEmVendas,
        MAX(CASE WHEN Origem = 'VendasRecebidas' THEN 1 ELSE 0 END) AS EncontradaEmVendasRecebidas
    FROM FontesVenda GROUP BY Empresa, Obra, Venda
)
SELECT
    -- Identificacao estavel: isolar tambem por organizacao/origem UAU na plataforma.
    C.Empresa_prc AS CodEmpresa, E.Desc_emp AS NomeEmpresa,
    C.Obra_prc AS CodObra, O.Descr_obr AS NomeObra,
    C.NumVend_prc AS Venda,
    CAST(C.Empresa_prc AS varchar(20)) + '_' + C.Obra_prc + '_'
        + CAST(C.NumVend_prc AS varchar(20)) AS ChaveContrato,
    CAST(C.Empresa_prc AS varchar(20)) + '_' + C.Obra_prc + '_'
        + CAST(C.NumVend_prc AS varchar(20)) + '_' + C.Tipo_prc + '_'
        + CAST(C.NumParc_prc AS varchar(20)) + '_'
        + CAST(C.NumParcGer_prc AS varchar(20)) AS ChaveParcela,

    -- Cadastro do contrato, sem escolher silenciosamente entre fontes conflitantes.
    V.QuantidadeRegistrosVenda, V.QuantidadeClientesNasFontes,
    V.EncontradaEmVendas, V.EncontradaEmVendasRecebidas,
    V.MenorDataVenda, V.MaiorDataVenda,
    V.MenorValorVenda, V.MaiorValorVenda,
    V.DataCancelamentoEncontrada,
    V.Cliente AS CodCliente, P.Nome_pes AS NomeCliente,
    P.Cpf_pes AS CpfCnpj, P.Email_pes AS EmailCliente,

    -- Parcela e atraso: nao usar prorrogacao como vencimento original/promessa confirmada.
    C.Tipo_prc AS TipoParcela, PAR.Descricao_par AS DescricaoTipoParcela,
    C.NumParc_prc AS NumeroParcela, C.NumParcGer_prc AS NumeroGeralParcela,
    C.TotParc_prc AS TotalParcelasInformadoUAU,
    C.Status_prc AS StatusParcelaUAU,
    C.Data_prc AS VencimentoOriginal, C.DataPror_prc AS Prorrogacao,
    DATEDIFF(DAY, C.Data_prc, @DataReferencia) AS DiasAtraso,
    CASE WHEN C.DataPror_prc >= DATEADD(DAY, 1, CAST(@DataReferencia AS datetime))
        THEN 1 ELSE 0 END AS ProrrogacaoFuturaDetectada,
    C.Valor_prc AS ValorBaseAbertoUAU, C.Obs_prc AS ObservacaoParcela,

    -- Resumo REPETIDO por contrato: nao somar estes campos entre linhas de parcelas.
    AB.QuantidadeParcelasAbertasContrato,
    AB.QuantidadeParcelasVencidasContrato,
    AB.ValorBaseAbertoContrato, AB.ValorBaseVencidoContrato,
    AB.VencimentoOriginalMaisAntigo,
    CASE WHEN AB.VencimentoOriginalMaisAntigo < @DataReferencia
        THEN DATEDIFF(DAY, AB.VencimentoOriginalMaisAntigo, @DataReferencia)
        ELSE 0 END AS MaiorAtrasoContrato,

    -- Calculo ERP por parcela: so expor valores quando ha exatamente um registro.
    -- Nao selecionar MAX de varios calculos como se fosse o valor atual.
    CALC.QuantidadeRegistrosCalculo,
    CALC.MenorDataCalculo, CALC.MaiorDataCalculo,
    CASE WHEN CALC.QuantidadeRegistrosCalculo = 0 THEN 'SEM_CALCULO'
        WHEN CALC.QuantidadeRegistrosCalculo > 1 THEN 'MULTIPLOS_CALCULOS_REVISAR'
        WHEN CALC.MaiorDataCalculo IS NULL THEN 'SEM_DATA_CALCULO'
        WHEN CAST(CALC.MaiorDataCalculo AS date) = @DataReferencia THEN 'REFERENCIA_HOJE'
        ELSE 'REFERENCIA_DIFERENTE_REVISAR' END AS SituacaoReferenciaCalculo,
    CASE WHEN CALC.QuantidadeRegistrosCalculo = 1 THEN CALC.ValorTotal END AS ValorTotalCalculadoUAU,
    CASE WHEN CALC.QuantidadeRegistrosCalculo = 1 THEN CALC.ValorParcela END AS ValorParcelaCalculadaUAU,
    CASE WHEN CALC.QuantidadeRegistrosCalculo = 1 THEN CALC.Multa END AS MultaCalculadaUAU,
    CASE WHEN CALC.QuantidadeRegistrosCalculo = 1 THEN CALC.JurosAtraso END AS JurosAtrasoCalculadosUAU,
    CASE WHEN CALC.QuantidadeRegistrosCalculo = 1 THEN CALC.CorrecaoAtraso END AS CorrecaoAtrasoCalculadaUAU,

    -- Evidencias de bloqueio: nao equivalem a decisao homologada sobre o estado vigente.
    DIS.QuantidadeRegistrosDistrato, DIS.QuantidadeAprovados,
    DIS.QuantidadeNaoAprovados, DIS.QuantidadeStatusDesconhecidos,
    DIS.UltimoCadastroDistrato, DIS.UltimaAprovacaoDistrato,
    CASE WHEN V.Venda IS NULL THEN 'REVISAR_VENDA_NAO_LOCALIZADA'
        WHEN V.DataCancelamentoEncontrada IS NOT NULL THEN 'BLOQUEAR_CANCELAMENTO_A_VALIDAR'
        WHEN DIS.QuantidadeRegistrosDistrato > 0 THEN 'BLOQUEAR_DISTRATO_A_VALIDAR'
        WHEN V.Cliente IS NULL THEN 'BLOQUEAR_CLIENTE_A_VALIDAR'
        WHEN P.Cod_pes IS NULL THEN 'BLOQUEAR_CADASTRO_NAO_LOCALIZADO'
        ELSE 'SEM_BLOQUEIO_DETECTADO_NESTE_TESTE' END AS ConferenciaContrato,
    -- Nao liberar mensagens/regularizar divida automaticamente a partir deste diagnostico.
    CAST(0 AS bit) AS EnvioAutomaticoAutorizadoNesteTeste,

    -- Colecoes separadas para evitar multiplicacao da mesma parcela.
    (SELECT T.Tipo_tel AS TipoTelefone, T.DDD_tel AS DDD, T.Fone_tel AS Numero
        FROM PesTel AS T WHERE T.Pes_tel = V.Cliente
        FOR JSON PATH) AS TelefonesClienteJson,
    (SELECT VC.Cliente_CVen AS CodPessoa, PC.Nome_pes AS NomePessoa,
            VC.EmiteBoleto_CVen AS EmiteBoletoUAU,
            CASE WHEN VC.Cliente_CVen = V.Cliente THEN 1 ELSE 0 END AS ClientePrincipalDaFonte
        FROM VendaClientes AS VC
        LEFT JOIN Pessoas AS PC ON PC.Cod_pes = VC.Cliente_CVen
        WHERE VC.Empresa_CVen = C.Empresa_prc AND VC.Obra_CVen = C.Obra_prc
          AND VC.Num_CVen = C.NumVend_prc
        FOR JSON PATH) AS ParticipantesVendaJson,
    (SELECT IV.Produto_Itv AS CodProduto, IV.CodPerson_Itv AS NumPersonalizacao,
            PS.Descricao_psc AS DescricaoProduto, U.Identificador_unid AS Unidade
        FROM (
            SELECT I.Produto_Itv, I.CodPerson_Itv FROM ItensVenda AS I
            WHERE I.Empresa_Itv = C.Empresa_prc AND I.Obra_Itv = C.Obra_prc AND I.NumVend_Itv = C.NumVend_prc
            UNION
            SELECT I.Produto_Itr, I.CodPerson_Itr FROM ItensRecebidas AS I
            WHERE I.Empresa_Itr = C.Empresa_prc AND I.Obra_Itr = C.Obra_prc AND I.NumVend_Itr = C.NumVend_prc
        ) AS IV
        LEFT JOIN PrdSrv AS PS ON PS.NumProd_psc = IV.Produto_Itv
        LEFT JOIN UnidadePer AS U ON U.Empresa_unid = C.Empresa_prc AND U.Obra_unid = C.Obra_prc
            AND U.Prod_unid = IV.Produto_Itv AND U.NumPer_unid = IV.CodPerson_Itv
        FOR JSON PATH) AS UnidadesVendaJson,
    @DataHoraConsulta AS DataHoraConsultaServidorUAU,
    @DataReferencia AS DataReferenciaAtraso
FROM ContasReceber AS C
LEFT JOIN Contratos AS V ON V.Empresa = C.Empresa_prc AND V.Obra = C.Obra_prc AND V.Venda = C.NumVend_prc
LEFT JOIN Empresas AS E ON E.Codigo_emp = C.Empresa_prc
LEFT JOIN Obras AS O ON O.Empresa_obr = C.Empresa_prc AND O.Cod_obr = C.Obra_prc
LEFT JOIN Pessoas AS P ON P.Cod_pes = V.Cliente
LEFT JOIN Parcelas AS PAR ON PAR.Tipo_par = C.Tipo_prc
OUTER APPLY (
    SELECT COUNT_BIG(*) AS QuantidadeParcelasAbertasContrato,
        SUM(CASE WHEN A.Data_prc < @DataReferencia AND A.Valor_prc > 0 THEN CAST(1 AS bigint) ELSE 0 END) AS QuantidadeParcelasVencidasContrato,
        SUM(A.Valor_prc) AS ValorBaseAbertoContrato,
        SUM(CASE WHEN A.Data_prc < @DataReferencia AND A.Valor_prc > 0 THEN A.Valor_prc ELSE 0 END) AS ValorBaseVencidoContrato,
        MIN(CASE WHEN A.Valor_prc > 0 THEN A.Data_prc END) AS VencimentoOriginalMaisAntigo
    FROM ContasReceber AS A
    WHERE A.Empresa_prc = C.Empresa_prc AND A.Obra_prc = C.Obra_prc AND A.NumVend_prc = C.NumVend_prc
) AS AB
OUTER APPLY (
    SELECT COUNT_BIG(*) AS QuantidadeRegistrosDistrato,
        SUM(CASE WHEN D.StatusAprov_vdd = 1 THEN 1 ELSE 0 END) AS QuantidadeAprovados,
        SUM(CASE WHEN D.StatusAprov_vdd = 0 THEN 1 ELSE 0 END) AS QuantidadeNaoAprovados,
        SUM(CASE WHEN D.StatusAprov_vdd IS NULL OR D.StatusAprov_vdd NOT IN (0, 1) THEN 1 ELSE 0 END) AS QuantidadeStatusDesconhecidos,
        MAX(D.DataCad_vdd) AS UltimoCadastroDistrato,
        MAX(D.DataAprov_vdd) AS UltimaAprovacaoDistrato
    FROM VendaDistrato AS D
    WHERE D.Empresa_vdd = C.Empresa_prc AND D.Obra_vdd = C.Obra_prc AND D.NumVend_vdd = C.NumVend_prc
) AS DIS
OUTER APPLY (
    SELECT COUNT_BIG(*) AS QuantidadeRegistrosCalculo,
        MIN(K.DataCalc_crc) AS MenorDataCalculo, MAX(K.DataCalc_crc) AS MaiorDataCalculo,
        MAX(K.ValParcela_crc) AS ValorTotal,
        CASE WHEN C.AmortParc_prc = 1
            THEN MAX(K.ValPrincipalPrice_crc + K.ValJurosCompPrice_crc + K.ValCorrecao_crc)
            ELSE MAX(K.ValPrincipal_crc + K.ValJurosComp_crc + K.ValCorrecao_crc) END AS ValorParcela,
        MAX(K.ValMultaAtraso_crc) AS Multa,
        MAX(K.ValJuroAtraso_crc) AS JurosAtraso,
        MAX(K.ValCorrecaoAtraso_crc) AS CorrecaoAtraso
    FROM ContasReceberCalc AS K
    WHERE K.Empresa_crc = C.Empresa_prc AND K.Obra_crc = C.Obra_prc AND K.NumVend_crc = C.NumVend_prc
      AND K.NumParc_crc = C.NumParc_prc AND K.Tipo_crc = C.Tipo_prc AND K.NumParcGer_crc = C.NumParcGer_prc
) AS CALC
WHERE C.Empresa_prc = @Empresa AND C.Obra_prc = @Obra
  AND C.Valor_prc > 0
  AND DATEDIFF(DAY, C.Data_prc, @DataReferencia) >= @MinimoDiasAtraso
  AND (@MostrarBloqueadas = 1 OR (
      V.Venda IS NOT NULL AND V.DataCancelamentoEncontrada IS NULL
      AND DIS.QuantidadeRegistrosDistrato = 0 AND V.Cliente IS NOT NULL AND P.Cod_pes IS NOT NULL
  ))
ORDER BY C.NumVend_prc, C.Data_prc, C.Tipo_prc, C.NumParc_prc, C.NumParcGer_prc;

-- Resultado vazio apos baixa nao comprova pagamento: conferir Recebidas.
-- JSONs e totais do contrato repetem em cada parcela: nao somar valores de contrato por linha.
-- Nome/CPF/contatos sao dados pessoais; compartilhar somente a amostra necessaria ao teste.
