# Templates do WhatsApp em uso

Registro operacional do estado dos templates na Meta e dos caminhos que podem consumi-los no app.
Decisões de categoria, copy e migração ficam em `docs/INBOX-WHATSAPP.md`; aqui é o “o que está
aprovado, o que está ligado e com qual contrato”.

> **Atualizado em 01/09/2026 pela Graph API:** **28 aprovados** (19 UTILITY,
> 8 MARKETING, 1 AUTHENTICATION), **1 pendente** (`encerramento_conteudo`, UTILITY provisório) e
> 2 rejeitados. Na tela de Envios existem **16 definições manuais**, todas desenhadas como UTILITY;
> 15 estão aprovadas e disponíveis agora, e a pendente aparece indisponível quando o catálogo vivo
> da Meta responde.
>
> Fontes: Graph API da WABA (status e categoria), `CONTRATOS` em
> `lib/notifications/pilula-template.ts` (parâmetros), `git grep` dos call-sites e
> `notification_deliveries` (o que realmente saiu).
>
> 🔁 **Substituição de 05/10/2026 (R-47, R-48, R-50 e R-117).** Quatro templates novos foram
> **SUBMETIDOS** à Meta (§3.3), com nomes novos (template aprovado não se edita e apagar queima o
> nome). **Entram no ar dois:** `acesso_vertho_v2` (substitui `acesso_vertho`) e
> `votacao_pendente_v3` (substitui `votacao_pendente`). **Dois NÃO são usados, por decisão do dono:**
> `perfil_pendente` e `mapeamento_pendente` voltaram MARKETING (custo ~6×), e os convites do Perfil
> e do Mapeamento seguem nos textos antigos `avaliacao_pendente` e `avaliacao_competencias`, que
> continuam APPROVED/UTILITY. Os antigos substituídos seguem APPROVED na Meta e não podem ser
> editados nem apagados. **O estado real de cada um (PENDING ou APPROVED, a categoria e a
> `correct_category`) se confere na Meta, nunca neste arquivo:**
> `GET /{waba}/message_templates?fields=name,status,category,correct_category`. Onde as tabelas abaixo
> escrevem "Meta em 01/09", é a leitura daquele dia; para os dois que entram a coluna diz "conferir na
> Meta".
>
> ⚠️ **Este arquivo envelhece.** A categoria de um template muda na revisão da Meta **depois** de
> aprovado (4 de 8 viraram MARKETING em 14/08), e o nome ligado a cada papel vive numa env var
> *Sensitive* que nem o CLI lê. Para o estado ATUAL, a fonte é a **R13 do health**
> (`checarTemplatesLigados`), que pergunta à Meta e imprime o observado no log
> `[templates-ligados]`. Este doc é ponto de partida, não autoridade.

---

## 1. Fluxos automáticos e dedicados

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
| 7 | `acesso_vertho_v2` (legado: `acesso_vertho`, enquanto a env apontar para ele) | UTILITY | `acesso` · `WHATSAPP_TEMPLATE_ACESSO` | Magic link pedido no login ou ao Beto no WhatsApp | `lib/notifications/access-link-service.ts` · `lib/whatsapp/beto-access-link.ts` |
| 8 | `otp_acesso` | AUTHENTICATION | — (nome fixo no código) | Código de 6 dígitos do login por telefone | `app/api/auth/phone-otp/request/route.ts:83` |
| 9 | `plano_desenvolvimento` | UTILITY | `plano` · `WHATSAPP_TEMPLATE_PLANO` | Relatório individual: pelo cron `avisar_planos` (só **depois do corte**) ou pela tela, sob demanda | `lib/notifications/avisar-plano-pronto.ts` · `/admin-v2/cliente` → "Planos (PDI)" |
| 10 | `avaliacao_pendente` | UTILITY | — (nome fixo na tela) | Convite ao mapeamento comportamental pendente, independente de cenários | **tela de Envios** (aba WhatsApp) |
| 11 | `avaliacao_final_pendente` | UTILITY (APPROVED, medido 03/10/2026) | `avaliacao_final` · `WHATSAPP_TEMPLATE_AVALIACAO_FINAL` | Semana acessível = a do Cenário B, sem nota e sem nota sendo gerada: **segunda** (abriu) e **quinta** (pendente) | `lib/fase4/trigger-diario-empresa.ts` (`enviarAberturaAvaliacaoFinal` e a quinta) |

🔑 **O nº 11 entrou na cadência em 03/10/2026 (R-89)**. O template está **APPROVED/UTILITY** na Meta
(pt_BR, sem divergência de `correct_category`; corpo e botão idênticos ao registro em
`lib/whatsapp/templates.ts`) e a env `WHATSAPP_TEMPLATE_AVALIACAO_FINAL=avaliacao_final_pendente` foi gravada
na Vercel (production) em 03/10/2026, a pedido do dono, **sem possibilidade de ler o valor de volta**
(a Vercel a marca Sensitive sozinha): o observável é o R13 do health, que lista o papel `avaliacao_final`
com nome, status e categoria vindos da Meta. Sem a env, a semana da avaliação final não sai por WhatsApp
(não há texto livre de propósito) e segue por e-mail e push, com a copy própria (`emailAvaliacaoFinal`,
`pushAvaliacaoFinal`). Antes, a segunda dessa semana não dizia nada e a quinta mandava
`registro_evidencia`, que promete ajustar "as próximas semanas", que não existem. O papel já está na
lista da R13 (`PAPEIS` em `lib/whatsapp/templates-ligados.ts`), então a categoria passa a ser
vigiada no dia em que a env for gravada.

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

### Tela de Envios: 18 templates com público automático

Selecionar um template em `/admin/whatsapp` **não depende de o operador reconstruir a regra de
negócio nos selects**. A turma (ou empresa inteira com justificativa) define o universo; o servidor
aplica a regra obrigatória do template nesse universo. Cargo, votação, DISC e mapeamento são apenas
**refinamentos opcionais** — só estreitam os elegíveis, nunca ampliam o público.

Todos exigem WhatsApp/telefone e todos os parâmetros do contrato preenchidos. Depois da regra, a
idempotência remove quem já recebeu o mesmo template; nos templates semanais, a chave inclui a
semana/slot, portanto uma semana não bloqueia a seguinte.

