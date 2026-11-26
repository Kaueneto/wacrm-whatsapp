-- RASCUNHO PARA HOMOLOGACAO: nao cadastrado/executado no UAU.
-- Parametro UAU: <EmpresaObra>, no formato aceito por fn_ListEmpObr.
-- Sem filtro por atraso: preservar parcelas abertas futuras e prorrogadas.
-- Valor_Prc e o valor base informado pelo ERP; nao equivale ao valor reajustado.
-- A chave candidata deve ser conferida na base antes de ser adotada como unica.
-- A presenca aqui nao autoriza cobranca: validar estado vigente da venda,
-- especialmente distrato/cancelamento, antes de enfileirar e enviar mensagens.

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
FROM ContasReceber AS C
WHERE EXISTS (
    SELECT 1
    FROM fn_ListEmpObr(<EmpresaObra>, ',') AS Escopo
    WHERE Escopo.Empresa = C.Empresa_prc
      AND Escopo.Obra = C.Obra_prc
)
ORDER BY
    C.Empresa_prc, C.Obra_prc, C.NumVend_prc,
    C.Data_prc, C.Tipo_prc, C.NumParc_prc, C.NumParcGer_prc;
