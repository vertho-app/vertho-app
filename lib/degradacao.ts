/**
 * Telemetria de degradação (FMEA-PIPELINE §3.3 — decisão de produto de 28/07):
 * fallback pode existir, mas nunca INVISÍVEL. Onde o fluxo cai no caminho
 * degradado (DUO→single, missão placeholder, overlay sem kit…), além do
 * console.warn existente registra-se UMA linha por (fluxo, tipo, chave) em
 * `degradacao_log` (mig 194); repetições NO MESMO DIA incrementam `ocorrencias`
 * — virado o dia (UTC), o contador recomeça do 1. Sem o reset, chaves quentes
 * (o overlay registra a cada leitura de página) acumulavam para sempre e a R10,
 * que lê "volume nas últimas 24h", cruzava o limiar crítico em operação normal:
 * alarme crônico, que é o mesmo silêncio por excesso.
 *
 * REGRA DE OURO: esta função NUNCA lança. Ela existe exatamente para o caminho
 * de fallback — se a telemetria derrubasse o fluxo, o remédio seria pior que a
 * doença. Qualquer falha vira console.error e segue o jogo.
 *
 * O health-check estrutural lê a tabela a cada run (R10 em
 * lib/pipeline-health/regras.ts) e transforma volume anormal ou severidade
 * crítica em achado — é ele quem "reclama", não este helper.
 */
import { createSupabaseAdmin } from '@/lib/supabase';

/** Tipos canônicos de degradação — FONTE ÚNICA (mesmo padrão de lib/status.ts). */
export const DEGRADACAO = {
  /** trilha-core: DUO indisponível → build ABORTA (28/07); escape = programa_modo='regular_single'. */
  DUO_PARA_SINGLE: 'duo-para-single',
  /** trilha-core: descritores sem avaliação ignorados na alocação. */
  DESCRITOR_SEM_AVALIACAO: 'descritor-sem-avaliacao',
  /** trilha-core (onboarding): competência sem assessment → default neutro 1.5. */
  ONBOARDING_DEFAULT_NEUTRO: 'onboarding-default-neutro',
  /** trilha-core (DUO): blueprint→trilha não-aproveitável → selectDescriptorsDuo. */
  BLUEPRINT_ADAPTER_FALLBACK: 'blueprint-adapter-fallback',
  /** build-season: desafio por IA falhou → templated. */
  DESAFIO_PLACEHOLDER: 'desafio-placeholder',
  /** build-season: missão/cenário por IA falhou → build ABORTA (28/07; antes era placeholder). */
  MISSAO_PLACEHOLDER: 'missao-placeholder',
  /** build-season: semana sem core de conteúdo → build ABORTA (28/07; antes era fallback_gerado). */
  CONTEUDO_AUSENTE: 'conteudo-ausente',
  /** build-season (piloto): semana com menos entregas que o esperado. */
  PILOTO_DISTRIBUICAO_INCOMPLETA: 'piloto-distribuicao-incompleta',
  /** jornada: fechamento concluiu, mas a jornada seguinte não foi gerada (mig 199). */
  JORNADA_ENCADEAMENTO_FALHOU: 'jornada-encadeamento-falhou',
  /** contexto-empresa: síntese do PPP falhou → cai no PPP mais recente. */
  SINTESE_PPP_FALHOU: 'sintese-ppp-falhou',
  /** overlay: sem kit para o DISC da pessoa → mantém o conteúdo do build. */
  KIT_AUSENTE_DISC: 'kit-ausente-disc',
  /**
   * overlay: existe kit do tema E do DISC, mas só de OUTRO cargo → barrado, mantém
   * o build. Separado de `kit-ausente-disc` porque a ação é diferente e mais barata:
   * o tema já foi escrito e aprovado, falta gerar a célula do cargo certo. Misturar
   * os dois esconderia isso dentro do balde maior.
   */
  KIT_CARGO_DIVERGENTE: 'kit-cargo-divergente',
  /**
   * vídeo: o ASR não devolveu timing por palavra → legendas caem na heurística
   * proporcional E as animações perdem `speechStartFrame/EndFrame` (7 templates
   * usam esses cues). Medido em 03/08: o projeto OpenAI perdeu acesso a modelos
   * de áudio em algum ponto entre 25/06 e 14/07, e **139 vídeos** foram gerados
   * assim — em silêncio, porque só havia console.warn. É o caso que justifica
   * esta constante existir.
   */
  ALINHAMENTO_ASR_AUSENTE: 'alinhamento-asr-ausente',
  /**
   * envio: falhou gravar a linha de `notification_deliveries` (mig 198). O envio
   * em si NÃO é afetado — o que se perde é a medição. Está aqui porque tabela
   * vazia é ambígua entre "ninguém enviou" e "o logger quebrou", e essa dúvida
   * invalidaria a comparação WhatsApp × push que a instrumentação existe para
   * permitir. Dedup por canal, então canal quebrado = 1 linha/dia, não 1/mensagem.
   */
  TELEMETRIA_ENTREGA_FALHOU: 'telemetria-entrega-falhou',
  /**
   * envio: o teto de volume por disparo (lib/whatsapp/cadencia) cortou a cauda
   * do lote — as mensagens NÃO foram enfileiradas. No cron diário elas não se
   * perdem (sem carimbo de canal, o dia seguinte tenta de novo), mas o corte
   * precisa ser CONTÁVEL: uma pessoa que não recebeu hoje é indistinguível de
   * uma que não tinha telefone, e foi essa ambiguidade que fez o lote de
   * 11/08/2026 ser reportado como "155 enviados" quando 50 saíram.
   */
  WHATSAPP_TETO_LOTE: 'whatsapp-teto-lote',
  /**
   * envio: o provedor estava conectado mas com mensagens presas na fila
   * interna, então o WhatsApp do dia foi PULADO (e-mail e push seguem). A fila
   * é descarregada em rajada quando a conexão estabiliza; empilhar o lote em
   * cima dela foi o caminho do bloqueio de 11/08/2026.
   */
  WHATSAPP_FILA_SUJA: 'whatsapp-fila-suja',
  /**
   * envio: o teto diário de SMS (lib/sms) barrou o envio. Severidade `critico`
   * porque, ao contrário do teto de WhatsApp, aqui não há "amanhã tenta de
   * novo": SMS só é acionado quando o WhatsApp JÁ falhou, e o caso de uso é
   * login. Teto atingido significa gente sem conseguir entrar, e não uma
   * mensagem de cadência adiada.
   */
  SMS_TETO_DIARIO: 'sms-teto-diario',
} as const;
export type DegradacaoTipo = (typeof DEGRADACAO)[keyof typeof DEGRADACAO];

