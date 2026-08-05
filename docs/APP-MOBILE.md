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
- **Critério de fracasso declarado**: se a conversão até `endpoint_registrado`
  ficar abaixo de ~1/3 dos elegíveis, o gargalo é a INSTALAÇÃO, não a
  notificação — e aí a resposta é a fase 4/5 (app de loja), não refinar o PWA.

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

### Como decidir entre os dois

Sem opinião: com o funil. Se as pessoas atravessarem a instalação, o PWA ganha em
custo, velocidade e risco. Se travarem no "Adicionar à Tela de Início", isso é a
justificativa **quantificada** para a conta Apple e o app de loja — e aí o gasto
é uma resposta a um número, não uma aposta.

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
1. Carimbar `kind: 'pilula'` no webhook `whatsapp-cis`.
2. Deixar o WhatsApp acumular dado por pelo menos uma semana cheia para a fase 1
   produzir a proporção cadência × autenticação.
3. **Decisão explícita e separada:** se e quando expor o convite a gente real.
   Sucesso no tenant de teste valida o mecanismo, não a adoção.

⚠️ **Chave VAPID:** regenerar invalida **todas** as inscrições existentes e obriga
cada pessoa a reativar. A privada vive só nas envs da Vercel.