| Template manual | Meta em 01/09 | Regra automática obrigatória |
|---|---|---|
| `boas_vindas_v2` | APPROVED/UTILITY | Está no escopo e tem WhatsApp cadastrado |
| `votacao_pendente_v3` (substitui a v2 `votacao_pendente`, que era APPROVED/UTILITY desde 25/09) | conferir na Meta (submetido 05/10) | Votação aberta, ainda não votou e o cargo tem competências na cédula; um por pessoa **por dia** (Brasília). Sem prazo: a votação só fecha quando o admin a desliga (R-117) |
| `avaliacao_pendente` | APPROVED/UTILITY | Ainda não tem perfil comportamental (`perfil_dominante`); independe de cenários e respostas da avaliação técnica |
| `avaliacao_competencias` | APPROVED/UTILITY | Tem perfil comportamental, cargo/cenários/top5 configurados e zero respostas **às competências do Top 5 de hoje** |
| `avaliacao_parcial` | APPROVED/UTILITY | Respondeu pelo menos uma competência do Top 5 de hoje, mas ainda não todas |
| `inicio_temporada` | **APPROVED/MARKETING** (submetido UTILITY em 08/10/2026, reclassificado ~8 min depois; custa ~6×) | A mesma regra do `avaliacao_competencias`: perfil comportamental, Top 5 com cenário e zero respostas ao Top 5 de hoje |
| `inicio_temporada_v2` ⏳ | **conferir na Meta** (submetido 08/10/2026 08:36 BRT, id 1120910870528165, PENDING/UTILITY provisório) | A mesma regra, e exige o nome da instituição (o corpo a cita) |

> **A avaliação é medida pela régua da tela do assessment (07/10/2026).** "Iniciada", "respondidas" e "total" contam só as
> competências do `top5_workshop` do cargo que têm cenário servível (não é `cenario_b` e atende `cenario_nota_minima`,
> quando ligada), casadas pelo nome em minúsculas. Resposta de competência que saiu do Top 5 (jornada anterior) não conta.
> Antes, contava qualquer resposta da empresa contra todas as competências com cenário: em Ibipeba, na 2ª jornada, 41 de
> 53 pessoas eram excluídas do convite e a parcial mostraria "x de 7". O convite nomeia a primeira competência servível.
| `resultado_perfil` | APPROVED/UTILITY | Tem `perfil_dominante` disponível |
| `plano_desenvolvimento` | APPROVED/UTILITY | Tem relatório `individual` em `relatorios` |
| `trilha_liberada_v2` | APPROVED/UTILITY | A trilha mais recente está ativa e ainda não tem atividade iniciada |
| `conteudo_semana` | APPROVED/UTILITY | Cadência/trilha ativas; semana acessível é de conteúdo e tem conteúdo configurado |
| `missao_semana_v2` | APPROVED/UTILITY | Cadência/trilha ativas; semana acessível é de aplicação |
| `semana_pendente_v2` | APPROVED/UTILITY | Semana acessível está atrás da semana do calendário |
| `conteudo_semana_pendente_v3` | APPROVED/UTILITY | Está atrás do calendário e a semana acessível é de conteúdo |
| `registro_desafio` | APPROVED/UTILITY | Semana acessível é de conteúdo, tem desafio e ainda não foi concluída |
| `registro_evidencia` | APPROVED/UTILITY | Semana acessível é de aplicação e ainda não foi concluída |
| `retomada_trilha` | APPROVED/UTILITY | Cadência ativa e último carimbo de envio ocorreu há pelo menos 14 dias |
| `encerramento_conteudo` | **PENDING/UTILITY** | Trilha ativa e semana acessível anterior à avaliação final; com o catálogo Meta carregado, fica indisponível enquanto pendente |
| `avaliacao_final_pendente` | APPROVED/UTILITY (medido 03/10/2026; a doc dizia "não submetido" desde 16/09) | Semana acessível é a do Cenário B, sem nota e sem nota sendo gerada |
| `trilha_concluida` | APPROVED/UTILITY | A trilha mais recente está concluída |

A prévia expõe a mesma sequência usada no disparo:

1. **No escopo** — universo da turma/empresa.
2. **Elegíveis** — passaram pela regra automática e têm parâmetros válidos.
3. **Após refinamentos** — permaneceram depois dos filtros opcionais.
4. **Vão receber** — não haviam recebido o slot e ficaram dentro do teto do lote.

Quem sai aparece separado por motivo: fora da regra automática, removido pelos refinamentos, já
recebeu ou adiado pelo teto. Prévia e envio chamam o mesmo núcleo
`prepararLoteTemplate`; a action passa o universo em `colabs.escopo` e os refinados em
`idsRefinados`, de modo que chamar o endpoint diretamente não contorna a regra.

⚠️ **Idempotência manual ainda não é idempotência entre caminhos.** A tela grava/lê `kind` com o
nome técnico do template; a cadência grava o papel (`pilula`, `evidencia`, `plano` etc.) e o script
de boas-vindas grava `boas_vindas`. Portanto “já receberam” na prévia significa “já receberam por
este caminho manual/mesmo `kind`”, não prova que o cron ou um script nunca enviou a mesma copy.
Até unificar os `kind`/`dedupe_key`, um reenvio cruzado deve ser decisão consciente do operador.

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
| `encerramento_conteudo` ⏳ | nome | **instituição** | link da semana acessível | — | — |
| `avaliacao_parcial` | nome | respondidos | total | link do assessment | — |
| `resultado_perfil` | nome | link | — | — | — |
| `plano_desenvolvimento` | nome | link de `/dashboard/pdi` | — | — | — |
| `trilha_liberada_v2` | nome | competência | total de semanas | link da trilha | — |
| `avaliacao_final_pendente` ⏳ | nome |  |  |  | `<slug>/<semana do Cenário B>` |
| `trilha_concluida` | nome | competência | total de semanas | link do resultado | — |
| `conteudo_semana_pendente_v3` | nome | semana acessível | tema | link da semana | — |
| `semana_pendente_v2` | nome | semana do calendário | semana pendente | — | `<slug>/<semana pendente>` |
| `recorte_demonstracao` | nome | link do Mapa (`linkDireto`) | — | — | — |
| `avaliacao_pendente` | nome | **instituição** | link de `/dashboard/perfil-comportamental/mapeamento` | — | — |
| `avaliacao_competencias` | nome | **competência** (`top5_workshop`) | link de `/dashboard/assessment` | — | — |
| `inicio_temporada` | nome | **competência(s)** do Top 5 de hoje, juntas com "e" | link de `/dashboard/assessment` | — | — |
| `inicio_temporada_v2` ⏳ | nome | **competência(s)** do Top 5 de hoje, juntas com "e" | **instituição** | link de `/dashboard/assessment` | — |
| `boas_vindas_v2` | nome | **instituição** | link de `/entrar` | — | — |
| `votacao_pendente_v3` ⏳ | nome | **instituição** | link de `/dashboard/votacao` | (3 variáveis: **sem prazo**) |  |
| `votacao_competencias` ⛔ | — | — | — | — | **sem contrato** (MARKETING): nenhum caminho envia; nunca saiu |
| `acesso_vertho_v2` ⏳ (e o legado `acesso_vertho`, mesmo contrato) | *(corpo sem variável)* | | | | URL: `app.vertho.ai/entrar?t={{1}}` |

