/**
 * TRILHO DE LIDERANÇA: o segundo mapeamento da pessoa, separado do mapeamento
 * do cargo (decisão do dono, 13/09/2026: a pessoa faz os dois).
 *
 * Este núcleo decide se ESTA pessoa responde o trilho de liderança e com quais
 * competências. Vive em `lib/` (sem gate de sessão) para ser testável com o mock
 * do Supabase e reusado pela tela de assessment e pela leitura do RH, a mesma
 * régua nos dois lados, senão a tela convida para um trilho que a leitura não
 * reconhece. Por isso a exclusão de `role='rh'` e de e-mails internos está AQUI
 * também: `carregarPopulacao` (agregar.ts) os deixa fora da matriz, e um RH
 * respondendo cinco cenários que nunca aparecem seria trabalho jogado fora.
 *
 * As competências do trilho são a MATRIZ GLOBAL de liderança, igual em todo
 * tenant (`lib/simuladores/lideranca/matriz-global.ts`), e não mais o
 * `top5_workshop` do cargo-alvo. O que o cargo-alvo decide é a VARIANTE: quem
 * OCUPA o cargo responde a de gestor em exercício, quem não ocupa responde a de
 * potencial sucessor. A régua é a mesma nas duas; muda o enquadramento de 7 das
 * 30 perguntas.
 *
 * 🔑 Até 14/09/2026 quem ocupava o cargo-alvo era RECUSADO aqui, e a razão era
 * boa enquanto as competências vinham do Top 5 do cargo: para essa pessoa, o
 * trilho do cargo já media exatamente aquilo. Com matriz própria isso deixou de
 * ser verdade, e a recusa passou a excluir justamente metade do público que o
 * instrumento existe para medir.
 *
 * O cargo-alvo casa por nome NORMALIZADO (`chaveCompetencia`), como a validação
 * e a agregação: "gerente comercial" gravado à mão tem que achar "Gerente
 * Comercial".
 */
import { MODULOS, canUseModulo } from '@/lib/access-gates/modulos';
import { carregarParticipacaoAtiva } from '@/lib/turmas/contexto';
import { isInternalEmail } from '@/lib/internal-emails';
import { assessmentCompetencyWasAnswered, type AssessmentAnswerRef } from '@/lib/assessment/completion';
import { chaveCompetencia, competenciasDoPrograma, lerConfigProntidao, ocupaCargoAlvo, type ConfigProntidaoLideranca } from './config';
import { VARIANTES, varianteDe, type VarianteLideranca } from '@/lib/simuladores/lideranca/matriz-global';

export type Trilho = 'cargo' | 'lideranca';

export function trilhoDe(v: unknown): Trilho {
  return v === 'lideranca' ? 'lideranca' : 'cargo';
}

export type CodigoRecusaTrilho =
  | 'MODULO_NAO_CONTRATADO'
  | 'PROGRAMA_NAO_CONFIGURADO'
  | 'FORA_DA_POPULACAO'
  | 'CARGO_ALVO_NAO_EXISTE';

export type ResolucaoTrilhoLideranca =
  | {
      ok: true;
      cfg: ConfigProntidaoLideranca;
      /** O cargo de referência do programa (de onde sai o gabarito do eixo de estilo). */
      cargoAlvo: string;
      /** Variante da matriz que esta pessoa responde. */
      variante: VarianteLideranca;
      /**
       * O `cargo` com que os cenários e as competências desta variante estão
       * gravados. É ELE que vai para `resolverTop5ComCenario`, não o cargo-alvo.
       */
      cargoDaMatriz: string;
      competencias: string[];
    }
  | { ok: false; code: CodigoRecusaTrilho; message: string };

const RECUSA: Record<CodigoRecusaTrilho, string> = {
  MODULO_NAO_CONTRATADO: 'O mapeamento de liderança não está contratado para esta empresa.',
  PROGRAMA_NAO_CONFIGURADO: 'O mapeamento de liderança ainda não foi configurado.',
  FORA_DA_POPULACAO: 'O mapeamento de liderança não está aberto para você nesta rodada.',
  CARGO_ALVO_NAO_EXISTE: 'O cargo de referência do mapeamento de liderança não existe mais nesta empresa.',
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
  // A mesma exclusão da população que a leitura aplica (agregar.ts).
  if (colab.role === 'rh' || isInternalEmail(colab.email)) return recusa('FORA_DA_POPULACAO');

  if (cfg.escopo.tipo === 'turma') {
    const { turma } = await carregarParticipacaoAtiva(sb, colab.empresa_id, colab.id);
    if (!turma || turma.id !== cfg.escopo.turmaId) return recusa('FORA_DA_POPULACAO');
  }

  // O cargo-alvo ainda é lido, mas para conferir que EXISTE e pegar o nome
  // canônico: as competências vêm da matriz, não mais do Top 5 dele.
  const { data: cargos, error } = await sb.from('cargos_empresa')
    .select('nome')
    .eq('empresa_id', colab.empresa_id);
  if (error) throw new Error(`não foi possível ler o cargo-alvo: ${error.message}`);
  const alvoChave = chaveCompetencia(cfg.cargo_alvo);
  const cargo = (cargos || []).find((c: any) => chaveCompetencia(c?.nome) === alvoChave) || null;
  if (!cargo) return recusa('CARGO_ALVO_NAO_EXISTE');

  const variante = varianteDe(ocupaCargoAlvo(colab.cargo, cfg));
  return {
    ok: true,
    cfg,
    cargoAlvo: cargo.nome || cfg.cargo_alvo,
    variante,
    cargoDaMatriz: VARIANTES[variante],
    competencias: competenciasDoPrograma(cfg),
  };
}

/** 'YYYY-MM-DD' no fuso do produto: o "dia" do um-por-dia é o de Brasília, não o UTC. */
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
 * pertencem ao trilho contam: o trilho do cargo nunca bloqueia o de liderança
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
