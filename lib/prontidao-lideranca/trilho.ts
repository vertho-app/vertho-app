/**
 * TRILHO DE LIDERANÇA — o segundo mapeamento da pessoa, separado do mapeamento
 * do cargo (decisão do dono, 13/09/2026: a pessoa faz os dois).
 *
 * Este núcleo decide se ESTA pessoa responde o trilho de liderança e com quais
 * competências. Vive em `lib/` (sem gate de sessão) para ser testável com o mock
 * do Supabase e reusado pela tela de assessment e pela leitura do RH — a mesma
 * régua nos dois lados, senão a tela convida para um trilho que a leitura não
 * reconhece. Por isso a exclusão de `role='rh'` e de e-mails internos está AQUI
 * também: `carregarPopulacao` (agregar.ts) os deixa fora da matriz, e um RH
 * respondendo cinco cenários que nunca aparecem seria trabalho jogado fora.
 *
 * As competências do trilho são o `top5_workshop` do CARGO-ALVO — a mesma fonte
 * que a IA3 usa para gerar cenários. O cargo-alvo casa por nome NORMALIZADO
 * (`chaveCompetencia`), como a validação e a agregação: "gerente comercial"
 * gravado à mão tem que achar "Gerente Comercial". A pessoa que ocupa o
 * cargo-alvo responde essas competências pelo trilho normal (cargo).
 */
import { MODULOS, canUseModulo } from '@/lib/access-gates/modulos';
import { carregarParticipacaoAtiva } from '@/lib/turmas/contexto';
import { isInternalEmail } from '@/lib/internal-emails';
import { assessmentCompetencyWasAnswered, type AssessmentAnswerRef } from '@/lib/assessment/completion';
import { chaveCompetencia, lerConfigProntidao, ocupaCargoAlvo, type ConfigProntidaoLideranca } from './config';

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

export interface ColabParaTrilho {
  id: string;
  empresa_id: string;
  cargo?: string | null;
  role?: string | null;
  email?: string | null;
}

/**
 * Decide se a pessoa responde o trilho de liderança. Ordem das recusas: da
 * mais barata (sem I/O) para a mais cara. Lança só em erro de leitura.
 */
export async function resolverTrilhoLideranca(
  sb: any,
  colab: ColabParaTrilho,
  sysConfigEmpresa: unknown,
): Promise<ResolucaoTrilhoLideranca> {
  const recusa = (code: CodigoRecusaTrilho): ResolucaoTrilhoLideranca => ({ ok: false, code, message: RECUSA[code] });

  if (!canUseModulo(sysConfigEmpresa as any, MODULOS.PRONTIDAO_LIDERANCA).allowed) return recusa('MODULO_NAO_CONTRATADO');
  const cfg = lerConfigProntidao(sysConfigEmpresa);
  if (!cfg) return recusa('PROGRAMA_NAO_CONFIGURADO');
  if (ocupaCargoAlvo(colab.cargo, cfg)) return recusa('OCUPA_CARGO_ALVO');
  // A mesma exclusão da população que a leitura aplica (agregar.ts).
  if (colab.role === 'rh' || isInternalEmail(colab.email)) return recusa('FORA_DA_POPULACAO');

  if (cfg.escopo.tipo === 'turma') {
    const { turma } = await carregarParticipacaoAtiva(sb, colab.empresa_id, colab.id);
    if (!turma || turma.id !== cfg.escopo.turmaId) return recusa('FORA_DA_POPULACAO');
  }

  const { data: cargos, error } = await sb.from('cargos_empresa')
    .select('nome, top5_workshop')
    .eq('empresa_id', colab.empresa_id);
  if (error) throw new Error(`não foi possível ler o cargo-alvo: ${error.message}`);
  const alvoChave = chaveCompetencia(cfg.cargo_alvo);
  const cargo = (cargos || []).find((c: any) => chaveCompetencia(c?.nome) === alvoChave) || null;
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
 *
 * ⚠️ É checagem de leitura, não trava de banco: duas submissões no mesmo
 * segundo passam as duas (TOCTOU). Aceito: o custo é uma pessoa responder dois
 * cenários num dia, e o upsert de `respostas` continua único por competência.
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
