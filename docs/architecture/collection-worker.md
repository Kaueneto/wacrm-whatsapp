# Sincronização automática da carteira UAU

A Sincronização tem duas abas. **Configuração** reúne escopo, exclusões, atraso mínimo e consultas; **Agendamento** define frequência, data inicial, fuso e de 1 a 12 horários por dia programado. O botão no topo salva ambas. Configurações antigas permanecem em modo manual.

Para disponibilizar a execução automática:

1. Aplique `supabase/migrations/110_collection_sync_schedule.sql` após as migrations 106 e 108.
2. Configure as duas consultas UAU e salve o agendamento habilitado.
3. Execute `npm run worker:collections` em um processo permanente ou use o serviço `collection-worker` do Docker Compose. `npm run worker:collections:check` verifica apenas a estrutura do banco, sem executar importações.

O worker usa as mesmas variáveis do servidor: `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` e `ENCRYPTION_KEY`. Não depende de a página estar aberta. Não executa disparos de mensagens.

As frequências seguem o calendário no fuso configurado: diária, a cada N dias ancorados na data inicial, dias específicos da semana e dia do mês. Dia 1 corresponde ao início do mês; meses sem um dia mensal escolhido são pulados. Ocorrências perdidas não são reproduzidas em massa. Uma execução concluída avança para o próximo horário futuro; falhas são registradas em `schedule_error` e tentadas novamente após cinco minutos.

A função de claim é exclusiva do serviço, usa bloqueio de linha e lease para evitar disputa entre workers. Uma importação já ativa impede outra. O worker não sobrescreve a próxima data de uma configuração alterada durante o processamento. A aplicação final continua atômica e exige a mesma versão da configuração e da conexão UAU.

No ambiente local, apenas `npm run dev` não inicia o worker. A interface permite salvar os parâmetros, mas a execução automática exige a migration e o processo acima.

## Valores calculados pelo UAU

Após a conciliação SQL, cada venda com parcelas abertas é enriquecida pela API `Venda/BuscarParcelasAReceber`, com `valor_presente: false` e a mesma data de referência da SQL. A execução consulta até três vendas por vez e renova o lease entre os grupos. Não é necessário alterar as duas consultas SQL ou aplicar nova migration: os totais são armazenados em `data.calculated` no JSON da posição.

O principal base permanece intacto para conciliar recebimentos. O principal com reajuste soma `Valor_prc` e `vlrCorrecao`; não soma novamente `vlrCorrecaoEmb`. O total a pagar usa `ValorReaj` diretamente, sem acrescentar componentes novamente. Correção por atraso (`vlrCorrecaoAtra`) é exibida separadamente no detalhe. A carteira mostra principal com reajuste, total vencido com encargos e saldo atualizado de vencidas e futuras; as análises continuam identificadas como principal base.

Os conjuntos de parcelas, vencimentos e valores base da SQL e da API devem corresponder. Resposta incompleta, duplicada, divergente, sem o componente de reajuste ou falha da API interrompe a execução sem publicar dados parciais. Isso também evita combinar uma posição SQL anterior a uma baixa com uma resposta posterior à baixa. Nesse caso, repita a sincronização. Os valores calculados representam a data da sincronização; abrir o detalhe pode consultar uma posição mais recente.

Posições antigas continuam disponíveis como principal base, com orientação para reimportar. O resumo não soma valores base de contratos antigos a valores atualizados de contratos novos como se fossem um total calculado completo.
