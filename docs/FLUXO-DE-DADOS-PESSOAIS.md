# Fluxo de dados pessoais — levantamento técnico

> **O que este documento é:** um mapa do que o sistema coleta, onde guarda e para quem envia,
> levantado **no código e no banco** em 14/08/2026. Serve de insumo para quem for redigir a
> política de privacidade e o contrato de tratamento de dados.
>
> **O que ele NÃO é:** não é a política de privacidade, não é análise jurídica e não classifica
> nada como "dado sensível" no sentido legal. Essa leitura é de quem entende de direito digital.
>
> **Por que existe:** o modelo de política que circulou em 14/08 dizia *"Compartilhamos dados
> apenas com a Meta Platforms"*. São **onze** destinos externos, e o mais relevante não é o
> WhatsApp — é a IA, que recebe nome e avaliação de desempenho.

---

## 1. O que é coletado

### 1.1 Cadastro (`colaboradores` — 400 registros)

`nome_completo`, `email`, `telefone`, `whatsapp`, `foto_url`, `cargo`, `gestor_nome`,
`gestor_email`, `gestor_whatsapp`.

O cadastro é feito **pelo contratante** (secretaria/escola), em massa, não pelo próprio titular.

### 1.2 Avaliação de desempenho — o núcleo do produto

| Tabela | Linhas | Conteúdo |
|---|---|---|
| `descriptor_assessments` | 1.224 | Nota e nível por descritor de competência, por pessoa |
| `respostas` | 228 | Respostas a cenários situacionais, com `nome_colaborador`, `email_colaborador`, `whatsapp` |
| `mensagens_chat` | — | Conversa da pessoa com a Mentora IA (texto livre) |
| `trilhas` | 49 | Plano individual de desenvolvimento |
| `colaboradores.comp_*` / `lid_*` | — | Perfil comportamental (DISC) |

Isto descreve **como uma pessoa foi avaliada no trabalho**. Quem é avaliado, na operação atual,
é majoritariamente professor e diretor de rede pública.

### 1.3 Comunicação

| Tabela | Linhas | Conteúdo |
|---|---|---|
| `notification_deliveries` | 972 | Registro por mensagem: canal, status, entrega, leitura |
| `whatsapp_mensagens_recebidas` | 0 | Texto do que a pessoa responde no WhatsApp (mig 212) |
| `fase4_envios` | 37 | `nome`, `email`, `whatsapp`, carimbos por canal |
| `colab_otp` | — | `telefone` + hash do código de acesso |
| `notification_endpoints` | 5 | Inscrição de push (identifica o aparelho) |

### 1.4 Comercial (titulares que não são colaboradores)

`diag_leads`, `sales_contacts`, `radarempresas_estabelecimentos` (nome, e-mail, telefones de
contato de escolas/empresas prospectadas).

---

## 2. 🔴 O que sai para a IA

**Este é o item que o modelo de política omitia.** Em `actions/fase4.ts`, o prompt enviado ao
modelo de linguagem é montado assim:

```
Empresa: {nome da empresa}
Colaborador: {nome_completo} | Cargo: {cargo}
Relatório de competências:
{ ...JSON com a avaliação completa... }
```

Ou seja: **nome identificado + cargo + avaliação de desempenho** trafegam para um provedor de IA
de terceiro. O mesmo padrão aparece em `lib/check-ia4-core.ts:141`.

Provedores de IA em uso (`actions/ai-client.ts`, `lib/ai-batch.ts`):

| Provedor | Papel |
|---|---|
| **Anthropic** (Claude) | padrão da maior parte do pipeline |
| **OpenAI** | fallback de provedor e alguns checks |
| **Google** (Gemini) | provedor alternativo |
| **Voyage** | embeddings do acervo de conteúdo |

⚠️ **Pergunta que o jurídico vai fazer e a engenharia precisa responder:** os contratos com esses
provedores incluem cláusula de **não-treinamento** com os dados enviados? Isso depende do plano
contratado em cada um e não é verificável no código.

