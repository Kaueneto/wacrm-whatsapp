# Painel de cobrança — gráficos e métricas

Planejamento de 25/11/2026, a partir das três capturas do Clickmenos fornecidas
pelo responsável. Complementa [carteira e régua](carteira-regua-cobranca.md).
É especificação de produto; não implementa gráficos nem atribui significado aos
dados internos da ferramenta de referência além do que aparece nas capturas.

## Estrutura proposta

Filtros por organização autorizada, empresa, obra/empreendimento, período, equipe,
responsável, régua e situação operacional. Campanha é filtro adicional de ações e
resultados associados, sem condicionar a existência da carteira.

Separar **posição da carteira em uma data** de **eventos ocorridos no período**.
Exibir filtros efetivos, unidade de contagem, data da posição, última sincronização
bem-sucedida e eventual ausência de cobertura histórica. Um filtro indisponível
para certa métrica deve ser explicitado, sem produzir falsa comparação.

## Referências recebidas e melhorias propostas

| Referência | Proposta para OCTA | Pergunta atendida |
| --- | --- | --- |
| Status de cobrança em rosca | Barras por situação operacional, com quantidade e saldo selecionáveis | Onde está concentrado o trabalho? |
| Faixa de atraso | Barras horizontais ordenadas, alternando contratos, clientes e valor, com denominador explícito | Quanto devemos priorizar em cada faixa? |
| Régua de cobrança | Distribuição por etapa e transições ao longo do período | Os contratos estão regularizando ou envelhecendo? |
| Recuperação mensal | Recebimentos confirmados e tendência do saldo vencido, em séries separadas e identificadas | O que entrou e como evoluiu a exposição? |
| Funil da operação | Conversões por população definida e caminhos observados, com pendências e tempo em cada passo | Onde a operação perde continuidade? |
| Saúde da fila | Sem responsável, sem próxima ação, retorno vencido, SLA excedido e antiguidade da espera | O que precisa de ação agora? |
| Envios por canal | Envios, entregas, respostas e falhas; automação e humano separados | O contato chegou e gerou interação? |
| Eventos por usuário | Atendimentos/tarefas, promessas e conclusões, combinados com carga e SLA | Como a equipe está trabalhando? |

Não depender de cor para distinguir situações: rótulos, valores, legendas e tabela
acessível. Manter cores consistentes entre painel, Kanban e trilha. Ao clicar em
uma barra ou indicador, abrir a lista correspondente com os mesmos filtros, e dali
o contrato/trilha. Nomes longos não devem esconder os valores ou deformar o layout.

## Indicadores principais

- Principal vencido e valor atualizado vencido, separados e datados.
- Contratos e clientes inadimplentes, sem duplicar por número de parcelas/atendimentos.
- Recebimentos confirmados de dívidas acompanhadas no período, separando principal
  e encargos quando o ERP fornecer a decomposição necessária.
- Regularizações confirmadas, novas entradas em atraso e reincidências.
- Promessas ativas, em tolerância de baixa, cumpridas e não cumpridas.
- Casos sem responsável/próxima ação e retornos vencidos.
- Elegíveis para jurídico e efetivamente transferidos, em medidas distintas.

Todos os números precisam de definição, unidade, escopo e possibilidade de abrir
os registros componentes. Valor desconhecido ou consulta falha não aparece como zero.

## Gráficos adicionais de maior utilidade

1. **Evolução do saldo vencido:** posição diária e conciliação das variações por
   novos vencimentos, recebimentos, renegociações, estornos, cancelamentos e ajustes.
   Variação monetária sozinha não identifica pagamento, pois há encargos e reajustes.
2. **Transição das faixas:** quantidade e saldo que avançaram, recuaram ou foram
   regularizados entre duas posições comparáveis. Separar contratos novos e saídas.
3. **Agenda de promessas:** valores e compromissos por vencimento; destacar espera
   de baixa antes de classificar descumprimento. Mostrar cobertura dos compromissos.
4. **Empreendimento por faixa de atraso:** matriz com empresa/obra, quantidade e
   saldo, permitindo identificar concentração sem misturar regras diferentes.
5. **Carga por equipe:** casos ativos, retornos vencidos, tempos medianos e percentil
   90, cumprimento do SLA e promessas acompanhadas. Volume não é nota de qualidade.

## Definições que evitam indicadores enganosos

### Recuperação

Não adotar automaticamente a fórmula visível na referência, que mistura recebimento
do período com saldo em atraso de hoje. Esses grupos podem mudar por novas dívidas,
renegociações e recortes diferentes.

Proposta para uma taxa comparável: fixar as parcelas vencidas e o principal aberto
no início de um período; medir o principal efetivamente recebido e alocado a essas
obrigações durante o período, dividido pelo principal de abertura da mesma população.
Exige identificadores e alocação financeira suficientes no ERP. Encargos, entradas
posteriores, renegociações, cancelamentos e estornos devem ficar explícitos.
Denominador zero produz taxa não aplicável. Se a alocação não for confiável,
apresentar valores e cobertura, sem fabricar uma taxa.

Comparar mês parcial com o mesmo trecho do período anterior, ou marcar claramente
que um deles está incompleto. Não comparar silenciosamente 25 dias com um mês inteiro.

### Operação e produtividade

Atendimentos abertos e concluídos são estados/eventos que não formam necessariamente
etapas aninhadas de um funil. Um contrato pode pagar sem promessa e ter vários
atendimentos; um cliente pode ter vários contratos. Definir a entidade de cada
conversão e admitir caminhos diretos, evitando percentuais com bases incompatíveis.

Separar automação de trabalho humano. Guardar autor, responsável no momento do
evento, departamento e transferências. Não atribuir causalmente todo pagamento ao
último atendente ou última mensagem; mostrar associação e janela usadas.

### Resultado do contato

Aceite pelo provedor, entrega, leitura disponível, resposta e pagamento confirmado
são eventos diferentes. Ausência de leitura não comprova falta de leitura. Emissão
de boleto não equivale a pagamento. Promessa/acordo não equivale a valor recuperado.

## Dependências e sequência

Primeiro validar dados e definições com a equipe, depois entregar posição atual,
faixas, evolução financeira e agenda de promessas. Acrescentar produtividade e SLA
com os eventos necessários já sendo registrados. Avaliação pelo cliente/supervisor
é um indicador separado e depende da modalidade escolhida.

A extração retroativa do ERP pode preencher parte do histórico financeiro;
transferências e ações que nunca foram registradas não devem ser reconstruídas
como fatos. Gráficos antigos precisam indicar início e limites da cobertura.
