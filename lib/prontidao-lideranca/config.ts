/**
 * Configuração do programa de Prontidão para Liderança: leitura tipada e
 * validação FAIL-CLOSED da chave `empresas.sys_config.prontidao_lideranca`.
 *
 * Por que a validação mora aqui, pura, e não na action: a chave é JSONB livre e
 * os dois consumidores (o trilho de resposta em `assessment-actions` e a leitura
 * em `agregar.ts`) precisam recusar a MESMA configuração inválida. Uma régua só,
 * testável sem banco.
 *
 * ⚠️ A colisão que a validação existe para impedir é silenciosa em produção:
 * `descriptor_assessments` tem UNIQUE `(colaborador_id, competencia, descritor)`
 * por NOME de competência (não por id). Se o cargo-alvo tiver uma competência
 * com o mesmo nome de uma do Top 5 do cargo da pessoa, a avaliação do trilho de
 * liderança SOBRESCREVE a do cargo (ou vice-versa) sem erro nenhum: a IA4 grava
 * por upsert. Recusar na configuração é o único ponto onde isso é visível.
 */
import { normalizeAssessmentCompetency } from '@/lib/assessment/completion';

export const CHAVE_CONFIG = 'prontidao_lideranca' as const;

/**
 * Igualdade de nome de competência/cargo NESTE módulo = a régua do próprio
 * assessment (sem acento, sem caixa): é ela que decide "esta competência já foi
 * respondida?", e o Top 5 vem digitado enquanto `competencias.nome` vem da
 * planilha. "Gestao" e "Gestão" são a mesma competência para quem responde.
 */
export const chaveCompetencia = (v: unknown): string => normalizeAssessmentCompetency(v);

export type EscopoProntidao =
  | { tipo: 'empresa_inteira' }
  | { tipo: 'turma'; turmaId: string };

export interface ConfigProntidaoLideranca {
  /** Nome do cargo (cargos_empresa.nome) cujo gabarito e Top 5 definem o programa. */
  cargo_alvo: string;
  /** Quem participa. Default: a empresa inteira (menos rh e e-mails internos). */
  escopo: EscopoProntidao;
  /** Um cenário por dia SÓ no trilho de liderança. Default: ligado. */
  um_por_dia: boolean;
  /**
   * Corte da posição, na escala 1 a 4. Default: 3,00, que é o N3 da régua, o
   * nível de meta do modelo. A classificação é binária no corte: média igual ou
   * acima demonstra, abaixo não demonstra.
   */
  corte_nota: number;
}

export const DEFAULTS_PRONTIDAO = {
  um_por_dia: true,
  corte_nota: 3.0,
  escopo: { tipo: 'empresa_inteira' } as EscopoProntidao,
} as const;

const num = (v: unknown, fallback: number): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

function lerEscopo(v: unknown): EscopoProntidao {
  const o = (v && typeof v === 'object') ? (v as Record<string, unknown>) : null;
  if (o?.tipo === 'turma') return { tipo: 'turma', turmaId: String(o.turmaId ?? '').trim() };
  return { tipo: 'empresa_inteira' };
}

/**
 * Lê a chave do `sys_config` da empresa. Devolve `null` quando o programa não
 * está configurado (chave ausente ou sem cargo-alvo). "Não configurado" é um
 * estado, não um erro; quem chama decide o que dizer.
 *
 * Chaves de versões anteriores (`exemplares`, `banda`) são simplesmente
 * ignoradas: o JSONB gravado pode tê-las, o tipo não as tem mais.
 */
export function lerConfigProntidao(sysConfig: unknown): ConfigProntidaoLideranca | null {
  const raw = (sysConfig && typeof sysConfig === 'object')
    ? (sysConfig as Record<string, unknown>)[CHAVE_CONFIG]
    : null;
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const cargoAlvo = String(r.cargo_alvo ?? '').trim();
  if (!cargoAlvo) return null;
  // Clamp na LEITURA também: a validação só roda ao salvar pela tela, e a chave é
  // JSONB livre. Um corte 7 gravado à mão faria todo mundo "não demonstrar".
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  return {
    cargo_alvo: cargoAlvo,
    escopo: lerEscopo(r.escopo),
    um_por_dia: r.um_por_dia === undefined ? DEFAULTS_PRONTIDAO.um_por_dia : r.um_por_dia === true,
    corte_nota: clamp(num(r.corte_nota, DEFAULTS_PRONTIDAO.corte_nota), 1, 4),
  };
}

