# Emissão de boletos UAU — conferência da documentação

Consulta realizada em 25/11/2026, somente em leitura. O Swagger 1.0 da conexão
instalada foi obtido; não foram emitidos, alterados, excluídos ou enviados boletos.
Nenhuma credencial, URL privada ou dado financeiro de cliente foi incluído neste documento.

## Endpoint e usuário

Endpoint encontrado para parcelas de vendas:
`POST /api/v{version}/Venda/GerarBoletoBancario`.

O modelo `UAUApi.Models.Venda.GerarBoletoBancarioRequest` e seu modelo aninhado
`UAUApi.Models.Venda.ParcelasBoleto` não possuem campo para escolher o login de
quem emite. A operação recebe token de usuário e token de integração em cabeçalhos
separados. A documentação exige que o usuário autenticado tenha permissão de
inclusão no programa `VEBOLETOAVULSO`.

O CRM hoje autentica pelo login/senha configurados em `uau_connections` e reutiliza
a sessão dessa conexão. Preencher o login UAU no perfil de um atendente não muda
essa autenticação. Portanto, no desenho atual, a emissão seria executada no contexto
do usuário autenticado da integração; não há parâmetro documentado que permita
substituí-lo pelo login salvo no perfil.

Isso não prova que a API obrigue toda integração a usar um único usuário para sempre:
a autenticação UAU aceita credenciais de usuário. Execução nominal exigiria avaliar
sessão/autenticação por usuário e permissões suportadas pela instalação, ou outro
recurso documentado pelo fornecedor. Não presumir delegação de identidade nem usar
o login em um campo inventado. A atribuição exata no log/cadastro do UAU ainda deve
ser conferida em homologação autorizada; o Swagger não prova a persistência da auditoria.

Independentemente do usuário técnico, a futura plataforma deve registrar seu autor
real: usuário do CRM, contrato, parcelas, solicitação, resultado e identificadores
do boleto, além da identidade técnica usada. Separar geração e envio ao cliente.
Auditoria local não altera o responsável gravado no ERP.

## Parâmetros conferidos

Obrigatórios no pedido: `parcelas` e `data_calculo`.

Obrigatórios em cada parcela: `Empresa_reaj`, `Obra_reaj`, `NumVenda_reaj`,
`NumParc_reaj`, `Tipo_reaj` e `NumParcGer_reaj`. Há desconto opcional em
`ValorDescAnt_reaj`.

As demais opções incluem antecipação, reajuste, agrupamento, padrão de cobrança,
boleto parcial, resíduo, taxa e comportamentos de exclusão/reaproveitamento.
Implementação futura deve manter validações, conferir boletos já existentes e
evitar geração ou exclusão duplicada em repetição/falha. A documentação de
reaproveitamento prevê possíveis alterações de vencimento/valor; essa opção
necessita validação específica com a operação e o banco, não é apenas download.

Também encontrados:

- `Venda/ConsultarParcelasDaVenda`: consulta das parcelas e validações para boleto.
- `Proposta/GerarBoleto`: emissão no contexto de proposta, diferente da venda.

Consulta/reimpressão de boleto existente não deve ser confundida com nova emissão.
Escolher o fluxo conforme o caso de uso validado.

## Referências

- Swagger 1.0 da instalação: rota e modelos inspecionados em 25/11/2026.
- [Integração UauWeb com Sites de Clientes — Globaltec](https://ajuda.globaltec.com.br/virtuau/integracao-uauweb-com-sites-de-clientes-para-integracao-utilizando-a-uauapi-api-rest-clique-aqui/): autenticação e fluxo de geração. A seção pública inclui exemplos legados; o formato REST instalado prevalece para nomes de campos.