⏳ = submetido em 05/10/2026, conferir o status na Meta. A v2 do lembrete de votação
(`votacao_pendente`, com `{{4}}` de prazo) saiu dos contratos: o webhook do QStash a recusa (400,
fail-closed), nenhum caminho a envia, e o texto dela segue só na Meta e nas mensagens já enviadas. O
`acesso_vertho` legado fica com contrato (o mesmo do v2) até a env virar v2. `perfil_pendente` e
`mapeamento_pendente` **não têm contrato** (não usados, §3.3): os convites seguem em
`avaliacao_pendente` e `avaliacao_competencias`, acima.
| `otp_acesso` | código | — | — | — | COPY_CODE nativo |

⚠️ **O link da missão vai SEM `formato`**, e isso é teste: semana de aplicação não entrega conteúdo
novo, então anunciar formato prometeria o que não existe — a classe da R1 do health, que nasceu de 17
pílulas anunciando "vídeo" numa semana sem vídeo.

⚠️ **Corpo sem variável NÃO leva componente.** O `acesso_vertho_v2` (e o legado `acesso_vertho`) tem
texto fixo; mandar `parameters: []` faz a Meta recusar a mensagem inteira. Ver
`lib/whatsapp/cloud-api.ts:554`.

🔑 **Contrato ≠ preenchimento.** O `CONTRATOS` diz a ORDEM dos parâmetros; quem diz de ONDE sai cada
valor é o mapa `RESOLVEDORES` em `lib/notifications/envio-template-lote.ts` — e os dois são
necessários, porque `{{2}}` é *instituição* num template e *competência* noutro. Os **16** com
resolvedor manual aparecem na tela. Os semanais usam a mesma semana acessível, plano e progresso da
cadência canônica; não há uma segunda régua inventada pela interface.

Ficam **fora da tela por decisão**: `acesso_vertho_v2`/`acesso_vertho`/`otp_acesso` (carregam
CREDENCIAL, gerada por pessoa; o caminho é o botão de magic link) e `recorte_demonstracao`
(destinatário é lead, não colaborador).

---

## 2. Aprovados sem uso e evolução dos consumidores

Aprovado não é o mesmo que ligado. A primeira lista existe na conta e nenhum caminho do app a
chama; a §2.1 registra os que saíram desse estado desde 16/08:

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

### 2.0 Estado dos 4 submetidos em 05/10/2026 (R-47, R-48, R-50, R-117)

Tabela de estado em 05/10/2026. **O estado real na Meta (PENDING, APPROVED, categoria,
`correct_category`) se confere lá**, com
`GET /{waba}/message_templates?fields=name,status,category,correct_category`, e não neste arquivo: a
categoria de um template novo muda durante a revisão, e a que volta na criação é provisória.

| Novo (submetido 05/10/2026) | Id na Meta | Substitui (continua APPROVED na Meta) | Estado no código | Achado |
|---|---|---|---|---|
| `acesso_vertho_v2` | 1333940663142012 | `acesso_vertho` | **Em uso** depois da troca da env. O `acesso_vertho` fica como **legado, mantido de propósito** em `TEMPLATES` e `CONTRATOS` até a env `WHATSAPP_TEMPLATE_ACESSO` virar v2: ela é Sensitive e não se lê de volta, então o login e o Beto seguem mandando o nome antigo até a troca. O Beto procura o último link pelos dois nomes (`ehTemplateDeAcesso`) | R-47 (15 minutos, a validade real é 1 hora) |
| `votacao_pendente_v3` | 1808140096867051 | `votacao_pendente` (v2) | **Em uso** na tela de Envios. A v2 saiu de `TEMPLATES`, dos `CONTRATOS` e da tela: nenhum caminho a envia; o envio deixou de calcular e de mandar o prazo | R-117 |
| `perfil_pendente` | 1075262552171268 | `avaliacao_pendente` | **NÃO usado, por decisão do dono.** Voltou MARKETING na Meta (custo ~6×). Sem registro em `TEMPLATES`, sem contrato, fora da tela: o convite do Perfil segue no `avaliacao_pendente` | R-48, R-50 (aceitos como estão) |
| `mapeamento_pendente` | 1098192242605290 | `avaliacao_competencias` | **NÃO usado, por decisão do dono.** Voltou MARKETING na Meta (custo ~6×). Sem registro em `TEMPLATES`, sem contrato, fora da tela: o convite do Mapeamento segue no `avaliacao_competencias` | R-48, R-50 (aceitos como estão) |

`avaliacao_parcial` e os demais não mudaram. Cada nome novo que entra só vale **depois de APPROVED**:
antes disso a Meta recusa o envio (132001) e a tela de Envios mostra o template como indisponível.
Para o `acesso`, a troca é a env (`printf '%s' acesso_vertho_v2 | vercel env add
WHATSAPP_TEMPLATE_ACESSO …`, nunca `echo`), e a confirmação é a R13 do health: o log
`[templates-ligados]` passa a mostrar `acesso=acesso_vertho_v2[APPROVED/UTILITY]`. O de nome fixo na
tela de Envios (`votacao_pendente_v3`) não é lido pela R13 (ela só olha os papéis da cadência, por
env); a tela mostra o status e a categoria vivos da Meta.

⚠️ **Idempotência por `kind` no lembrete de votação.** Quem recebeu a v2 não conta como "já
recebeu" no slot da v3 (a chave `votacao_pendente_v3:<pessoa>:dia:<AAAA-MM-DD>` mudou de prefixo): o
primeiro lembrete da v3 pode repetir o do mesmo dia.

### 2.1 Os antigos “sem consumidor” agora têm disparo deliberado (01/09)

Os seis que estavam sem fiação em 16/08 hoje têm contrato e resolvedor. Alguns também ganharam
cron/script; **todos** podem ser disparados deliberadamente pela tela de Envios, sempre depois da
prévia do público automático. Ter consumidor manual não cria agendamento: `trilha_concluida`, por
exemplo, continua saindo apenas quando um humano escolhe e confirma o lote.

