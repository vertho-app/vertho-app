# Templates do WhatsApp em uso

Registro operacional dos templates da Meta que estão **aprovados E ligados a algum caminho do
app**. Decisões de categoria, copy e migração ficam em `docs/INBOX-WHATSAPP.md`; aqui é o "o que
está no ar e com qual contrato".

> **Atualizado em 16/08/2026, 21h — a fila da Meta zerou:** os 9 pendentes aprovaram entre 12:34 e
> 19:55 (7 UTILITY, 2 MARKETING), e o webhook gravou os 9. Estado: **22 aprovados** (15 UTILITY,
> 6 MARKETING, 1 AUTHENTICATION), **0 pendentes**, 2 rejeitados, e `correct_category` null em todos
> — nenhuma reclassificação agendada.
>
> Fontes: Graph API da WABA (status e categoria), `CONTRATOS` em
> `lib/notifications/pilula-template.ts` (parâmetros), `git grep` dos call-sites e
> `notification_deliveries` (o que realmente saiu).
>
> ⚠️ **Este arquivo envelhece.** A categoria de um template muda na revisão da Meta **depois** de
> aprovado (4 de 8 viraram MARKETING em 14/08), e o nome ligado a cada papel vive numa env var
> *Sensitive* que nem o CLI lê. Para o estado ATUAL, a fonte é a **R13 do health**
> (`checarTemplatesLigados`), que pergunta à Meta e imprime o observado no log
> `[templates-ligados]`. Este doc é ponto de partida, não autoridade.

---

## 1. Os 9 que estão em uso

Cada papel da cadência resolve o nome do template por env var (`ENV_DO_PAPEL` em
`lib/notifications/pilula-template.ts`). Papel sem env var configurada fica **desligado** e o envio
cai no caminho legado — silenciosamente, que é o motivo da R13 existir.

| # | Template | Cat. | Papel / env | Quando dispara | Call-site |
|---|---|---|---|---|---|
| 1 | `conteudo_semana` | UTILITY | `pilula` · `WHATSAPP_TEMPLATE_PILULA` | Dias de pílula (P1/P2 da cadência da empresa) | `lib/fase4/trigger-diario-empresa.ts:287` |
| 2 | `registro_evidencia` | UTILITY | `evidencia` · `WHATSAPP_TEMPLATE_EVIDENCIA` | Quinta de semana de **aplicação** | `lib/fase4/trigger-diario-empresa.ts:523` |
| 3 | `registro_desafio` | UTILITY | `desafio` · `WHATSAPP_TEMPLATE_DESAFIO` | Quinta de semana de **conteúdo** | `lib/fase4/trigger-diario-empresa.ts:523` |
| 4 | `missao_semana_v2` | UTILITY | `missao` · `WHATSAPP_TEMPLATE_MISSAO` | Segunda da semana de **aplicação** (4/8/12) | `lib/fase4/trigger-diario-empresa.ts:409` |
| 5 | `retomada_trilha` | UTILITY | `retomada` · `WHATSAPP_TEMPLATE_RETOMADA` | 2+ semanas sem atividade | `lib/fase4/trigger-diario-empresa.ts:490` |
| 6 | `resultado_perfil` | UTILITY | `perfil` · `WHATSAPP_TEMPLATE_PERFIL` | Relatório individual pronto (envio deliberado, em lote) | `scripts/_avisar-perfil-pronto.ts:103` |
| 7 | `acesso_vertho` | UTILITY | `acesso` · `WHATSAPP_TEMPLATE_ACESSO` | Magic link pedido no login | `lib/notifications/access-link-service.ts:172` |
| 8 | `otp_acesso` | AUTHENTICATION | — (nome fixo no código) | Código de 6 dígitos do login por telefone | `app/api/auth/phone-otp/request/route.ts:83` |
| 9 | `plano_desenvolvimento` | UTILITY | `plano` · `WHATSAPP_TEMPLATE_PLANO` | Relatório individual: pelo cron `avisar_planos` (só **depois do corte**) ou pela tela, sob demanda | `lib/notifications/avisar-plano-pronto.ts` · `/admin-v2/cliente` → "Planos (PDI)" |
| 10 | `avaliacao_pendente` | UTILITY | — (nome fixo no script) | Cobrança deliberada de quem **já fez o mapeamento comportamental e nunca iniciou** o assessment | `scripts/_convite-avaliacao.ts` |

