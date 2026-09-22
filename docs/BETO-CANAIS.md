# Beto — canais, escopo e contexto

> **Status em 22/09/2026:** em produção. Este é o documento canônico para a divisão entre o
> Beto do WhatsApp e o Beto dentro do app, inclusive o acesso pelo WhatsApp, as guardas de
> conduta e o contexto da página atual no assistente autenticado.
>
> Entregas de referência: `ffcd3de3` (acesso seguro pelo WhatsApp), `eba78dcf` (página atual no
> Beto interno) e a abertura do WhatsApp para todos os colaboradores com guardas de conduta
> (22/09, §2.4 e §2.5).

---

## 1. Um nome, dois contextos

Os dois assistentes usam a persona Beto, mas não têm o mesmo contexto nem a mesma função.

| Canal | Identidade e contexto | Papel principal | Modelo |
|---|---|---|---|
| **WhatsApp** | Telefone reconhecido, empresa resolvida pelo banco e últimas mensagens de até 24 h | Porta de entrada: acesso, recuperação e triagem | Gemini 3.8 Flash |
| **Dentro do app** | Sessão autenticada, perfil, cargo, empresa, blueprint, semana/conteúdo relacionado e página atual | Orientação sobre desenvolvimento, conteúdo e uso da plataforma | Claude Sonnet 4.6 |
| **Inbox humano** | Conversa completa e contexto operacional acessível à equipe Vertho | Ambiguidade, exceção, ação de conta ou assunto que a automação não resolve | Humano |

Regra de encaminhamento: uma dificuldade para **entrar na conta** fica no WhatsApp; uma dúvida
sobre **vídeo, conteúdo, atividade, semana, trilha, progresso ou uso depois do login** vai para o
Beto dentro do app. Isso evita que o WhatsApp tente responder sem o contexto autenticado.

---

## 2. Beto no WhatsApp

### 2.1 Público e identidade

Desde 22/09/2026 o Beto responde a **todos os colaboradores**, não só à equipe:

- **Equipe da Vertho:** telefone que corresponde, sem ambiguidade, a um único e-mail `@vertho.ai`.
  `SUPORTE_AUTO_PILOTO_EMPRESA_ID` fixa a ACME como contexto, como no piloto: a mesma pessoa
  aparece em vários tenants de demonstração. Dois e-mails internos no mesmo número falham fechados.
- **Colaborador:** telefone que o webhook resolveu (`decidirDono`) para UMA empresa. O tenant é o
  do resolver; nome e cargo vêm do cadastro, lidos por `tenantDb` da própria empresa. Telefone de
  duas pessoas da mesma empresa é atendido sem nome e sem link personalizado.
- **Sem empresa** (número desconhecido, ou em várias empresas sem ser da equipe): sem resposta
  automática; fica na fila de não identificados da inbox. `Medido em 22/09`, 30 dias: 2 mensagens
  de 2 números desconhecidos; os 3 números em várias empresas eram todos da equipe.
- Tenant de demonstração (`is_demo`) não recebe resposta.

A empresa vem do banco; o Beto não pergunta ao colaborador onde ele trabalha. O fluxo aceita
texto, botão e áudio. O áudio é baixado da Meta e enviado ao Gemini como mídia inline para
entendimento e classificação. A resposta é curta, informal e contínua: o Beto só se apresenta no
primeiro turno e usa o histórico recente (incluindo as mensagens automáticas da plataforma e as
respostas da equipe, com links trocados por `[link]`) para não reiniciar a conversa.

O webhook agenda o atendimento fora da resposta imediata, por `after()`, para não atrasar o
`200 OK` exigido pela Meta. A chamada ao modelo tem timeout de 12 s, raciocínio `low`, limite de
700 tokens, `safetySettings` explícitos e saída JSON estruturada (`intencao`, `tom_usuario`,
`solicita_link`, `resposta`, `precisa_humano` e `acao`).

### 2.2 Pedido de acesso