| Template | Consumidor atual | Regra que impede público errado |
|---|---|---|
| `trilha_liberada_v2` | Tela de Envios | Trilha ativa e ainda não iniciada |
| `avaliacao_final_pendente` | Tela de Envios + cadência (papel `avaliacao_final`, desde 03/10/2026) | Semana acessível = Cenário B, não concluída, `feedback.finalizacao` fora de `processando` |
| `trilha_concluida` | Tela de Envios | Trilha mais recente concluída |
| `plano_desenvolvimento` | Cron + tela de Envios | Relatório individual/PDI existente |
| `avaliacao_pendente` | Tela de Envios | Mapeamento comportamental pendente, sem exigir cenários |
| `avaliacao_parcial` | Tela de Envios | Progresso estritamente entre zero e o total |
| `boas_vindas_v2` | Script + tela de Envios | Escopo explícito, WhatsApp e idempotência por template |
| `votacao_pendente_v3` (era `votacao_pendente`) | Tela de Envios | Votação aberta, sem voto registrado, cédula do cargo não vazia (`lib/votacao/cedula.ts`) |

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

## 3.2 O texto observado na Meta

Copiado e reconferido na Graph API até 01/09/2026 — é o corpo observado na conta, não o que o
código acha que manda. Serve para revisar copy sem abrir o WhatsApp Manager e para conferir o
`CONTRATOS` `{{n}}` a `{{n}}` antes de ligar qualquer papel. O
`encerramento_conteudo` está marcado PENDING; os demais desta seção estão aprovados.

🔁 **Exceção, os 2 de 05/10/2026 que entram:** `acesso_vertho_v2` e `votacao_pendente_v3` aparecem
com o texto **SUBMETIDO** (byte a byte o que o código tem e o que os guards
`tests/unit/integrations/whatsapp-template-*.test.ts` congelam), não com o observado: o estado
deles na Meta se confere lá (§2.0). Os antigos que eles substituem ficam marcados como "texto
antigo", porque é o que as mensagens já enviadas mostram.

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

**`encerramento_conteudo`** ⏳ · PENDING/UTILITY provisório · submetido 01/09/2026 (id 1109864224948022)

> Olá, **{{1}}**. A etapa de conteúdo do programa da **{{2}}** foi encerrada.
>
> Na sua trilha ainda há semanas em aberto. Concluí-las é o que libera a avaliação final do programa.
>
> Você pode continuar de onde parou em:
> **{{3}}**
>
> Os materiais da trilha continuam acessíveis na sua conta.

🔑 **Por que ele existe.** Quando um programa encerra, quem ficou para trás não tinha mensagem
verdadeira: o `retomada_trilha` afirma *"sem registro de atividade há mais de duas semanas"* — falso
para quem esteve ativo na quinzena — e não menciona encerramento nem avaliação; o `trilha_concluida`
afirma uma conclusão que não houve. São **29 das 36** pessoas com trilha ativa em Ibipeba (01/09).
Sem ele, o produto emudece na semana em que a cadência para.

⚠️ **Se voltar MARKETING, aceitar.** São 29 envios; re-submeter variação limítrofe arrisca a
recategorização de TODOS os UTILITY da WABA (§3.1). E o prazo NÃO está no corpo de propósito: data
fixa não cabe em template reutilizável, e prazo é o que empurra a copy para o tom promocional.

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

**`acesso_vertho_v2`** ⏳ · UTILITY · papel `acesso` · submetido 05/10/2026 (id 1333940663142012) ·
**corpo sem variável**, o dado vai no botão

> Seu link de acesso à Vertho foi gerado. Toque no botão abaixo para entrar.
>
> O link vale por 1 hora e só pode ser usado uma vez.
>
> _Rodapé:_ Não compartilhe este link com ninguém.
> _Botão:_ **Acessar Vertho** → `https://app.vertho.ai/entrar?t={{1}}`

**`acesso_vertho`** (legado, APPROVED/UTILITY) · texto antigo, ainda em uso enquanto a env
`WHATSAPP_TEMPLATE_ACESSO` apontar para ele

> Seu link de acesso à Vertho foi gerado. Toque no botão abaixo para entrar.
>
> O link expira em 15 minutos e só pode ser usado uma vez.
>
> _Rodapé:_ Não compartilhe este link com ninguém.
> _Botão:_ **Acessar Vertho** → `https://app.vertho.ai/entrar?t={{1}}`

⚠️ **A validade real do link é 1 hora, não 15 minutos** (medido em 03/10/2026: `mailer_otp_exp =
3600` no Supabase Auth; ver `lib/auth/validade-link.ts`). O corpo do `acesso_vertho` subestima, e
trocar o texto é versão nova do template na Meta: é o `acesso_vertho_v2`. O e-mail e o WhatsApp em
texto dizem 1 hora; o Beto não cita número no texto que acompanha este template, para não
contradizê-lo na mesma conversa enquanto a env puder apontar para o legado (o texto vale com os dois),
e usa a validade real para dizer se o link anterior foi usado ou expirou. Depois da troca da env e da
R13 confirmando a v2 em produção, citar "1 hora" no Beto passa a ser seguro.

No Beto do WhatsApp, o template de acesso é **obrigatório** (`whatsappTemplateRequired: true`): falha de
template não cai no legado de texto livre e o token nunca passa pelo modelo de IA. O emissor
preserva o `numeroId` que recebeu a conversa, aplica idempotência por mensagem, intervalo de 5
minutos e teto de 3 links por telefone em 24 h. Administradores da plataforma usam o slug virtual
`plataforma`, que termina em `/admin-v2` sem conceder permissão por si só. A rota `/entrar` só
consome o token após confirmação explícita, protegendo-o do preview automático do WhatsApp.
Detalhes: `docs/BETO-CANAIS.md` §2.

**`otp_acesso`** · AUTHENTICATION — botão nativo de copiar código

> Seu código de verificação é **{{1}}**. Para sua segurança, não o compartilhe.
>
> _Rodapé:_ Expira em 10 minutos.
> _Botão:_ **Copiar código** (COPY_CODE nativo)

---

### Templates de disparo deliberado (§2.1)

Os corpos abaixo estão aprovados e disponíveis na tela; “deliberado” significa que não existe um
cron próprio para esse momento. A regra automática descrita no §1 é aplicada antes de cada lote.

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

**`avaliacao_competencias`** · convite do Mapeamento, para quem já concluiu o Perfil

> Olá, **{{1}}**. Você concluiu o mapeamento comportamental, mas sua avaliação de **{{2}}** ainda não foi iniciada.
>
> Você pode começar em:
> **{{3}}**
>
> São 4 cenários, cerca de 10 minutos, e é ela que define a sua trilha de desenvolvimento.