🔑 **Dois gatilhos, réguas diferentes — 17/08.** O CRON usa o `CORTE_ISO` fixo e roda sem ninguém
olhando. A TELA ignora o corte de propósito: há prévia com números e um humano confirmando, então a
régua que vale é a **idempotência** (`notification_deliveries` com `kind='plano'`), que impede
segunda mensagem para a mesma pessoa — repetir o clique é seguro. O corte alternativo só é aceito
com escopo de tenant (`apenasSlug`), senão um reanúncio alcançaria outros clientes.

⚠️ **O corte tinha uma premissa falsa** e deixou os 34 de Macaé sem aviso nenhum (medido: zero
envios de `plano` no tenant). Ver F-I19 do `docs/FMEA-PIPELINE.md`. `Medido: 34/34 entregues, 0
falhas, em 215s.`

🔑 **O nº 4 fechou um buraco de mais de um mês.** A segunda da semana de aplicação só tinha o
caminho legado (`agendarWhatsapp` → Z-API), morto desde 11/08: por WhatsApp a semana **não abria**.
Sobravam e-mail e push. E os dois templates que existiam para esse momento (`missao_semana`,
`missao_aplicacao`, ambos MARKETING) nunca estiveram ligados a nada — não tinham contrato.

🔑 **Nºs 2 e 3 saem do MESMO call-site**, com o papel escolhido por `ehDesafio ? 'desafio' :
'evidencia'`. Eles têm a mesma forma e textos diferentes: trocar um pelo outro entrega a cobrança
errada para a pessoa certa, e nada no typecheck acusaria.

### Contrato de cada um

O `CONTRATOS` (mapa por **nome do template**, não por papel) é fail-closed: nome desconhecido não
envia. Isso existe porque cada aprovado tem o seu contrato e **ele não se deduz do nome** — o
`pilula_semanal` foi aprovado com `{{1}}`=formato e `{{2}}`=tema, e mandar os params do
`conteudo_semana` nele produziria *"Seu Maria de hoje: \*5\*"*.

| Template | `{{1}}` | `{{2}}` | `{{3}}` | `{{4}}` | Botão |
|---|---|---|---|---|---|
| `conteudo_semana` | nome | semana | tema | link | — |
| `registro_evidencia` | nome | semana | link | — | — |
| `registro_desafio` | nome | semana | link | — | — |
| `missao_semana_v2` | nome | semana | link **sem formato** | — | — |
| `retomada_trilha` | nome | link | — | — | — |
| `resultado_perfil` | nome | link | — | — | — |
| `plano_desenvolvimento` | nome | link de `/dashboard/pdi` | — | — | — |
| `recorte_demonstracao` ⏳ | nome | link do Mapa (`linkDireto`) | — | — | — |
| `acesso_vertho` | *(corpo sem variável)* | | | | URL: `app.vertho.ai/entrar?t={{1}}` |
| `otp_acesso` | código | — | — | — | COPY_CODE nativo |

⚠️ **O link da missão vai SEM `formato`**, e isso é teste: semana de aplicação não entrega conteúdo
novo, então anunciar formato prometeria o que não existe — a classe da R1 do health, que nasceu de 17
pílulas anunciando "vídeo" numa semana sem vídeo.

⚠️ **Corpo sem variável NÃO leva componente.** O `acesso_vertho` tem texto fixo; mandar
`parameters: []` faz a Meta recusar a mensagem inteira. Ver `lib/whatsapp/cloud-api.ts:554`.

---

## 2. Aprovados e NÃO usados

Aprovado não é o mesmo que ligado. Estes existem na conta e nenhum caminho do app os chama:

| Template | Cat. | Por que está fora |
|---|---|---|
| `pilula_semanal` | ⚠️ MARKETING | Foi o da pílula até 16/08. Trocado por `conteudo_semana` — mesmo momento, **6× mais barato**. Tem contrato no código; se voltar a ser ligado, volta o custo |
| `nudge_inatividade` | ⚠️ MARKETING | Substituído por `retomada_trilha`. Mesma função, mesma pessoa, 6× mais barato — a diferença é a voz do texto, e é ela que a Meta cobra |
| `missao_semana` | ⚠️ MARKETING | Semana de aplicação. Substituído por `missao_semana_v2` (UTILITY) em 16/08. Sem contrato — nunca chegou a ninguém |
| `missao_aplicacao` | ⚠️ MARKETING | Gêmeo do anterior: mesmo momento, dois templates, os dois sem contrato |
| `conteudo_semana_v2` | ⚠️ MARKETING | Reescrita do `conteudo_semana` que saiu **pior** que o original: aprovou MARKETING. O v1 (UTILITY) cobre o mesmo momento — não ligar |
| `trilha_liberada` | ⚠️ MARKETING | Substituído por `trilha_liberada_v2` (UTILITY), aprovado no mesmo dia |
| `boas_vindas` | UTILITY | Da fase Z-API. Sem contrato; o convite hoje sai por `acesso_vertho` |
| `hello_world` | UTILITY | Amostra da Meta |

### 2.1 Aprovados UTILITY e ainda **sem consumidor** (16/08)

Estes saíram da fila hoje e **não enviam nada**: o `CONTRATOS` é fail-closed, então template sem
contrato simplesmente não sai. Cada um precisa de contrato + papel + env var, e — o que custa mais
pensar — a decisão de **quando** dispara.

| Template | Momento | `{{n}}` | Nota |
|---|---|---|---|
| `trilha_liberada_v2` | Trilha liberada para a pessoa | nome · área · nº de semanas · link | Substitui o `trilha_liberada` (MARKETING) |
| `trilha_concluida` | Fim das 7 semanas | nome · área · nº de semanas · link do resultado | ⚠️ O dono pediu que **não** dispare sozinho sem aprovação dele |
| ~~`plano_desenvolvimento`~~ | — | — | ✅ **LIGADO em 16/08** (papel `plano`). Ver §1 |
| `avaliacao_pendente` | Assessment nunca iniciado | nome · empresa · link | ~187 pessoas nesse estado (medido 15/08) |
| `avaliacao_parcial` | Assessment parcial | nome · respondidos · total · link | O par `{{2}}`/`{{3}}` exige contar cenários — não é só um link |
| `boas_vindas_v2` | Convite ao programa | nome · empresa · link | O momento mais arriscado: 1ª mensagem, de um número desconhecido |

🔑 **Aprovar não é ligar, e ligar não é disparar.** Foram esses dois degraus que deixaram
`resultado_perfil` aprovado e sem consumidor por semanas, com ~120 pessoas sem saber que o
relatório delas estava pronto.

⚠️ **A nota que eu tinha escrito aqui sobre o `plano_desenvolvimento` estava ERRADA.** Dizia "não
ligar, a `pdis` está vazia" — e a tabela era irrelevante: **`/dashboard/pdi` nunca leu `pdis`**, lê
`relatorios`. A `pdis` é código morto da fase 4, com um único escritor (`gerarPDIs`) que nenhuma tela
chamou. Olhei o que estava GRAVADO em vez de ler quem CONSOME, que é a classe nº 1 deste repo
(CLAUDE.md §"A forma GRAVADA ≠ o que é ENTREGUE"). O template foi ligado em 16/08.

---

## 3. O que isso custa

No Brasil: **UTILITY R$ 0,06–0,09** · **MARKETING R$ 0,40–0,55** · AUTHENTICATION é a mais barata.
Em ~400 pessoas semanais, a pílula sozinha é a diferença entre ~R$ 25 e ~R$ 180 por semana.

