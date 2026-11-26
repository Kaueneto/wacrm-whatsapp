-- RASCUNHO PARA HOMOLOGACAO: nao cadastrado/executado no UAU.
-- Parametro: <EmpresaObra>.
-- Sem filtro por aprovacao, venda ou periodo, para nao esconder bloqueios antigos.
-- Preservar registros nao aprovados e inconsistencias para reconciliacao.
-- Estado/cancelamento da venda e coletado separadamente em carteira-vendas.sql.

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
FROM VendaDistrato AS D
WHERE EXISTS (
    SELECT 1
    FROM fn_ListEmpObr(<EmpresaObra>, ',') AS Escopo
    WHERE Escopo.Empresa = D.Empresa_vdd
      AND Escopo.Obra = D.Obra_vdd
)
ORDER BY
    D.Empresa_vdd, D.Obra_vdd, D.NumVend_vdd,
    D.DataCad_vdd, D.DataAprov_vdd, D.StatusAprov_vdd;
