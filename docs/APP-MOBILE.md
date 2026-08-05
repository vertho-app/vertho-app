# App mobile e notificações — decisões, medições e o que falta

> Documento de decisão do projeto "reduzir dependência do WhatsApp".
> Escrito em 05/08/2026, depois da fase 3 validada no iPhone.

## 1. A hipótese

Hoje a cadência do programa (pílula, evidência, nudge) chega por WhatsApp. A
hipótese é que **push → deep link → conteúdo certo** substitua parte desse
volume, reduzindo dependência de um canal que é caro, frágil (QR/ban de número)
e que hoje é gargalo declarado para 50k usuários.

**A hipótese ainda não foi testada.** O que foi testado é se ela é *tecnicamente
viável* — ver §4.

## 2. Sequência (fases)

| Fase | O quê | Estado |
|---|---|---|
| 1 | Mapear os usos atuais do WhatsApp | ⏳ instrumentado, aguardando dado |
| 2 | Backend de notificações independente de provedor | ✅ 05/08 |
| 3 | Spike Web Push / PWA em iPhone físico | ✅ 05/08 |
| 4 | Shell Capacitor Android (valida bridge nativa) | não iniciada |
| 5 | Conta Apple + macOS em nuvem → primeiro TestFlight | não iniciada |
| 6 | Arquitetura definitiva do app iOS | não iniciada |

A ordem é deliberada: as fases 1–3 não custam conta Apple, Mac nem revisão de
loja. Só se elas mostrarem que a hipótese se sustenta é que faz sentido gastar
com as fases 5–6.

## 3. Como medimos (declarado ANTES de coletar)

Regra: métrica escolhida depois de ver o dado é métrica escolhida para agradar.

- **Denominador = pessoas elegíveis do tenant**, não entregas. "578 ocorrências"
  já significou "uma tela varrendo semanas futuras" nesta base; contar eventos
  como gente é o erro recorrente aqui.
- **A comparação WhatsApp × push é por PESSOA ALCANÇADA**, nunca
  "entrega-WhatsApp × abertura-push". Push só chega a quem instalou e autorizou —
  um subconjunto auto-selecionado, cuja taxa de abertura sai ótima e não responde
  nada.
- **O funil de adesão é a medida principal** (`notification_optin_events`):
  `convite_exibido → instalado_detectado → permissao_solicitada →
  permissao_concedida|negada → endpoint_registrado`. Sem esses degraus, um
  resultado fraco é ambíguo entre "push não engaja" e "ninguém conseguiu
  instalar" — conclusões opostas que levam a decisões opostas.
### ⚠️ Correção do critério (05/08, depois do spike)

O critério original — "< 1/3 de conversão até `endpoint_registrado` = gargalo na
instalação" — assumia teste **não-guiado**, e isso estava errado por uma razão
simples: **ninguém adiciona um site à tela de início por conta própria.** Não é
hipótese a testar, é comportamento conhecido; medir isso gastaria pessoas reais
para confirmar um zero previsível.

A pergunta certa não é "eles instalam sozinhos?" (não instalam), e sim
**"instalar dá para ensinar, a que custo?"**. O que muda a decisão é que a
instrução vira **imposto permanente**: cobrado de cada pessoa nova, em cada
tenant, para sempre. Numa escola de 54 pessoas é um vídeo no grupo; em 50 mil, é
um canal de suporte.

**Critério revisado, declarado antes de coletar:**

1. Medir a conversão **entre instruídos** (quem recebeu o roteiro de instalação),
   nunca entre todos.
2. **Sempre segmentado por plataforma.** A média entre iOS e Android esconde
   exatamente a diferença que decide tudo — no Android não existe ritual de
   instalação, então juntar os dois produz um número que não descreve ninguém.
3. Gargalo iOS confirmado ⇒ a resposta é a fase 4/5 (app de loja) **para iOS**,
   não refinar o PWA. Isso não bloqueia o Android, que já funciona sem atrito.

### O que já está instrumentado

| Tabela | Papel |
|---|---|
| `notification_deliveries` (mig 198) | uma linha por tentativa, **em qualquer canal** — inclusive WhatsApp |
| `notification_endpoints` (mig 200) | uma linha por INSTALAÇÃO (não por pessoa) |
| `notification_optin_events` (mig 201) | os degraus do funil, segmentados por plataforma |