⚠️ **Três imprecisões conhecidas nos textos de convite, ACEITAS por decisão do dono (05/10/2026):**
o `avaliacao_pendente` diz "cerca de 15 minutos" (a tela diz uns 5) e "é ela que define a sua
trilha" (o Perfil não define trilha), e o `avaliacao_competencias` diz "São 4 cenários" (é 1 cenário
com 4 perguntas por competência) e também "define a sua trilha". Os substitutos `perfil_pendente` e
`mapeamento_pendente` (§3.3) voltaram MARKETING e não são usados: corrigir as imprecisões custaria
~6× por mensagem.

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

**`votacao_pendente_v3`** ⏳ (lembrete da votação v3, **sem prazo**, DEPOIS das boas-vindas) ·
submetido 05/10/2026 (id 1808140096867051) · substitui a v2 `votacao_pendente`

> Olá, **{{1}}**. Seu voto na escolha das competências do seu cargo, no programa da **{{2}}**, ainda não foi registrado.
>
> Você pode votar em:
> **{{3}}**
>
> A votação leva cerca de 5 minutos, e o resultado define as competências trabalhadas na Jornada.

**`votacao_pendente`** (v2, APPROVED/UTILITY desde 25/09, substituída) · texto antigo, com o prazo que não existia

> Olá, **{{1}}**. Seu voto na escolha das competências do seu cargo, no programa da **{{2}}**, ainda não foi registrado.
>
> Você pode votar em:
> **{{3}}**
>
> O prazo para registro do voto é **{{4}}**, às 23h59. A votação leva cerca de 5 minutos, e o resultado define as competências trabalhadas no programa.

⛔ **`votacao_competencias`** — a v1, APROVADA COMO MARKETING em 2 minutos (25/09/2026), fora da tela.
O evento de categoria veio sem motivo (classificador automático). Lado a lado com os 21 UTILITY
aprovados, ela fugia do molde em quatro pontos, que a v2 corrige e o guard
`tests/unit/integrations/whatsapp-templates.test.ts` agora congela (os três primeiros):
chamada no imperativo antes do link ("Para votar, acesse:"), prazo como janela que fecha ("fica
aberta até"), benefício vendido ("Seu voto ajuda a definir"), e abertura anunciando um EVENTO
("A votação … está aberta") em vez de um fato sobre a pessoa ("Seu voto … ainda não foi registrado").
O texto da v1, para comparação:

> Olá, **{{1}}**. A votação de competências do seu cargo está aberta no programa da **{{2}}**.
>
> Você escolhe, em ordem, as 5 competências mais importantes para o seu trabalho. Leva cerca de 5 minutos, e a votação fica aberta até as 23h59 de **{{3}}**.
>
> Para votar, acesse:
> **{{4}}**
>
> Seu voto ajuda a definir as competências que o programa vai desenvolver.

A v2 (`votacao_pendente`) dava o prazo "amanhã" em Brasília no momento do envio (decisão do dono
de 25/09). ⚠️ Mas a mensagem PROMETIA um prazo que o sistema não executa: quem fecha a votação é o
admin, na aba Votação, e ele não fecha sozinho às 23h59 (R-117). A **v3 tira o prazo** (3
variáveis) e o envio deixou de calculá-lo e de mandá-lo; se um dia o dono quiser um prazo, é ele
que precisa existir na tela da votação antes de voltar para o texto.

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

## 3.3 Versões novas SUBMETIDAS à Meta em 05/10/2026

O dono aprovou os textos e o coordenador os **submeteu** à Meta em 05/10/2026, os quatro com **nomes
novos** (template aprovado não se edita sem nova revisão, e apagar um nome o queima). Os antigos
seguem APPROVED na Meta. Cada proposta manteve o molde que a Meta aceitou como UTILITY (§3.1):
informa, não promove, sem trecho que descreva o programa além do necessário.

⚠️ **O estado real de cada um (PENDING ou APPROVED, a categoria e a `correct_category`) se confere na
Meta, e não neste arquivo:**

```bash
GET /{WABA_ID}/message_templates?fields=name,status,category,correct_category
```

A categoria que volta na submissão é provisória e pode mudar na revisão (§3.1, §5). Todos nasceram
`PENDING/UTILITY`. Leitura do coordenador em 05/10/2026, que envelhece: `acesso_vertho_v2` e
`votacao_pendente_v3` ficaram APPROVED/UTILITY, e `perfil_pendente` e `mapeamento_pendente` voltaram
**MARKETING**.

| Novo | Id na Meta | Substitui | O que o texto aprovado dizia de errado | Achado | Decisão |
|---|---|---|---|---|---|
| `acesso_vertho_v2` | 1333940663142012 | `acesso_vertho` | "O link expira em 15 minutos", mas a validade real é 1 hora (`mailer_otp_exp = 3600`) | R-47 | **Entra** (APPROVED/UTILITY) |
| `votacao_pendente_v3` | 1808140096867051 | `votacao_pendente` (v2) | Promete prazo "às 23h59", mas a votação só fecha quando o admin a desliga | R-117 | **Entra** (APPROVED/UTILITY) |
| `perfil_pendente` | 1075262552171268 | `avaliacao_pendente` | "A avaliação leva cerca de 15 minutos" (a tela diz uns 5) e "é ela que define a sua trilha" (o Perfil não define trilha); chama de avaliação o que o produto chama de Perfil | R-48, R-50 | **NÃO usado** (MARKETING, ~6×) |
| `mapeamento_pendente` | 1098192242605290 | `avaliacao_competencias` | "avaliação de {{2}}" (o produto chama de Mapeamento); "São 4 cenários" (é 1 cenário com 4 perguntas por competência); "define a sua trilha" | R-48, R-50 | **NÃO usado** (MARKETING, ~6×) |

### Os dois que entram

Os textos submetidos, com as variáveis, estão na §3.2 (blocos marcados com ⏳), byte a byte o que o
código tem.

- `acesso_vertho_v2`: só a frase da validade (15 minutos viram 1 hora); botão e rodapé iguais, sem
  variável no corpo. O exemplo submetido é o do botão,
  `https://app.vertho.ai/entrar?t=ibipeba~pkce_a1b2c3d4e5f6a7b8`. Depois de APPROVED, a env
  `WHATSAPP_TEMPLATE_ACESSO` passa a `acesso_vertho_v2` (gravar com `printf '%s'`, nunca `echo`) e o
  log `[templates-ligados]` da R13 confirma. Até lá o texto antigo segue valendo, e o app já diz a
  validade real de 1 hora em todo texto que não é template.
- `votacao_pendente_v3`: 3 variáveis (nome, instituição, link). **Sai a `{{4}}` do prazo**, e o envio
  (`lib/notifications/envio-template-lote.ts` e a tela de Envios) deixou de calcular e de mandar o
  prazo. Exemplo submetido: Maria, 4Life Educação,
  `https://4life-educacao.vertho.ai/dashboard/votacao`. Nome fixo na tela de Envios: nada a
  configurar, e a tela mostra o status vivo da Meta (PENDING aparece indisponível). Se o dono quiser
  um prazo no futuro, é ele que precisa existir na tela da votação.

### Os dois submetidos e NÃO usados

`perfil_pendente` (id 1075262552171268) e `mapeamento_pendente` (id 1098192242605290) foram
submetidos em 05/10/2026, **voltaram MARKETING** na Meta e **NÃO são usados, por decisão do dono**
(custo ~6× por mensagem). Os convites do Perfil e do Mapeamento **seguem nos textos antigos**
`avaliacao_pendente` e `avaliacao_competencias`, que continuam APPROVED/UTILITY. Por isso o código não
os registra em `TEMPLATES`, não tem contrato para eles e a tela de Envios não os oferece.

O texto submetido de cada um, caso a decisão mude (variáveis na mesma ordem dos antigos):

**`perfil_pendente`** (nome, instituição, link)

> Olá, **{{1}}**. Seu Perfil comportamental no programa da **{{2}}** ainda não foi iniciado.
>
> Você pode começar em:
> **{{3}}**
>
> O Perfil leva uns 5 minutos.

**`mapeamento_pendente`** (nome, competência, link)

> Olá, **{{1}}**. Você concluiu o Perfil comportamental, mas o seu Mapeamento de **{{2}}** ainda não foi iniciado.
>
> Você pode começar em:
> **{{3}}**
>
> É um cenário com 4 perguntas, em cerca de 10 minutos. Ele orienta o conteúdo da sua Jornada.

Exemplos submetidos: `perfil_pendente` = Maria, Secretaria Municipal de Ibipeba/BA,
`https://ibipeba.vertho.ai/dashboard`; `mapeamento_pendente` = Maria, Autocuidado e bem-estar
profissional, `https://macae.vertho.ai/dashboard/assessment`. O "cerca de 10 minutos" do Mapeamento é
o do texto antigo aprovado, **não foi medido**.

⚠️ **Imprecisões conhecidas e ACEITAS nos textos antigos de convite**, enquanto os novos não forem
usados: `avaliacao_pendente` diz "cerca de 15 minutos" (a tela diz uns 5) e "é ela que define a sua
trilha" (o Perfil não define trilha); `avaliacao_competencias` diz "São 4 cenários" (é 1 cenário com
4 perguntas por competência) e "define a sua trilha". São as três imprecisões da revisão (R-48 e
R-50), aceitas pelo dono porque corrigi-las custaria ~6× em cada convite.

