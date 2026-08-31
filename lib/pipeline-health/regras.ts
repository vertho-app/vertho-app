/**
 * Regras do health-check — funções PURAS sobre dados já coletados.
 *
 * Ficam separadas da leitura do banco de propósito: é o que permite testá-las por
 * mutação (tests/unit/pipeline-health-regras.test.ts). Cada regra nasceu de uma
 * falha REAL, medida em produção — a referência está no comentário de cada uma.
 *
 * ── ÍNDICE (o ID é CITADO fora daqui — não renumere sem varrer) ─────────────
 *
 * Pré-voo (entregas previstas)   Estrutural / avulsas
 *   R1  checarFormatoPrometido      R8   checarDestinoDoAlerta
 *   R2  checarCoberturaKit          R9   checarMbForaDaRegua
 *   R3  checarDesafioPlaceholder    R10  checarDegradacoes
 *   R4  checarContatos              R11  checarPushDegradado
 *   R5  checarCoreAusente           R11b checarPushSemVapid
 *                                   R12  checarCanalEntradaWhatsapp
 * Pós-voo (envios observados)      R13  checarTemplatesLigados
 *   R6  checarCanalZerado           R14  checarModelosConfigurados
 *   R7  checarEntregaIncompleta     R15  checarHorizonteKits
 *                                   R16  checarCelulaVideoEmError
 *
 * ⚠️ **O número NÃO segue a ordem do arquivo, e isso é deliberado.** Os IDs são
 * citados em docs, testes e outros módulos (`lib/degradacao.ts`, `admin-supabase.ts`,
 * CLAUDE.md, FMEA, RESUMO…), então renumerar por estética quebraria referência viva.
 * A ordem aqui é a de leitura; a identidade é o número.
 *
 * 🔴 **31/08/2026 — por que este índice existe.** `R7` e `R10` estavam DUPLICADOS
 * (R7 = pós-voo *e* horizonte; R10 = degradações *e* célula de vídeo), e a
 * ambiguidade já tinha vazado: o FMEA documentava "R10" como a regra de vídeo
 * enquanto o CLAUDE.md e o RESUMO documentavam "R10" como a de degradação — duas
 * verdades sobre o mesmo rótulo no mesmo repositório. Horizonte virou **R15** e
 * célula de vídeo virou **R16** (perderam a disputa por terem menos citações).
 * `tests/unit/pipeline-health-ids-unicos.test.ts` impede a regressão.
 */
import { achado, type Achado } from './types';

/** Uma entrega prevista = (pessoa × pílula) de uma semana, JÁ PÓS-OVERLAY. */
export interface EntregaPrevista {
  colaboradorId: string;
  nome: string;
  cargo: string | null;
  disc: string | null;
  semana: number;
  pilula: number;
  descritor: string | null;
  /** Kit do DISC aplicado? Sem ele: conteúdo genérico + desafio placeholder. */
  temKit: boolean;
  /** Formato que a PÍLULA vai anunciar no texto (o preferido da pessoa). */
  formatoAnunciado: string;
  /** Formatos que a semana realmente entrega (pós-overlay, vídeo incluído). */
  formatosDisponiveis: string[];
  coreId: string | null;
  desafioPlaceholder: boolean;
  telefoneValido: boolean;
  temEmail: boolean;
}

/** Resultado de envio observado (postflight). */
export interface EnvioObservado {
  colaboradorId: string;
  nome: string;
  temTelefone: boolean;
  temEmail: boolean;
  /** tem inscrição de push ativa — canal aplicável a esta pessoa */
  temPush: boolean;
  carimboWhatsapp: string | null;
  carimboEmail: string | null;
  carimboPush: string | null;
}

/**
 * R1 · A pílula anuncia um formato que a semana não entrega.
 *
 * Real (27/07, Ibipeba): 17 entregas anunciavam "Seu vídeo 🎬 de hoje" numa semana
 * sem vídeo; 6 já tinham saído. O texto usa o formato PREFERIDO da pessoa
 * (`derivarPrioridadeFormatos[0]`), sem consultar o que existe. Já estava no FMEA
 * (§2, camadas 6-7) e mordeu mesmo assim.
 */
export function checarFormatoPrometido(entregas: EntregaPrevista[]): Achado | null {
  const quebradas = entregas.filter((e) => !e.formatosDisponiveis.includes(e.formatoAnunciado));
  return achado(
    'formato-prometido-ausente', 'critico',
    'Pílula anuncia formato que a semana não tem',
    quebradas.length,
    'A pessoa recebe "Seu vídeo/áudio de hoje", clica e não encontra o formato prometido.',
    {
      amostra: quebradas.map((e) => `${e.nome} · p${e.pilula} · promete ${e.formatoAnunciado} · tem ${e.formatosDisponiveis.join('/') || 'nada'}`),
      acao: 'Gerar o formato faltante antes do envio, ou anunciar o formato disponível.',
    },
  );
}

/**
 * R2 · Entrega sem kit do DISC → conteúdo genérico e desafio placeholder.
 *
 * Real (27/07): 31 de 72 entregas da semana 3 sem kit — a pessoa recebia o desafio
 * "Aplique {descritor}…" em vez do desafio sob medida ao perfil.
 */
export function checarCoberturaKit(entregas: EntregaPrevista[]): Achado | null {
  const semKit = entregas.filter((e) => !e.temKit);
  return achado(
    'entrega-sem-kit', 'aviso',
    'Entrega sem kit do DISC da pessoa',
    semKit.length,
    'Cai no conteúdo genérico do build e no desafio placeholder — perde a personalização por perfil.',
    {
      amostra: semKit.map((e) => `${e.nome} · ${e.disc} · ${e.descritor}`),
      acao: 'npx tsx scripts/_gerar-kits-faltantes.ts <semana> --executar',
    },
  );
}