Os 9 em uso são UTILITY ou AUTHENTICATION — **nenhum MARKETING ligado** (16/08). A R13 do health
avisa se isso mudar, porque MARKETING não tem sintoma: aprova, envia, entrega, e só aparece na fatura.

Os 6 MARKETING aprovados estão todos **desligados**, e 4 deles porque um gêmeo UTILITY tomou o lugar:
`pilula_semanal`→`conteudo_semana`, `nudge_inatividade`→`retomada_trilha`,
`missao_semana`/`missao_aplicacao`→`missao_semana_v2`, `trilha_liberada`→`trilha_liberada_v2`.
Cabe pedir **revisão de categoria** deles em até 60 dias da reclassificação (só pelo WhatsApp
Manager, ver §3.1) — se algum voltar a UTILITY, a copy original volta a ficar disponível de graça.

---

## 3.1 A regra da Meta, e o que ela obriga a vigiar

Da doc oficial *Template categorization* (conferida em 16/08/2026):

- **Desde 09/04/2025, `allow_category_change` é o comportamento PADRÃO.** Submeter como UTILITY e a
  Meta discordar **não** rejeita: ela **aprova como MARKETING**. É o mecanismo por trás dos "4 de 8"
  de 14/08 — não houve erro nosso de leitura, é como o sistema funciona.
- **Existe aviso PRÉVIO, e é consultável:**
  `GET /{WABA_ID}/message_templates?fields=category,correct_category`. `correct_category` divergente
  de `category` = reclassificação agendada para o 1º dia do mês seguinte. **Medido em 16/08: null nos
  24 templates — nada agendado.**
- **Revisão de categoria pode ser pedida em até 60 dias** da mudança, para template MARKETING +
  APPROVED. Só pelo WhatsApp Manager (Business Support → *Template Category Updates* → *Request
  Review*), não pela API. Aplicável aos 4 MARKETING da seção 2.
- Conteúdo **vago** (só `{{1}}`, "Parabéns!") é MARKETING por definição.

### 🔴 Escada de punição por classificar marketing como utility

| Nível | O que acontece | Duração |
|---|---|---|
| Aviso | E-mail aos admins da WABA. **A partir dele, UTILITY→MARKETING passa a ser instantâneo, sem as 24h de aviso prévio** | contínuo |
| Rate limit | Teto de volume UTILITY em 24h; o excedente é **recusado** | mín. 7 dias |
| Restrição de utility | **TODOS** os UTILITY aprovados viram MARKETING; criar UTILITY e pedir revisão ficam desabilitados | 7 dias (30 se reincidente) |
| Portfólio | O mesmo em **todas** as WABAs do Business Suite | 30 dias |

⚠️ **Nosso perfil é o de risco:** 6 submissões viraram MARKETING e há v2 de copy limítrofe na fila.
Não re-submeter cópia limítrofe repetidamente.

### 🔴 Ponto cego: não vemos a advertência

O aviso e a punição chegam no campo **`account_update`** (com `restriction_info`), e ele **não está
assinado**: `GET /{app-id}/subscriptions` devolve 11 campos e nenhum é esse (medido 16/08). Se a Meta
advertir a conta, não chega webhook — só e-mail aos admins da WABA.

E dois campos **assinados** caem em `ignorados` no `app/api/webhooks/whatsapp-cloud/route.ts`, ou
seja, chegam e somem: `account_alerts` e `message_template_quality_update` (queda de qualidade de um
template).

O que JÁ é tratado e grava em `whatsapp_template_eventos`: `message_template_status_update`,
`template_category_update` e `template_correct_category_detection` (o aviso prévio).
⚠️ Mesmo assim a tabela **não é registro completo** — em 14/08 a API mostrava 6 reclassificações e a
tabela guardou 2. Para categoria, a fonte é a API.

## 3.2 O texto de cada template aprovado

Copiado da Graph API em 17/08/2026 — é o corpo **aprovado**, não o que o código acha que manda.
Serve para revisar copy sem abrir o WhatsApp Manager, e para conferir o `CONTRATOS` `{{n}}` a `{{n}}`
antes de ligar qualquer papel.

