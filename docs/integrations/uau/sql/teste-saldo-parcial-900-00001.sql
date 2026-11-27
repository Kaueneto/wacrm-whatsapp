-- Localizar o saldo apos a baixa parcial. Executar inteiro no SQL Server UAU.
-- Somente leitura; nao presume que o saldo preserva os identificadores anteriores.
SET NOCOUNT ON;
DECLARE @Empresa int = 900;
DECLARE @Obra varchar(5) = '00001';
DECLARE @Venda int = 1;
DECLARE @Hoje date = CAST(GETDATE() AS date);

-- Todas as abertas da venda, inclusive futuras e de outros tipos/numero geral.
SELECT C.Empresa_prc AS Empresa, C.Obra_prc AS Obra, C.NumVend_prc AS Venda,
    C.Tipo_prc AS TipoParcela, C.NumParc_prc AS NumeroParcela,
    C.NumParcGer_prc AS NumeroGeralParcela,
    C.Origem_prc AS OrigemParcelaUAU,
    C.Cliente_prc AS CodCliente,
    C.Data_prc AS VencimentoOriginalAtualUAU, C.DataPror_prc AS Prorrogacao,
    C.DataCad_prc AS CadastroParcelaUAU,
    C.Valor_prc AS ValorBaseAindaAberto,
    C.Status_prc AS StatusParcelaUAU, C.Obs_prc AS ObservacaoParcela,
    CASE WHEN C.Data_prc < @Hoje AND C.Valor_prc > 0 THEN 1 ELSE 0 END AS VencidaHoje,
    CAST(C.Empresa_prc AS varchar(20)) + '_' + C.Obra_prc + '_'
        + CAST(C.NumVend_prc AS varchar(20)) + '_' + C.Tipo_prc + '_'
        + CAST(C.NumParc_prc AS varchar(20)) + '_'
        + CAST(C.NumParcGer_prc AS varchar(20)) AS ChaveParcela
FROM ContasReceber AS C
WHERE C.Empresa_prc = @Empresa AND C.Obra_prc = @Obra AND C.NumVend_prc = @Venda
ORDER BY C.Data_prc, C.Tipo_prc, C.NumParc_prc, C.NumParcGer_prc;

-- Todos os recebimentos da venda; inclui outros numeros para conferir o estorno.
SELECT R.Empresa_rec AS Empresa, R.Obra_rec AS Obra, R.NumVend_rec AS Venda,
    R.Tipo_rec AS TipoParcela, R.NumParc_rec AS NumeroParcela,
    R.NumParcGer_rec AS NumeroGeralParcela, R.NumReceb_rec AS NumeroRecebimento,
    R.OrigParc_rec AS OrigemParcelaUAU,
    R.Data_Rec AS DataRecebimentoUAU, R.DataVenci_rec AS VencimentoOriginalRecebimento,
    R.ParcType_rec AS TipoRecebimentoUAU, R.Status_rec AS StatusRecebimentoUAU,
    R.Valor_rec, R.ValorConf_rec,
    R.VlMulta_rec, R.VlMultaConf_rec,
    R.VlJuros_rec, R.VlJurosConf_rec,
    R.User_rec AS UsuarioRegistroUAU
FROM Recebidas AS R
WHERE R.Empresa_rec = @Empresa AND R.Obra_rec = @Obra AND R.NumVend_rec = @Venda
ORDER BY R.Data_rec, R.NumReceb_rec, R.Tipo_rec, R.NumParc_rec, R.NumParcGer_rec;

-- Origem_Prc/OrigParc_Rec sao evidencias, nao FK presumida. Obter sua descricao.
SELECT S.name AS Esquema, T.name AS Tabela, C.name AS Coluna,
    EP.name AS Propriedade, CAST(EP.value AS nvarchar(4000)) AS DescricaoNoBanco
FROM sys.tables AS T
INNER JOIN sys.schemas AS S ON S.schema_id = T.schema_id
INNER JOIN sys.columns AS C ON C.object_id = T.object_id
LEFT JOIN sys.extended_properties AS EP
    ON EP.class = 1 AND EP.major_id = T.object_id AND EP.minor_id = C.column_id
WHERE (T.name = 'ContasReceber' AND C.name IN ('Origem_Prc', 'Data_Prc', 'NumParcGer_Prc'))
   OR (T.name = 'Recebidas' AND C.name = 'OrigParc_Rec')
ORDER BY S.name, T.name, C.column_id, EP.name;