/**
 * R3 · Desafio ainda é o placeholder do build.
 *
 * Sinal independente de R2: o kit pode existir e o desafio continuar placeholder se
 * o overlay não aplicou (F-C4: `precarregarKits` devolvendo Map vazio truthy).
 * Ter os dois separados distingue "falta kit" de "kit existe e não chegou".
 */
export function checarDesafioPlaceholder(entregas: EntregaPrevista[]): Achado | null {
  const ph = entregas.filter((e) => e.desafioPlaceholder && e.temKit);
  return achado(
    'desafio-placeholder-com-kit', 'critico',
    'Kit existe mas o desafio continua placeholder',
    ph.length,
    'Indica overlay não aplicado (não falta de kit) — o sintoma de F-C4, em que uma falha de query desliga a personalização da coorte inteira.',
    {
      amostra: ph.map((e) => `${e.nome} · ${e.descritor}`),
      acao: 'Investigar precarregarKits/overlayKitNaSemana — não adianta gerar kit.',
    },
  );
}

/**
 * R4 · Pessoa sem canal de entrega utilizável.
 *
 * Real (27/07): telefone gravado com DDI 597 (Suriname) em vez de 55 — a Z-API
 * recusou 3× e o carimbo ficou gravado como se tivesse saído. Um dígito trocado no
 * cadastro tirou a pessoa do canal por 2 semanas sem ninguém ver.
 */
export function checarContatos(entregas: EntregaPrevista[]): Achado[] {
  const porPessoa = new Map<string, EntregaPrevista>();
  for (const e of entregas) if (!porPessoa.has(e.colaboradorId)) porPessoa.set(e.colaboradorId, e);
  const pessoas = [...porPessoa.values()];

  const semNada = pessoas.filter((p) => !p.telefoneValido && !p.temEmail);
  const semZap = pessoas.filter((p) => !p.telefoneValido && p.temEmail);

  return [
    achado(
      'sem-canal-nenhum', 'critico',
      'Colaborador ativo sem canal de entrega',
      semNada.length,
      'Nem telefone válido nem e-mail: a trilha avança e a pessoa nunca é notificada, sem telemetria.',
      { amostra: semNada.map((p) => p.nome), acao: 'Corrigir cadastro antes do envio.' },
    ),
    achado(
      'telefone-invalido', 'aviso',
      'Telefone ausente ou fora do E.164 válido',
      semZap.length,
      'Recebe só por e-mail. O WhatsApp falha no provedor e o carimbo grava assim mesmo (o carimbo prova enfileiramento, não entrega).',
      { amostra: semZap.map((p) => p.nome), acao: 'Conferir DDI/DDD no cadastro.' },
    ),
  ].filter(Boolean) as Achado[];
}

/**
 * R5 · Entrega sem core de conteúdo.
 *
 * Real (16/07): 6 pessoas ficaram sem core na semana 2 porque o `core_id` do plano
 * apontava para conteúdo já apagado. O plano é SNAPSHOT — não se auto-corrige.
 */
export function checarCoreAusente(entregas: EntregaPrevista[]): Achado | null {
  const sem = entregas.filter((e) => !e.coreId && !e.formatosDisponiveis.length);
  return achado(
    'entrega-sem-core', 'critico',
    'Semana sem conteúdo resolvível',
    sem.length,
    'A pessoa abre a semana e não há o que consumir — o snapshot do plano aponta para conteúdo inexistente.',
    {
      amostra: sem.map((e) => `${e.nome} · sem ${e.semana}/p${e.pilula}`),
      acao: 'Reparar com selecionarConteudoDaSemana (a mesma função do motor), não à mão.',
    },
  );
}

/**
 * R6 · Um canal inteiro ficou zerado no dia (postflight).
 *
 * Real (20/07): a Z-API caiu e o cron carimbou 36 pílulas com ZERO WhatsApp
 * entregue. O carimbo por canal (mig 181) corrigiu a contabilidade, mas nada
 * AVISAVA — a /admin/engajamento reportava 100%.
 */
export function checarCanalZerado(envios: EnvioObservado[]): Achado[] {
  const comTel = envios.filter((e) => e.temTelefone);
  const comMail = envios.filter((e) => e.temEmail);
  const comPush = envios.filter((e) => e.temPush);
  const zapOk = comTel.filter((e) => e.carimboWhatsapp).length;
  const mailOk = comMail.filter((e) => e.carimboEmail).length;
  const pushOk = comPush.filter((e) => e.carimboPush).length;

  const out: (Achado | null)[] = [];
  if (comTel.length >= 3 && zapOk === 0) {
    out.push(achado('canal-whatsapp-zerado', 'critico', 'Nenhum WhatsApp saiu hoje',
      comTel.length, 'Todos os elegíveis ficaram sem WhatsApp — sinal de provedor fora ou credencial ausente, não de azar individual.',
      { acao: 'Checar Z-API/WaSender e QSTASH_TOKEN; reenviar o canal que faltou.' }));
  }
  if (comMail.length >= 3 && mailOk === 0) {
    out.push(achado('canal-email-zerado', 'critico', 'Nenhum e-mail saiu hoje',
      comMail.length, 'Todos os elegíveis ficaram sem e-mail — provedor fora ou credencial ausente.',
      { acao: 'Checar RESEND_API_KEY e o painel do provedor.' }));
  }
  // Push como canal de primeira classe também aqui. Sem esta linha, uma pane
  // total de push (VAPID ausente no ambiente, leitura de endpoints falhando)
  // seria indistinguível de "ninguém aderiu" — e ausência de sinal já foi
  // confundida com "ninguém quis" duas vezes neste projeto.
  if (comPush.length >= 3 && pushOk === 0) {
    out.push(achado('canal-push-zerado', 'critico', 'Nenhum push saiu hoje',
      comPush.length, 'Todos com inscrição ativa ficaram sem push — VAPID ausente, provedor fora ou falha ao ler os endpoints, não azar individual.',
      { acao: 'Checar NEXT_PUBLIC_VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY na Vercel e o degradacao_log (fluxo=envio).' }));
  }
  return out.filter(Boolean) as Achado[];
}

