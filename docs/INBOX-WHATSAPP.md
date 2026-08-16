# Caixa de entrada do WhatsApp

> **Status: NO AR** (fases 1 e 2 implementadas). Escrita como proposta em 14/08/2026, construída no
> mesmo dia, **revisada e corrigida em 15/08/2026** — o que mudou nessa revisão está na §9, que é o
> lugar para começar se você já conhece o resto.
>
> Onde está o quê:
>
> | Peça | Arquivo |
> |---|---|
> | Webhook (assinatura, mensagens, status, templates) | `app/api/webhooks/whatsapp-cloud/route.ts` |
> | Decisão de dono do telefone (pura) | `lib/whatsapp/resolver-dono.ts` |
> | Envio pela Cloud API | `lib/whatsapp/cloud-api.ts` |
> | Caixa do cliente (uma empresa) | `app/admin-v2/cliente/InboxPanel.tsx` + `inbox-actions.ts` |
> | **Caixa da equipe (todas as empresas + não identificados)** | `app/admin-v2/inbox/` |
> | Thread e estado da conversa, compartilhados | `app/admin-v2/_inbox/` |
> | Núcleos puros (janela, thread, caixa, rascunhos) | `lib/inbox/` |
> | Schema | mig 212 (inbound), 214 (templates), 215 (enviadas + lida), **216 (view de conversas)** |
> | Testes | `tests/unit/integrations/inbox-*.test.ts`, `whatsapp-cloud-*.test.ts` |
>
> **A revisão de 14/08 mudou o escopo.** A v1 previa só leitura; o pedido original era ver **e
> responder**, e o argumento para adiar a resposta ("caixa que às vezes falha é pior que ausência")
> trazia dentro de si a condição de entrada — a janela como estado que **controla** a UI, não apenas
> a explica. A §0 registra o que aquela revisão corrigiu.

---

## 0. O que a revisão corrigiu (e o que ela errou)

**Corrigido no plano:**

| Item | Correção |
|---|---|
| Rota do workspace | É `/admin-v2/cliente?empresa=<id>`, **não** `/[id]`. E não há sistema de abas — seria seção nova |
| Thread unilateral | A v1 mostrava só o que CHEGA. O gestor veria *"Sim"* sem saber *sim a quê* |
| `notification_deliveries` | Guarda telemetria, **não o texto enviado** — thread bidirecional exige migration |
| Mídia | Áudio é o formato mais provável de resposta no Brasil; "recebeu um áudio" sem ouvir é meio valor |
| Corrida na janela | Gestor abre com janela aberta, digita 5 min, envia com ela fechada |
| `chatwoot-deploy/` | Existe na raiz do workspace (último commit 25/06/2026) — ver §2.1 |

**O que a revisão afirmou e não procede** (registrado para quem ler depois não repetir):

- *"Não existe envio pela Cloud API."* Existe: `lib/whatsapp/cloud-api.ts`. A observação
  **parcialmente** válida é outra: ele envia só **template**, não texto livre, e fica FORA do
  registry de propósito — registrá-lo tornaria a Cloud API o caminho de toda mensagem enquanto só o
  template de autenticação está aprovado.
- *"Não existe `PHONE_NUMBER_ID`."* Existe no `.env.local` e nas envs de produção; foi o que
  enviou todas as mensagens de 14/08.

---

## 0.1 ✅ Quem responde: a equipe Vertho (decidido em 14/08/2026)

Era o que bloqueava o desenho, e está resolvido: **quem atende é a equipe Vertho**, não o RH das
escolas contratantes.

Consequências, que valem como restrição de projeto:

- **`/admin-v2` é o lugar certo.** O gate `checarAcessoPlataforma` que já existe ali é exatamente o
  modelo de permissão necessário — não há permissão nova a criar.
- **Não há rota dentro do tenant.** Se um dia gestores de cliente forem responder, isso NÃO é
  "liberar a mesma tela": é outra rota, outro gate e auditoria por autor. Reaproveitar a tela de
  plataforma para o cliente seria dar a um contratante a visão da caixa dos outros.
- **A auditoria de autor pode ser simples na fase 2** — o time é pequeno e todo mundo é
  platform-admin. Registrar quem enviou continua obrigatório; o que não é preciso é hierarquia de
  papéis.

---

## 1. Por que isto existe

Um número na **Cloud API não tem aplicativo**. Ele não é pareado com celular nenhum, então
não há "abrir o WhatsApp e ver as conversas" — é a diferença mais concreta em relação ao
número por QR (Z-API) que o produto usava até aqui.

Medido em 14/08/2026: antes do webhook subir, `subscribed_apps` da WABA estava vazio. Uma
resposta de colaborador **sumia sem deixar rastro**. Hoje ela é gravada em
`whatsapp_mensagens_recebidas`, e ninguém tem como ver.

### O que já está resolvido (não faz parte desta proposta)