⚠️ Ao editar copy aqui, lembre que **o texto é o que define a categoria**: nome do produto, urgência,
pergunta engajadora, entusiasmo e reengajamento puxam para MARKETING (6× o custo). O que passa como
UTILITY é **afirmar um fato sobre o estado da conta da pessoa** e explicar para que serve. Ver §3.1.

---

### Em uso (§1)

**`conteudo_semana`** · UTILITY · papel `pilula`

> Olá, **{{1}}**. O conteúdo da semana **{{2}}** da sua trilha já está disponível: **{{3}}**.
>
> Você pode acessar em:
> **{{4}}**
>
> O conteúdo é selecionado a partir do seu perfil e da competência desta semana.

**`registro_evidencia`** · UTILITY · papel `evidencia` — quinta de semana de **aplicação**

> Olá, **{{1}}**. Você está na semana **{{2}}** da sua trilha de desenvolvimento.
>
> O registro de evidências desta semana está pendente. Você pode registrar em:
> **{{3}}**
>
> As evidências registradas são usadas para ajustar as próximas semanas da sua trilha.

**`registro_desafio`** · UTILITY · papel `desafio` — quinta de semana de **conteúdo**

> Olá, **{{1}}**. O desafio da semana **{{2}}** da sua trilha ainda não foi registrado.
>
> Você pode rever o desafio e relatar como foi em:
> **{{3}}**
>
> O relato é usado para acompanhar sua evolução na trilha.

🔑 Os dois acima saem do mesmo call-site e têm a **mesma forma**. É o texto que os separa — trocar um
pelo outro entrega a cobrança errada para a pessoa certa, sem nada no typecheck acusar.

**`missao_semana_v2`** · UTILITY · papel `missao`

> Olá, **{{1}}**. A missão da semana **{{2}}** da sua trilha está disponível.
>
> Você pode acessar em:
> **{{3}}**
>
> Nesta semana não há conteúdo novo. O registro da prática é solicitado na quinta-feira.

**`retomada_trilha`** · UTILITY · papel `retomada`

> Olá, **{{1}}**. Sua trilha de desenvolvimento está sem registro de atividade há mais de duas semanas.
>
> Você pode retomar de onde parou em:
> **{{2}}**
>
> A trilha permanece disponível na sua conta.

**`resultado_perfil`** · UTILITY · papel `perfil`

> Olá, **{{1}}**. O resultado do seu perfil comportamental já está disponível na sua conta.
>
> Você pode consultar em:
> **{{2}}**
>
> O resultado é usado para personalizar as próximas etapas da sua trilha.

**`plano_desenvolvimento`** · UTILITY · papel `plano`

> Olá, **{{1}}**. Seu plano de desenvolvimento individual está disponível.
>
> Você pode acessar em:
> **{{2}}**
>
> O plano é gerado a partir da sua avaliação de perfil e das competências do seu cargo.

**`acesso_vertho`** · UTILITY · papel `acesso` — **corpo sem variável**, o dado vai no botão

> Seu link de acesso à Vertho foi gerado. Toque no botão abaixo para entrar.
>
> O link expira em 15 minutos e só pode ser usado uma vez.
>
> _Rodapé:_ Não compartilhe este link com ninguém.
> _Botão:_ **Acessar Vertho** → `https://app.vertho.ai/entrar?t={{1}}`

**`otp_acesso`** · AUTHENTICATION — botão nativo de copiar código

> Seu código de verificação é **{{1}}**. Para sua segurança, não o compartilhe.
>
> _Rodapé:_ Expira em 10 minutos.
> _Botão:_ **Copiar código** (COPY_CODE nativo)

---

### Aprovados UTILITY, sem consumidor (§2.1)

**`trilha_liberada_v2`**

> Olá, **{{1}}**. Sua trilha de desenvolvimento em **{{2}}** está disponível: são **{{3}}** semanas.
>
> Você pode começar em:
> **{{4}}**
>
> O conteúdo é selecionado a partir do seu perfil e das competências do seu cargo.