/**
 * R7 · Quem devia receber e não recebeu por canal nenhum (postflight).
 *
 * Complementa R6: o canal pode estar de pé no agregado e ainda assim a pessoa
 * específica ter ficado de fora. Sem isso, a falha individual é invisível.
 */
export function checarEntregaIncompleta(envios: EnvioObservado[]): Achado | null {
  const faltou = envios.filter(
    (e) => (e.temTelefone || e.temEmail || e.temPush)
      && !e.carimboWhatsapp && !e.carimboEmail && !e.carimboPush,
  );
  return achado(
    'entrega-nao-realizada', 'critico',
    'Pessoa elegível não recebeu por canal nenhum',
    faltou.length,
    'Tinha contato e não há carimbo em nenhum canal: a pílula do dia se perdeu (o cron não faz catch-up).',
    { amostra: faltou.map((e) => e.nome), acao: 'Reenviar o dia com o script de reenvio pontual.' },
  );
}

/**
 * R15 · HORIZONTE: tema demandado por uma semana FUTURA sem kit publicado.
 *
 * ⚠️ **Era R7 até 31/08/2026** — número que já pertencia a `checarEntregaIncompleta`
 * (o pós-voo). Renumerada porque o ID duplicado tornava ambíguo todo achado
 * descrito como "R7"; quem ficou com o 7 foi o pós-voo, por ser a sequência
 * natural de R6. Referências externas atualizadas na mesma passada.
 *
 * As outras regras olham a entrega de amanhã — servem para corrigir, não para
 * planejar. Esta olha semanas à frente, porque a produção de kit não cabe em 25h:
 * são ~5min por DISC, e um bloco novo de competência pode significar dezenas.
 *
 * Real (27/07, Ibipeba): a trilha troca de BLOCO DE COMPETÊNCIAS na semana 5 — os 3
 * pares (competência × cargo) que entram ali eram 100% novos e nenhum tinha kit, com
 * o piloto já na semana 3. Os kits das semanas 1-3 foram gerados sob demanda, uma
 * rodada por vez, e o bloco novo nunca entrou em rodada nenhuma. A capacidade de
 * detectar já existia (`levantarPlanoKitsCoorte` em dry-run); faltava alguém perguntar.
 *
 * Corte de severidade por TEMPO, não por volume: perto demais para produzir = crítico.
 */
export interface LacunaKitHorizonte {
  competencia: string;
  descritor: string;
  cargo: string;
  /** DISC sem kit publicado. */
  faltantes: string[];
  pessoas: number;
  /** Semana da trilha (a mais próxima) que demanda este tema. */
  semana: number;
  /** Dias até essa semana abrir para quem está mais adiantado NO RECORTE. */
  diasAte: number;
  /**
   * Turma do recorte (mig 210). `null` = empresa sem turmas (compat).
   *
   * Vai no rótulo do achado porque "sem5 · 12d · Gestão Escolar" não diz de QUEM
   * é a semana 5 quando há duas safras — e a ação de produzir kit é por turma.
   */
  turma?: string | null;
}

/** Abaixo disto não há tempo hábil de produzir e revisar: vira crítico. */
export const HORIZONTE_CRITICO_DIAS = 14;

export function checarHorizonteKits(
  lacunas: LacunaKitHorizonte[],
  criticoAteDias: number = HORIZONTE_CRITICO_DIAS,
): Achado[] {
  const comFalta = lacunas.filter((l) => l.faltantes.length > 0);
  // A turma entra no rótulo SÓ quando há mais de uma no lote: em cliente de uma
  // safra só, o prefixo seria ruído constante.
  const varias = new Set(comFalta.map((l) => l.turma ?? '')).size > 1;
  const rotulo = (l: LacunaKitHorizonte) =>
    `${varias && l.turma ? `[${l.turma}] ` : ''}sem${l.semana} (${l.diasAte}d) · ${l.competencia} · ${l.cargo} · ${l.descritor} · ${l.faltantes.join('')} · ${l.pessoas}p`;
  // Ordena pelo que vence primeiro — a amostra é cortada em 8 e tem que mostrar o
  // mais urgente, não o alfabeticamente primeiro.
  const ordenar = (a: LacunaKitHorizonte, b: LacunaKitHorizonte) => a.diasAte - b.diasAte || b.pessoas - a.pessoas;

  const urgentes = comFalta.filter((l) => l.diasAte <= criticoAteDias).sort(ordenar);
  const futuras = comFalta.filter((l) => l.diasAte > criticoAteDias).sort(ordenar);

  const somaDiscs = (ls: LacunaKitHorizonte[]) => ls.reduce((s, l) => s + l.faltantes.length, 0);

  return [
    achado(
      'kit-horizonte-urgente', 'critico',
      `Semana a menos de ${criticoAteDias} dias sem kit`,
      somaDiscs(urgentes),
      'Sem kit, a pessoa recebe conteúdo genérico e desafio placeholder — a entrega acontece, só perde a personalização por DISC, então ninguém reclama. Produzir leva ~5min por DISC e não cabe no aviso de 25h do pré-voo.',
      {
        amostra: urgentes.map(rotulo),
        acao: 'planejarKitsCoorte(empresaId, { executar: true }) — ou /admin/conteudos/kit/coorte.',
      },
    ),
    achado(
      'kit-horizonte-proximo', 'aviso',
      'Semana futura sem kit (ainda há folga)',
      somaDiscs(futuras),
      'Ainda dá tempo, mas entra na fila de produção agora para não virar urgência.',
      { amostra: futuras.map(rotulo) },
    ),
  ].filter(Boolean) as Achado[];
}

