# Primeira interface da carteira de cobrança

Branch: `feature/carteira-cobranca`. Rota: `/collections`.
Acesso inicial: administradores e proprietários, pelo menu Relacionamentos → Cobrança.

## Disponível nesta versão

- Quadro por faixas de atraso, lista, busca e filtros de empresa e situação operacional.
- Contrato em painel lateral, com identificadores, faixa financeira e trilha ilustrativa.
- Exemplos fictícios identificados por aviso. O modo de carteira real apresenta estado vazio; não representa uma consulta ao UAU.
- Editor da régua padrão da organização. Negociação e promessa aparecem como situações operacionais, sem substituir a faixa financeira.
- Preparação de códigos de consultas, tipo padrão/personalizado, descoberta de parâmetros pela integração UAU existente, horários diários, fuso, atraso mínimo e exclusões de empresas.
- Rascunho compartilhado entre administradores da organização, persistido em `collection_portfolio_settings` com RLS. As migrations 106 e 107 foram aplicadas no banco configurado em `.env.local` nesta implantação; a 107 preserva o cadastro ao aceitar convite para outra organização.
- A mudança de organização remonta a interface e cancela a leitura pendente; os exemplos não são importados nem gravados como contratos reais.
- Configuração simplificada para duas consultas: inadimplência e conciliação. Rascunhos v1 são convertidos para v2 sem reaproveitar uma consulta antiga de recebimentos como se fosse conciliação.
- Ação **Validar consultas** na aba Sincronização: consulta dados reais e apresenta o resumo da primeira página de inadimplência e de um contrato piloto. Paginação, atraso mínimo e XML de contratos são preenchidos pelo servidor. Esse teste não importa dados financeiros nem altera o UAU.

## Próxima etapa: dados reais

Salvar o rascunho não executa consultas, cria jobs ou dispara mensagens.
O estado do cadastro é limitado a `draft`, inclusive por restrição no banco.
Ainda precisam ser implementados:

1. Cadastro das SQLs no UAU concluído pelo responsável: 144 (inadimplência) e 145 (conciliação), personalizadas. A validação de leitura via API do piloto passou em 27/11/2026; ampliar a homologação dos cenários financeiros continua pendente. A interface não cadastra SQL no ERP.
2. Mapeamento e validação das colunas de carteira, recebimentos, distratos e manutenção.
3. Armazenamento dos contratos, parcelas, recebimentos, mudanças de estado e posições históricas.
4. Worker com sincronização manual e horários configurados, exclusão mútua e histórico de execuções.
5. Conciliação de parcial, estorno, renegociação, distrato e desaparecimento de parcela, conforme os testes documentados da empresa 900.
6. Réguas por empresa/obra, vínculo com categorias UAU, responsabilidade da equipe e promessas reais.
7. Indicadores históricos e gráficos. Os indicadores atuais são calculados apenas sobre o recorte dos exemplos.

Os exemplos não são evidência de recuperação nem de ações realizadas. Não há ações
de envio ou movimentação manual dos cartões nesta prévia. A trilha real será baseada
em eventos persistidos e não em uma reconstrução inventada das etapas anteriores.

## Validação

- Testes de configuração, limites das faixas, API e isolamento PostgreSQL/RLS.
- Suíte completa: `npm test -- --maxWorkers=2`, 215 arquivos e 2.168 testes aprovados.
- TypeScript, ESLint dos arquivos alterados e `git diff --check`.
- Página aberta no navegador local autenticado; quadro e entrada na navegação conferidos visualmente.

## Validação real de 27/11/2026

Configuração salva como rascunho exclusivamente na organização vinculada ao piloto
21886, com autoria do proprietário administrativo conferido na sessão. Códigos 144
e 145, tipo personalizada e escopo `'900|00001'`. Os valores não foram fixados como
padrão global do produto. Horários permanecem apenas como preparação, sem jobs ativos.

A API confirmou os quatro parâmetros da 144 e os dois da 145, inclusive `ContratosXml`
como texto. A 144 retornou uma parcela vencida com principal de R$ 314,43. A 145 retornou
55 parcelas abertas, uma vencida e principal total de R$ 168.485,68, com zero recebimentos
e distratos atuais e três manutenções. O total da conciliação inclui parcelas futuras;
não deve ser somado ao valor da inadimplência nem classificado todo como vencido.

Validação local desta alteração: 36 testes em seis arquivos aprovados, TypeScript,
ESLint e diff sem erros. A chamada real foi somente de leitura; a única gravação foi
o rascunho das preferências na plataforma. A importação permanente e o worker continuam
pendentes e não são simulados pelo botão de validação.