**`trilha_concluida`**

> Olá, **{{1}}**. Você concluiu a sua trilha de desenvolvimento em **{{2}}**: as **{{3}}** semanas do programa foram registradas.
>
> Seu resultado final está disponível em:
> **{{4}}**
>
> Os materiais da trilha continuam acessíveis na sua conta.

**`avaliacao_pendente`**

> Olá, **{{1}}**. Sua avaliação de perfil no programa da **{{2}}** ainda não foi iniciada.
>
> Você pode começar em:
> **{{3}}**
>
> A avaliação leva cerca de 15 minutos e é ela que define a sua trilha de desenvolvimento.

**`avaliacao_parcial`**

> Olá, **{{1}}**. Sua avaliação está parcialmente respondida: **{{2}}** de **{{3}}** cenários registrados.
>
> Você pode continuar de onde parou em:
> **{{4}}**
>
> As respostas já enviadas foram salvas.

**`boas_vindas_v2`** — a primeira mensagem, de um número ainda desconhecido

> Olá, **{{1}}**. Você foi inscrito(a) pela **{{2}}** no programa de desenvolvimento de competências.
>
> Este é o canal oficial do programa. Seu acesso está em:
> **{{3}}**
>
> Se não reconhece este convite, é só responder a esta mensagem.

---

### MARKETING — desligados, guardados como contraste

Vale ler ao lado dos UTILITY equivalentes: **a diferença é sempre a voz**, não a informação.

**`pilula_semanal`** (≠ `conteudo_semana`) — anuncia o FORMATO, e é o que se perdeu na troca

> Seu **{{1}}** de hoje: **{{2}}**.
>
> Acesse sua semana na plataforma:
> **{{3}}**
>
> Bons estudos!
> — Equipe Vertho

**`nudge_inatividade`** (≠ `retomada_trilha`)

> Olá, **{{1}}**! 👋
>
> Notamos que você está há mais de 2 semanas sem interagir com sua trilha.
>
> Que tal retomar hoje?
>
> — Vertho Mentor IA

**`missao_aplicacao`** e **`missao_semana`** (≠ `missao_semana_v2`) — dois templates para o mesmo momento

> Olá, **{{1}}**!
>
> **Semana {{2}} — Missão de Aplicação**
>
> Esta semana não tem pílula nova: é hora de colocar em prática o que você vem aprendendo, com uma **missão** feita para o seu dia a dia.
>
> Sua missão completa está na plataforma:
> **{{3}}**
>
> E este vídeo explica como a semana funciona:
> **{{4}}**
>
> Na quinta a Mentora IA vai querer saber como foi. Boa prática!
> — Equipe Vertho

**`conteudo_semana_v2`** (≠ `conteudo_semana`) — a reescrita que saiu pior: tirou o link do corpo,
pôs num botão, e ainda assim veio MARKETING

> Olá, **{{1}}**. O conteúdo da semana **{{2}}** da sua trilha está disponível.
>
> Tema: **{{3}}**
>
> O conteúdo é selecionado a partir do seu perfil e da competência desta semana.
>
> _Botão:_ **Ver conteúdo** → `https://app.vertho.ai/ir/{{1}}`

**`trilha_liberada`** (≠ `trilha_liberada_v2`) — a única diferença é *"foi liberada: são N semanas,
com um conteúdo novo e um registro de prática por semana"* contra *"está disponível: são N semanas"*.
Descrever o programa puxou para MARKETING.

**`boas_vindas`** — da fase Z-API, sem contrato

> Olá, **{{1}}**! Bem-vindo à **{{2}}**! 🎉
>
> Seu link de acesso:
> **{{3}}**
>
> Clique para entrar direto, sem senha.
> Este link expira em 24h.

🔑 **O contraste mais útil deste arquivo:** `trilha_liberada` × `trilha_liberada_v2`. Mesma
informação, mesma estrutura, um trecho a mais descrevendo o programa — e 6× no custo. É a evidência
de que a categoria não olha o assunto, olha a **intenção percebida**.

