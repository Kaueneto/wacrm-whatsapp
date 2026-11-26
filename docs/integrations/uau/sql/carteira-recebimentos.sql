-- RASCUNHO PARA HOMOLOGACAO: nao cadastrado/executado no UAU.
-- Parametros: <EmpresaObra>, <DataInicio>, <DataFimExclusivo>.
-- Intervalo: DataInicio inclusiva, DataFimExclusivo exclusiva (com horario).
-- Sem joins de unidades/depositos, agregacao ou exclusao de bancos.
-- Nao classificar automaticamente toda linha como pagamento em dinheiro.
-- A semantica de ParcType_Rec, componentes *_Conf e estornos precisa ser validada.

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
FROM Recebidas AS R
WHERE EXISTS (
    SELECT 1
    FROM fn_ListEmpObr(<EmpresaObra>, ',') AS Escopo
    WHERE Escopo.Empresa = R.Empresa_rec
      AND Escopo.Obra = R.Obra_Rec
)
  AND R.Data_Rec >= CAST(<DataInicio> AS datetime2)
  AND R.Data_Rec < CAST(<DataFimExclusivo> AS datetime2)
ORDER BY
    R.Empresa_rec, R.Obra_Rec, R.NumVend_Rec, R.Data_Rec,
    R.NumReceb_Rec, R.Tipo_Rec, R.NumParc_Rec, R.NumParcGer_Rec, R.ParcType_Rec;