/**
 * R16 · Célula de vídeo que FALHOU e continua sem deck (F-V3).
 *
 * ⚠️ **Era R10 até 31/08/2026.** O número 10 ficou com `checarDegradacoes`, que o
 * carrega em ~19 lugares (CLAUDE.md, RESUMO, FMEA, `lib/degradacao.ts`, testes).
 * A duplicata já tinha vazado para a documentação: o FMEA descrevia "R10" como
 * esta regra e o CLAUDE.md como a outra, no mesmo repositório.
 *
 * O achado `video-stale` só pega célula presa em `processing/rendering/render_queued`.
 * Quem termina em **`error`** sai do radar: o resolver da entrega filtra
 * `status<>'error'`, a pessoa cai no formato não-vídeo e ninguém é avisado.
 *
 * **Medido 28/07:** num lote de 41 células, 6 falharam (~15%) por saturação de
 * fornecedor — 3 TTS sem áudio, 3 HeyGen timeout. Recuperáveis re-disparando, mas só se
 * alguém souber.
 *
 * ⚠️ O critério é "erro **E** nenhum deck", não "tem erro". Medido no mesmo dia: **35
 * células já tiveram erro alguma vez e 33 delas foram resolvidas** por uma tentativa
 * posterior. Uma regra que contasse `error` cru acusaria 35 para sempre — ruído crônico é
 * alarme desligado.
 */
export interface CelulaVideoSemDeck {
  empresaSlug: string | null;
  cargo: string | null;
  disc: string | null;
  erros: number;
  ultimoErro: string | null;
}

export function checarCelulaVideoEmError(celulas: CelulaVideoSemDeck[]): Achado | null {
  return achado(
    'celula-video-em-error', 'aviso',
    'Célula de vídeo falhou e segue sem deck',
    celulas.length,
    'A última tentativa terminou em erro e não há deck assistível: a entrega ignora a célula e a pessoa recebe o formato não-vídeo, sem nada avisar. Costuma ser saturação de fornecedor (TTS/HeyGen) num lote, e o re-disparo resolve.',
    {
      amostra: celulas.map((c) => `${c.empresaSlug || '?'} · ${c.cargo || '?'} · ${c.disc || '?'} · ${c.erros}× · ${String(c.ultimoErro || '').slice(0, 50)}`),
      acao: 'Re-disparar a célula (resolverCelulaVideo com gerar:true) — em lote, com concorrência 2 para não saturar de novo.',
    },
  );
}

/**
 * R9 · Módulo-Base publicado cujo `descritor` não existe na régua da competência×cargo.
 *
 * O resolver casa o descritor da semana contra `modulos_base_conteudo.descritor` (por
 * embedding, ou tokens quando não há vetor). Se o MB gravou outra coisa nesse campo —
 * um TÍTULO editorial, por exemplo — o match nunca é exato e a escolha vira ruído:
 * o conteúdo é gerado, ancorado no módulo do assunto VIZINHO, sem erro nenhum.
 *
 * **Medido em 28/07 (Ibipeba):** os 18 MBs de "Autocuidado × Gestão Escolar" guardavam o
 * título ("A Calma que se Constrói") em vez do nome da régua ("Regulação sob pressão").
 * Resultado: 6 descritores colapsaram em 2 módulos, 14 de 18 conteúdos core ficaram
 * ancorados no módulo errado e 2 módulos nunca foram usados por nada. O mesmo manuscrito
 * gravou certo em Coordenação Pedagógica — ninguém tinha como notar a diferença.
 *
 * Este é um check de DADOS, não de código: por isso vive no run estrutural (diário,
 * persistido) e não num guard de CI, que só enxerga o repositório.
 */
export interface MbForaDaRegua {
  id: string;
  competencia: string;
  cargo: string | null;
  descritor: string;
}

export function checarMbForaDaRegua(itens: MbForaDaRegua[]): Achado | null {
  return achado(
    'mb-descritor-fora-da-regua', 'critico',
    'Módulo-Base publicado com descritor que não existe na régua',
    itens.length,
    'O resolver casa pelo nome do descritor: com outro valor no campo, o conteúdo nasce ancorado no módulo do assunto vizinho — sem erro, sem log, sem sinal na tela.',
    {
      amostra: itens.map((m) => `${m.cargo || 'todos'} · ${m.competencia} · "${m.descritor}"`),
      acao: 'Gravar o nome_curto da régua em `descritor` (o título editorial vive em `titulo`) e RECALCULAR `descritor_embedding` — o vetor antigo tem precedência sobre tokens.',
    },
  );
}

/**
 * R8 · O alarme tem para onde alertar?
 *
 * `alertar()` só envia se `ADMIN_EMAILS` estiver preenchida; sem ela, o alerta crítico
 * vira um `console.error` que ninguém lê. **Medido em 27/07:** a env não existia em
 * NENHUM ambiente enquanto os 4 modos eram construídos e declarados prontos — todo o
 * sistema de alarme era decorativo, e só apareceu numa auditoria manual.
 *
 * Por isso este achado entra no run ESTRUTURAL, que é persistido: mesmo sem conseguir
 * mandar e-mail (a ironia é inevitável), fica na série histórica e na tela. Um alarme
 * sem destinatário é a mesma "documentação que não protege ninguém" que este sistema
 * existe para substituir.
 */
