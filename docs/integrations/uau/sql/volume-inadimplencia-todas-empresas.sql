-- DIAGNOSTICO DE VOLUME: executar inteiro no SQL Server do UAU.
-- Apenas leitura. Uma linha de resultado; nao transfere detalhes dos clientes.
-- Todas as empresas/obras visiveis para o usuario SQL que executar.
-- Criterio: vencimento ORIGINAL anterior a hoje e Valor_prc > 0.
-- Contagem bruta: inclui canceladas/distratadas se ainda houver parcelas nessas condicoes.
-- Nao equivale a publico elegivel para cobranca. Nao altera o banco nem envia mensagens.
-- Pode exigir leitura significativa de ContasReceber; avaliar execucao fora do pico.

SET NOCOUNT ON;
DECLARE @Inicio datetime = GETDATE();
DECLARE @Hoje date = CAST(@Inicio AS date);

;WITH ContratosVencidos AS (
    SELECT C.Empresa_prc AS Empresa, C.Obra_prc AS Obra, C.NumVend_prc AS Venda,
        COUNT_BIG(*) AS QuantidadeParcelas,
        MIN(C.Data_prc) AS VencimentoMaisAntigo
    FROM ContasReceber AS C
    WHERE C.Data_prc < @Hoje
      AND C.Valor_prc > 0
    GROUP BY C.Empresa_prc, C.Obra_prc, C.NumVend_prc
)
SELECT @Hoje AS DataReferenciaServidorUAU,
    COALESCE(SUM(QuantidadeParcelas), CAST(0 AS bigint)) AS TotalParcelasVencidasBruto,
    COUNT_BIG(*) AS TotalContratosComParcelasVencidas,
    COUNT(DISTINCT Empresa) AS TotalEmpresasComParcelasVencidas,
    MIN(VencimentoMaisAntigo) AS VencimentoMaisAntigo,
    @Inicio AS InicioConsultaServidorUAU
FROM ContratosVencidos;

-- Para tempo/leituras da consulta, o DBA pode usar as estatisticas da ferramenta
-- ou habilitar SET STATISTICS TIME ON e SET STATISTICS IO ON na propria sessao.
-- Nao extrapolar o tempo observado no piloto de um contrato para a base inteira.
