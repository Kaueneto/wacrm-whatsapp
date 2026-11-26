-- RASCUNHO PARA HOMOLOGACAO: nao cadastrado/executado no UAU.
-- Parametro: <EmpresaObra>.
-- Sem filtro de data, status, parcelas ou banco: posicao das fontes de vendas.
-- Preservar a origem e conflitos; nao somar duplicatas da mesma venda.
-- A presenca em VendasRecebidas nao comprova, sozinha, quitacao ou venda ativa.

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
FROM FontesVenda AS F
WHERE EXISTS (
    SELECT 1
    FROM fn_ListEmpObr(<EmpresaObra>, ',') AS Escopo
    WHERE Escopo.Empresa = F.CodEmpresa
      AND Escopo.Obra = F.CodObra
)
ORDER BY F.CodEmpresa, F.CodObra, F.Venda, F.OrigemVenda;