export function checarDestinoDoAlerta(adminEmails: string | undefined): Achado | null {
  const destinos = String(adminEmails || '').split(',').map((s) => s.trim()).filter(Boolean);
  return achado(
    'alerta-sem-destino', 'critico',
    'Sem destinatário de alerta — nenhum alerta crítico chega a ninguém',
    destinos.length ? 0 : 1,
    'Os checks continuam rodando e gravando, mas o e-mail nunca sai: o pipeline degrada em silêncio de novo, agora com um painel dizendo que está tudo monitorado.',
    { acao: "Definir HEALTH_ALERT_EMAILS na Vercel: printf '%s' 'email@dominio' | vercel env add HEALTH_ALERT_EMAILS production (NÃO usar ADMIN_EMAILS: ela também concede platform-admin)" },
  );
}

/**
 * R10 · Fallbacks acionados nas últimas 24h (telemetria de degradação, FMEA §3.3).
 *
 * Decisão de produto de 28/07: fallback pode existir, mas nunca invisível. Cada
 * queda no caminho degradado grava uma linha em `degradacao_log` (mig 194, via
 * lib/degradacao.ts) — esta regra é quem TRANSFORMA o rastro em reclamação: sem
 * ela, a tabela seria só mais um log que ninguém lê (o mesmo destino do
 * console.warn que ela substitui).
 *
 * Sobe para crítico quando algum tipo foi registrado com severidade crítica
 * (ex.: `missao-placeholder` — a semana inteira degrada) ou quando o VOLUME
 * total passa do limiar: uma degradação é acidente; dezenas por dia são sintoma.
 */
export interface DegradacaoRegistro {
  fluxo: string;
  tipo: string;
  severidade: 'info' | 'aviso' | 'critico';
  ocorrencias: number;
}

/** Acima disto em 24h, o volume em si é o problema — não um tipo específico. */
export const DEGRADACAO_VOLUME_CRITICO = 50;

export function checarDegradacoes(registros: DegradacaoRegistro[]): Achado | null {
  const porTipo = new Map<string, { ocorrencias: number; severidade: string }>();
  for (const r of registros || []) {
    const atual = porTipo.get(r.tipo) || { ocorrencias: 0, severidade: r.severidade };
    atual.ocorrencias += Number(r.ocorrencias) || 1;
    if (r.severidade === 'critico') atual.severidade = 'critico';
    porTipo.set(r.tipo, atual);
  }
  const total = [...porTipo.values()].reduce((s, t) => s + t.ocorrencias, 0);
  const temCritico = [...porTipo.values()].some((t) => t.severidade === 'critico');
  return achado(
    'degradacao-fallback-24h',
    temCritico || total > DEGRADACAO_VOLUME_CRITICO ? 'critico' : 'aviso',
    'Fallbacks acionados nas últimas 24h',
    total,
    'Fluxos caíram no caminho degradado (conteúdo placeholder, personalização desligada, trilha reduzida) — a entrega acontece, só perde qualidade, então ninguém reclama.',
    {
      amostra: [...porTipo.entries()]
        .sort((a, b) => b[1].ocorrencias - a[1].ocorrencias)
        .map(([tipo, t]) => `${tipo} · ${t.ocorrencias}×`),
      acao: 'Ver degradacao_log (detalhe por fluxo/chave) e atacar o tipo mais frequente — fallback repetido é sintoma, não azar.',
    },
  );
}

/**
 * R11 · Saúde do canal PUSH nas últimas 24h (`notification_deliveries`).
 *
 * Complementa — não substitui — o `canal-push-zerado` do pós-voo. Aquele lê
 * CARIMBO e herda o timing do fan-out (o pós-voo roda logo após o enfileiramento,
 * não após os envios). Esta lê a tabela de ENTREGAS numa janela de 24h, quando a
 * resposta já existe, e enxerga duas coisas que o carimbo não conta:
 *
 *  · FALHAS — o carimbo só registra sucesso, então uma taxa alta de falha é
 *    invisível por ele;
 *  · PRESOS — linha em `tentativa` que envelheceu sem desfecho. A entrega é
 *    gravada ANTES do envio (para o id viajar no payload), então `tentativa`
 *    velha significa que o processo morreu entre gravar e enviar. Não existe
 *    nenhuma outra tela onde isso apareça.
 *
 * Zero entregas NÃO é achado: em dia sem cadência (fim de semana, empresa sem
 * envio) zero é o correto. Alarme por ausência aqui viraria crônico — e alarme
 * crônico é a mesma coisa que silêncio.
 */
export interface PushDiario {
  total: number;
  sucesso: number;
  falha: number;
  presos: number;
}

/** Acima disto, a proporção de falha deixa de ser azar individual. */
export const PUSH_FALHA_CRITICA = 0.5;
/** Abaixo disto, a amostra não sustenta conclusão sobre o canal. */
export const PUSH_AMOSTRA_MINIMA = 5;