---

## 3. Onde os dados ficam

| Camada | Fornecedor | Observação |
|---|---|---|
| Banco de dados | **Supabase** (Postgres) | ⚠️ Região do projeto **a confirmar no painel** — não é legível pelo código |
| Aplicação | **Vercel** | `vercel.json` **não declara região** ⇒ usa o default da conta |
| Backups | **Supabase Storage**, bucket `backups` | `.json.gz` diário, rotação de 7 dias (`actions/backup.ts`) |
| Vídeo | **Bunny Stream** | vídeos com nome da pessoa na narração/tela |
| Avatar de vídeo | **HeyGen** | geração dos decks |

**Transferência internacional:** todos os fornecedores acima são estrangeiros. A confirmação de
*em que país* cada dado repousa depende da configuração de região de Supabase e Vercel — é o
primeiro item a verificar no painel.

---

## 4. Comunicação: quem recebe o quê

| Fornecedor | Recebe | Onde no código |
|---|---|---|
| **Meta** (WhatsApp Cloud API) | telefone + conteúdo da mensagem | `lib/whatsapp/cloud-api.ts` |
| **Z-API** (WhatsApp por QR) | idem — caminho legado, ainda ativo | `lib/whatsapp/providers/zapi.ts` |
| **Resend** | e-mail + conteúdo | `lib/notifications/pilula-envio.ts` |
| **Twilio** | telefone + código de acesso (SMS) | `lib/sms/providers/twilio.ts` — configurado, sem número |
| **Web Push** (navegador) | endpoint do aparelho | `lib/notifications/push-core.ts` |

---

## 5. Retenção — o que se apaga hoje

| Dado | Regra | Onde |
|---|---|---|
| `mensagens_chat` de sessão abandonada | apagada após **48h** de inatividade | `cleanup_sessoes` |
| Backups | rotação de **7 dias** | `actions/backup.ts` |
| **Todo o resto** | **sem prazo definido** — permanece indefinidamente | — |

⚠️ Não existe rotina de exclusão a pedido do titular, nem prazo de descarte para avaliação,
cadastro ou histórico de mensagens. Hoje isso seria feito na mão, direto no banco.

---

## 6. Quem é controlador e quem é operador

A plataforma é **multi-tenant**: cada secretaria/escola tem seus colaboradores isolados, e o
cadastro é feito por ela, não pelo titular.

Isso sugere que o **contratante é o controlador** e a Vertho é **operadora** — o que muda a quem
o titular pede exclusão e quem responde pelo tratamento. O modelo de política que circulou trata
a Vertho como controladora de tudo, o que não corresponde ao desenho.

⚠️ Consequência prática, já observada: um mesmo telefone pode pertencer a pessoas cadastradas em
**empresas diferentes** — no primeiro evento real do webhook, um número resolveu para 7 cadastros
em 6 tenants. "Excluir os dados desta pessoa" não é uma operação única.

---

## 7. Lacunas que a engenharia precisa fechar

1. **Região de Supabase e Vercel** — verificar no painel e declarar.
2. **Cláusula de não-treinamento** nos contratos de IA — verificar plano de cada provedor.
3. **Rotina de exclusão a pedido** — não existe.
4. **Prazo de descarte** — não existe para nenhum dado além de chat abandonado e backup.
5. **Registro de consentimento** — o cadastro é feito pelo contratante; não há registro de aceite
   do titular no sistema.
6. **Z-API ainda ativa** — a política precisa refletir os dois caminhos de WhatsApp enquanto a
   migração não fecha.

---

## 8. Nota sobre a publicação do app na Meta

A política precisa existir para publicar o app. Mas publicar um texto que descreve **apenas o
WhatsApp** deixaria de fora o núcleo do produto — a avaliação por IA — que é justamente a parte
com mais consequência para o titular. As duas coisas não têm o mesmo prazo: o app pode esperar a
revisão do texto.