Antes da mig 198 o serviço central de WhatsApp (`lib/whatsapp/index.ts`) **não
persistia nada** — não existia denominador para responder quanto do volume é
cadência e quanto é autenticação. Essa é a razão de a instrumentação do canal
atual ter vindo antes do canal novo.

⚠️ Call sites ainda não atribuídos gravam com `kind` nulo. É lacuna **contável**
(`WHERE kind IS NULL`), não silenciosa. A pílula está nesse grupo: ela sai por
`trigger-diario-empresa` → QStash → webhook `whatsapp-cis` → `sendWhatsapp`.

## 4. Resultado medido — 05/08/2026

Tenant `teste-piloto`, iPhone físico com **iOS 26.6**, sem conta Apple, sem Mac,
sem TestFlight.

| Etapa | Resultado |
|---|---|
| PWA instalado na tela de início | ✅ |
| Permissão concedida → endpoint Apple registrado | ✅ 13s do convite ao endpoint |
| Push enviado pelo núcleo de produção | ✅ `entregues: 1` |
| Recebido com o app FECHADO | ✅ |
| Toque abriu `/dashboard/perfil` (não a home) | ✅ |
| `opened_at` gravado | ✅ 84s e 9s |

**Conclusão:** a cadeia é tecnicamente viável no aparelho mais restritivo.

**O que isto NÃO prova:** N=1, e o 1 é o dono do produto — que sabia o caminho de
instalação, não recebeu o convite por WhatsApp e não passou pelo navegador
in-app. A adoção real segue não medida.

### 4.1 Primeira conversão INSTRUÍDA de terceiros — 05/08, mesma tarde

Três pessoas, tenant `teste-piloto`, com o roteiro de instalação em mãos.

**iPhone (Juliane) — o funil que interessa, medido pela primeira vez:**

| Horário (UTC) | Evento | |
|---|---|---|
| 18:24:44 | `convite_exibido` · motivo `ios-nao-instalado` | tela de instrução |
| 18:25:07 | idem, 23s depois — ainda não instalado | |
| 18:26:25 | `convite_exibido` + `instalado_detectado` | instalou |
| 18:27:33 | `permissao_solicitada` | |
| 18:27:39 | `permissao_concedida` | |
| 18:27:41 | `endpoint_registrado` | ✅ `web.push.apple.com` |

**Instrução → instalado: 1min41s. Instrução → ativo: 2min57s. Conversão
instruída no iOS: 1/1.** O ritual de instalação não se mostrou proibitivo
QUANDO HÁ INSTRUÇÃO — que é exatamente o que o critério revisado (§3) pede
medir. N=1 e pessoa motivada: é sinal, não conclusão.

**Android (mesma pessoa):** `convite_exibido` 18:13:55 → `permissao_solicitada`
18:21:18. **7min23s entre ver o card e tocar nele**, sem nenhum obstáculo
técnico no caminho. Pista de que no Android o problema não é *poder*, é
*querer* — problema de copy e de momento, muito mais barato de resolver que
plataforma. (Pode ser só distração; não sustenta conclusão sozinho.)

**Desktop (Samuel):** ativou no Chrome do Mac, via `fcm.googleapis.com`, sem
nenhum código específico. O adapter é mesmo agnóstico de serviço de push.
⚠️ Registre-se que isso NÃO testa a hipótese: no desktop não existe ritual de
instalação. "Ativou" e "testou o que importa" são coisas diferentes.

### 4.2 Dois defeitos que só o uso real expôs

1. **O convite era invisível no iOS.** O componente checava `PushManager` antes
   de checar iOS-não-instalado; como o PushManager não existe fora do app
   instalado, o Safari caía em 'sem-suporte' e renderizava `null`. A tela
   "adicione à tela de início" **nunca renderizou para ninguém**, e o degrau
   `ios-nao-instalado` nunca disparava — o funil era estruturalmente incapaz de
   medir a evasão na instalação, que é a única coisa que este spike existe para
   medir. Uma pessoa abriu no iPhone, viu a home limpa, e o funil registrou zero
   eventos: indistinguível de "nunca entrou".
   Guarda: `lib/notifications/estado-convite.ts` (função pura) +
   `tests/unit/notifications-estado-convite.test.ts`, validado por mutação.
