# Homologação de duas consultas para sincronização

## Cadastro no UAU

- `sincronizacao-01-inadimplencia.sql`: uma linha por contrato com parcela vencida no escopo escolhido. Parametrizada por `EmpresaObra`, `MinimoDiasAtraso`, `Pagina` e `TamanhoPagina`.
- `sincronizacao-02-conciliacao.sql`: uma linha por contrato solicitado, mesmo quando não há parcelas abertas nem recebimentos atuais. Reúne abertas (inclusive futuras), recebimentos, distratos e manutenções. Parâmetros `EmpresaObra` e `ContratosXml`.
- `teste-sincronizacao-900-00001.sql`: as mesmas duas consultas, já preenchidas para empresa 900, obra 00001, primeira página com 100 contratos; conciliação da venda 1.

No piloto, o escopo é `'900|00001'`, atraso mínimo 1 e página 1.
Na plataforma, paginação, atraso e lista de contratos serão preenchidos pelo sistema.
A entrada da lista usa XML; não requer OPENJSON nem mudança de compatibilidade do banco.
As coleções de saída continuam JSON, com `COALESCE(..., N'[]')` para ausência de registros.

Cadastrar as duas SQLs como consultas personalizadas e informar os códigos gerados.
Esta etapa é de homologação: não libera envios nem confirma pagamento automaticamente.
Os rascunhos antigos em quatro consultas foram substituídos por este modelo para o novo fluxo.

## Retorno observado em 26/11/2026 às 23:53

Resultado fornecido pelo responsável após executar o piloto no SSMS:

- Inadimplência: nenhuma linha no escopo consultado.
- Conciliação: contrato `900_00001_1` localizado, uma fonte de venda e um cliente nas fontes.
- Data de cancelamento: 26/11/2026.
- Distrato com status 1 (aprovado), cadastro e aprovação em 26/11/2026.
- Parcelas abertas e recebimentos retornaram SQL NULL. Os arquivos foram atualizados para padronizar como `[]`; o retorno atualizado ainda precisa ser conferido no banco.
- Manutenções com tipos 4, 4, 13 e 0. Tipo 0 corresponde a cancelar venda no mapeamento fornecido. Tipo 13 ainda não possui descrição validada e permanece como código original, sem inferir seu significado.

Este caso confirma que a conciliação consegue encontrar o contrato distratado mesmo
sem linhas na consulta de inadimplência. O tratamento correto é registrar o distrato,
preservar o histórico e bloquear cobranças desse contrato; não classificar como
pagamento nem acrescentar recuperação financeira. Não há conclusão de que nunca
houve pagamento: os recebimentos anteriores dos testes foram estornados.

O piloto não homologa sozinho pagamento integral, parcial, estorno e renegociação
nas novas SQLs. A sintaxe atualizada foi conferida com o parser oficial T-SQL 2016
instalado com o SSMS; isso não substitui execução, avaliação de plano ou teste da API.

## Reversão do distrato observada em 26/11/2026 às 23:57

Depois de desfazer o distrato da venda piloto, o responsável forneceu os dois resultados:

| Evidência | Resultado |
| --- | --- |
| Chave do contrato | `900_00001_1`, preservada |
| Cancelamento atual | `DataCancelamentoEncontrada = NULL` |
| Distratos atuais | `[]` |
| Parcelas abertas na conciliação | 55 chaves distintas, sem duplicidade na amostra |
| Principal total aberto | R$ 168.485,68 |
| Parcelas vencidas na referência de 26/11 | 1, principal de R$ 314,43, vencimento original 18/11/2026 |
| Demais parcelas abertas | 54, principal de R$ 168.171,25 |
| Próxima parcela | Tipo E, número 51 / geral 55, R$ 345,57 em 28/11/2026 |
| Recebimentos atuais | `[]` |
| Tipos de manutenção preservados | 4, 4, 13; o tipo 0 anterior deixou de aparecer |

A consulta de inadimplência retornou apenas a parcela E / 1 / 1 de R$ 314,43.
A conciliação preservou também o saldo futuro de R$ 345,57 e as demais parcelas.
Essas duas parcelas iniciais somam os R$ 660,00 do principal dos testes anteriores,
mas não estão ambas vencidas na referência de 26/11.

Neste caso, a reversão retirou evidências atuais de cancelamento/distrato e fez a
parcela vencida reaparecer. A integração deve registrar essa mudança, preservar o
evento anterior de distrato no próprio histórico e reavaliar o bloqueio atual;
não manter bloqueio eterno por ter observado um distrato em uma execução anterior.
O tipo histórico 13 segue sem descrição homologada e não deve ser interpretado
como cancelamento, pagamento ou reativação por si só.

As coleções vazias agora retornaram `[]`, confirmando o ajuste de formato no SSMS.
Ainda falta a validação das consultas cadastradas via API e dos outros cenários nas
novas SQLs. Não houve envio, baixa ou alteração no UAU pela plataforma nesta análise.