| Peça | Onde |
|---|---|
| Recebimento + assinatura HMAC | `app/api/webhooks/whatsapp-cloud/route.ts` |
| Persistência idempotente (`wamid` único) | mig 212 |
| Resolução de tenant pelo telefone, com ambiguidade explícita | `resolverDono()` |
| Status de entrega (`sent`/`delivered`/`read`/`failed`) | mig 212 + `camposDoStatus()` |

---

## 2. Decisão: construir aqui, e não usar Chatwoot

A comparação de custo foi feita e **não é o preço que decide** — o Chatwoot Cloud sairia de
graça no tier gratuito (até 2 agentes, e a operação hoje é de uma pessoa).

| Opção | Entrada | Recorrente |
|---|---|---|
| Chatwoot Cloud (Hacker) | zero | grátis até 2 agentes |
| Chatwoot self-hosted (CE) | ~1 semana de setup | ~R$ 80/mês (4 GB RAM) + manutenção |
| Construir aqui — só leitura | poucas horas | ~zero |

**O que decide é o isolamento entre tenants.** Um único número de WhatsApp serve ~10 empresas.
Para o Chatwoot, tudo cai numa inbox só: as conversas de todos os clientes misturadas, sem
separação. Separar por cliente é a invariante mais forte deste produto — com guards de CI
defendendo-a — e é exatamente o que o webhook já resolve na entrada. Levar isso para o
Chatwoot seria reimplementar do lado de fora uma lógica que já existe aqui dentro.

⚠️ **Não verificado:** `subscribed_apps` é uma lista, então *provavelmente* dá para ter o app
Vertho e um app do Chatwoot inscritos na mesma WABA, cada um com seu endpoint. Se um dia essa
rota for considerada, **validar isso primeiro** — se não for possível, a escolha vira "inbox do
Chatwoot **ou** status de entrega", não os dois.

### 2.1 ✅ Chatwoot descartado (14/08/2026)

O caminho Chatwoot está **encerrado** — não é mais alternativa em aberto.

Há um diretório `chatwoot-deploy/` na raiz do workspace (fora de `nextjs-app/`), com
`docker-compose.yml`, `Caddyfile` e `cloud-init.yaml`, último commit em 25/06/2026. Ele é um repo
git **próprio e sem remote**: apagá-lo é perda definitiva, não recuperável por `git`. A remoção
ficou com o dono.

⚠️ `docs/ESCALA-50K.md` ainda citava o Chatwoot como destino de atendimento humano — corrigido na
mesma rodada. Doc velho que ensina o errado é uma classe de problema já catalogada nesta base.

---

## 3. Escopo

### 3.1 O que ENTRA

- **Seção "Mensagens" no workspace do cliente** (`/admin-v2/cliente?empresa=<id>` — não há sistema de abas hoje), listando o que chegou
  daquele tenant.
- **Agrupamento por pessoa**, com a última mensagem e o horário em destaque.
- **Estado da janela de 24h** visível por conversa (ver §5.1) — mesmo sem poder responder, é o
  que explica por que responder não está disponível.
- **Painel de mensagens sem tenant**, em área de plataforma (ver §5.2).
- **Mídia identificada** (áudio/imagem/documento) mostrada como tipo, não como mensagem vazia.

### 3.1.1 A thread precisa ter os DOIS lados

A v1 mostrava só `whatsapp_mensagens_recebidas`. Isso produz uma conversa pela metade — o gestor lê
*"Sim"* sem saber a que a pessoa respondeu, e **conversa pela metade parece defeito**.

O lado enviado existe em `notification_deliveries`, mas com uma limitação que precisa ser dita:
**aquela tabela é telemetria, não histórico de conversa.** Ela tem canal, `kind`, provedor, status e
`provider_message_id` — **não tem o texto**. Então:

- **Fase 1** junta os envios na linha do tempo pelo que existe: *"pílula da semana 5 — entregue
  10:32, lida 10:47"*. Já resolve o "sim a quê" na maioria dos casos, porque o `kind` diz qual
  mensagem era.
- **Fase 2** exige migration para guardar o texto do que sai (e quem enviou, quando houver operador
  humano). Sem isso, a resposta manual não teria onde ser registrada.

⚠️ Envios legados pela **Z-API não vão aparecer** com status real — eles nunca tiveram
`provider_message_id`. A thread fica completa só para o que sai pela Cloud API.

### 3.2 Fase 2 — responder (depois de §0.1)

A v1 excluía resposta com um argumento correto: caixa que às vezes falha é pior que ausência. Mas o
próprio plano já calcula o estado da janela — então o incremento é transformá-la de **informação**
em **controle**:

| Janela | UI |
|---|---|
| **Aberta** | Campo habilitado; envia texto livre pela Cloud API; mostra quanto tempo resta |
| **Fechada** | Campo **bloqueado**, com a explicação e o caminho por template |

O que a fase 2 exige, e não é pouco:

