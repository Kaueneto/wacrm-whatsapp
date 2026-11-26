-- TESTE DIRETO NO SQL SERVER UAU. Executar o arquivo inteiro.
-- Empresa 900, obra 00001; uma linha por parcela aberta com vencimento original passado.
-- Leitura somente: nao baixa parcelas, nao emite boletos e nao envia cobrancas.
-- Valor base do ERP, sem recalcular juros/multa/correcao.
-- Ainda requer homologacao dos estados de cancelamento/distrato na instalacao.

SET NOCOUNT ON;

DECLARE @Empresa int = 900;
DECLARE @Obra varchar(5) = '00001';
DECLARE @MinimoDiasAtraso int = 1;
DECLARE @DataReferencia date = CAST(GETDATE() AS date);

;WITH FontesVenda AS (
    SELECT
        V.Empresa_Ven AS Empresa,
        V.Obra_Ven AS Obra,
        V.Num_Ven AS Venda,
        V.Cliente_Ven AS Cliente,
        V.DataCancel_Ven AS DataCancelamento
    FROM Vendas AS V
    WHERE V.Empresa_Ven = @Empresa AND V.Obra_Ven = @Obra

    UNION ALL

    SELECT
        V.Empresa_VRec,
        V.Obra_VRec,
        V.Num_VRec,
        V.Cliente_VRec,
        V.DataCancel_VRec
    FROM VendasRecebidas AS V
    WHERE V.Empresa_VRec = @Empresa AND V.Obra_VRec = @Obra
), Contratos AS (
    -- Nao multiplicar parcelas quando a venda aparece nas duas fontes.
    -- Ausencia de estado verificavel/conflito de cliente nao libera o contrato.
    SELECT Empresa, Obra, Venda, MAX(Cliente) AS Cliente
    FROM FontesVenda
    GROUP BY Empresa, Obra, Venda
    HAVING COUNT(DISTINCT Cliente) = 1
       AND COUNT_BIG(Cliente) = COUNT_BIG(*)
       AND MAX(CASE WHEN DataCancelamento IS NOT NULL THEN 1 ELSE 0 END) = 0
)
SELECT
    C.Empresa_prc AS CodEmpresa,
    C.Obra_prc AS CodObra,
    C.NumVend_prc AS Venda,
    V.Cliente AS CodCliente,
    P.Nome_pes AS NomeCliente,
    C.Tipo_prc AS TipoParcela,
    C.NumParc_prc AS NumeroParcela,
    C.NumParcGer_prc AS NumeroGeralParcela,
    C.Data_prc AS VencimentoOriginal,
    C.DataPror_prc AS Prorrogacao,
    DATEDIFF(DAY, C.Data_prc, @DataReferencia) AS DiasAtraso,
    C.Valor_prc AS ValorBaseAbertoUAU,
    @DataReferencia AS DataReferencia,
    CAST(C.Empresa_prc AS varchar(20)) + '_' + C.Obra_prc + '_'
        + CAST(C.NumVend_prc AS varchar(20)) AS ChaveContrato,
    CAST(C.Empresa_prc AS varchar(20)) + '_' + C.Obra_prc + '_'
        + CAST(C.NumVend_prc AS varchar(20)) + '_' + C.Tipo_prc + '_'
        + CAST(C.NumParc_prc AS varchar(20)) + '_'
        + CAST(C.NumParcGer_prc AS varchar(20)) AS ChaveParcela
FROM ContasReceber AS C
INNER JOIN Contratos AS V
    ON V.Empresa = C.Empresa_prc
   AND V.Obra = C.Obra_prc
   AND V.Venda = C.NumVend_prc
LEFT JOIN Pessoas AS P ON P.Cod_pes = V.Cliente
WHERE C.Empresa_prc = @Empresa
  AND C.Obra_prc = @Obra
  AND C.Valor_prc > 0
  AND DATEDIFF(DAY, C.Data_prc, @DataReferencia) >= @MinimoDiasAtraso
  AND NOT EXISTS (
      -- Protecao conservadora para este teste:
      -- qualquer registro de distrato exige revisao e fica fora do resultado.
      -- Nao transforma simulacao/pendencia em distrato efetivado.
      SELECT 1 FROM VendaDistrato AS D
      WHERE D.Empresa_vdd = C.Empresa_prc
        AND D.Obra_vdd = C.Obra_prc
        AND D.NumVend_vdd = C.NumVend_prc
  )
ORDER BY C.NumVend_prc, C.Data_prc, C.Tipo_prc, C.NumParc_prc, C.NumParcGer_prc;

-- Comparacao esperada com a amostra exportada em 26/11/2026:
-- venda 1, tipo E, parcela 1, numero geral 1, vencimento 18/11/2026,
-- valor base 660,00. O resultado atual pode ter mudado desde a exportacao.
-- Apos baixa integral efetiva, essa parcela deve deixar ContasReceber e o resultado.
-- Baixa parcial pode manter saldo/gerar desdobramento: conferir chaves e saldo no ERP.
-- Desaparecimento sozinho NAO comprova pagamento: conferir Recebidas antes de regularizar.