`avaliacao_parcial` ("X de Y cenários registrados") não entrou: conferir se a unidade "cenário" ainda
é a que a tela de resposta do Mapeamento mostra antes de decidir.

### `inicio_temporada`: a abertura de uma temporada nova (id 1632488078229341; VOLTOU MARKETING em 08/10/2026)

🔴 **Reclassificado.** Submetido UTILITY em 08/10/2026, a Meta o aprovou e o reclassificou para **MARKETING** às 08:08 BRT
(`previous_category: UTILITY`), cerca de 8 minutos depois, como já tinha feito com `perfil_pendente` e
`mapeamento_pendente` em 05/10. A leitura da API 5 minutos depois ainda mostrava `PENDING/UTILITY`: a reclassificação
defasa (o mesmo aconteceu com o `conteudo_semana_pendente`). Custo por mensagem, pelo comentário de 15/08 em
`pilula-template.ts` (não reconferido no rate card): ~R$ 0,45 em MARKETING contra ~R$ 0,08 em UTILITY. O código declara
MARKETING e a tela de Envios o rotula "(cobrado como MARKETING)". **Usar ou não é decisão do dono.** A tentativa de ficar
em UTILITY é o `inicio_temporada_v2`, abaixo.

Boas-vindas e o primeiro passo para quem entra numa turma depois da primeira (Ibipeba, "Temporada 2").
Existe ao lado do `avaliacao_competencias` porque aquele é um **lembrete** ("ainda não foi iniciada"); a
abertura reconhece o ciclo novo. Quem recebe é a mesma regra do lembrete (`aptaAoMapeamento`), então os dois
nunca divergem sobre o público; muda só o `{{2}}`, que aqui nomeia **todas** as competências servíveis do Top 5.

> Olá, **{{1}}**. Boas-vindas à sua temporada de **{{2}}**.
>
> Para começar, faça o mapeamento de competências no link abaixo:
> **{{3}}**
>
> São 4 perguntas sobre uma situação real, cerca de 10 minutos por competência. É a partir dele que montamos a sua trilha de desenvolvimento.
>
> Boa temporada!

Exemplo: Maria, Comunicação, `https://ibipeba.vertho.ai/dashboard/assessment`. Escolhas conferidas na tela do
assessment (`Assessment.explanation`): "mapeamento" (o botão é "Começar mapeamento"), "4 perguntas" e "~10 min
por competência"; sem presumir gênero ("Boas-vindas", nunca "bem-vinda"); sem "São 4 cenários".