export type DegradacaoFluxo = 'trilha' | 'build' | 'overlay' | 'contexto-empresa' | 'video' | 'envio';
export type DegradacaoSeveridade = 'info' | 'aviso' | 'critico';

export interface DegradacaoInput {
  fluxo: DegradacaoFluxo;
  tipo: DegradacaoTipo;
  /** Chave de dedup: uma linha por (fluxo, tipo, chave). Ex.: colaboradorId, `${empresaId}:${semana}`. */
  chave: string;
  empresaId?: string | null;
  colaboradorId?: string | null;
  severidade?: DegradacaoSeveridade;
  detalhe?: Record<string, unknown> | null;
}

const TABELA = 'degradacao_log';

/**
 * Registra (ou incrementa) uma degradação. NUNCA lança.
 *
 * `sb` é opcional: o default é o client admin (service_role — a tabela tem RLS
 * ON sem policy). O upsert é select-then-upsert porque o supabase-js não faz
 * `ocorrencias + 1` atômico no ON CONFLICT; corrida entre duas escritas no
 * mesmo instante pode perder 1 incremento — aceitável para telemetria (a linha
 * e a última ocorrência nunca se perdem, que é o que importa).
 */
export async function registrarDegradacao(input: DegradacaoInput, sb?: any): Promise<void> {
  try {
    const client = sb ?? createSupabaseAdmin();
    const chave = input.chave ?? '';
    const { data: existente } = await client.from(TABELA)
      .select('ocorrencias, ultima_em')
      .eq('fluxo', input.fluxo)
      .eq('tipo', input.tipo)
      .eq('chave', chave)
      .maybeSingle();
    // `ocorrencias` conta o DIA (UTC): a R10 lê "volume nas últimas 24h", então
    // acumular desde a 1ª ocorrência da chave inflava o volume para sempre.
    const hoje = new Date().toISOString().slice(0, 10);
    const mesmoDia = String(existente?.ultima_em || '').slice(0, 10) === hoje;
    const { error } = await client.from(TABELA).upsert({
      fluxo: input.fluxo,
      tipo: input.tipo,
      chave,
      empresa_id: input.empresaId ?? null,
      colaborador_id: input.colaboradorId ?? null,
      severidade: input.severidade ?? 'aviso',
      detalhe: input.detalhe ?? null,
      ocorrencias: (mesmoDia ? Number(existente?.ocorrencias) || 0 : 0) + 1,
      ultima_em: new Date().toISOString(),
    }, { onConflict: 'fluxo,tipo,chave' });
    if (error) console.error('[degradacao] upsert falhou (fallback preservado):', error.message);
  } catch (err: any) {
    console.error('[degradacao] registro falhou (fallback preservado):', err?.message || err);
  }
}
