-- Comparacao da parcela baixada no teste. Executar inteiro no SQL Server UAU.
-- Somente leitura. Nao depende de a parcela continuar na lista de inadimplentes.
SET NOCOUNT ON;
DECLARE @Empresa int = 900;
DECLARE @Obra varchar(5) = '00001';
DECLARE @Venda int = 1;
DECLARE @Tipo varchar(10) = 'E';
DECLARE @Parcela int = 1;
DECLARE @ParcelaGeral int = 1;

-- 1. Saldo atual da mesma obrigacao: uma linha mesmo quando nao ha abertas.
SELECT @Empresa AS Empresa, @Obra AS Obra, @Venda AS Venda,
    @Tipo AS TipoParcela, @Parcela AS NumeroParcela, @ParcelaGeral AS NumeroGeralParcela,
    COUNT_BIG(*) AS QuantidadeRegistrosAindaAbertos,
    SUM(C.Valor_prc) AS ValorBaseAindaAberto,
    MIN(C.Data_prc) AS MenorVencimentoAberto
FROM ContasReceber AS C
WHERE C.Empresa_prc = @Empresa AND C.Obra_prc = @Obra AND C.NumVend_prc = @Venda
  AND C.Tipo_prc = @Tipo AND C.NumParc_prc = @Parcela AND C.NumParcGer_prc = @ParcelaGeral;

-- 2. Todos os recebimentos dessa chave, sem somar/ocultar tipos ou eventos distintos.
-- Status_Rec e ParcType_Rec precisam de legenda propria: nao reutilizar Status_Prc.
SELECT R.Empresa_rec AS Empresa, R.Obra_Rec AS Obra, R.NumVend_Rec AS Venda,
    R.Tipo_Rec AS TipoParcela, R.NumParc_Rec AS NumeroParcela,
    R.NumParcGer_Rec AS NumeroGeralParcela, R.NumReceb_Rec AS NumeroRecebimento,
    R.ParcType_Rec AS TipoRecebimentoUAU, R.Status_Rec AS StatusRecebimentoUAU,
    R.Data_Rec AS DataRecebimentoUAU, R.DataVenci_Rec AS VencimentoOriginal,
    R.Cliente_Rec AS CodCliente, R.User_Rec AS UsuarioRegistroUAU,
    R.Valor_Rec, R.ValorConf_Rec,
    R.VlMulta_Rec, R.VlMultaConf_Rec, R.VlJuros_Rec, R.VlJurosConf_Rec,
    R.VlCorrecao_Rec, R.VlCorrecaoConf_Rec,
    R.VlCorrecaoAtr_Rec, R.VlCorrecaoAtrConf_Rec,
    R.VlJurosParc_Rec, R.VlJurosParcConf_Rec,
    R.VlAcres_Rec, R.VlAcresConf_Rec,
    R.VlTaxaBol_Rec, R.VlTaxaBolConf_Rec,
    R.VlDesconto_Rec, R.VlDescontoConf_Rec
FROM Recebidas AS R
WHERE R.Empresa_rec = @Empresa AND R.Obra_Rec = @Obra AND R.NumVend_Rec = @Venda
  AND R.Tipo_Rec = @Tipo AND R.NumParc_Rec = @Parcela AND R.NumParcGer_Rec = @ParcelaGeral
ORDER BY R.Data_Rec, R.NumReceb_Rec, R.ParcType_Rec;

-- 3. Contrato: futura = aberta sem atraso; nao confundir regularizacao com quitacao.
SELECT COUNT_BIG(*) AS QuantidadeParcelasAbertasContrato,
    SUM(CASE WHEN C.Valor_prc > 0 AND C.Data_prc < CAST(GETDATE() AS date)
        THEN CAST(1 AS bigint) ELSE 0 END) AS ParcelasVencidasComValorPositivo,
    SUM(C.Valor_prc) AS ValorBaseAbertoContrato,
    MIN(CASE WHEN C.Valor_prc > 0 THEN C.Data_prc END) AS ProximoOuMaisAntigoVencimento
FROM ContasReceber AS C
WHERE C.Empresa_prc = @Empresa AND C.Obra_prc = @Obra AND C.NumVend_prc = @Venda;

-- 4. Legendas nativas dos recebimentos. Zero linhas pode significar falta de descricao/permissao.
SELECT S.name AS Esquema, T.name AS Tabela, C.name AS Coluna,
    TY.name AS TipoSQL, EP.name AS Propriedade,
    CAST(EP.value AS nvarchar(4000)) AS DescricaoNoBanco
FROM sys.tables AS T
INNER JOIN sys.schemas AS S ON S.schema_id = T.schema_id
INNER JOIN sys.columns AS C ON C.object_id = T.object_id
INNER JOIN sys.types AS TY ON TY.user_type_id = C.user_type_id
LEFT JOIN sys.extended_properties AS EP
    ON EP.class = 1 AND EP.major_id = T.object_id AND EP.minor_id = C.column_id
WHERE T.name = 'Recebidas'
  AND C.name IN ('Status_Rec', 'ParcType_Rec', 'NumReceb_Rec', 'Valor_Rec', 'ValorConf_Rec')
ORDER BY S.name, C.column_id, EP.name;

-- A consulta principal vazia NAO basta para declarar pagamento. Confrontar esta
-- evidencia com recebimento real e eventual desdobramento/renegociacao/estorno.
