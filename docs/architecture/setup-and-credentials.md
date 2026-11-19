# Preparação local e credenciais

Complemento da Fase 0, em 17/11/2026. O projeto contém `.env.local.example`; não havia `.env.local` nem credenciais reais disponíveis. Não é possível confirmar seu banco remoto a partir deste checkout. Configurar ambiente não exige começar as alterações arquiteturais.

### Atualização — preparação do banco executada após o baseline

Com a conexão PostgreSQL fornecida localmente e autorização para preparar o banco, foi confirmado que o projeto configurado estava vazio (nenhuma tabela pública, usuário ou histórico de migrations). As **58 migrations existentes foram aplicadas com sucesso**, até a versão `060`, sem modificar os arquivos SQL.

Validação posterior: `supabase/ci/verify-schema.sql` passou; existem 37 tabelas públicas, todas com RLS habilitada; buckets `avatars`, `chat-media` e `flow-media` criados; trigger `on_auth_user_created` habilitado. Chaves pública e de servidor responderam HTTP 200 na consulta de existência de tabela. Isso não substitui testes de isolamento com usuários autenticados.

O servidor de desenvolvimento já existente responde HTTP 200 em `http://localhost:3000/signup` e `/login`. Cadastro por email está habilitado e exige confirmação de email. O próximo passo é o responsável criar seu usuário pela aplicação (recomendado) ou em Authentication → Users → Add user no painel Supabase. O trigger cria perfil e conta com papel owner; conferir esses vínculos após o cadastro. Nenhum usuário foi criado pelo agente, nenhum email foi enviado por ele e nenhum disparo WhatsApp foi feito.

Evidências sem credenciais: `baseline-logs/migrations-apply.log` e `baseline-logs/migrations-verify.log`. Os passos de aplicação de migrations mais abaixo ficam como referência para outros ambientes; não é necessário reaplicar manualmente o schema neste projeto.

## Endereços que vamos usar primeiro

**Configuração inicial: aplicação neste computador em `http://localhost:3000`, conectada ao projeto Supabase que você já criou na nuvem.** Não é necessário contratar domínio para abrir o CRM e testar login/interface. Neste guia, a porta padrão é 3000; a porta 3100 mencionada no diagnóstico foi usada somente no baseline.