1. **Envio de texto livre pela Cloud API.** `lib/whatsapp/cloud-api.ts` hoje só manda template.
2. **A resposta sai pelo MESMO `to_phone_id` da conversa** — sem failover para o número por QR.
   Responder de outro número quebra o fio da conversa para quem recebe.
3. **Revalidar a janela NO SERVIDOR, no instante do envio.** O estado renderizado envelhece: o
   gestor abre com a janela aberta, escreve cinco minutos e envia com ela fechada. Confiar na tela
   produz erro 131047 da Meta e uma mensagem que a pessoa nunca recebe.
4. **Persistir texto, `wamid`, operador e chave de idempotência** (duplo clique é o caso comum).
5. **Auth explícita**: sessão + papel, e — se a decisão de §0.1 for "cliente responde" — escopo de
   empresa na própria rota.
6. 🔴 **Conversa ambígua NÃO pode ter resposta.** Um telefone em vários tenants (caso real: 7
   cadastros em 6 empresas) não tem contexto definido; responder ali é mandar mensagem no contexto
   errado. O painel de §5.2 é read-only por construção.

### 3.3 O que continua fora

| Fora do escopo | Motivo |
|---|---|
| **Atribuição / múltiplos atendentes** | É o que o Chatwoot faz bem. Só se o volume justificar — hoje é **zero**. |
| **Tempo real (websocket)** | Polling curto (10–15s) basta na fase 2; na fase 1, atualizar na navegação. |
| **Seletor de template fora da janela** | Depende de ter templates aprovados de conversa, que ainda não existem. Até lá, bloqueio explicado. |

### 3.4 Mídia: primeiro follow-up, não "talvez um dia"

A v1 tratava download de mídia como eventual. A revisão apontou o que muda isso: **no Brasil, áudio é
o formato mais provável de resposta de colaborador.** Mostrar "recebeu um áudio" sem poder ouvir é
meia funcionalidade — e quem atende não consegue responder com consciência.

A implementação correta é um **proxy autenticado**: o servidor pega a URL temporária da Meta
(`GET /{media-id}`) e transmite o arquivo. A URL expira em poucos minutos e **não pode** ser exposta
ao browser, porque carrega o token. Fica logo depois da fase 1.

### 3.3 Pré-condição honesta

**A tela nasce vazia.** Com o app da Meta em modo de desenvolvimento, só chegam eventos de
teste do painel — mensagem real de colaborador não chega. O valor só aparece depois de
**publicar o app** (item separado da Business Verification). Construir antes é aceitável porque
é barato e porque o webhook já está acumulando histórico; construir a parte **cara** antes seria
investir em suposição.

---

## 4. Dados

Tudo já existe (mig 212). Nenhuma migration nova é necessária para o escopo de leitura.

```
whatsapp_mensagens_recebidas
  empresa_id      -- NULL quando não resolvido (ver ambiguidade)
  colaborador_id  -- NULL idem
  ambiguidade     -- 'telefone-desconhecido' | 'telefone-em-multiplas-empresas' | 'erro-na-resolucao: …'
  wa_message_id   -- único (idempotência do retry da Meta)
  from_phone
  tipo            -- text | audio | image | document | interactive | …
  texto           -- NULL para mídia, de propósito
  raw             -- payload cru
  recebida_em
```

**Índices já criados:** `(empresa_id, recebida_em DESC)` e `(from_phone, recebida_em DESC)` —
cobrem as duas consultas desta tela.

### 4.1 Leitura tem que passar por `tenantDb`

A tabela é tenant-owned e guarda PII (telefone + texto). A consulta da aba do cliente vai por
`tenantDb(empresaId)`; o `tenant-read-guard` cobra isso no CI. O painel de não-resolvidas é a
exceção — por definição não tem tenant — e roda em rota de plataforma (§5.2).

---

## 5. Comportamento

### 5.1 A janela de 24h como estado visível

A janela abre quando a **pessoa** escreve e dura 24h. Dentro dela, texto livre é permitido e
templates de Utilidade são **gratuitos**; fora dela, só template aprovado e pago.

Mesmo sem responder pela tela, o estado precisa aparecer:

- **Aberta** — "responde até HH:MM" (calculado de `recebida_em` da última mensagem da pessoa).
- **Fechada** — "janela encerrada; só template".

Sem isso, a primeira pergunta de quem olha a tela ("por que não posso responder?") não tem
resposta na própria tela.

### 5.2 Mensagens sem tenant

`empresa_id IS NULL` acontece em dois casos legítimos:

- **`telefone-desconhecido`** — número que não está em `colaboradores`.
- **`telefone-em-multiplas-empresas`** — a mesma pessoa cadastrada em mais de um tenant. Não é
  hipótese: no primeiro evento real de teste, o telefone do dono resolveu para **7 cadastros em
  6 tenants**. Um professor que atue em duas escolas da rede cai no mesmo caso.

Há um terceiro caso desde 15/08: **`telefone-em-multiplas-pessoas`** — uma empresa só, duas pessoas
com o mesmo número. Aí o **tenant** é inequívoco (a conversa aparece na caixa daquele cliente) e a
PESSOA fica nula. Escolher entre as duas seria sortear, e o sorteio vira histórico.

