import { parseProgramaCustom, CUSTOM_LIMITES } from '@/lib/season-engine/programa-custom';
import type { ProgramaModoLabel } from '@/lib/season-engine/programa-config';

/**
 * Chaves de `empresas.sys_config` que NÃO podem ser gravadas pelo formulário de
 * configurações da empresa — só por action própria, com gate de plataforma.
 *
 * POR QUE A LISTA EXISTE (medido 13/09/2026): `salvarConfig` tem gate
 * `settings.company.manage`, que o papel `rh` possuía, e num `'use server'` todo
 * export é endpoint HTTP — o payload é montado pelo CLIENTE. A tela carrega o
 * `sys_config` inteiro no state e devolve tudo, então qualquer chave que decida
 * CONTRATO (o que a empresa comprou) ou PROGRAMA (como o instrumento mede e
 * quem ele mede) era escrivível pelo RH mesmo com a action dela endurecida.
 *
 * `modulos` era assim desde o Pulso; `prontidao_lideranca` nasceu com o mesmo
 * furo. Proteger uma chave por vez fecha a instância e deixa a classe aberta —
 * daí a lista, e daí o guard que a cobra.
 *
 * 🔑 REGRA: chave nova que decide contrato ou programa entra AQUI no mesmo
 * commit que a cria. Configuração de OPERAÇÃO do tenant (branding, cadência,
 * modelos de IA, etapas liberadas) continua fora — é disso que a tela trata.
 *
 * Guard: `tests/unit/security/sys-config-chaves-plataforma.test.ts`.
 */
export const CHAVES_SO_PLATAFORMA = [
  /** O que a empresa CONTRATOU (`lib/access-gates/modulos.ts`). */
  'modulos',
  /** Cargo-alvo, exemplares, população e corte do mapeamento de liderança. */
  'prontidao_lideranca',
  /** Liberação dos simuladores por cargo, editada na aba própria de Cargos. */
  'simuladores_por_cargo',
  /** O programa da empresa: o formato de toda trilha que nascer (R-73). */
  'programa_modo',
  /** Os parâmetros do programa Personalizado (`parseProgramaCustom`). */
  'programa_custom',
  /** As competências fixas do modo Onboarding (`lib/season-engine/trilha-core.ts`). */
  'competencias_onboarding',
] as const;

export type ChaveSoPlataforma = (typeof CHAVES_SO_PLATAFORMA)[number];

/**
 * Das chaves só-plataforma, as que o PRÓPRIO formulário de configurações edita
 * (aba Programa). Elas passam pelo formulário apenas para quem tem
 * `program.configure` (a chave exclusiva do master) e com valor validado; para
 * qualquer outro papel valem como as demais: o que está gravado fica.
 *
 * R-73 (revisão de 02/10/2026): até aqui as três entravam pelo objeto inteiro
 * sem validação nenhuma, e um modo desconhecido caía calado no DUO
 * (`getProgramaConfigByModo`), mudando de 7 para 14 semanas a próxima trilha
 * de cada pessoa da empresa.
 */
export const CHAVES_DE_PROGRAMA = ['programa_modo', 'programa_custom', 'competencias_onboarding'] as const satisfies readonly ChaveSoPlataforma[];

/** Os rótulos que o motor reconhece (`ProgramaModoLabel`); qualquer outro vira DUO em silêncio. */
export const MODOS_DE_PROGRAMA = ['jornada', 'regular_duo', 'regular_single', 'onboarding', 'piloto', 'custom'] as const satisfies readonly ProgramaModoLabel[];

/** Teto de competências fixas do Onboarding: o motor usa as N primeiras, e N é pequeno. */
const MAX_COMPETENCIAS_ONBOARDING = 10;

/**
 * O valor desta chave de programa é aceitável? Devolve o motivo da recusa, ou
 * `null`. Ausente (`undefined`/`null`) é aceitável: a empresa herda o padrão do
 * motor, que é o mesmo que nunca ter gravado a chave.
 */
export function problemaNaChaveDePrograma(chave: (typeof CHAVES_DE_PROGRAMA)[number], valor: unknown): string | null {
  if (valor === undefined || valor === null) return null;
  if (chave === 'programa_modo') {
    return (MODOS_DE_PROGRAMA as readonly unknown[]).includes(valor)
      ? null
      : `Programa inválido: "${String(valor)}". Use um destes: ${MODOS_DE_PROGRAMA.join(', ')}.`;
  }
  if (chave === 'programa_custom') {
    return parseProgramaCustom(valor)
      ? null
      : `Programa personalizado inválido: semanas de ${CUSTOM_LIMITES.semanasMin} a ${CUSTOM_LIMITES.semanasMax} e competências de ${CUSTOM_LIMITES.compsMin} a ${CUSTOM_LIMITES.compsMax}.`;
  }
  // competencias_onboarding: lista de nomes, como `trilha-core.ts` a lê.
  const ok = Array.isArray(valor)
    && valor.length <= MAX_COMPETENCIAS_ONBOARDING
    && valor.every((v) => typeof v === 'string' && v.trim().length > 0 && v.length <= 200);
  return ok ? null : `Competências do Onboarding inválidas: uma lista de até ${MAX_COMPETENCIAS_ONBOARDING} nomes.`;
}