| Uso | URL de exemplo | Onde usar |
|---|---|---|
| Abrir a plataforma neste computador | [http://localhost:3000](http://localhost:3000) | Navegador e `NEXT_PUBLIC_SITE_URL` |
| Cadastro inicial | [http://localhost:3000/signup](http://localhost:3000/signup) | Navegador, após conferir banco e ambiente |
| Login | [http://localhost:3000/login](http://localhost:3000/login) | Navegador |
| Painel | [http://localhost:3000/dashboard](http://localhost:3000/dashboard) | Navegador, após login |
| Configurações / integração WhatsApp | [http://localhost:3000/settings](http://localhost:3000/settings) | Navegador, como owner/admin |
| Retorno de autenticação | `http://localhost:3000/auth/callback` | Endpoint usado pelos links de email; não autentica ao abrir manualmente |
| Mesmo computador, por IP de loopback | [http://127.0.0.1:3000](http://127.0.0.1:3000) | Alternativa ao localhost; seguir o bloco de Auth correspondente abaixo |
| Outro dispositivo da mesma rede, opcional | `http://192.168.1.50:3000` | Exemplo fictício: substituir pelo IPv4 real do computador que executa o projeto |
| Backend Supabase na nuvem | `https://abcdefghijklmnopqrst.supabase.co` | Exemplo fictício: substituir pela Project URL do seu Supabase |
| Webhook local, para referência | `http://localhost:3000/api/whatsapp/webhook` | É a rota local; a Meta precisa da versão HTTPS pública via túnel |

`localhost` e `127.0.0.1` apontam para o próprio dispositivo. No celular, esses endereços apontam para o celular, não para este computador. Use **localhost de forma consistente no primeiro teste**: alternar entre ele, 127.0.0.1 e o IP da rede troca a origem do navegador e pode separar cookies/sessões do login.

O Supabase continua com sua URL HTTPS mesmo quando a interface está local. Não substituir `NEXT_PUBLIC_SUPABASE_URL` por localhost: isso só faria sentido com uma instância Supabase local instalada e configurada, que não é o cenário inicial deste guia.

## Links dos painéis de configuração

| Serviço | Acesso | Caminho depois de entrar |
|---|---|---|
| Supabase | [Abrir painel Supabase](https://supabase.com/dashboard) | Selecionar o projeto que você criou |
| URL do Supabase | Painel do projeto → Connect / Data API | Copiar a **Project URL**, no formato `https://<referencia-do-projeto>.supabase.co` |
| Chaves do Supabase | Painel do projeto → Settings → API Keys | Copiar chave pública e chave de servidor nos respectivos campos do env |
| Redirects de login | Painel do projeto → Authentication → URL Configuration | Preencher o bloco local abaixo |
| Tabelas / migrations | Painel do projeto → Table Editor / SQL Editor | Conferir o schema antes do primeiro cadastro |
| Aplicativo Meta | [Meta for Developers — aplicativos](https://developers.facebook.com/apps/) | Selecionar/criar app com WhatsApp; acessar configurações básicas e API Setup |
| Gestão empresarial Meta | [Meta Business Settings](https://business.facebook.com/settings/) | Selecionar portfólio; conferir contas WhatsApp, ativos e usuários do sistema |

Exemplos de URLs do painel Supabase, substituindo `SUA_REFERENCIA` pela referência do seu projeto (não é uma senha):

```text
https://supabase.com/dashboard/project/SUA_REFERENCIA
https://supabase.com/dashboard/project/SUA_REFERENCIA/settings/api-keys
https://supabase.com/dashboard/project/SUA_REFERENCIA/auth/url-configuration
```

Os links internos dos painéis podem mudar; se um deles redirecionar, entrar pelo painel principal e seguir o caminho da tabela. Referências oficiais: [chaves Supabase](https://supabase.com/docs/guides/getting-started/api-keys) e [URLs de redirecionamento](https://supabase.com/docs/guides/auth/redirect-urls).

## Exemplo de `.env.local` para o primeiro teste

Arquivo: `D:\dev\wacrm-whatsapp-zap\wacrm-whatsapp\.env.local`. Criar a partir do exemplo conforme o passo a passo mais abaixo. **Os valores `SUBSTITUA_...` e a referência de projeto abaixo são placeholders; precisam ser trocados.** Não copiar as credenciais fictícias usadas no build do baseline.

```dotenv
# Supabase hospedado: usar a URL e as chaves DO MESMO projeto.
NEXT_PUBLIC_SUPABASE_URL=https://abcdefghijklmnopqrst.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=SUBSTITUA_PELA_CHAVE_PUBLICA_DO_SUPABASE
SUPABASE_SERVICE_ROLE_KEY=SUBSTITUA_PELA_CHAVE_DE_SERVIDOR_DO_SUPABASE

# Gerar 32 bytes aleatórios em hex: exatamente 64 caracteres hexadecimais.
ENCRYPTION_KEY=SUBSTITUA_PELA_CHAVE_GERADA_LOCALMENTE

# Configuração local da interface.
NEXT_PUBLIC_SITE_URL=http://localhost:3000
NEXT_PUBLIC_APP_LOCALE=pt

# Preencher quando conectar o aplicativo oficial da Meta.
META_APP_SECRET=SUBSTITUA_PELO_APP_SECRET_DA_META
META_APP_ID=SUBSTITUA_PELO_APP_ID_DA_META
```

URL/chave pública do Supabase permitem começar a validar o acesso e o login. Completar os demais segredos antes de usar os recursos que dependem deles. O App ID não é secreto; o App Secret é. O token de envio WhatsApp será cadastrado dentro da plataforma.

Para gerar a chave de criptografia, no terminal local:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Após salvar o arquivo, iniciar o servidor com porta fixa para não mudar as URLs do guia:

```powershell
Set-Location -LiteralPath 'D:\dev\wacrm-whatsapp-zap\wacrm-whatsapp'
npm run dev -- --hostname localhost --port 3000
```

Esperar o servidor indicar que está pronto e abrir [o login local](http://localhost:3000/login). Se a porta estiver ocupada, encerrar o outro processo de desenvolvimento ou escolher outra porta e atualizar todas as URLs correspondentes. Alterações no env exigem reiniciar o servidor; builds de produção exigem rebuild para variáveis públicas.

## Supabase Auth: valores para copiar no painel

Para o primeiro teste neste computador, em **Authentication → URL Configuration**:

**Site URL:**

```text
http://localhost:3000
```

**Redirect URLs:** adicionar as duas entradas abaixo se desejar permitir também testes por loopback numérico. Para usar somente localhost, a primeira é suficiente.

```text
http://localhost:3000/**
http://127.0.0.1:3000/**
```

O `/**` é uma regra de correspondência de caminhos para desenvolvimento, não uma URL para abrir no navegador. O código pede retorno de cadastro para `http://localhost:3000/auth/callback?next=/dashboard` e recuperação de senha para `http://localhost:3000/auth/callback?next=/reset-password` quando o acesso começou em localhost. A origem acompanha o endereço usado para abrir a aplicação. Manter o fluxo no mesmo navegador e endereço até concluir o login. [Referência Supabase sobre redirects](https://supabase.com/docs/guides/auth/redirect-urls).

Se decidir usar **127.0.0.1 como endereço principal**, mudar `NEXT_PUBLIC_SITE_URL` e o Site URL do Supabase para `http://127.0.0.1:3000`, manter a entrada correspondente nos Redirect URLs e iniciar com `--hostname 127.0.0.1`. Não é necessário fazer essa troca no teste inicial.

## Acesso por IP da rede local, se precisar testar em outro dispositivo

Esta é uma etapa opcional, posterior ao teste em localhost. Descobrir o IPv4 da conexão Wi-Fi/Ethernet ativa com `ipconfig`. Exemplo: se o resultado real for `192.168.1.50`, os valores serão:

```text
Abrir no outro dispositivo: http://192.168.1.50:3000
NEXT_PUBLIC_SITE_URL:       http://192.168.1.50:3000
Supabase Site URL:          http://192.168.1.50:3000
Supabase Redirect URLs:     http://192.168.1.50:3000/**
```

Para escutar conexões da rede, iniciar com:

```powershell
npm run dev -- --hostname 0.0.0.0 --port 3000
```

`0.0.0.0` é o endereço de escuta, não o endereço a preencher no navegador, no env ou no Supabase. Os dispositivos precisam estar na mesma rede e o Firewall do Windows precisa permitir a conexão na porta 3000 na rede privada. Se houver bloqueio de origem do Next no desenvolvimento, adicionar o hostname/IP real em `ALLOWED_DEV_ORIGINS` (exemplo `192.168.1.50`, sem protocolo/porta) e reiniciar. O IP pode mudar ao reconectar a rede. Recursos do navegador que exigem contexto seguro, como gravação de áudio, podem precisar de HTTPS quando acessados por IP de rede.

## Meta: URL do webhook durante o desenvolvimento local

O CRM pode continuar rodando localmente. Para receber callbacks da Meta, expor a porta 3000 por um túnel HTTPS. Exemplo ilustrativo de endereço atribuído pelo túnel:

```text
URL pública do túnel: https://castel-teste-123.ngrok-free.app
Callback na Meta:    https://castel-teste-123.ngrok-free.app/api/whatsapp/webhook
Verify Token:        o mesmo segredo gerado e salvo em Configurações → WhatsApp
```

Esse hostname é fictício: usar o HTTPS realmente atribuído pelo túnel. Não cadastrar `http://localhost:3000`, `http://127.0.0.1:3000` ou IP privado como callback público da Meta. A confirmação GET e os eventos POST chegam à mesma rota de webhook, que já existe no código.

Se usar o túnel **apenas para webhook**, continuar acessando a interface por localhost e manter o env/Auth locais. Se abrir e autenticar a interface pelo túnel, adicionar também `https://<host-real-do-tunel>/**` aos Redirect URLs do Supabase; para usá-lo como endereço principal/convites, atualizar `NEXT_PUBLIC_SITE_URL` e Site URL. O `next.config.ts` já permite os padrões ngrok e trycloudflare listados nele; outros hosts podem exigir `ALLOWED_DEV_ORIGINS`. Não adicionar portas/protocolo nessa variável.

Configurar o callback e a assinatura de eventos da WABA conforme a [referência oficial da Meta](https://developers.facebook.com/docs/graph-api/reference/whats-app-business-account/subscribed_apps/). Um túnel permite receber eventos, mas não implementa o worker persistente nem comprova entrega de campanhas.

## O que preencher e onde

| Variável | Necessidade real no código | Como obter |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Navegador, Auth, servidor e admin | URL HTTPS do projeto no painel Supabase, seção Connect/Data API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Cliente público; RLS limita acesso | Settings → API Keys: chave pública publishable ou legado anon; o nome da variável existente deve permanecer |
| `SUPABASE_SERVICE_ROLE_KEY` | Webhook, engines e API pública; somente servidor | Settings → API Keys: chave secret ou legado service_role; conferir funcionamento no staging antes de adotar formato novo |
| `ENCRYPTION_KEY` | Criptografar/decriptar tokens Meta/IA | Gerar localmente 32 bytes aleatórios, codificados em **64 caracteres hexadecimais** |
| `META_APP_SECRET` | Validar assinatura de POSTs Meta | App no Meta for Developers → configurações básicas → App Secret; exige permissão administrativa |
| `NEXT_PUBLIC_SITE_URL` | URL canônica e links | Para local: `http://localhost:3000`; para homologação: domínio HTTPS público real |
| `NEXT_PUBLIC_APP_LOCALE` | Idioma compilado da UI | Definir `pt` para português brasileiro e reiniciar/rebuildar |
| `META_APP_ID` | Upload de amostras de templates com imagem e diagnóstico de assinatura da WABA | App ID nas configurações básicas do mesmo aplicativo Meta |
| `AUTOMATION_CRON_SECRET` | Só para drenagem de esperas/timeouts de automações/flows | Gerar outro segredo aleatório e configurar o agendador que chama os dois endpoints cron com Bearer; não cria scheduler de campanhas |
| `ALLOWED_INVITE_HOSTS` | Restrição opcional de hostname de convites | Lista definida pelo operador, sem esquema/porta |
| `ALLOWED_DEV_ORIGINS` | Túnel de desenvolvimento com hostname fora dos padrões já permitidos | Hostname do túnel; usada por `next.config.ts`, ausente do exemplo de env |
| `WHATSAPP_TEMPLATES_DRY_RUN` | Simula criação/edição de templates | Opcional `true`; **não simula envios de mensagens**, nem substitui Meta para testar campanhas |
| `AI_REQUEST_TIMEOUT_MS`, `AI_CONTEXT_MESSAGE_LIMIT`, `AI_PROVIDER_ALLOWED_PRIVATE_HOSTS` | Ajustes opcionais de IA | Manter defaults inicialmente; último só para provedor privado intencional |

Os nomes das variáveis públicas são os que este código lê. Não colocar service-role/secret, token Meta, App Secret ou chave de criptografia em variável `NEXT_PUBLIC_*`. Não é necessária senha do banco na aplicação. Senha/conexão de banco e credencial CLI são apenas para operação de migrations; não confundir com a chave service-role.

O Supabase distingue chaves públicas (publishable/anon) e privilegiadas (secret/service_role). O painel atual oferece formatos novos e legados; o uso de chave pública não substitui RLS. [Documentação oficial de chaves](https://supabase.com/docs/guides/getting-started/api-keys). Os clientes deste fork passam a chave ao SDK; a compatibilidade real com a opção escolhida permanece pendente de teste conectado.

## Dados Meta que ficam no formulário, não no env

Em **Configurações → WhatsApp**, como owner/admin:

| Campo | O que significa / obtenção |
|---|---|
| Phone Number ID | ID numérico do recurso de telefone em WhatsApp → API Setup ou WhatsApp Manager. Não é o telefone com DDI |
| WABA ID | ID da WhatsApp Business Account associada ao aplicativo/número, também disponível no setup/Manager. Não é o ID do portfólio empresarial |
| Access Token | Token de acesso com permissão sobre esses ativos. Temporário do painel serve para diagnóstico; para operação, gerar token de usuário do sistema com prazo/rotação conhecidos |
| Verify Token | Segredo aleatório escolhido por você; gravar no formulário e repetir exatamente no painel de webhook da Meta. Não é App Secret nem Access Token |
| PIN | PIN de seis dígitos para registro/verificação em duas etapas quando necessário; usar o PIN definido para esse número e seguir o diagnóstico do formulário |

O backend verifica vínculo WABA/número, pode registrar número e assinar o app na WABA ao salvar; salvar configuração não é apenas inserir texto no banco. Não usar número de produção sem revisar essa operação. `src/app/api/whatsapp/config/route.ts` criptografa access/verify tokens antes de persistir em `whatsapp_config`.

No Meta Business Settings, um administrador cria usuário do sistema, atribui aplicativo e WABA e gera o token para o app com `whatsapp_business_messaging` e `whatsapp_business_management`; operações de gestão do portfólio podem exigir `business_management`. Conferir permissões e validade no painel. [Geração oficial de tokens de usuário do sistema](https://developers.facebook.com/docs/business-management-apis/system-users/install-apps-and-generate-tokens).

O setup inicial oferece número de teste, IDs e token temporário; a coleção oficial Meta descreve esse fluxo. [WhatsApp Cloud API — Meta no Postman](https://www.postman.com/meta/whatsapp-business-platform/collection/wlk6lh4/whatsapp-cloud-api). Para operar com número próprio, concluir cadastro/verificação do número e requisitos mostrados no WhatsApp Manager (nome, conta empresarial e pagamento quando aplicável). Não presumir aprovação empresarial nem liberação de limites por ter criado um app.

## Próximos passos para abrir o CRM

1. **Conferir o banco antes de escrever nele.** No Supabase, verificar se existem `public.accounts`, `profiles`, `whatsapp_config`, `broadcasts`, `broadcast_recipients`, `message_templates`. Se apenas criou o projeto, o schema do WaCRM ainda pode estar ausente. Consultar o histórico `supabase_migrations.schema_migrations`, quando existente; ausência dessa tabela não prova banco vazio se houve SQL manual.
2. **Preparar migrations existentes em staging vazio.** Há 58 arquivos em `supabase/migrations`, de 001 a 060 com lacunas. Aplicar todos os arquivos existentes em ordem, sem inventar arquivos ausentes nem repetir somente 001. A cadeia inclui deduplicações, alterações de constraints e funções; em banco com dados é preciso revisar histórico/backup antes. Não executar `db reset` remoto. Esta fase não aplicou migrations ao seu projeto.
3. Para um projeto novo e confirmado vazio, um operador com Supabase CLI pode autenticar (`supabase login`), vincular (`supabase link --project-ref <referencia>`), inspecionar `supabase migration list`, revisar `supabase db push --dry-run` e só então executar `supabase db push`. A CLI não está instalada neste ambiente; comandos dependem de sua instalação/configuração. Executar `supabase/ci/verify-schema.sql` no projeto de homologação e revisar RLS com usuários/papéis reais. O workflow de migrations usa banco local descartável; não copiar seu reset para produção.
4. Conferir buckets/políticas criados pelas migrations, especialmente `avatars`, `flow-media` e `chat-media`, extensão vector e publicação Realtime. Não tornar buckets públicos para contornar erro de permissão. `supabase/config.toml` é configuração mínima de CI, não réplica do projeto hospedado.
5. Criar `.env.local` copiando o exemplo **apenas se ainda não existir**:

   ```powershell
   if (-not (Test-Path -LiteralPath .env.local)) {
     Copy-Item -LiteralPath .env.local.example -Destination .env.local
   }
   ```

   Preencher as chaves usando o painel/gerenciador de segredos local. Para gerar `ENCRYPTION_KEY`, executar e copiar a saída diretamente para o arquivo, sem enviar pelo chat:

   ```powershell
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

   Guardar backup seguro dessa chave: trocar seu valor impede decriptar tokens antigos. `.env.local` está ignorado pelo Git. Não usar os placeholders/zeros dos testes como segredos operacionais.
6. Em Supabase → Authentication → URL Configuration, configurar Site URL local e permitir `http://localhost:3000/**`. Habilitar o fluxo de email/senha e conferir confirmação de email. Usar o mesmo navegador que solicitou o email para completar PKCE. No deploy, cadastrar o domínio HTTPS correto. O comportamento do código está documentado em `docs/auth-emails.md`.
7. Executar `npm run dev`, abrir `http://localhost:3000/signup`, cadastrar usuário, confirmar email e entrar. Conferir conta/papel owner e páginas de contatos/configurações. Os triggers devem criar perfil/conta; se isso não ocorrer, verificar migrations/logs Auth em vez de editar papéis manualmente. Supabase URL e chave pública são suficientes para iniciar essa validação; Meta pode ser conectada depois. Service-role e criptografia são necessárias para os caminhos que as utilizam, não para renderizar qualquer página pública.
8. Criar/configurar app Meta com WhatsApp e começar pelo número de teste. Preencher os campos da integração no formulário. Usar os diagnósticos de conexão/registro, que consultam Meta, e sincronizar templates; esses passos não comprovam entrega de mensagens.
9. Publicar endpoint de staging ou usar túnel HTTPS para a porta local. Em Meta, callback: `https://<host>/api/whatsapp/webhook`, com o mesmo verify token já salvo. Assinar `messages` e eventos de templates utilizados pelo código quando disponíveis; conferir assinatura do app na WABA. Verificação de callback e assinatura WABA são verificações distintas. [Referência oficial de apps assinados na WABA](https://developers.facebook.com/docs/graph-api/reference/whats-app-business-account/subscribed_apps/).
10. Conferir logs: challenge 200, assinatura válida no POST, `phone_number_id` resolvido para conta correta. `localhost` não recebe callbacks públicos da Meta sem túnel/deploy. Mudança de hostname do túnel pode exigir atualizar callback e redirects Auth.

Até aqui é possível validar login, banco, interface e conexão oficial. Um teste de mensagem real, mesmo para número de teste, fica para etapa operacional expressamente autorizada: destinatário permitido, template aprovado, consentimento e acompanhamento dos webhooks. Nenhum envio foi feito neste baseline. **Não iniciar campanha empresarial para provar continuidade após fechar a aba:** esse comportamento ainda depende da Fase 1.

IA, UAU, Redis, MCP e API keys públicas do WaCRM não são pré-requisitos para a primeira abertura. IA é configurada por conta no painel; o MCP usa seu próprio `.env.example` (`WACRM_BASE_URL`, `WACRM_API_KEY`) e é leitura por padrão. Não habilitar seus flags de escrita/broadcast para o diagnóstico inicial.

## O que falta para comprovar funcionamento ponta a ponta

Credenciais configuradas localmente, confirmação do estado das migrations no Supabase, teste autenticado de RLS/Storage/Realtime, app/WABA/número de teste e HTTPS público. O baseline de código/build não comprova esses itens. Nenhum segredo precisa ser enviado por mensagem; preencher localmente e informar somente quais etapas foram concluídas e os erros sem tokens.

## Atualização — campanhas e processamento no servidor (18/11/2026)

A primeira implementação de Campanhas e do worker já foi adicionada. Migrations 061–064 aplicadas, sem reenfileirar disparos antigos. O worker reutiliza as credenciais existentes; não é necessário criar outra chave.

- Campanhas: http://localhost:3000/campaigns
- Disparos: http://localhost:3000/broadcasts
- Verificar a conexão do worker sem enviar: `npm run worker:check`.
- Iniciar o processo persistente em outro terminal: `npm run worker:campaigns`.
- Para esta sessão, o worker foi iniciado em segundo plano; logs locais em `.runtime/`. Após reiniciar o computador, inicie-o novamente ou use o serviço Docker Compose.

Para o primeiro teste operacional, use apenas a etiqueta de contatos de teste, salve a campanha com programação desativada, confira os dados e escolha Executar agora. Depois do enfileiramento, pode fechar a aba e voltar para acompanhar o progresso. Não selecionar Todos os contatos para esse teste se já houver uma base real importada.

Detalhes, limitações e recuperação: [campaign-worker.md](campaign-worker.md).