Essas linhas **não podem** aparecer na aba de um cliente — seria mostrar a mensagem de uma
pessoa no painel de outro. Ficam em **`/admin-v2/inbox`** (caixa da equipe), com o motivo à vista,
os candidatos a dono e a associação auditada.

> ⚠️ Se este painel não existir, essas mensagens ficam **invisíveis**: não estão em tenant
> nenhum e ninguém as procura. Invisível é pior que ausente, porque parece que não chegou nada.
>
> Isto não é hipótese: entre 14 e 15/08 o painel não existia, e **a única mensagem já recebida**
> estava exatamente nesse estado. Ver §9.1.

### 5.3 Mídia

`texto = NULL` com `tipo = 'audio'` significa "mandou um áudio", não "mandou nada". A tela
mostra o tipo. Tratar como vazio esconderia que a pessoa respondeu.

---

## 6. Riscos

| Risco | Tratamento |
|---|---|
| **Tela vazia gera desconfiança** | Estado vazio explica *por quê*: app não publicado ⇒ só eventos de teste. Vazio sem explicação parece defeito. |
| **PII exposta a quem não deve** | Consulta por `tenantDb`; painel de não-resolvidas restrito a platform-admin. |
| **Expectativa de resposta** | A tela diz explicitamente que é leitura. Um gestor achar que respondeu quando não respondeu é pior do que não ter a tela. |
| **Volume futuro** | Paginação por data desde o início; sem `SELECT *` na tabela inteira. |
| **Corrida na janela (fase 2)** | Gestor abre com janela aberta, digita 5 min, envia com ela fechada. Revalidar no SERVIDOR no instante do envio e devolver erro explicado — o estado renderizado envelhece. |
| **Envio duplicado (fase 2)** | Duplo clique é o caso comum. Chave de idempotência por (conversa, texto, janela de segundos). |
| **Auth das rotas de leitura** | Não é implícita: sessão + papel em TODAS as rotas, incluindo as de leitura. Se a §0.1 decidir "cliente responde", escopo de empresa na própria rota. |

---

## 7. Plano

**Bloqueio:** responder a §0.1 (quem responde) antes de qualquer coisa da fase 2.

**Fase 1 — ver (poucas horas)**
1. Consulta por tenant, agrupada por pessoa, com cálculo da janela (função pura, testável sem banco).
2. Seção no workspace do cliente: lista de conversas + detalhe.
3. Thread com os DOIS lados: recebidas + envios de `notification_deliveries` (sem texto — ver §3.1.1).
4. Painel de não-resolvidas, na plataforma, read-only por construção.

**Follow-up imediato — áudio (§3.4)**
5. Proxy autenticado de mídia. Sem ele, resposta de áudio é ilegível para quem atende.

**Fase 2 — responder (~1 dia, depois da §0.1)**
6. Envio de texto livre pela Cloud API, pelo mesmo `to_phone_id` da conversa.
7. Migration do histórico enviado (texto, `wamid`, operador, idempotência).
8. Janela controlando a UI + revalidação no servidor no instante do envio.
9. Estado mínimo de não-lida e polling de 10–15s.

Estimativa da fase 1: **poucas horas**, por ser consulta sobre dados que já existem.

### 7.1 Critérios de aceite

- [x] Mensagem de colaborador de um tenant aparece **só** na aba daquele cliente.
- [x] Mensagem com `ambiguidade` **não** aparece em nenhum cliente, e aparece no painel de plataforma
      — `/admin-v2/inbox`, entregue em 15/08 (ver §9.1: até lá a action existia e a tela não).
- [x] Janela de 24h mostrada corretamente nas bordas (23h59 aberta, 24h01 fechada) — validado por teste com relógio congelado, não com `Date.now()`.
- [x] Áudio aparece como áudio, não como mensagem vazia.
- [x] Tela vazia explica que o app ainda não foi publicado.
- [x] A thread mostra os dois lados: o que a pessoa escreveu e o que o sistema enviou.

**Fase 2:**
- [x] Janela exatamente em 24h: 23h59 permite enviar, 24h01 bloqueia — com relógio congelado, nunca `Date.now()`.
- [x] Janela expirada ENTRE a renderização e o envio → erro explicado, não mensagem perdida.
- [x] Duplo clique não envia duas vezes (chave de idempotência; a versão **atômica** segue pendente — §9.2).
- [x] Conversa ambígua não tem campo de resposta.
- [ ] **Resposta sai pelo mesmo número da conversa.** ⚠️ NÃO cumprido: o envio usa
      `process.env.PHONE_NUMBER_ID`, não o `to_phone_id` gravado. Com um número só, indistinguível;
      com o segundo número (proposta A=acesso / B=jornada) passa a responder pelo remetente errado.
- [x] Falha da Meta aparece para quem enviou, não só no log.