Pedidos textuais claros como “não consigo entrar” ou “me manda um novo link” usam o emissor
determinístico, sem esperar a IA. Nos outros (texto ou áudio), o Gemini apenas identifica a
intenção (`solicita_link`); a aplicação continua sendo a única responsável por criar e enviar o
acesso. A `resposta` do modelo só é enviada quando o link NÃO saiu, e por isso o prompt proíbe
dizer que está gerando ou enviando um link (medido no ensaio, §2.6).

O destino é calculado pelo banco:

- administrador da plataforma: host genérico `app.vertho.ai`, com destino final `/admin-v2`
  (vale também para colaborador cujo e-mail esteja em `platform_admins`);
- colaborador: tenant único habilitado com `login_por_whatsapp=true`;
- mais de um tenant elegível ou nenhum destino seguro: não envia link personalizado.

Para colaborador, o link segue o contrato da porta pública `phone-magic-link/request`
(`identidadeDeAcessoDoColaborador`): a linha é revalidada no tenant, o número que escreveu tem de
ser o do cadastro, `login_por_whatsapp` tem de estar ligado, e o e-mail da conta sai de
`emailDeAcessoPorTelefone` (`lib/phone-otp.ts`), a régua única das três portas de telefone.
Phone-only sem e-mail recebe o proxy gravado no cadastro ANTES de a conta ser criada; e-mail real
nunca é sobrescrito. O link vai para o mesmo número que pediu: o Beto não dá acesso a ninguém que
a porta pública já não daria.

“Não consigo acessar o vídeo/conteúdo/atividade” **não** é interpretado como pedido de login.
Esses termos excluem o atalho de acesso e provocam orientação para o Beto interno.

### 2.3 Proteções do link

- O modelo de IA nunca recebe nem produz o token.
- Só o template aprovado `acesso_vertho` pode transportar o link; neste fluxo não existe fallback
  para texto livre.
- O token da Supabase é de uso único. A rota `/entrar` mostra primeiro uma confirmação e só o
  consome após clique explícito (`ir=1`), protegendo contra previews automáticos do WhatsApp.
- O envio usa o mesmo `numeroId` que recebeu a conversa.
- Há idempotência por `wamid`, intervalo mínimo de 5 minutos e teto de 3 links por telefone em
  24 horas. 🔴 Até 22/09/2026 o intervalo e o teto **não seguravam nada**: procuravam a chave
  `beto-acesso:*` em `whatsapp_mensagens_enviadas`, onde só a caixa grava `dedupe_key`
  (`registro-saida.ts`). `Medido`: 7 respostas do Beto nas enviadas, 0 com chave; as chaves estavam
  em `notification_deliveries`. A leitura passou a ser lá, pelo `wamid` das mensagens que o
  telefone mandou nas últimas 24 h (a tabela não tem coluna de telefone).
- O slug virtual `plataforma` permite direcionar um administrador para `/admin-v2`; ele não
  concede privilégio. A autorização de administrador continua sendo verificada após o login.

### 2.4 Conduta

`lib/whatsapp/suporte-conduta.ts`, da camada mais barata para a mais cara. Nenhuma confia na outra:

1. **Sofrimento na entrada, por regex**, antes de qualquer regra que silencia: texto fixo com o
   CVV (188) e o SAMU (192), sem IA. A lista só tem frases sobre a própria vida ("não aguento mais"
   sozinho é desabafo sobre o site e não entra). Falso positivo conhecido: "quero morrer de
   vergonha" recebe o CVV.
2. **Prompt**: sem palavrão, ironia, sarcasmo ou bronca, mesmo que a pessoa use; sem opinião sobre
   política, religião, colegas, gestores ou empresa; sem salário, demissão ou avaliação; sem
   orientação médica, psicológica, jurídica ou financeira; sem promessa; recusa gentil a trocar de
   papel ou revelar instruções. Defeito na plataforma é `precisa_humano`.
3. **`tom_usuario`** no JSON: `sofrimento` e `denuncia` recebem texto fixo (CVV; RH, ouvidoria ou
   canal de denúncia e 190) e viram degradação `critico`; `ofensivo` recebe um aviso calmo e a
   conversa passa para a equipe; `irritado` é respondido normalmente.