export function checarPushDegradado(p: PushDiario): Achado | null {
  if (!p || p.total === 0) return p?.presos ? presosAchado(p.presos) : null;

  const taxaFalha = p.total ? p.falha / p.total : 0;
  const tudoFalhou = p.sucesso === 0 && p.total > 0;
  const falhaAlta = p.total >= PUSH_AMOSTRA_MINIMA && taxaFalha > PUSH_FALHA_CRITICA;

  if (tudoFalhou || falhaAlta) {
    return achado(
      'push-degradado-24h',
      'critico',
      'Push falhando nas últimas 24h',
      p.falha + p.presos || p.total,
      'Houve tentativa de push e quase nada chegou — VAPID ausente/rotacionada, provedor fora ou inscrições mortas em massa. Como push é canal adicional, ninguém reclama: a pessoa simplesmente não é avisada.',
      {
        amostra: [`total ${p.total}`, `sucesso ${p.sucesso}`, `falha ${p.falha}`, `presos ${p.presos}`],
        acao: 'Conferir NEXT_PUBLIC_VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY na Vercel e degradacao_log (fluxo=envio). Rotacionar VAPID invalida TODAS as inscrições.',
      },
    );
  }
  return p.presos ? presosAchado(p.presos) : null;
}

function presosAchado(presos: number): Achado | null {
  return achado(
    'push-preso-em-tentativa',
    'aviso',
    'Entregas de push presas em "tentativa"',
    presos,
    'A linha foi gravada antes do envio e o desfecho nunca chegou: o processo morreu no meio. A pessoa não recebeu e a entrega não conta como falha em lugar nenhum.',
    { acao: 'Ver notification_deliveries WHERE channel=\'webpush\' AND status=\'tentativa\' — e checar timeout da lambda do cron.' },
  );
}

/**
 * R11b · Gente inscrita em push num ambiente SEM VAPID.
 *
 * Esta regra existe porque a R11 acima NÃO PODE pegar este caso, e a descoberta
 * disso é o motivo de ela existir separada: com VAPID ausente, `enviarPush`
 * retorna ANTES de gravar qualquer linha em `notification_deliveries`. Total
 * zero, falhas zero — e `achado()` devolve `null` quando a contagem é 0. Ou
 * seja: a regra desenhada para detectar pane total ficava muda justamente na
 * pane total. Check que não pode falhar é o anti-padrão que este módulo combate.
 *
 * A contagem aqui é "quem NÃO vai receber", nunca "quantas falhas" — é o que
 * garante que ela seja diferente de zero exatamente quando o problema existe.
 *
 * E é DETERMINÍSTICA: lê ambiente, não infere de tabela vazia. Tabela vazia
 * confunde quatro estados distintos (ninguém aderiu · cron não rodou · flag
 * desligada · VAPID ausente); a env responde de graça e sem ambiguidade.
 * Mesmo formato do R8 (`checarDestinoDoAlerta`).
 */
export function checarPushSemVapid(configurado: boolean, endpointsAtivos: number): Achado | null {
  if (configurado) return null;
  return achado(
    'push-sem-vapid',
    'critico',
    'Pessoas inscritas em push, mas o ambiente não tem VAPID',
    endpointsAtivos,
    'Cada uma dessas pessoas concedeu permissão e nunca vai receber nada: o envio aborta antes de tentar, então não há sequer registro de falha. Do lado delas, o app simplesmente não avisa.',
    { acao: "Definir NEXT_PUBLIC_VAPID_PUBLIC_KEY e VAPID_PRIVATE_KEY na Vercel. ⚠️ Gerar par NOVO invalida todas as inscrições existentes — se elas foram criadas com a chave antiga, todo mundo reativa." },
  );
}

/**
 * R12 · O canal de ENTRADA do WhatsApp ainda está de pé?
 *
 * Todas as 14 regras acima olham SAÍDA. O inbound não tinha nenhuma — e ele é o
 * lado que falha em silêncio absoluto: a Meta desativa a inscrição do webhook
 * quando ele erra de forma persistente, e num número da Cloud API **não existe
 * aplicativo** onde alguém possa "abrir e ver depois". A mensagem não fica
 * pendente: ela nunca chega a lugar nenhum.
 *
 * 🔴 POR QUE NÃO DÁ PARA MEDIR ISSO POR VOLUME. "Nenhuma mensagem recebida em
 * 24h" é o estado NORMAL deste canal hoje (uma mensagem no total até 15/08/2026).
 * Uma regra baseada em contagem ficaria muda sempre — inclusive no dia da queda.
 * Por isso `inspecionarCloudApi()` PERGUNTA à Meta, e esta função só decide.
 * Mesmo espírito do R8 e do R11b: ler configuração, nunca inferir de tabela vazia.
 *
 * `inscrito === null` vira aviso próprio em vez de silêncio: não saber é um
 * estado, e um check que trata ignorância como "ok" é o que este módulo combate.
 *
 * A qualidade do número entra aqui porque chega no mesmo custo e é o único aviso
 * PRÉVIO de restrição — em 11/08/2026 um disparo em lote derrubou um número, e o
 * sinal chegou como canal morto, nunca como métrica.
 */
export interface SaudeCanalEntrada {
  configurada: boolean;
  inscrito: boolean | null;
  appsInscritos: string[];
  numeroOk: boolean | null;
  qualidade: string | null;
  nomeVerificado: string | null;
  motivo: string | null;
}