---

## 4. Como conferir sem confiar neste arquivo

```bash
# Status, categoria e RECLASSIFICAÇÃO AGENDADA (correct_category) direto na Meta.
# correct_category != category  ⇒  vira MARKETING no 1º dia do mês seguinte.
node -e "process.loadEnvFile('.env.local');
 fetch('https://graph.facebook.com/v22.0/'+process.env.WABA_ID+'/message_templates?limit=200&fields=name,status,category,correct_category&access_token='+process.env.META_WHATSAPPBUSINESS_API)
 .then(r=>r.json()).then(j=>j.data.forEach(t=>console.log(
   (t.correct_category&&t.correct_category!==t.category?'AGENDADO':'  '),t.status,t.category,t.name)))"

# Uma mensagem pelo caminho REAL, imprimindo o template resolvido antes de enviar
npx tsx scripts/_testar-template.ts --papel=pilula --telefone=55… --slug=ibipeba --empresa-id=… 
```

E o que está ligado **em produção** sai no log `[templates-ligados]` a cada health estrutural —
papel desligado aparece como `(desligado)`, que é o caso que o silêncio esconde.

⚠️ Ao gravar uma env var de template: `printf '%s' 'nome' | vercel env add …`, **nunca `echo`** (o
`\n` colado vira `132001` no cron, e a mensagem não sai).

---

## 5. Fila da Meta (20/08)

⏳ **`avaliacao_competencias`** — PENDING/UTILITY (provisória), submetido em 20/08/2026
(`id=2012427279422433`). Reescrita do `avaliacao_pendente` para quem **já concluiu o mapeamento
comportamental** e parou antes do assessment.

🔑 **Por que dois templates para o mesmo momento.** O corpo do `avaliacao_pendente` diz *"sua
avaliação **de perfil** ainda não foi iniciada"*, e no vocabulário do produto "perfil comportamental"
é exatamente o passo que essa pessoa acabou de dar (as telas dizem "SEU PERFIL COMPORTAMENTAL"; o
assessment aparece como "avaliação"). Para ela, a frase se lê como mensagem desatualizada.
`Medido 19-20/08:` nos 19 professores de Macaé nesse estado, **19 entregues · 11 abriram · 2
responderam**, e nada nas 18h seguintes — não foi alcance nem canal, foi a copy.

A nova RECONHECE o passo dado e NOMEIA a competência em `{{2}}` (que vem de
`cargos_empresa.top5_workshop`, a régua da própria tela). A fiação já está pronta: contrato em
`CONTRATOS` e `scripts/_convite-avaliacao.ts` com ele como default — enquanto estiver PENDING o
envio volta `132001`, que é falha ALTA e visível, não silenciosa.

⚠️ **Se voltar MARKETING, aceitar** e usar assim mesmo ou voltar ao `avaliacao_pendente` — não
re-submeter variação limítrofe (§3.1).

### Estado anterior (18/08)

**22 aprovados · 1 pendente · 2 rejeitados.**

⏳ **`recorte_demonstracao`** — PENDING/UTILITY, submetido em 17/08. É o recorte da demonstração
para o **lead do CONARH**, e o único template do repo cujo destinatário não é colaborador de tenant.

🔑 **Por que UTILITY, e por que isso não é malandragem.** Mensagem comercial a contato frio é
*retargeting*, que a régua da Meta chama de MARKETING **"mesmo quando solicitada pelo usuário"**. O
que sustenta UTILITY aqui é outro caso da mesma régua: **"Continue a Conversation on WhatsApp"** —
iniciar no WhatsApp uma interação começada em outro canal, **a pedido da pessoa**. É literalmente o
que o termo de consentimento do estande diz. Para isso valer, a copy **entrega o que foi pedido e
não vende nada**: o convite dos 20 minutos, o "circular com o time" e a confirmação de reunião
ficaram de fora e vivem na página do Mapa.