4. **`safetySettings` do Gemini** (antes valia o padrão do provedor). `DANGEROUS_CONTENT` fica em
   `BLOCK_ONLY_HIGH`, porque o filtro também avalia a mensagem da pessoa, e barrar quem está em
   crise antes do modelo trocaria o CVV por uma contenção genérica. Bloqueio vira escalada neutra.
5. **Verificação da saída** antes do envio: palavrão, ofensa (por palavra inteira, sem acento) e
   qualquer link além de `app.vertho.ai/entrar`. Reprovou, sai texto fixo e degradação `critico`.

Textos fixos, rascunho do modelo nunca enviado: sofrimento, denúncia, ofensa, escalada, bloqueio
do filtro, IA fora do contrato. Degradações: `suporte-auto-falhou` (não atendeu) e
`suporte-auto-conduta` (caso de conduta; o conteúdo da mensagem não vai no detalhe, está na caixa).

### 2.5 Quando o Beto fica calado, e o freio

A mensagem continua na caixa, com push para a equipe:

| Situação | Motivo |
|---|---|
| Uma pessoa da equipe respondeu este número pela caixa nos últimos 30 min | `humano-na-conversa` |
| O próprio Beto passou um assunto para a equipe nas últimas 12 h (escalada ou aviso de ofensa) e a mensagem insiste NESSE assunto. Assunto novo é respondido | `aguardando-equipe` |
| Só "ok", "obrigada" ou emoji, sem conversa com o Beto em andamento | `so-confirmacao` |
| Ofensa de novo depois do aviso, até 24 h | `ofensa-repetida` |
| Falha ao ler o histórico (não dá para saber se há uma pessoa na conversa) | `falha-historico` |
| 10 respostas a este número na última hora (memória E banco) | `teto-piloto` / `teto-hora` |

O sofrimento por regex passa na frente de todas essas regras.

Janelas decididas pelo dono em 22/09/2026, no mesmo dia da abertura: a resposta da equipe calava o
Beto por 12 h (uma resposta de manhã o calava o dia todo) e passou a 30 min; depois de escalar, ele
calava qualquer mensagem e passou a calar só o mesmo assunto. Quem decide se é o mesmo assunto é o
modelo, no campo `continua_escalada` (o CONTEXTO leva `aguardando_equipe`); sem a leitura do
modelo (fora do contrato, bloqueio do filtro), o Beto fica calado, porque a conversa já está com a
equipe.

**Freio:** `SUPORTE_AUTO_ESCOPO` = `interno` (volta a atender só a equipe) ou `desligado`. Ausente
vale `todos`; valor desconhecido cai em `interno`, nunca em `todos`. Lido em runtime.

### 2.6 Ensaio contra o modelo real

`tests/unit/suporte-auto-conduta-live.test.ts`, opt-in por `SUPORTE_AUTO_LIVE=1` (banco, envio e
ledger de mentira; nada é escrito em produção): 30 mensagens (ofensa, tentativa de mudar as
regras, fora do escopo, sofrimento, denúncia, irritação legítima e mensagens reais comuns da caixa)
× 3 rodadas, com asserção de que nada que saiu tem palavrão, instrução interna ou link fora da lista.

`Medido em 22/09/2026`: na 1ª rodada, 4 respostas diziam "já estou gerando um novo link" num texto
que só sai quando o link NÃO foi gerado, e pedido de humano sobre acesso recebia "me mande a
mensagem exata do erro" logo depois de a pessoa mandá-la. Com o prompt e a escalada corrigidos, a
2ª rodada deu 30 de 30 casos no desfecho esperado nas 3 repetições, 0 promessa de link, 0 bloqueio
do filtro, 87 chamadas, US$ 0,138 (cerca de US$ 0,0016 por resposta).