export function checarCanalEntradaWhatsapp(s: SaudeCanalEntrada): Achado[] {
  // Cloud API desligada é um estado legítimo: o canal legado (Z-API/WaSender)
  // assume, e alarmar aqui seria reclamar de uma decisão.
  if (!s?.configurada) return [];

  const out: (Achado | null)[] = [];

  if (s.inscrito === false) {
    out.push(achado(
      'whatsapp-webhook-sem-inscricao', 'critico',
      'O webhook do WhatsApp não está inscrito na conta da Meta',
      1,
      'Tudo que chegar pelo WhatsApp some sem rastro — e como o número da Cloud API não tem aplicativo, ninguém consegue ver depois. Do lado de quem escreveu, a mensagem foi entregue.',
      { acao: 'Reinscrever: POST /{WABA_ID}/subscribed_apps com o token do app, e conferir os campos messages e message_template_status_update.' },
    ));
  }

  // Cegueira em QUALQUER das duas metades vira achado. `inscrito` e `numeroOk`
  // vêm de chamadas diferentes: um ambiente com token e sem `PHONE_NUMBER_ID`
  // responde a primeira e não a segunda, e tratar isso como "ok" seria a mesma
  // falha que a regra existe para pegar, um nível acima.
  if (s.inscrito === null || s.numeroOk === null) {
    out.push(achado(
      'whatsapp-webhook-check-cego', 'aviso',
      'Não foi possível verificar a saúde do canal de entrada',
      1,
      `O canal pode estar de pé ou caído — este check não conseguiu perguntar${s.motivo ? ` (${s.motivo})` : ''}. Enquanto isso, uma queda do inbound continua indistinguível de "ninguém escreveu".`,
      { acao: 'Conferir WABA_ID, PHONE_NUMBER_ID e META_WHATSAPPBUSINESS_API na Vercel (o token precisa de whatsapp_business_management).' },
    ));
  }

  if (s.numeroOk === false) {
    out.push(achado(
      'whatsapp-numero-inacessivel', 'critico',
      'O número da Cloud API não respondeu com a credencial atual',
      1,
      'Nenhuma mensagem sai — inclusive o OTP de login, que hoje tenta este caminho antes do legado.',
      { acao: 'Conferir PHONE_NUMBER_ID e a validade do token do system user no painel da Meta.' },
    ));
  }

  const q = (s.qualidade || '').toUpperCase();
  if (q === 'RED' || q === 'YELLOW') {
    out.push(achado(
      `whatsapp-qualidade-${q.toLowerCase()}`, q === 'RED' ? 'critico' : 'aviso',
      `Qualidade do número em ${q} na Meta`,
      1,
      q === 'RED'
        ? 'A Meta já restringiu ou está prestes a restringir o número: o limite de mensagens cai e o canal pode morrer para todos os tenants de uma vez.'
        : 'Sinal PRÉVIO de restrição — bloqueios e "marcar como spam" acumulados. É a janela para agir antes de perder o número.',
      { acao: 'Reduzir disparo em lote, revisar copy dos templates e conferir o painel de qualidade da WABA.' },
    ));
  }

  return out.filter(Boolean) as Achado[];
}

/**
 * R13 · O template LIGADO em cada papel da cadência.
 *
 * 🔴 Real (15/08/2026): a pílula semanal — o disparo de maior volume do produto
 * — estava apontando para um template que a Meta havia reclassificado de UTILITY
 * para MARKETING. Nada quebrou: aprovado, enviado, entregue. Só que MARKETING
 * custa ~6× (R$ 0,40-0,55 contra R$ 0,06-0,09), e em ~400 pessoas por semana
 * isso é a diferença entre ~R$ 25 e ~R$ 180 semanais. Havia, o tempo todo, um
 * template UTILITY **aprovado** cobrindo o mesmo momento, parado.
 *
 * Por que ninguém viu: o nome vem de `WHATSAPP_TEMPLATE_*`, marcada como
 * *Sensitive* na Vercel (não dá para ler de volta), e `templateAtivo()` não
 * tinha nenhum outro consumidor — nenhuma tela, nenhum check. Configuração
 * declarada não é configuração observável.
 *
 * As três severidades correspondem a três consequências diferentes:
 *   - **`INEXISTENTE`** → a Meta responde 132001 e a mensagem NÃO SAI. Crítico.
 *     É também o sintoma de um `\n` colado no `vercel env add` (já mordeu).
 *   - **status ≠ APPROVED** → mesmo efeito: não sai. Crítico.
 *   - **MARKETING** → sai, entrega, custa 6×. Aviso, porque pode ser escolha
 *     consciente — mas nunca uma escolha invisível.
 *
 * Papel desligado (`nome === null`) é estado legítimo e não vira achado.
 */
export interface TemplateLigadoObservado {
  papel: string;
  nome: string | null;
  status: string | null;
  categoria: string | null;
  motivo: string | null;
}

export function checarTemplatesLigados(ligados: TemplateLigadoObservado[]): Achado[] {
  const ativos = (ligados || []).filter((t) => t.nome);
  if (!ativos.length) return [];

  const out: (Achado | null)[] = [];

  // Cegueira primeiro: se não deu para perguntar, os outros dois checks abaixo
  // ficariam mudos e isso pareceria "tudo certo".
  const cegos = ativos.filter((t) => t.motivo);
  out.push(achado(
    'template-ligado-check-cego', 'aviso',
    'Não foi possível verificar os templates ligados na Meta',
    cegos.length,
    `Os templates da cadência podem estar corretos ou apontando para nada — este check não conseguiu perguntar${cegos[0]?.motivo ? ` (${cegos[0].motivo})` : ''}.`,
    { amostra: cegos.map((t) => `${t.papel} → ${t.nome}`), acao: 'Conferir WABA_ID e META_WHATSAPPBUSINESS_API na Vercel.' },
  ));

  const sumidos = ativos.filter((t) => !t.motivo && t.status === 'INEXISTENTE');
  out.push(achado(
    'template-ligado-inexistente', 'critico',
    'Papel da cadência aponta para um template que não existe na Meta',
    sumidos.length,
    'A Meta recusa com 132001 e a mensagem não sai. Costuma ser typo, template apagado ou um "\\n" colado no valor pelo shell.',
    { amostra: sumidos.map((t) => `${t.papel} → ${t.nome}`), acao: 'Conferir o nome exato em /{WABA_ID}/message_templates e regravar com printf %s (sem pipe de echo).' },
  ));

  const naoAprovados = ativos.filter((t) => !t.motivo && t.status && t.status !== 'INEXISTENTE' && t.status !== 'APPROVED');
  out.push(achado(
    'template-ligado-nao-aprovado', 'critico',
    'Papel da cadência aponta para template que não está aprovado',
    naoAprovados.length,
    'Template PENDING ou REJECTED é recusado no envio (132001) — a cadência daquele papel fica muda.',
    { amostra: naoAprovados.map((t) => `${t.papel} → ${t.nome} (${t.status})`), acao: 'Ligar um template APPROVED, ou desligar o papel até a aprovação sair.' },
  ));

  const marketing = ativos.filter((t) => !t.motivo && t.categoria === 'MARKETING');
  out.push(achado(
    'template-ligado-marketing', 'aviso',
    'Papel da cadência ligado a template MARKETING (custa ~6×)',
    marketing.length,
    'MARKETING custa R$ 0,40-0,55 por mensagem contra R$ 0,06-0,09 do UTILITY. Funciona e entrega — só sai caro, e sem sintoma.',
    { amostra: marketing.map((t) => `${t.papel} → ${t.nome}`), acao: 'Procurar um template UTILITY aprovado para o mesmo momento; se não houver, submeter uma versão com copy mais transacional.' },
  ));

  return out.filter(Boolean) as Achado[];
}

