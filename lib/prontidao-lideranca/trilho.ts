/**
 * TRILHO DE LIDERANÇA — o segundo mapeamento da pessoa, separado do mapeamento
 * do cargo (decisão do dono, 13/09/2026: a pessoa faz os dois).
 *
 * Este núcleo decide se ESTA pessoa responde o trilho de liderança e com quais
 * competências. Vive em `lib/` (sem gate de sessão) para ser testável com o mock
 * do Supabase e reusado pela tela de assessment e pela leitura do RH — a mesma
 * régua nos dois lados, senão a tela convida para um trilho que a leitura não
 * reconhece.
 *
 * As competências do trilho são o `top5_workshop` do CARGO-ALVO — a mesma fonte
 * que a IA3 usa para gerar cenários. A pessoa que ocupa o cargo-alvo responde
 * essas competências pelo trilho normal (cargo); para ela o trilho de liderança
 * seria a mesma prova duas vezes.
 */
import { MODULOS, canUseModulo } from '@/lib/access-gates/modulos';
import { carregarParticipacaoAtiva } from '@/lib/turmas/contexto';
import { assessmentCompetencyWasAnswered, type AssessmentAnswerRef } from '@/lib/assessment/completion';
import { lerConfigProntidao, ocupaCargoAlvo, type ConfigProntidaoLideranca } from './config';

export type Trilho = 'cargo' | 'lideranca';

export function trilhoDe(v: unknown): Trilho {
  return v === 'lideranca' ? 'lideranca' : 'cargo';
}

export type CodigoRecusaTrilho =
  | 'MODULO_NAO_CONTRATADO'
  | 'PROGRAMA_NAO_CONFIGURADO'
  | 'OCUPA_CARGO_ALVO'
  | 'FORA_DA_POPULACAO'
  | 'CARGO_ALVO_SEM_TOP5';

export type ResolucaoTrilhoLideranca =
  | { ok: true; cfg: ConfigProntidaoLideranca; cargoAlvo: string; competencias: string[] }
  | { ok: false; code: CodigoRecusaTrilho; message: string };

const RECUSA: Record<CodigoRecusaTrilho, string> = {
  MODULO_NAO_CONTRATADO: 'O mapeamento de liderança não está contratado para esta empresa.',
  PROGRAMA_NAO_CONFIGURADO: 'O mapeamento de liderança ainda não foi configurado.',
  OCUPA_CARGO_ALVO: 'Você já responde estas competências pelo mapeamento do seu cargo.',
  FORA_DA_POPULACAO: 'O mapeamento de liderança não está aberto para você nesta rodada.',
  CARGO_ALVO_SEM_TOP5: 'O cargo-alvo do mapeamento de liderança ainda não tem competências definidas.',
};

/**
 * Decide se a pessoa responde o trilho de liderança. Ordem das recusas: da
 * mais barata (sem I/O) para a mais cara. Lança só em erro de leitura.
 */
export async function resolverTrilhoLideranca(
  sb: any,
  colab: { id: string; empresa_id: string; cargo?: string | null },
  sysConfigEmpresa: unknown,
): Promise<ResolucaoTrilhoLideranca> {
  const recusa = (code: CodigoRecusaTrilho): ResolucaoTrilhoLideranca => ({ ok: false, code, message: RECUSA[code] });

  if (!canUseModulo(sysConfigEmpresa as any, MODULOS.PRONTIDAO_LIDERANCA).allowed) return recusa('MODULO_NAO_CONTRATADO');
  const cfg = lerConfigProntidao(sysConfigEmpresa);
  if (!cfg) return recusa('PROGRAMA_NAO_CONFIGURADO');
  if (ocupaCargoAlvo(colab.cargo, cfg)) return recusa('OCUPA_CARGO_ALVO');

  if (cfg.escopo.tipo === 'turma') {
    const { turma } = await carregarParticipacaoAtiva(sb, colab.empresa_id, colab.id);
    if (!turma || turma.id !== cfg.escopo.turmaId) return recusa('FORA_DA_POPULACAO');
  }

  const { data: cargo, error } = await sb.from('cargos_empresa')
    .select('nome, top5_workshop')
    .eq('empresa_id', colab.empresa_id)
    .eq('nome', cfg.cargo_alvo)
    .maybeSingle();
  if (error) throw new Error(`não foi possível ler o cargo-alvo: ${error.message}`);
  const top5: string[] = Array.isArray(cargo?.top5_workshop)
    ? cargo.top5_workshop.map((s: unknown) => String(s ?? '').trim()).filter(Boolean)
    : [];
  if (!top5.length) return recusa('CARGO_ALVO_SEM_TOP5');

  return { ok: true, cfg, cargoAlvo: cargo.nome || cfg.cargo_alvo, competencias: top5 };
}

/** 'YYYY-MM-DD' no fuso do produto — o "dia" do um-por-dia é o de Brasília, não o UTC. */
export function diaEmSaoPaulo(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d);
}

export interface RespostaComData extends AssessmentAnswerRef {
  timestamp_resposta?: string | null;
}

/**
 * A pessoa já respondeu HOJE alguma competência do trilho? Só respostas que
 * pertencem ao trilho contam — o trilho do cargo nunca bloqueia o de liderança
 * nem o contrário.
 */
export function respondeuHojeNoTrilho(
  respostas: RespostaComData[],
  competenciasDoTrilho: { id?: string | null; nome?: string | null }[],
  agora: Date = new Date(),
): boolean {
  const hoje = diaEmSaoPaulo(agora);
  return respostas.some((r) => {
    if (!r.timestamp_resposta) return false;
    const d = new Date(r.timestamp_resposta);
    if (Number.isNaN(d.getTime()) || diaEmSaoPaulo(d) !== hoje) return false;
    return competenciasDoTrilho.some((c) => assessmentCompetencyWasAnswered(c, [r]));
  });
}