export interface CargoParaValidacao {
  nome: string;
  temGabarito: boolean;
  /** `top5_workshop` do cargo: as competências que geram cenário. */
  top5: string[];
}

export interface ContextoValidacao {
  /** Cargos do tenant (`cargos_empresa`). */
  cargos: CargoParaValidacao[];
  /** Nomes de cargo das pessoas na população (para a checagem de colisão). */
  cargosDaPopulacao: string[];
}

export interface ValidacaoConfig {
  ok: boolean;
  erros: string[];
  avisos: string[];
}

/** O escopo comercial fixa 5 competências × 6 descritores; fora disso é aviso, não erro. */
export const COMPETENCIAS_ESPERADAS = 5;

/**
 * Valida a configuração contra o estado do tenant. Puro: recebe o que leu quem
 * chamou. `ok: false` tem pelo menos um erro; avisos nunca bloqueiam.
 */
export function validarConfigProntidao(
  cfg: ConfigProntidaoLideranca,
  ctx: ContextoValidacao,
): ValidacaoConfig {
  const erros: string[] = [];
  const avisos: string[] = [];

  const chaveCargo = chaveCompetencia(cfg.cargo_alvo);
  const alvo = ctx.cargos.find((c) => chaveCompetencia(c.nome) === chaveCargo) || null;
  if (!alvo) {
    erros.push(`Cargo-alvo "${cfg.cargo_alvo}" não existe em cargos_empresa.`);
  } else {
    if (!alvo.temGabarito) erros.push(`Cargo-alvo "${alvo.nome}" não tem gabarito (perfil ideal, tela 4). Gere o gabarito antes.`);
    if (!alvo.top5.length) erros.push(`Cargo-alvo "${alvo.nome}" não tem Top 5 (top5_workshop). São as competências que o programa mede.`);
    else if (alvo.top5.length !== COMPETENCIAS_ESPERADAS) {
      avisos.push(`Cargo-alvo tem ${alvo.top5.length} competências no Top 5; o escopo do mapeamento prevê ${COMPETENCIAS_ESPERADAS}.`);
    }

    // Colisão por NOME (ver cabeçalho): competência do cargo-alvo com o mesmo
    // nome de uma competência do Top 5 de um cargo da população.
    const nomesAlvo = new Set(alvo.top5.map(chaveCompetencia).filter(Boolean));
    const cargosPop = new Set(ctx.cargosDaPopulacao.map(chaveCompetencia).filter(Boolean));
    for (const cargo of ctx.cargos) {
      const chave = chaveCompetencia(cargo.nome);
      if (chave === chaveCargo || !cargosPop.has(chave)) continue;
      const colisoes = cargo.top5.filter((n) => nomesAlvo.has(chaveCompetencia(n)));
      if (colisoes.length) {
        erros.push(
          `A competência "${colisoes[0]}" está no Top 5 do cargo "${cargo.nome}" e também no cargo-alvo. `
          + 'A avaliação por descritor é gravada por NOME de competência e uma sobrescreveria a outra. Renomeie uma delas.',
        );
      }
    }
  }

  if (cfg.escopo.tipo === 'turma' && !cfg.escopo.turmaId) {
    erros.push('Escopo por turma exige turmaId.');
  }

  if (!(cfg.corte_nota >= 1 && cfg.corte_nota <= 4)) erros.push('corte_nota precisa estar entre 1,00 e 4,00.');

  return { ok: erros.length === 0, erros, avisos };
}

/** Competências do programa = Top 5 do cargo-alvo, na ordem do cargo. */
export function competenciasDoPrograma(cfg: ConfigProntidaoLideranca, cargos: CargoParaValidacao[]): string[] {
  const chave = chaveCompetencia(cfg.cargo_alvo);
  const alvo = cargos.find((c) => chaveCompetencia(c.nome) === chave);
  return alvo ? [...alvo.top5] : [];
}

/** A pessoa ocupa o cargo-alvo? Para ela o trilho é o do cargo, não o de liderança. */
export function ocupaCargoAlvo(cargoDaPessoa: string | null | undefined, cfg: ConfigProntidaoLideranca): boolean {
  return chaveCompetencia(cargoDaPessoa) === chaveCompetencia(cfg.cargo_alvo);
}