---

## 8. Dependências fora do código

Nada aqui depende desta proposta, mas a tela só terá conteúdo real quando:

- **Business Verification** aprovar (em processamento em 14/08) — destrava `TIER_1000` e categoria Authentication;
- **o app for publicado** — sem isso, só eventos de teste do painel chegam ao webhook.

---

## 9. Revisão de 15/08/2026 — o que estava errado no que já estava no ar

Seis correções, todas da mesma família: **funcionavam sem dar erro**. Nenhuma delas produzia tela
vermelha, log de exceção ou teste vermelho — é por isso que a lista foi levantada lendo o código, e
cada item foi confirmado contra o banco antes de virar trabalho.

### 9.1 A medição que sustentou a prioridade

| Medido em 15/08/2026 | Resultado |
|---|---|
| Mensagens recebidas, no total | **1** — e com `empresa_id NULL`, portanto invisível em toda tela |
| Linhas de `notification_deliveries` com `provider_message_id` | **0 de 979** |
| Cadastros de `whatsapp` fora de E.164 com DDI | **0 de 157** |
| Telefone repetido entre tenants | 1 número em **7 pessoas / 6 empresas**; outros 2 em 4 empresas |

A primeira linha é o argumento inteiro da caixa da equipe: **1 de 1** mensagem recebida estava
invisível, enquanto o workspace do cliente exibia "Nenhuma mensagem recebida deste cliente". Havia
uma `listarNaoResolvidas()` escrita — e **nenhum consumidor na interface**. Action sem tela não é
meio caminho andado: é a lacuna com aparência de cobertura.

A segunda linha diz que o webhook de status, hoje, não casa com nada — 100% dos eventos morriam
num update de zero linhas.

### 9.2 O que foi corrigido

| # | Achado | Por que passava despercebido | Correção |
|---|---|---|---|
| 1 | Mensagem sem tenant não aparecia em lugar nenhum | A tela do cliente diz "nenhuma mensagem", que é indistinguível de "ninguém escreveu" | `/admin-v2/inbox`: todas as empresas numa lista, fila de não identificados **com os candidatos**, associação **auditada** (`inbox.associar`) e reprocessamento (`inbox.reprocessar`) |
| 2 | 🔴 `resolverDono` decidia sobre `.limit(5)` | Sem `ORDER BY`, cinco linhas quaisquer; se caíssem na mesma empresa, `Set(empresa_id).size === 1` e a mensagem ia para **o tenant errado** — vazamento cross-tenant sem erro nenhum | Consulta sem limite + decisão pura em `lib/whatsapp/resolver-dono.ts`. Novo desfecho: mesma empresa com 2+ pessoas resolve o **tenant** e deixa a pessoa nula, em vez de sortear `data[0]` |
| 3 | Update de status sem conferir se casou | `update` que afeta zero linhas volta `error: null` — sucesso aparente | `.select('id')` + `registrarDegradacao` (`chave: 'sem-destino'`, severidade `aviso`) |
| 4 | `fetch` para a Graph sem timeout | Conexão pendurada só aparece como lentidão | `AbortSignal.timeout` nos quatro (envio 15s, mídia 10s, download 30s) e motivo legível que diz **"estado do envio DESCONHECIDO"** — timeout não é prova de não-envio |
| 5 | Rascunho global e corrida no polling | Escrever para A, clicar em B e enviar para B não gera nenhum sinal na tela | Rascunho **por (empresa, telefone)** e controle de pedidos (`lib/inbox/rascunhos.ts`); resposta de pedido ultrapassado é descartada |
| 6 | Thread com `ORDER BY ASC LIMIT 300` | Devolve as 300 mensagens **mais antigas**: acima disso, a conversa abre no começo do relacionamento e esconde o que acabou de chegar | `DESC` nas três consultas, inversão em memória, e a janela lida da linha `[0]` |

Junto: a lista de conversas passou a ser agregada **no banco** (view `whatsapp_conversas`, mig 216).
Antes eram "as últimas 500 mensagens agrupadas em memória" — uma cota de mensagens, não de pessoas,
em que um telefone falante esconde as conversas dos outros, começando pela mais antiga (a que
esperava resposta).

### 9.2b Segunda rodada (mesma data): saúde do canal e pontos cegos

Três itens, vindos de uma lista de sugestões que foi avaliada item a item — o que entrou
mudou de forma no caminho, e é a forma que importa:

- **R12 · saúde do canal de entrada** (`checarCanalEntradaWhatsapp` + `inspecionarCloudApi`).
  Todas as 14 regras anteriores do health olhavam SAÍDA. A sugestão original era um "health check
  do webhook"; **medir por volume não funcionaria** — "zero mensagens em 24h" é o estado normal
  deste canal, então a regra nasceria muda. O check PERGUNTA à Meta: `GET /{WABA_ID}/subscribed_apps`
  (inscrição — vazio é exatamente como a desativação aparece, sem erro) e
  `GET /{PHONE_NUMBER_ID}` (credencial + `quality_rating`). Não saber vira **achado próprio**
  (`whatsapp-webhook-check-cego`), nunca silêncio.
  A qualidade veio de brinde no mesmo custo e é o único aviso PRÉVIO de restrição — em 11/08 um
  disparo em lote derrubou um número e o sinal chegou como canal morto, não como métrica.