Com as janelas novas entraram 8 casos com histórico: assunto escalado há 2 h ("e aí? alguém vai
ver?", "continua travado", "acontece no celular também" contra "onde vejo meu PDI?" e "meu link
expirou"), aviso de ofensa há 1 h (pedido educado contra nova ofensa) e resposta da equipe há 1 h.
`Medido em 22/09/2026`: 38 de 38 casos no desfecho esperado nas 3 repetições; o modelo separou
mesmo assunto de assunto novo em 24 de 24 execuções; 111 chamadas, US$ 0,20.

---

## 3. Beto dentro do app — página atual

`components/beto-chat.tsx` captura o `pathname` no momento do envio e o passa para
`chatWithBeto`. O servidor transforma esse valor em uma pista controlada, definida em
`lib/beto/pagina-atual.ts`, antes de acrescentá-la ao prompt.

O Beto recebe, por exemplo, “PDI”, “Perfil”, “Relatórios” ou “Temporada — Semana 4”. Ele não recebe
o HTML, o conteúdo visual da tela nem a árvore do navegador. Por isso pode contextualizar uma
explicação, mas não afirmar que viu um botão, erro ou mensagem que não esteja nos dados enviados.

Proteções do contexto:

- query string e fragmento são removidos;
- ids de conteúdo e jornada viram marcadores como `[id]` e `[trilha]`;
- URL externa, quebra de linha e entrada acima do limite são recusadas;
- rota autenticada desconhecida vira o rótulo genérico `/dashboard/[pagina]`;
- a página é apenas contexto de navegação; autenticação e autorização continuam vindo da sessão
  do servidor.

O chat segue oculto nas experiências imersivas já definidas pelo `DashboardShell`, como conteúdo
aberto, semana da temporada, treino de atendimento e simulador de vendas. A entrega de contexto
não muda essa regra de interface.

---

## 4. Dados enviados a provedores de IA

- **WhatsApp / Google:** mensagem de texto ou áudio, histórico recente (inclusive mensagens
  automáticas da plataforma e respostas da equipe, com links trocados por `[link]`), nome, cargo e
  empresa já resolvidos. Desde 22/09/2026 vale para todo colaborador identificado, não só para a
  equipe. O token do magic link nunca é enviado ao modelo.
- **App / Anthropic:** mensagem, histórico, contexto autenticado disponível ao Beto e a descrição
  normalizada da página atual. Query string e identificadores dinâmicos não seguem no contexto
  da página.

O mapa de tratamento e destinos externos está em `docs/FLUXO-DE-DADOS-PESSOAIS.md`.

---

## 5. Arquivos de referência

| Responsabilidade | Arquivo |
|---|---|
| Orquestração do WhatsApp, persona, áudio e triagem | `lib/whatsapp/suporte-auto.ts` |
| Guardas de conduta e textos fixos | `lib/whatsapp/suporte-conduta.ts` |
| Resolução de destino, identidade do colaborador e controles do link | `lib/whatsapp/beto-access-link.ts` |
| E-mail da conta de quem entra pelo telefone (régua única) | `lib/phone-otp.ts::emailDeAcessoPorTelefone` |
| Emissão do template de acesso | `lib/notifications/access-link-service.ts` |
| Confirmação e consumo do link | `app/entrar/route.ts` |
| Action autenticada do Beto interno | `app/actions/beto.ts` |
| Normalização da página atual | `lib/beto/pagina-atual.ts` |
| Interface e captura do pathname | `components/beto-chat.tsx` |
| Entrada do webhook da Meta | `app/api/webhooks/whatsapp-cloud/route.ts` |

Testes de referência: `tests/unit/integrations/suporte-auto.test.ts`,
`tests/unit/whatsapp-suporte-conduta.test.ts`,
`tests/unit/suporte-auto-conduta-live.test.ts` (opt-in, modelo real),
`tests/unit/integrations/beto-access-link.test.ts`,
`tests/unit/security/entrar-nao-consome.test.ts`,
`tests/unit/security/magic-link-destino-admin.test.ts` e `tests/unit/beto-pagina-atual.test.ts`.

---

## 6. Fora do escopo atual

- Resposta automática para número sem empresa identificada (desconhecido, ou em várias empresas
  sem ser da equipe) e para tenant de demonstração.
- Responder imagem, documento ou figurinha: só texto, botão e áudio passam pelo Beto.
- Consultar ou alterar dados de conta por decisão livre do modelo.
- Enviar credencial em texto livre.
- Fazer o Beto do WhatsApp substituir o Beto autenticado dentro do app.
- Inferir o que está visualmente renderizado na tela; o assistente conhece apenas a rota
  normalizada e os dados autenticados fornecidos pelo servidor.
