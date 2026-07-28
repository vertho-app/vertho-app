/**
 * Telemetria de degradação (FMEA-PIPELINE §3.3 — decisão de produto de 28/07):
 * fallback pode existir, mas nunca INVISÍVEL. Onde o fluxo cai no caminho
 * degradado (DUO→single, missão placeholder, overlay sem kit…), além do
 * console.warn existente registra-se UMA linha por (fluxo, tipo, chave) em
 * `degradacao_log` (mig 194); repetições só incrementam `ocorrencias`.
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
  /** trilha-core: DUO indisponível → fluxo single (degrau final da cadeia de 4 níveis). */
  DUO_PARA_SINGLE: 'duo-para-single',
  /** trilha-core: descritores sem avaliação ignorados na alocação. */
  DESCRITOR_SEM_AVALIACAO: 'descritor-sem-avaliacao',
  /** trilha-core (onboarding): competência sem assessment → default neutro 1.5. */
  ONBOARDING_DEFAULT_NEUTRO: 'onboarding-default-neutro',
  /** trilha-core (DUO): blueprint→trilha não-aproveitável → selectDescriptorsDuo. */
  BLUEPRINT_ADAPTER_FALLBACK: 'blueprint-adapter-fallback',
  /** build-season: desafio por IA falhou → templated. */
  DESAFIO_PLACEHOLDER: 'desafio-placeholder',
  /** build-season: missão/cenário por IA falhou → placeholder (a semana degrada). */
  MISSAO_PLACEHOLDER: 'missao-placeholder',
  /** build-season: semana sem core de conteúdo (fallback_gerado). */
  CONTEUDO_AUSENTE: 'conteudo-ausente',
  /** build-season (piloto): semana com menos entregas que o esperado. */
  PILOTO_DISTRIBUICAO_INCOMPLETA: 'piloto-distribuicao-incompleta',
  /** contexto-empresa: síntese do PPP falhou → cai no PPP mais recente. */
  SINTESE_PPP_FALHOU: 'sintese-ppp-falhou',
  /** overlay: sem kit para o DISC da pessoa → mantém o conteúdo do build. */
  KIT_AUSENTE_DISC: 'kit-ausente-disc',
} as const;
export type DegradacaoTipo = (typeof DEGRADACAO)[keyof typeof DEGRADACAO];

export type DegradacaoFluxo = 'trilha' | 'build' | 'overlay' | 'contexto-empresa';
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
      .select('ocorrencias')
      .eq('fluxo', input.fluxo)
      .eq('tipo', input.tipo)
      .eq('chave', chave)
      .maybeSingle();
    const { error } = await client.from(TABELA).upsert({
      fluxo: input.fluxo,
      tipo: input.tipo,
      chave,
      empresa_id: input.empresaId ?? null,
      colaborador_id: input.colaboradorId ?? null,
      severidade: input.severidade ?? 'aviso',
      detalhe: input.detalhe ?? null,
      ocorrencias: (Number(existente?.ocorrencias) || 0) + 1,
      ultima_em: new Date().toISOString(),
    }, { onConflict: 'fluxo,tipo,chave' });
    if (error) console.error('[degradacao] upsert falhou (fallback preservado):', error.message);
  } catch (err: any) {
    console.error('[degradacao] registro falhou (fallback preservado):', err?.message || err);
  }
}