- **Três pontos cegos fechados**: gravar a mensagem enviada (🔴 `critico` — ela SAIU e a thread não
  mostra, então o atendente reescreve e a pessoa recebe duas), `marcarLida` (aviso) e a telemetria
  do `cloud-api` (sem a linha, o `wamid` não existe e o status nunca casa). Os três morriam em
  `console.error`, que é o mesmo que não registrar.
- **Retry só nas LEITURAS de mídia.** A sugestão era "retry exponencial para falhas de rede"; no
  `POST /messages` isso é o caminho curto para a mensagem chegar duas vezes — a Graph não aceita
  chave de idempotência nesse endpoint e timeout não prova recusa. O `dedupeKey` não protegeria:
  ele é consultado ANTES do envio, não dentro do `fetch`. Guardado por teste
  (`🔴 ENVIO nunca é repetido`).

**Avaliadas e NÃO feitas** (registrado para não voltarem como novidade):

| Sugestão | Por que não agora |
|---|---|
| Rate limiting explícito na Cloud API | O OTP já é limitado por `(empresa, telefone)` em `lib/phone-otp.ts`; o inbox é humano digitando; e há **0 envios** registrados por este canal. Vira obrigatório **no dia em que a cadência migrar** — aí no mesmo mecanismo do lote legado, não num novo |
| Documentação de rollback para Z-API | O rollback já é **automático**: o OTP cai em cascata Cloud API → Z-API/WaSender → SMS. Para desligar, basta remover `PHONE_NUMBER_ID`/`META_WHATSAPPBUSINESS_API`. Para o inbox não existe e não deveria: responder pelo número da Z-API é outro número, outra conversa |
| Log estruturado (Sentry/Datadog) | O mecanismo canônico já é `registrarDegradacao` (dedup, contador por dia, lido pela R10) + Sentry. O que faltava eram os três pontos cegos acima, não o formato |
| Alerta de taxa de leitura < 20% por template | Premissa quebrada: `read` só existe se a pessoa tiver **confirmação de leitura ligada** — a métrica misturaria comportamento com configuração de privacidade. E o denominador hoje é ~zero (a cadência vai por Z-API, que não tem status). Quando houver volume: comparar **entregue × lido**, com piso de N, e nomear a métrica pelo que ela mede |

### 9.2c Anexos e emoji (15/08)

**Emoji já funcionava** — o corpo vai como UTF-8 e nada no caminho sanitiza. O que entrou foi
conveniência: um seletor com quatro grupos curtos (`_inbox/SeletorEmoji.tsx`), **sem dependência
nova** — um pacote com 1.800 emojis e busca resolveria o mesmo problema com um bundle que esta tela
não tem. Nuance medida: o limite de 4096 usa `.length` do JS, que conta emoji como 2; na prática
irrelevante, mas nosso teto é um pouco mais conservador que o da Meta.

**Anexos** (`responderComAnexo`): imagem, áudio, vídeo e documento, em dois passos —
`POST /{PHONE_NUMBER_ID}/media` (upload) e depois a mensagem referenciando o id.

| Decisão | Por quê |
|---|---|
| **Upload, não `link` público** | A Meta buscaria a URL, e o nosso Storage é privado — seria signed URL, isto é, o arquivo de uma conversa acessível a quem tivesse o link durante o TTL. No upload o binário sai por nós |
| **Teto de 4 MB, e ele é NOSSO** | A Meta aceita 5 MB (imagem), 16 MB (áudio/vídeo) e **100 MB** (documento). Mas a Vercel corta o corpo da request em **4,5 MB** (413 `FUNCTION_PAYLOAD_TOO_LARGE`) — e o `next.config.mjs` declara `bodySizeLimit: '15mb'`, promessa que a plataforma não cumpre: funciona em dev, falha no ar. A recusa acontece **antes** do upload e diz o número verdadeiro |
| **`raw` no formato da Meta** (`{ document: { id } }`) | O mesmo `midiaIdDoRaw` que lê o recebido passa a ler o enviado, e o proxy autenticado serve os dois ids sem uma linha a mais |
| **Mesma janela de 24h** | Anexo compartilha `prepararEnvio` com o texto. Duas cópias da regra divergiriam na primeira correção |
| **Anexo por CONVERSA no estado da tela** | Mesmo risco do rascunho, com estrago maior: escolher um arquivo, trocar de conversa e enviar mandaria o documento de um cliente para outro |
| **Upload que falha vira tentativa gravada** | Sem a linha, o atendente não sabe se o arquivo foi — e reenvia |

