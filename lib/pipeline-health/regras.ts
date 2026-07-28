/**
 * Regras do health-check — funções PURAS sobre dados já coletados.
 *
 * Ficam separadas da leitura do banco de propósito: é o que permite testá-las por
 * mutação (tests/unit/pipeline-health-regras.test.ts). Cada regra nasceu de uma
 * falha REAL, medida em produção — a referência está no comentário de cada uma.
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
  carimboWhatsapp: string | null;
  carimboEmail: string | null;
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
  const zapOk = comTel.filter((e) => e.carimboWhatsapp).length;
  const mailOk = comMail.filter((e) => e.carimboEmail).length;

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
  return out.filter(Boolean) as Achado[];
}

/**
 * R7 · Quem devia receber e não recebeu por canal nenhum (postflight).
 *
 * Complementa R6: o canal pode estar de pé no agregado e ainda assim a pessoa
 * específica ter ficado de fora. Sem isso, a falha individual é invisível.
 */
export function checarEntregaIncompleta(envios: EnvioObservado[]): Achado | null {
  const faltou = envios.filter((e) => (e.temTelefone || e.temEmail) && !e.carimboWhatsapp && !e.carimboEmail);
  return achado(
    'entrega-nao-realizada', 'critico',
    'Pessoa elegível não recebeu por canal nenhum',
    faltou.length,
    'Tinha contato e não há carimbo em nenhum canal: a pílula do dia se perdeu (o cron não faz catch-up).',
    { amostra: faltou.map((e) => e.nome), acao: 'Reenviar o dia com o script de reenvio pontual.' },
  );
}

/**
 * R7 · HORIZONTE: tema demandado por uma semana FUTURA sem kit publicado.
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
  /** Dias até essa semana abrir para quem está mais adiantado na coorte. */
  diasAte: number;
}

/** Abaixo disto não há tempo hábil de produzir e revisar: vira crítico. */
export const HORIZONTE_CRITICO_DIAS = 14;

export function checarHorizonteKits(
  lacunas: LacunaKitHorizonte[],
  criticoAteDias: number = HORIZONTE_CRITICO_DIAS,
): Achado[] {
  const comFalta = lacunas.filter((l) => l.faltantes.length > 0);
  const rotulo = (l: LacunaKitHorizonte) =>
    `sem${l.semana} (${l.diasAte}d) · ${l.competencia} · ${l.cargo} · ${l.descritor} · ${l.faltantes.join('')} · ${l.pessoas}p`;
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
 * R10 · Célula de vídeo que FALHOU e continua sem deck (F-V3).
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

/** Aplica todas as regras de PRÉ-VOO. */
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
