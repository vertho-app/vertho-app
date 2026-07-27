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