2. **Endpoint duplicado.** Reinstalar o PWA zera o `localStorage`, gera
   `installation_id` novo e cria segunda linha — com a assinatura antiga ainda
   VÁLIDA na Apple. Observado: `entregues: 2` para uma pessoa, duas notificações
   no mesmo aparelho, mais uma por reinstalação, sem auto-correção (endpoint vivo
   nunca devolve 410). Corrigido no registro (desativa mesmo user-agent) + limpeza
   das linhas antigas.

**Lição transversal:** os dois defeitos passaram por typecheck, 1200+ testes e
build limpo. Quem os encontrou foi gente usando — e, no caso do primeiro, o
sintoma era *ausência de sinal*, que é o mais fácil de confundir com "ninguém
quis".

## 5. O que construímos: um PWA. O que isso custa.

O que existe hoje é o **próprio app web, instalável na tela de início e capaz de
receber push**. Não passa pela App Store e não é revisado pela Apple.

Push funciona igual nos dois modelos. A diferença real não é notificação — é
**instalação e legitimidade**.

### Desvantagens de não estar na loja

1. **Atrito de instalação — o custo dominante.** Na loja: um toque em "Obter".
   No PWA iOS: abrir no **Safari** (o navegador in-app do WhatsApp não serve),
   Compartilhar → Adicionar à Tela de Início. Cada passo perde gente, e o público
   do produto não é técnico. É exatamente o que o funil de §3 mede.
2. **Link do WhatsApp não abre o app instalado.** Universal Links exigem conta
   Apple e app assinado. Um link enviado por WhatsApp abre o navegador in-app,
   nunca o PWA da tela de início. (Se o push substituir a mensagem, o problema
   desaparece — mas enquanto os dois canais coexistirem, ele existe.)
3. **Credibilidade comercial.** "Está na App Store?" é pergunta de compra em
   secretaria/escola. Ausência na loja pesa em processo de aquisição.
4. **Permissão de push só depois de instalar.** App de loja pede notificação já
   na primeira abertura; o PWA no iOS não tem essa opção.
5. **Distribuição gerenciada (MDM).** Rede que administra aparelhos consegue
   empurrar app de loja para o parque; PWA não tem equivalente prático.
6. **Recursos nativos limitados.** Sem background fetch, sem geofencing, sem
   processamento em segundo plano de verdade. Hoje nada disso é requisito.
7. **Fragilidade da inscrição.** Remover o ícone da tela de início derruba a
   inscrição de push. ⚠️ Há também relatos de expurgo de dados de web app por
   inatividade no iOS — **não verificado no nosso caso**, e é a primeira coisa a
   checar se um endpoint morrer sozinho.
8. **Percepção.** Para parte dos usuários, ícone na tela de início "é um atalho",
   não um app.

### Vantagens do que temos (por que veio primeiro)

- Sem revisão da Apple — e um wrapper puro de site tem risco real de barra pela
  **guideline 4.2** ("mínima funcionalidade").
- Sem US$ 99/ano, sem Mac, sem Xcode.
- Deploy instantâneo; sem ciclo de revisão para corrigir nada.
- O mesmo código serve Android, onde push **não exige instalação** — e onde está
  a maior parte dos usuários (medido: entre pageloads móveis, Android supera iOS
  ~2:1).

### A decisão não é PWA × loja — é por plataforma

O erro de enquadramento é tratar isso como escolha única. O ritual de instalação
**só existe no iOS**. No Android, o push funciona no Chrome sem instalar nada: o
convite aparece, a pessoa autoriza, acabou.

E a distribuição importa: entre pageloads móveis da plataforma, **Android supera
iOS em cerca de 2:1** (medido no Sentry, 30 dias, 05/08 — 960 × 450; é medida de
pageload, não de pessoas, e não segmentada por tenant).

| | Instalação | Instrução necessária | Veredito |
|---|---|---|---|
| **Android** (~2/3 dos móveis) | não precisa | nenhuma | ✅ PWA resolve hoje |
| **iOS** (~1/3) | obrigatória | sim, sempre | ⚠️ onboarding guiado — ou app de loja |

Ou seja: o push **já entrega valor à maioria dos usuários móveis, sem imposto
nenhum**. Quem fica devendo é o iOS — e é ele, sozinho, que justifica a conta
Apple, quando e se a fatia iOS pesar o suficiente.

Consequência prática: priorizar Android no primeiro uso real, porque lá o ganho
é imediato e não depende de convencer ninguém a instalar nada.

## 6. Ressalvas técnicas das fases 4–6

