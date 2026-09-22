# Beto — canais, escopo e contexto

> **Status em 22/09/2026:** em produção. Este é o documento canônico para a divisão entre o
> Beto do WhatsApp e o Beto dentro do app, inclusive o piloto interno de acesso pelo WhatsApp e
> o contexto da página atual no assistente autenticado.
>
> Entregas de referência: `ffcd3de3` (acesso seguro pelo WhatsApp) e `eba78dcf` (página atual no
> Beto interno).

---

## 1. Um nome, dois contextos

Os dois assistentes usam a persona Beto, mas não têm o mesmo contexto nem a mesma função.

| Canal | Identidade e contexto | Papel principal | Modelo |
|---|---|---|---|
| **WhatsApp** | Telefone reconhecido, empresa do piloto e últimas mensagens de até 24 h | Porta de entrada: acesso, recuperação e triagem | Gemini 3.8 Flash |
| **Dentro do app** | Sessão autenticada, perfil, cargo, empresa, blueprint, semana/conteúdo relacionado e página atual | Orientação sobre desenvolvimento, conteúdo e uso da plataforma | Claude Sonnet 4.6 |
| **Inbox humano** | Conversa completa e contexto operacional acessível à equipe Vertho | Ambiguidade, exceção, ação de conta ou assunto que a automação não resolve | Humano |

Regra de encaminhamento: uma dificuldade para **entrar na conta** fica no WhatsApp; uma dúvida
sobre **vídeo, conteúdo, atividade, semana, trilha, progresso ou uso depois do login** vai para o
Beto dentro do app. Isso evita que o WhatsApp tente responder sem o contexto autenticado.

---

## 2. Beto no WhatsApp — piloto interno

### 2.1 Público e identidade

- O piloto só responde automaticamente quando o telefone corresponde, sem ambiguidade, a um
  único e-mail `@vertho.ai`.
- `SUPORTE_AUTO_PILOTO_EMPRESA_ID` fixa a ACME como contexto conversacional do piloto. A empresa
  vem do banco; o Beto não pergunta ao colaborador onde ele trabalha.
- Telefone desconhecido ou vinculado a mais de uma identidade interna falha fechado e permanece
  disponível para atendimento humano na inbox.
- O fluxo aceita texto, botão e áudio. O áudio é baixado da Meta e enviado ao Gemini como mídia
  inline para entendimento e classificação.
- A resposta é curta, informal e contínua. O Beto só se apresenta no primeiro turno e usa o
  histórico recente para não reiniciar a conversa a cada mensagem.

O webhook agenda o atendimento fora da resposta imediata, por `after()`, para não atrasar o
`200 OK` exigido pela Meta. A chamada ao modelo tem timeout de 12 s, raciocínio `low`, limite de
700 tokens e saída JSON estruturada (`intencao`, `solicita_link`, `resposta`, `precisa_humano` e
`acao`).

### 2.2 Pedido de acesso

Pedidos textuais claros como “não consigo entrar” ou “me manda um novo link” usam o emissor
determinístico, sem esperar a IA. No áudio, o Gemini apenas identifica a intenção; a aplicação
continua sendo a única responsável por criar e enviar o acesso.

O destino é calculado pelo banco:

- administrador da plataforma: host genérico `app.vertho.ai`, com destino final `/admin-v2`;
- colaborador: tenant único habilitado com `login_por_whatsapp=true`;
- mais de um tenant elegível ou nenhum destino seguro: não envia link personalizado.

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
  24 horas.
- O slug virtual `plataforma` permite direcionar um administrador para `/admin-v2`; ele não
  concede privilégio. A autorização de administrador continua sendo verificada após o login.

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

- **WhatsApp / Google:** mensagem de texto ou áudio, histórico recente, nome, cargo e empresa já
  resolvidos. O token do magic link nunca é enviado ao modelo.
- **App / Anthropic:** mensagem, histórico, contexto autenticado disponível ao Beto e a descrição
  normalizada da página atual. Query string e identificadores dinâmicos não seguem no contexto
  da página.

O mapa de tratamento e destinos externos está em `docs/FLUXO-DE-DADOS-PESSOAIS.md`.

---

## 5. Arquivos de referência

| Responsabilidade | Arquivo |
|---|---|
| Orquestração do WhatsApp, persona, áudio e triagem | `lib/whatsapp/suporte-auto.ts` |
| Resolução de destino e controles do link | `lib/whatsapp/beto-access-link.ts` |
| Emissão do template de acesso | `lib/notifications/access-link-service.ts` |
| Confirmação e consumo do link | `app/entrar/route.ts` |
| Action autenticada do Beto interno | `app/actions/beto.ts` |
| Normalização da página atual | `lib/beto/pagina-atual.ts` |
| Interface e captura do pathname | `components/beto-chat.tsx` |
| Entrada do webhook da Meta | `app/api/webhooks/whatsapp-cloud/route.ts` |

Testes de referência: `tests/unit/integrations/suporte-auto.test.ts`,
`tests/unit/integrations/beto-access-link.test.ts`,
`tests/unit/security/entrar-nao-consome.test.ts`,
`tests/unit/security/magic-link-destino-admin.test.ts` e `tests/unit/beto-pagina-atual.test.ts`.

---

## 6. Fora do escopo atual

- Resposta automática para clientes externos ou qualquer endereço que não seja `@vertho.ai`.
- Consultar ou alterar dados de conta por decisão livre do modelo.
- Enviar credencial em texto livre.
- Fazer o Beto do WhatsApp substituir o Beto autenticado dentro do app.
- Inferir o que está visualmente renderizado na tela; o assistente conhece apenas a rota
  normalizada e os dados autenticados fornecidos pelo servidor.
