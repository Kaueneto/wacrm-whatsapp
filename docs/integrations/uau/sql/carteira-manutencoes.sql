-- RASCUNHO PARA HOMOLOGACAO: nao cadastrado/executado no UAU.
-- Parametros: <EmpresaObra>, <DataInicio>, <DataFimExclusivo>.
-- Historico de eventos; NAO representa o estado vigente da venda.
-- Sem restricao fixa de tipo: preservar cancelamentos, simulacoes e pendencias.
-- Os nomes abaixo reproduzem os tipos apresentados na consulta 20.

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
FROM VendaHist AS H
WHERE EXISTS (
    SELECT 1
    FROM fn_ListEmpObr(<EmpresaObra>, ',') AS Escopo
    WHERE Escopo.Empresa = H.Empresa_vhist
      AND Escopo.Obra = H.Obra_vhist
)
  AND H.DataMnt_vhist >= CAST(<DataInicio> AS datetime2)
  AND H.DataMnt_vhist < CAST(<DataFimExclusivo> AS datetime2)
ORDER BY
    H.Empresa_vhist, H.Obra_vhist, H.NumVend_vhist,
    H.DataMnt_vhist, H.Num_vhist;
