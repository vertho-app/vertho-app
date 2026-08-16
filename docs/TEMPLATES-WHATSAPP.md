# Templates do WhatsApp em uso

Registro operacional dos templates da Meta que estão **aprovados E ligados a algum caminho do
app**. Decisões de categoria, copy e migração ficam em `docs/INBOX-WHATSAPP.md`; aqui é o "o que
está no ar e com qual contrato".

> **Levantado em 16/08/2026.** Fontes: Graph API da WABA (status e categoria), `CONTRATOS` em
> `lib/notifications/pilula-template.ts` (parâmetros), `git grep` dos call-sites e
> `notification_deliveries` (o que realmente saiu).
>
> ⚠️ **Este arquivo envelhece.** A categoria de um template muda na revisão da Meta **depois** de
> aprovado (4 de 8 viraram MARKETING em 14/08), e o nome ligado a cada papel vive numa env var
> *Sensitive* que nem o CLI lê. Para o estado ATUAL, a fonte é a **R13 do health**
> (`checarTemplatesLigados`), que pergunta à Meta e imprime o observado no log
> `[templates-ligados]`. Este doc é ponto de partida, não autoridade.

---

## 1. Os 7 que estão em uso

Cada papel da cadência resolve o nome do template por env var (`ENV_DO_PAPEL` em
`lib/notifications/pilula-template.ts`). Papel sem env var configurada fica **desligado** e o envio
cai no caminho legado — silenciosamente, que é o motivo da R13 existir.

| # | Template | Cat. | Papel / env | Quando dispara | Call-site |
|---|---|---|---|---|---|
| 1 | `conteudo_semana` | UTILITY | `pilula` · `WHATSAPP_TEMPLATE_PILULA` | Dias de pílula (P1/P2 da cadência da empresa) | `lib/fase4/trigger-diario-empresa.ts:287` |
| 2 | `registro_evidencia` | UTILITY | `evidencia` · `WHATSAPP_TEMPLATE_EVIDENCIA` | Quinta de semana de **aplicação** | `lib/fase4/trigger-diario-empresa.ts:523` |
| 3 | `registro_desafio` | UTILITY | `desafio` · `WHATSAPP_TEMPLATE_DESAFIO` | Quinta de semana de **conteúdo** | `lib/fase4/trigger-diario-empresa.ts:523` |
| 4 | `retomada_trilha` | UTILITY | `retomada` · `WHATSAPP_TEMPLATE_RETOMADA` | 2+ semanas sem atividade | `lib/fase4/trigger-diario-empresa.ts:472` |
| 5 | `resultado_perfil` | UTILITY | `perfil` · `WHATSAPP_TEMPLATE_PERFIL` | Relatório individual pronto (envio deliberado, em lote) | `scripts/_avisar-perfil-pronto.ts:103` |
| 6 | `acesso_vertho` | UTILITY | `acesso` · `WHATSAPP_TEMPLATE_ACESSO` | Magic link pedido no login | `lib/notifications/access-link-service.ts:172` |
| 7 | `otp_acesso` | AUTHENTICATION | — (nome fixo no código) | Código de 6 dígitos do login por telefone | `app/api/auth/phone-otp/request/route.ts:83` |

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
| `retomada_trilha` | nome | link | — | — | — |
| `resultado_perfil` | nome | link | — | — | — |
| `acesso_vertho` | *(corpo sem variável)* | | | | URL: `app.vertho.ai/entrar?t={{1}}` |
| `otp_acesso` | código | — | — | — | COPY_CODE nativo |

⚠️ **Corpo sem variável NÃO leva componente.** O `acesso_vertho` tem texto fixo; mandar
`parameters: []` faz a Meta recusar a mensagem inteira. Ver `lib/whatsapp/cloud-api.ts:554`.

---

## 2. Aprovados e NÃO usados

Aprovado não é o mesmo que ligado. Estes existem na conta e nenhum caminho do app os chama:

| Template | Cat. | Por que está fora |
|---|---|---|
| `pilula_semanal` | ⚠️ MARKETING | Foi o da pílula até 16/08. Trocado por `conteudo_semana` — mesmo momento, **6× mais barato**. Tem contrato no código; se voltar a ser ligado, volta o custo |
| `nudge_inatividade` | ⚠️ MARKETING | Substituído por `retomada_trilha`. Mesma função, mesma pessoa, 6× mais barato — a diferença é a voz do texto, e é ela que a Meta cobra |
| `missao_semana` | ⚠️ MARKETING | Semana de aplicação. **Sem contrato no código** — não pode ser ligado sem escrever um |
| `missao_aplicacao` | ⚠️ MARKETING | Gêmeo do anterior: mesmo momento, dois templates. Também sem contrato |
| `boas_vindas` | UTILITY | Da fase Z-API. Sem contrato; o convite hoje sai por `acesso_vertho` |
| `hello_world` | UTILITY | Amostra da Meta |

🔴 **A semana de aplicação é o único momento sem opção UTILITY aprovada.** `missao_semana_v2`
(UTILITY) está PENDING; enquanto não sair, disparar essa semana custa 6× ou não sai.

---

## 3. O que isso custa

No Brasil: **UTILITY R$ 0,06–0,09** · **MARKETING R$ 0,40–0,55** · AUTHENTICATION é a mais barata.
Em ~400 pessoas semanais, a pílula sozinha é a diferença entre ~R$ 25 e ~R$ 180 por semana.

Os 7 em uso são UTILITY ou AUTHENTICATION — **nenhum MARKETING ligado** (16/08). A R13 do health
avisa se isso mudar, porque MARKETING não tem sintoma: aprova, envia, entrega, e só aparece na fatura.

---

## 4. Como conferir sem confiar neste arquivo

```bash
# Status e categoria AGORA, direto na Meta
node -e "process.loadEnvFile('.env.local');
 fetch('https://graph.facebook.com/v22.0/'+process.env.WABA_ID+'/message_templates?limit=200&access_token='+process.env.META_WHATSAPPBUSINESS_API)
 .then(r=>r.json()).then(j=>j.data.forEach(t=>console.log(t.status,t.category,t.name)))"

# Uma mensagem pelo caminho REAL, imprimindo o template resolvido antes de enviar
npx tsx scripts/_testar-template.ts --papel=pilula --telefone=55… --slug=ibipeba --empresa-id=… 
```

E o que está ligado **em produção** sai no log `[templates-ligados]` a cada health estrutural —
papel desligado aparece como `(desligado)`, que é o caso que o silêncio esconde.

⚠️ Ao gravar uma env var de template: `printf '%s' 'nome' | vercel env add …`, **nunca `echo`** (o
`\n` colado vira `132001` no cron, e a mensagem não sai).

---

## 5. Pendentes na Meta (16/08)

`avaliacao_pendente` · `avaliacao_parcial` · `boas_vindas_v2` · `missao_semana_v2` ·
`plano_desenvolvimento` · `trilha_concluida` · `trilha_liberada_v2` — todos submetidos como UTILITY.

⚠️ `conteudo_semana_v2` e `trilha_liberada` já foram reclassificados para **MARKETING** antes mesmo
de aprovar. O `conteudo_semana_v2` era a reescrita do nº 1 desta lista e saiu **pior** que o
original: se aprovar, não vale ligar.

**Nenhum deles pode ser ligado antes de `APPROVED`** — template PENDING é recusado no envio (132001)
e o papel fica mudo. Ao ligar qualquer um, escreva o contrato em `CONTRATOS` **no mesmo commit**:
o mapa é fail-closed, então nome sem contrato simplesmente não envia.