Fica de fora: **sticker** (webp, teto de 100 KB) e **template com mídia no cabeçalho** (é outro tipo
de template, e nenhum aprovado hoje).

### 9.2d 🔴 O link de acesso abria DENTRO do WhatsApp (15/08)

**O sintoma que chegou:** "recebi a msg do WA para abrir mas ele está abrindo por dentro do WA e não
no navegador".

**Por que isso queima o acesso, e não é só incômodo.** O botão do template leva a `/entrar?t=…`, que
redireciona para o `/auth/callback` do tenant, e o callback chama **`verifyOtp`** — que **consome o
token de uso único**. Dentro do navegador embutido isso produz três coisas ao mesmo tempo:

1. o token é gasto;
2. a sessão nasce no **cookie jar do WebView**, isolado do Safari/Chrome e do app instalado;
3. a pessoa fecha o WhatsApp, abre o app — **não está logada**, e o link não funciona mais.

O link parece ter funcionado e deixa a pessoa de fora. Um caso de "clicou, entrou, sumiu".

#### 🔑 A primeira tentativa foi detectar o navegador — e ela estava errada em DUAS camadas

A correção óbvia é olhar o User-Agent e desviar quem está no WebView. Foi o que subiu primeiro, e o
teste em aparelho real (15/08, 21:34) derrubou os dois pressupostos de uma vez:

1. **A heurística não detectou um iPhone real.** O log do `/entrar` mostra um único `302` indo direto
   ao callback. A regra "WKWebView não traz o token `Safari/`" não vale para o navegador embutido
   deste aparelho.
2. **E, mesmo se tivesse detectado, não resolveria.** Quando a pessoa pede "abrir no navegador", o
   WhatsApp transfere a **URL ATUAL** — que, depois do redirect automático, já era
   `<tenant>/dashboard`, sem token nenhum. O redirect automático **destrói a única URL que valia a
   pena transferir**. Foi exatamente o que se viu: dashboard dentro do WhatsApp, login no Safari.

O segundo ponto é o que muda o desenho. Não existe detecção boa o bastante: enquanto o `/entrar`
redirecionar sozinho, o link já não é mais redimível no instante em que a pessoa tenta mudar de
navegador.

#### A correção que vale: o token fica PARADO até um toque explícito

`/entrar?t=…` **nunca** consome. Ele valida o slug contra o banco e manda para `/entrar/abrir?t=…`,
uma tela de confirmação. Só `/entrar?t=…&ir=1` — o botão "Entrar agora" — segue para o
`/auth/callback`. Enquanto ninguém toca, a barra de endereços continua exibindo uma URL redimível, e
`••• → Abrir no Safari` leva o acesso junto.

| Plataforma | O que acontece |
|---|---|
| **Android** | `intent://…;package=com.android.chrome;S.browser_fallback_url=…;end` — o WebView entrega a navegação ao Chrome com o token **intacto**, e a confirmação aparece já no navegador certo. Um toque |
| **iOS / não detectado / navegador de verdade** | Tela de confirmação. Quem quiser o app instalado abre no Safari **antes** de entrar; quem só quer usar agora toca em "Entrar agora" |

A tela aparece **para todo mundo**, e isso é deliberado: a detecção erra (provado acima), e o custo
de errar é assimétrico — um toque a mais para quem já estava no navegador certo, contra um acesso
queimado para quem não estava. Efeito colateral bem-vindo: o robô de preview de link da Meta passa a
ler HTML em vez de seguir para o callback.

⚠️ **Escreva isto na resposta ao cliente, não só no código:** "abrir direto no navegador" no iPhone
é uma promessa que ninguém consegue cumprir — não existe caminho programático para sair do
WKWebView. Para quem já tem o app instalado, o caminho sem navegador nenhum é o **OTP**
(`otp_acesso`, template aprovado): código de 6 dígitos digitado onde a pessoa já está.

Testes: `tests/unit/security/entrar-nao-consome.test.ts` — o invariante é *"um GET sem `ir=1` NUNCA
aponta para o `/auth/callback`"*, varrido sobre quatro User-Agents justamente para não voltar a
depender da heurística. `tests/unit/security/navegador-embutido.test.ts` cobre o desvio do Android.
Ambos validados por mutação. O `/entrar` passou a **registrar o UA** de cada clique: a régua só
melhora com dado de aparelho real, e foi um aparelho real que derrubou a primeira versão.

#### 🔑 O UA real, e o que ele ensinou sobre heurística por ausência

O log do `/entrar` entregou a string que faltava (iPhone do dono, 15/08):

```
Mozilla/5.0 (iPhone; CPU iPhone OS 26_6 like Mac OS X) AppleWebKit/605.1.15
(KHTML, like Gecko) Version/26.6 Mobile/15E148 Safari/604.1 [WAiOS/2.26.31]
```

