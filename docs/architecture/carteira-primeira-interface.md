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

## Próxima etapa: dados reais

Salvar o rascunho não executa consultas, cria jobs ou dispara mensagens.
O estado do cadastro é limitado a `draft`, inclusive por restrição no banco.
Ainda precisam ser implementados:

1. Cadastro/homologação das consultas no UAU e definição dos códigos retornados. A interface consulta parâmetros de consultas existentes; não cadastra SQL no ERP.
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
