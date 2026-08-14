# Caixa de entrada do WhatsApp — proposta

> **Status:** proposta, não implementada. Escrita em 14/08/2026.
> **Pré-requisito já pronto:** o webhook da Cloud API (`app/api/webhooks/whatsapp-cloud`, mig 212)
> já grava tudo que chega. Esta proposta é sobre **ler**, não sobre capturar.

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

---

## 3. Escopo

### 3.1 O que ENTRA

- **Aba "Mensagens" no workspace do cliente** (`/admin-v2/cliente/[id]`), listando o que chegou
  daquele tenant.
- **Agrupamento por pessoa**, com a última mensagem e o horário em destaque.
- **Estado da janela de 24h** visível por conversa (ver §5.1) — mesmo sem poder responder, é o
  que explica por que responder não está disponível.
- **Painel de mensagens sem tenant**, em área de plataforma (ver §5.2).
- **Mídia identificada** (áudio/imagem/documento) mostrada como tipo, não como mensagem vazia.

### 3.2 O que NÃO entra, e por quê

| Fora do escopo | Motivo |
|---|---|
| **Responder pela tela** | Fora da janela de 24h só sai template aprovado. Uma caixa de resposta que às vezes funciona e às vezes falha é pior que ausência: o gestor escreve, tenta enviar, falha e não entende. Se entrar um dia, a janela precisa ser estado de primeira classe, com bloqueio explícito e contagem regressiva. |
| **Estado de lido / atribuição / múltiplos atendentes** | É o que o Chatwoot faz bem. Construir aqui só se o volume justificar — e hoje o volume é **zero**. |
| **Tempo real (websocket/polling)** | Sem volume, atualizar na navegação basta. |
| **Download de mídia** | Exige baixar da Graph API com o token e reencaminhar. Só faz sentido depois de saber se as pessoas mandam áudio de verdade. |

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

---

## 7. Plano

1. **Consulta + tipos** — leitura por tenant, agrupada por pessoa, com cálculo da janela. Função pura para a janela, testável sem banco.
2. **Aba no workspace do cliente** — lista de conversas, detalhe por pessoa.
3. **Painel de não-resolvidas** — plataforma, com o motivo da ambiguidade.
4. **Testes** — janela aberta/fechada/limite; ambíguo não vaza para tenant; mídia não vira vazio.

Estimativa: **poucas horas**, por ser consulta sobre dados que já existem.

### 7.1 Critérios de aceite

- [ ] Mensagem de colaborador de um tenant aparece **só** na aba daquele cliente.
- [ ] Mensagem com `ambiguidade` **não** aparece em nenhum cliente, e aparece no painel de plataforma.
- [ ] Janela de 24h mostrada corretamente nas bordas (23h59 aberta, 24h01 fechada) — validado por teste com relógio congelado, não com `Date.now()`.
- [ ] Áudio aparece como áudio, não como mensagem vazia.
- [ ] Tela vazia explica que o app ainda não foi publicado.

---

## 8. Dependências fora do código

Nada aqui depende desta proposta, mas a tela só terá conteúdo real quando:

- **Business Verification** aprovar (em processamento em 14/08) — destrava `TIER_1000` e categoria Authentication;
- **o app for publicado** — sem isso, só eventos de teste do painel chegam ao webhook.
