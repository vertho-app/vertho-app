# Caixa de entrada do WhatsApp — proposta

> **Status:** proposta, não implementada. Escrita em 14/08/2026, **revisada no mesmo dia** após
> duas revisões externas.
> **Pré-requisito já pronto:** o webhook da Cloud API (`app/api/webhooks/whatsapp-cloud`, mig 212)
> já grava tudo que chega.
>
> **A revisão mudou o escopo.** A v1 previa só leitura; o pedido original era ver **e responder**, e
> o argumento para adiar a resposta ("caixa que às vezes falha é pior que ausência") trazia dentro
> de si a condição de entrada — a janela como estado que **controla** a UI, não apenas a explica.
> O plano agora tem duas fases, e a §0 registra o que a revisão corrigiu.

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

Essas linhas **não podem** aparecer na aba de um cliente — seria mostrar a mensagem de uma
pessoa no painel de outro. Ficam num painel de plataforma, com o motivo à vista.

> ⚠️ Se este painel não existir, essas mensagens ficam **invisíveis**: não estão em tenant
> nenhum e ninguém as procura. Invisível é pior que ausente, porque parece que não chegou nada.

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

- [ ] Mensagem de colaborador de um tenant aparece **só** na aba daquele cliente.
- [ ] Mensagem com `ambiguidade` **não** aparece em nenhum cliente, e aparece no painel de plataforma.
- [ ] Janela de 24h mostrada corretamente nas bordas (23h59 aberta, 24h01 fechada) — validado por teste com relógio congelado, não com `Date.now()`.
- [ ] Áudio aparece como áudio, não como mensagem vazia.
- [ ] Tela vazia explica que o app ainda não foi publicado.
- [ ] A thread mostra os dois lados: o que a pessoa escreveu e o que o sistema enviou.

**Fase 2:**
- [ ] Janela exatamente em 24h: 23h59 permite enviar, 24h01 bloqueia — com relógio congelado, nunca `Date.now()`.
- [ ] Janela expirada ENTRE a renderização e o envio → erro explicado, não mensagem perdida.
- [ ] Duplo clique não envia duas vezes.
- [ ] Conversa ambígua não tem campo de resposta.
- [ ] Resposta sai pelo mesmo número da conversa.
- [ ] Falha da Meta aparece para quem enviou, não só no log.

---

## 8. Dependências fora do código

Nada aqui depende desta proposta, mas a tela só terá conteúdo real quando:

- **Business Verification** aprovar (em processamento em 14/08) — destrava `TIER_1000` e categoria Authentication;
- **o app for publicado** — sem isso, só eventos de teste do painel chegam ao webhook.