/** Aplica todas as regras de PRÉ-VOO. */
/**
 * R14 — o modelo de IA configurado ainda existe no provedor?
 *
 * Nasceu de um caso real (25/08/2026): `ia3_check`/`ia4_check` da ACME Demo com
 * override explícito para `gpt-5.4`, id que morreu no provedor DEPOIS de ter sido
 * gravado. Override explícito vence o pin — então os dois auditores Dual-IA
 * daquele tenant apontavam para o nada, e a única evidência era indireta (15 de
 * 25 cenários sem check, contra ~100% em todos os outros tenants).
 *
 * O ponto que define a forma deste check: **validação de escrita não pega isso**.
 * O valor era válido quando gravado. Só uma verificação recorrente contra o
 * provedor separa "configurado" de "ainda existe".
 */
export function checarModelosConfigurados(
  observados: Array<{
    modelo: string; origens: string[]; familia: string | null;
    temRota: boolean; temPreco: boolean;
    existeNoProvedor: boolean | null; motivoCegueira?: string;
  }>,
): Achado[] {
  const obs = observados || [];
  if (!obs.length) return [];
  const out: (Achado | null)[] = [];
  const amostrar = (l: typeof obs) => l.map((o) => `${o.modelo} ← ${o.origens.slice(0, 2).join(', ')}`);

  // Cegueira PRIMEIRO: sem isto, um provedor fora do ar zeraria os achados
  // abaixo e o silêncio pareceria aprovação.
  const cegos = obs.filter((o) => o.existeNoProvedor === null);
  out.push(achado(
    'modelo-check-cego', 'aviso',
    'Não foi possível verificar se os modelos configurados ainda existem',
    cegos.length,
    `Os modelos podem estar certos ou apontando para nada — este check não conseguiu perguntar ao provedor${cegos[0]?.motivoCegueira ? ` (${cegos[0].motivoCegueira})` : ''}.`,
    { amostra: amostrar(cegos), acao: 'Conferir as chaves de API do provedor na Vercel (`vercel env ls production`).' },
  ));

  const inexistentes = obs.filter((o) => o.existeNoProvedor === false);
  out.push(achado(
    'modelo-inexistente', 'critico',
    'Modelo configurado NÃO existe mais no provedor',
    inexistentes.length,
    'Toda chamada que resolver para este modelo falha. Quando é um auditor Dual-IA, a segunda opinião simplesmente para de acontecer — e a ausência de check parece "nada a apontar".',
    { amostra: amostrar(inexistentes), acao: 'Remover o override em `sys_config.ai.modelos` (o default pinado assume) ou apontar para um id vivo.' },
  ));

  const semRota = obs.filter((o) => !o.temRota);
  out.push(achado(
    'modelo-sem-rota', 'critico',
    'Modelo configurado sem rota no ai-client',
    semRota.length,
    'O último caso do dispatch é `callClaude`, então o id vai para a Anthropic e o erro chega ETIQUETADO COMO ANTHROPIC — parece queda de provedor, é modelo sem rota.',
    { amostra: amostrar(semRota), acao: 'Adicionar o provedor em `lib/ai-provedores.ts` ou trocar o modelo configurado.' },
  ));

  const semPreco = obs.filter((o) => !o.temPreco);
  out.push(achado(
    'modelo-sem-preco', 'aviso',
    'Modelo configurado sem preço no catálogo',
    semPreco.length,
    '`costFromTokens` devolve null e a linha do ledger nasce sem custo — cega justamente o instrumento que decide se o modelo compensa.',
    { amostra: amostrar(semPreco), acao: 'Adicionar a entrada em `lib/ia-cost-catalog.ts::MODELS`.' },
  ));

  return out.filter(Boolean) as Achado[];
}

export function regrasPreflight(entregas: EntregaPrevista[]): Achado[] {
  return [
    checarFormatoPrometido(entregas),
    checarDesafioPlaceholder(entregas),
    checarCoreAusente(entregas),
    ...checarContatos(entregas),
    checarCoberturaKit(entregas),
  ].filter(Boolean) as Achado[];
}

/** Aplica todas as regras de PÓS-VOO. */
export function regrasPostflight(envios: EnvioObservado[]): Achado[] {
  return [
    ...checarCanalZerado(envios),
    checarEntregaIncompleta(envios),
  ].filter(Boolean) as Achado[];
}