- `server.url` do Capacitor é **temporário por definição** (a doc oficial o trata
  como live reload, não produção). Um `webDir` com `mobile/www/index.html` mínimo
  offline, CSP e restrição de navegação do bridge são obrigatórios.
- **Não gerar `mobile/ios` no Windows** — o fluxo suportado exige macOS
  (Capacitor 8 → Xcode 26+).
- **FCM no iOS não é automático:** o plugin entrega token APNs; converter para
  FCM exige Firebase Messaging e trabalho no `AppDelegate`.
- **Universal Links exigem Apple Developer.**
- Indisponibilidade da Vercel derruba um app com WebView remota — relevante só se
  a fase 6 escolher esse desenho.

## 7. Decisões de implementação que não são óbvias

- **`public/sw.js` não tem handler de `fetch`, e não deve ganhar um.** O worker é
  registrado no escopo raiz para todo mundo; a primeira estratégia de cache ali
  serviria app shell velho depois de um deploy, para todos, sem erro visível. Sem
  handler de `fetch` ele é *estruturalmente* incapaz de servir conteúdo.
- **`opened_at` vem de POST autenticado do service worker**, não de GET com
  redirect: GET que muta estado é disparado por prefetcher, antivírus e bot de
  preview de link (inclusive o do WhatsApp), o que encheria a métrica de robô.
- **Push NÃO passa pelo `gateEnvioDemo`.** O guard é opt-in por call site e o
  `push-core` não o chama — de propósito, para permitir teste em tenant de
  demonstração. Quem ler "tenant demo não envia nada" estará errado quanto a este
  canal.
- **A flag `sys_config.notificacoes_push` é FAIL-CLOSED**, ao contrário do
  `envio-guard` (que falha aberto). A assimetria é de custo: falhar aberto aqui
  exibiria convite de notificação em tenant que não pediu.
- **`acme-demo` não serve para testar push:** o reset das 04h deleta
  `colaboradores`, e o `ON DELETE CASCADE` apaga o endpoint. O push pararia de
  chegar de um dia para o outro, parecendo falha do iOS.

## 8. Estado e próximos passos

**Pronto:** migs 198/200/201, `lib/notifications/{delivery-log,push-core,flag,
plataforma}`, adapter webpush, 4 rotas, PWA + service worker, convite com funil.
VAPID nas 3 envs da Vercel. Flag ligada **só** em `teste-piloto`.

**Em aberto:**
1. Deixar o WhatsApp acumular dado por pelo menos uma semana cheia para a fase 1
   produzir a proporção cadência × autenticação.
2. **Instrumentar o canal de E-MAIL.** A mig 198 cobre só o WhatsApp (o e-mail sai
   por Resend, direto, sem passar pelo serviço central). Hoje o e-mail está fora
   da contagem — e ele é o canal alternativo de login, então a comparação entre
   canais está incompleta enquanto isso durar.
   ⚠️ Efeito colateral já observado: colaborador **sem telefone** recebe o link de
   acesso por e-mail, e nada disso aparece na medição. O funil só começa em
   `convite_exibido` (pós-login), então desistência ANTES do login é invisível —
   "não tentou" fica idêntico a "tentou e falhou".
3. ~~Teste guiado com 2 pessoas reais~~ ✅ feito 05/08 — ver §4.1. Resultado:
   conversão instruída no iOS 1/1 em ~3min; Android sem obstáculo técnico mas
   com 7min de latência até o clique.
4. **Decisão explícita e separada:** se e quando expor o convite a gente real em
   tenant real. Sucesso no tenant de teste valida o mecanismo, não a adoção.
5. Sobre o Android, a pergunta aberta virou **copy e momento** (por que a pessoa
   demora a tocar num botão sem obstáculo?), não plataforma. É a hipótese mais
   barata de testar da lista.

### Histórico de correções deste documento

- **05/08** — critério de fracasso reescrito (§3): a versão original media
  instalação espontânea no iOS, que é ~zero por construção. Substituído por
  conversão entre instruídos, segmentada por plataforma.
- **05/08** — §5 reenquadrada: a decisão não é "PWA × loja", é por plataforma.
  Android não tem ritual de instalação e concentra ~2/3 dos pageloads móveis.

⚠️ **Chave VAPID:** regenerar invalida **todas** as inscrições existentes e obriga
cada pessoa a reativar. A privada vive só nas envs da Vercel.