O `Safari/604.1` está lá. A régua original procurava a **ausência** desse token para concluir
"WKWebView", e é por isso que ela errou. O sinal confiável é o marcador POSITIVO do app —
`[WAiOS/…]` —, não a falta de algo. Regra geral que vale além deste caso: heurística construída
sobre ausência falha em silêncio no dia em que o outro lado passa a incluir o que faltava, e não há
como saber quando esse dia chegou sem medir. O caso real virou fixture em
`navegador-embutido.test.ts` (string de campo, marcada como "não editar").

#### 🔴 A tela funcionava — e convidava ao erro

Com o token parado, o teste seguinte falhou mesmo assim, e o log conta por quê:

| Hora | Evento |
|---|---|
| 01:17:58 | `/auth/callback` **sucesso** — "Entrar agora" tocado dentro do WhatsApp. Token consumido |
| 01:20:23 | `verifyOtp error: Email link is invalid or has expired` |
| 01:21:00 | idem |

Os dois erros são as tentativas já no navegador, depois de copiar o endereço. A primeira versão da
tela oferecia **"Entrar agora" como botão principal para todo mundo**, com a instrução do navegador
num aviso ao lado — e o teste seguiu o que o botão pedia.

Onde o toque errado é **irreversível**, hierarquia visual não é estética: é a trava. A tela passou a
ter *"Abra no Safari para entrar"* como título dentro de app embutido, com três passos numerados.

#### 🔑 …e essa correção estava errada no DEFAULT

O dono testou e resumiu em uma palavra: **"burocrático"**. Ele está certo, e o erro é de escopo.

O problema que os três passos resolvem é de quem usa o **PWA instalado** — minoria. Para todo o
resto, entrar dentro do WhatsApp não é um consolo: é coerente. O navegador embutido **guarda a
sessão**, então o link da semana seguinte abre na mesma janela já logado. Cobrar de ~400 pessoas um
menu de três passos para atender a poucas é transformar a exceção em regra.

Versão final: **"Entrar agora" é o botão, para todo mundo, um toque.** A saída para o navegador vive
num `<details>` fechado ("Vai usar o app instalado na tela de início?"), com a consequência escrita e
o endereço copiável — visível para quem precisa, invisível para quem não precisa. A detecção de
embutido não some: ela decide qual `<details>` aparece e mantém o `intent://` do Android.

A lição que sobra não é sobre WebView: **uma correção pode estar certa no mecanismo e errada no
default.** "Quem paga o custo desta proteção?" é pergunta separada de "a proteção funciona?".

**O que continua em aberto:** quem tocar no secundário e depois quiser o app instalado segue sem
sessão e com o link gasto. Fechar isso exige trocar o `token_hash` do Supabase por um ticket nosso
redimível 2-3 vezes em 15 min. ⚠️ E aí esbarra numa promessa aprovada: o corpo do `acesso_vertho`
diz *"só pode ser usado uma vez"*. Mudar o comportamento sem mudar o texto torna o texto falso;
mudar o texto é submeter o template de novo à Meta, com o risco de voltar MARKETING (6× o custo —
4 de 8 voltaram assim em 14/08). Decisão pendente, e é do dono.

### 9.3 O que continua aberto — e por quê

- **Responder pelo `to_phone_id` da conversa** (§7.1). Com dois números, a chave da conversa é
  `(to_phone_id, from_phone)`. É o item com data marcada: quebra quando o segundo número entrar.
- **Idempotência atômica.** A chave é `(telefone, 40 primeiros caracteres, minuto)` e o fluxo é
  "consulta → chama a Meta → insere". Dois cliques simultâneos passam os dois; e uma tentativa que
  **falhou** faz a repetição encontrar a linha e devolver `ok: true` com `wa_message_id` nulo. O
  desenho certo é reservar a chave com um `pending` antes da chamada externa.
- **Variante do nono dígito no `wa_id`.** O `wa_id` de número BR pode chegar sem o 9, e aí nenhuma
  variante casa (o cadastro está 157/157 normalizado — o problema não é ele). Deliberadamente **não**
  implementado: ampliar um casamento de IDENTIDADE sem medir contra tráfego real troca uma linha a
  mais na fila por conversa entregue ao tenant errado. Enquanto isso, a fila de não identificados é
  a rede de segurança.
- **Mídia carregada inteira em memória** (`arrayBuffer`) — documento pode ter até 100 MB. Streaming,
  limite explícito, `X-Content-Type-Options: nosniff` e `attachment` para documento.
- **Webhook processa tudo antes do 200.** Mover para fila é correto em princípio, mas **não** para o
  inbound: hoje o retry da Meta é a rede de segurança de uma gravação que falha. O que deve sair da
  linha síncrona são `statuses` e eventos de template, que são medição.
- **Unicidade nos eventos de template** (`whatsapp_template_eventos` é insert puro; a Meta reentrega).
- **`read` e indicador de digitação na Meta**, e **`context.id`** (mensagem citada) — este dá para
  extrair do `raw` já gravado, na leitura, sem migration.
- **Retenção/LGPD** de texto, `raw` e mídias, com auditoria de acesso à mídia.