⚠️ **Se voltar MARKETING, aceitar.** Re-submeter copy limítrofe como UTILITY é o gatilho da escada
de punição (§3.1), e ela recategoriza **todos** os UTILITY da WABA. Com 2 leads com telefone, pagar
MARKETING custa menos de R$ 1; arriscar a cadência de centenas de pessoas, não.

**A fiação já está pronta** (papel `recorte`, contrato, e o `artefato/route.ts` tentando template
antes do legado). Falta só gravar `WHATSAPP_TEMPLATE_RECORTE` quando aprovar — deixada desligada de
propósito, porque ligar antes faria toda mensagem voltar `132001`.

⚠️ **O que a mensagem perdeu, e é do formato:** porta escolhida, competência crítica e **confirmação
da reunião marcada**. Template não tem bloco condicional — todo `{{n}}` precisa de valor sempre. Os
dois primeiros já estão na página; **a reunião não foi verificada** — se a página não a mostrar, a
informação some para quem marcou no estande.

---

## 5.1 Como era a fila (16/08, 21h)

**0 pendentes.** Os 9 que estavam na fila aprovaram no mesmo dia, entre 12:34 e 19:55 — e o webhook
gravou os 9 em `whatsapp_template_eventos`, nenhum se perdeu.

| Resultado | Templates |
|---|---|
| ✅ UTILITY (7) | `avaliacao_pendente` · `avaliacao_parcial` · `boas_vindas_v2` · `missao_semana_v2` · `plano_desenvolvimento` · `trilha_concluida` · `trilha_liberada_v2` |
| 🔴 MARKETING (2) | `conteudo_semana_v2` · `trilha_liberada` — os dois já vinham carimbados antes de aprovar |

Desses, só o `missao_semana_v2` foi ligado. Os outros 6 UTILITY estão na §2.1, aprovados e sem
consumidor.

### Ao ligar o próximo

- Escreva o contrato em `CONTRATOS` **no mesmo commit**: o mapa é fail-closed, e nome sem contrato
  não envia — falha silenciosa, não erro.
- Confira o contrato contra o corpo APROVADO na Graph API, `{{n}}` por `{{n}}`. Ele **não se deduz do
  nome**: foi assim que o `pilula_semanal` quase mandou *"Seu Maria de hoje: \*5\*"* para 36 pessoas.
- Rode `npx tsx scripts/_testar-template.ts` para si mesmo antes de qualquer lote.
- Grave a env var com `printf '%s' … | vercel env add`, **nunca `echo`**.
- E pergunte se o dado que a mensagem anuncia **existe**: `plano_desenvolvimento` está aprovado e a
  tabela `pdis` está vazia em todos os tenants.

## Cadência: uma régua só, e ela mudou em 17/08

Todo envio em lote passa por **`lib/whatsapp/cadencia.ts`** — `criarPaceadorSincrono()` no loop
síncrono, `atrasosDoLote()`/`criarRelogioCadencia()` para o `Upstash-Delay`. Nunca um literal.

**Default 6s** (era 15s), com jitter ±30% e teto de 120 por disparo, tudo por env
(`WHATSAPP_LOTE_INTERVALO_MS`/`_MAX`/`_JITTER`). O 15s foi calibrado para o número QR bloqueado em
11/08; hoje o canal é a Cloud API oficial (teto técnico 80 msg/s — o limite que resta é o tier de
destinatários únicos, que é volume, não taxa). `Medido em 17/08:` 38 boas-vindas a 7,0s e 34 avisos
de plano a 6,5s — 72 mensagens, 0 falhas. A régua do incidente continua travando o valor: no máximo
**10 msg/min**, e 6s dá exatamente 10.

⚠️ **A política não governava nada até 17/08**: havia quatro réguas, duas delas com os 2s do
incidente, porque o guard media o canal LEGADO e não varria `scripts/`. Ver F-I20 do
`docs/FMEA-PIPELINE.md`. Ao trocar de canal ou fornecedor, **o denominador do guard troca junto** —
senão ele fica verde certificando o caminho que ninguém mais usa.