⚠️ **Risco de categoria.** O `mapeamento_pendente` (nome, competência, uma ação, "ele orienta o conteúdo da sua
Jornada") é parente próximo deste texto e voltou MARKETING em 05/10/2026 (~6× o custo). O trecho de benefício
("É a partir dele que montamos a sua trilha") é o ponto de dúvida: o `avaliacao_competencias` APPROVED/UTILITY
também tem um, então não há prova de que seja ele. Só vale **depois de APPROVED** e com a categoria conferida
na Meta (`correct_category`); se voltar MARKETING, a decisão de usar é do dono (custo). A versão enxuta, sem a
frase de benefício, é a próxima a tentar, com nome novo. Submetido com o OK do dono em 08/10/2026
(`scripts/_sync-templates-whatsapp.ts --so=inicio_temporada --executar`): nasceu `PENDING/UTILITY`, lido de volta
na Meta no mesmo dia. **O estado de hoje se confere lá:** `GET /{WABA_ID}/message_templates?name=inicio_temporada&fields=id,name,status,category,previous_category,correct_category`.

### `inicio_temporada_v2`: a versão enxuta (SUBMETIDO à Meta em 08/10/2026 08:36 BRT, id 1120910870528165)

A 2ª e última tentativa de ficar em UTILITY. Sai o que o `inicio_temporada` tinha de acolhimento ("Boas-vindas", "Boa
temporada!") e a frase de benefício ("É a partir dele que montamos a sua trilha"); entra a **instituição** como âncora, o
traço do `boas_vindas_v2` e do `votacao_pendente_v3`, que seguem APPROVED/UTILITY (lido na Meta em 08/10/2026). Mesma regra
de quem recebe; exige o nome da instituição (sem ele o corpo diria "no programa da , já está disponível").

> Olá, **{{1}}**. O mapeamento de competências da sua temporada de **{{2}}**, no programa da **{{3}}**, já está disponível.
>
> Você pode fazê-lo em:
> **{{4}}**
>
> São 4 perguntas sobre uma situação real, cerca de 10 minutos por competência.

Exemplo: Maria, Comunicação, Secretaria Municipal de Ibipeba/BA, `https://ibipeba.vertho.ai/dashboard/assessment`. Diz
"já está disponível" e não "já começou" porque a turma abre em diagnóstico e a trilha só começa na data dela.

⚠️ **Sem garantia.** O `mapeamento_pendente` também era um aviso de estado, sem benefício vendido, e voltou MARKETING:
o classificador da Meta não é previsível pelo conteúdo. **Só vale depois de APPROVED e com a categoria lida na Meta**,
esperando alguns minutos (a reclassificação defasa). Se voltar MARKETING, não há terceira tentativa: a escolha fica entre
usar o `inicio_temporada` cobrado como MARKETING e mandar o `avaliacao_competencias` (UTILITY), e o texto que perder sai
de `TEMPLATES`, de `CONTRATOS` e da tela, como foi feito com `perfil_pendente` e `mapeamento_pendente`.

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
papel desligado aparece como `(desligado)`, que é o caso que o silêncio esconde. Depois da troca da
env do acesso, a linha mostra `acesso=acesso_vertho_v2[APPROVED/UTILITY]`; se a env for trocada ANTES
de o v2 estar APPROVED, a R13 acusa `template-ligado-nao-aprovado` (crítico) e a mensagem não sai. Os
templates de nome fixo da tela de Envios (como o `votacao_pendente_v3`) não passam pela R13: o status
e a categoria deles estão na própria tela.

### 4.1 Disparo MANUAL: o nome vem do `CONTRATOS`, não do papel

O `.env.local` **não tem** as `WHATSAPP_TEMPLATE_*` de produção (elas são *Sensitive* na Vercel e não
voltam pelo `vercel env pull`). Então, num script que roda o motor fora do cron, `templateAtivo()`
devolve `null` e o código cai no **texto livre**, que fora da janela de 24h a Meta não entrega. Quem
dispara na mão precisa escolher o nome — e o lugar de escolher é o `CONTRATOS` de
`lib/notifications/pilula-template.ts`, que documenta, por template, qual é o preferido e por quê.

🔴 **`APPROVED` responde "posso enviar?", nunca "devo enviar por este?".** `Medido: 09/09/2026` — no
catch-up da P2 do Ibipeba eu resolvi o nome pelo PAPEL (`pilula` → `pilula_semanal`), conferi só o
status na Meta e mandei **23 mensagens em MARKETING**: ~R$ 10,35 contra ~R$ 1,84 do `conteudo_semana`
(UTILITY), que o próprio `CONTRATOS` marca como *"O PREFERIDO desde 15/08/2026 … 6× menos pela mesma
entrega"*. Nada quebrou, e é esse o ponto: a mensagem sai, entrega, e só a fatura sabe. A copy também
muda, então as 23 leram *"Seu vídeo de hoje: tema"* em vez do *"Olá, {nome}. O conteúdo da semana N…"*
que a cadência usa desde 15/08.

**Antes do `--aplicar`, imprima o nome resolvido E a categoria** (o `_testar-template.ts` já imprime o
resolvido; a categoria vem do bloco de conferência acima). Vale para qualquer lote manual, não só
para a pílula.

⚠️ Ao gravar uma env var de template: `printf '%s' 'nome' | vercel env add …`, **nunca `echo`** (o
`\n` colado vira `132001` no cron, e a mensagem não sai).

🔴 **O NÚMERO também não vem do local.** `WHATSAPP_NUMEROS_EXTRA` (o vínculo empresa → número, ex.:
4Life no +55 11 5199-1865) só existe em produção. Script que chama `dispararLoteTemplate` ou
`enviarTemplateCloud` na máquina do dev resolve o número ali e sai pelo INICIAL (Pilotos), calado.
Para lote manual por script, monte com `prepararLoteTemplate` e **enfileire com
`enfileirarLoteTemplate`**: o QStash entrega em `app.vertho.ai/api/webhooks/qstash/whatsapp-cis` e a
produção resolve o número pelo `empresaId`, igual à tela. `Medido: 26/09/2026` — boas-vindas e
`votacao_pendente` para as 3 pessoas de teste da 4Life, 6/6 com `from_phone_id=1250415214830990`.

---

## 5. Estado da Meta (01/09) e histórico da fila de 30/08

Consulta atual: `conteudo_semana_pendente` e `_v2` terminaram
**APPROVED/MARKETING**; `conteudo_semana_pendente_v3` terminou
**APPROVED/UTILITY**. O único pendente da conta é `encerramento_conteudo`
(PENDING/UTILITY provisório). Abaixo fica o histórico da rodada porque ele registra por que o v3
removeu o botão e qual sinal de categoria foi observado.

⏳ **`conteudo_semana_pendente`** — submetido 30/08/2026 (`id=4542094136055090`). A SEGUNDA de quem
está travado: afirma o conteúdo da semana (com tema e botão para o formato) **e** que ela continua
pendente, numa mensagem só.

🔴 **A CATEGORIA JÁ VIROU, E EM MINUTOS.** A criação devolveu `PENDING/UTILITY`; a consulta feita
**5 minutos depois**, na mesma sessão, devolveu `PENDING/MARKETING` — 6× o custo. É a terceira vez
que esta base observa a reclassificação silenciosa (14/08 com 4 de 8; 15/08 com `pilula_semanal`
segurando UTILITY por vinte minutos), e a primeira em que o intervalo foi curto o bastante para
alguém ver acontecer. **Nunca registre a categoria da resposta de criação** — consulte
`GET /{waba}/message_templates?fields=name,status,category` depois, e de novo antes de ligar a env.

⏳ **`conteudo_semana_pendente_v2`** — submetido 30/08/2026 (`id=908796505239144`), MESMO momento e
MESMO contrato do v1, com a ordem invertida. Corre em paralelo em vez de esperar o veredito: o
precedente é o `semana_pendente` v1/v2 (23/08), e o perdedor só é apagado depois que o vencedor
aprova **e** entrega.

⏳ **`conteudo_semana_pendente_v3`** — submetido 30/08/2026 (`id=2450758295411521`). Link **no
corpo**, sem botão, e é o experimento que muda a variável certa.

### 🔴 O sinal é o BOTÃO, e isto inverte o que estava escrito no código

Os v1 (anuncia + cobra) e v2 (só cobra) voltaram **MARKETING**. A hipótese do v2 — "anunciar e cobrar
na mesma mensagem" — morreu com ele: o v2 não anuncia e caiu igual. Cruzando FORMA × categoria real
nos **20 templates da conta** (medido 30/08):

| | MARKETING | UTILITY |
|---|---|---|
| link em **BOTÃO** | 3 | 1 |
| link **no CORPO** | 2 | 14 |

O par mais limpo é interno e não depende de estatística: **`conteudo_semana` (link no corpo) é
UTILITY** e **`conteudo_semana_v2` (a MESMA copy, link em botão) é MARKETING**.

⚠️ **O comentário do `conteudo_semana_v2` afirmava o contrário** — que "link no corpo é o sinal que
mais se correlacionou com reclassificação para MARKETING" — e foi por causa dele que o v1 e o v2
nasceram com botão, queimando duas submissões. A frase era de 14/08, quando nenhum template com
botão tinha voltado da revisão. Corrigida no código, com a linha original preservada e datada:
comentário que ensina o oposto do medido custa uma submissão a cada pessoa que o lê.

🔴 **ARMADILHA CARREGADA: `conteudo_semana_v2` está APPROVED/MARKETING e nunca foi ligado.**
`whatsapp_mensagens_enviadas` (30 dias) tem **198 envios de `conteudo_semana`** e **zero** dele — ou
seja, a cadência roda no UTILITY e não há custo de 6× correndo. Mas basta alguém apontar
`WHATSAPP_TEMPLATE_PILULA` para "o desenho novo" e a mensagem de MAIOR volume da operação passa a
custar 6× sem nenhum sintoma. Ligar só depois de conferir a categoria na Meta.

O veredito final confirmou o experimento: v1/v2 ficaram MARKETING e o v3, com link no corpo, ficou
UTILITY. v1 e v2 compartilham um montador; o v3 tem contrato PRÓPRIO — quatro variáveis, link em
`{{4}}` e **sem botão**. Trocar a env entre v3 e os irmãos exige o contrato correspondente, travado
em `tests/unit/p1-conteudo-pendente.test.ts`.

Papel `conteudo_pendente` · `WHATSAPP_TEMPLATE_CONTEUDO_PENDENTE`. Contrato do v3:
`{{1}}`=nome, `{{2}}`=semana **ACESSÍVEL**, `{{3}}`=tema, `{{4}}`=link da semana no corpo.

⚠️ **A semana aqui é a ACESSÍVEL — o oposto do `semana_pendente_v2`**, onde `{{2}}` é o calendário.
Quem está travado tem conteúdo e pendência na MESMA semana, e é isso que permite dizer as duas coisas
sem repetir variável. Mandar o calendário é typecheck-limpo e entrega "o conteúdo da semana 7 está
disponível" com tema de outra semana e botão para a porta fechada. Travado em
`tests/unit/p1-conteudo-pendente.test.ts` (validado por mutação).

🔑 **Por que ele existe (medido 30/08/2026).** A segunda de quem está travado não entregava nada de
novo: a semana acessível não muda, então era a MESMA pílula da semana anterior, mesmo tema e mesmo
link, sem uma palavra sobre o que falta. Na coorte real de Ibipeba e Macaé, **46 das 74 pessoas** não
concluíram nada desde 24/08 (37 nunca concluíram nada em toda a trilha). Efeito colateral que
ninguém tinha notado: com a pendência ocupando o slot da terça, essas pessoas **nunca** recebiam o
segundo conteúdo da semana. Ligar esta chave move a pendência para a segunda e devolve a P2 à terça,
sem uma única mensagem a mais.

✅ **`semana_pendente_v2`** — APPROVED/UTILITY, submetido 23/08/2026
(`id=28202583309372601`). Afirma que a semana anterior continua pendente e leva, **em botão**, para a
semana que DESTRAVA — nunca para a trancada, que é o defeito que ele existe para corrigir.
Papel `pendencia` · `WHATSAPP_TEMPLATE_PENDENCIA` (gravada em produção em 25/08).
Contrato: `{{1}}`=nome, `{{2}}`=semana do calendário, `{{3}}`=semana pendente; botão `<slug>/<semana
PENDENTE>`. Fail-closed sem `semanaPendente`: corpo com buraco e botão `/NaN` não dão erro na API,
chegam assim na mão da pessoa.

🔴 **TEMPLATE `PENDING` NÃO SE EDITA — e isso define o custo de errar a copy.** A v1
(`semana_pendente`, `id=28457950447135990`) saiu dizendo *"a conversa de evidências com a Mentora"*.
Ao tentar corrigir:

```
HTTP 400 · error_subcode 2388003
"Os modelos de mensagem só podem ser editados se tiverem sido rejeitados."
```

Como apagar QUEIMA o nome enquanto a exclusão processa (§14/08), o caminho foi `_v2` em paralelo — o
v1 só sai depois que este aprovar. **O dry-run do `_sync-templates-whatsapp.ts` é o último ponto
barato de revisão da copy**; depois do `--executar`, corrigir custa um nome novo.

🔑 **Por que "Mentora" estava errado, e a régua que sai disso.** Era a **única** ocorrência da palavra
em todo o `pt-BR.json` — não é vocabulário do produto. A tela chama o card de "Evidências" e o botão
de "Levantar evidências"; e o que a pessoa reconhece como mentor é o **Beto**, que vive noutra tela e
não conclui semana nenhuma. A copy empurraria para o componente errado. **O nome na mensagem tem que
ser o nome do BOTÃO que a pessoa vai apertar** — se a palavra não aparece na tela de destino, não
pode aparecer na mensagem. A frase errada estava também em `SeasonWeek.locked.rule` (4 idiomas),
corrigida no mesmo commit: copiar copy de uma tela não a valida, a tela pode ser a origem do erro.

⚠️ **Não é bloqueante para a cadência.** O redirecionamento para a semana acessível (F-I22) roda pelo
`conteudo_semana`, já aprovado. Este template é o reforço explícito quando aprovar.

### Estado anterior (20/08)

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
