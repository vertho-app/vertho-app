/**
 * FONTE ÚNICA da configuração efetiva de um participante.
 *
 * Precedência: **participação → turma → colaborador (legado) → empresa → default**.
 *
 * Estende — não substitui — a precedência de dois níveis que já existia em
 * `resolverModoColab` (lib/season-engine/programa-config.ts). A turma entra no
 * meio; o carimbo da trilha continua sendo quem manda no RUNTIME (ver
 * "Duas coisas diferentes" abaixo).
 *
 * ── Duas coisas diferentes, de propósito ────────────────────────────────────
 *  1. **sys_config efetivo** (aqui): flags de etapa, cadência, competências,
 *     módulos contratados. Muda quando o operador mexe no painel.
 *  2. **ProgramaConfig** (`getProgramaConfigDaTrilha`): a ESTRUTURA do programa
 *     — semanas, missões, avaliação. Vem do CARIMBO da trilha e é congelada na
 *     geração: mudar a config da empresa não regenera trilha em andamento.
 *
 * Editar `config_override` depois da trilha gerada NÃO a regenera. A trilha
 * serve o que foi carimbado, e a UI precisa dizer isso — senão o campo de tela e
 * a régua do servidor divergem em silêncio.
 *
 * ── Regra de desempate (qual turma?) ────────────────────────────────────────
 * A config efetiva é a da turma da **trilha em andamento**; antes de existir
 * trilha, a da turma do **contexto da tela ou da ação**. Nunca inferida do
 * colaborador sozinho. O caso ambíguo está fechado no banco: o índice parcial
 * `turma_membros_ativo_unico_ux` (mig 210) garante UMA participação ativa por
 * pessoa.
 */

import { SPEC_CONFIG, type EstrategiaChave } from './chaves';

export type ConfigBruta = Record<string, any> | null | undefined;

export interface FontesConfig {
  /** `empresas.sys_config`. */
  empresa?: ConfigBruta;
  /** `turmas.sys_config`. */
  turma?: ConfigBruta;
  /** `turma_membros.config_override` — exceção da PARTICIPAÇÃO, não da pessoa. */
  participacao?: ConfigBruta;
  /**
   * `colaboradores.programa_modo` — LEGADO. Global à pessoa, então vaza para a
   * safra seguinte: quem recebeu override 'piloto' numa turma seguiria em
   * 'piloto' meses depois, em outra, sem ninguém perceber. Aceito como fonte de
   * menor prioridade que a participação, para não quebrar quem já depende dele.
   */
  colaboradorLegado?: { programa_modo?: string | null } | null;
}

export interface ConfigEfetiva {
  [chave: string]: any;
}

/** De onde cada chave veio — para a UI explicar "isto vem da turma, não da empresa". */
export type ProcedenciaConfig = Record<string, 'participacao' | 'turma' | 'empresa' | 'colaborador_legado'>;

export interface ResultadoConfig {
  config: ConfigEfetiva;
  procedencia: ProcedenciaConfig;
  /**
   * Chaves que um nível tentou definir sem ter direito (ex.: turma mexendo em
   * `ai`). Ignoradas no resultado. Não é erro fatal: é diagnóstico — config
   * silenciosamente descartada é como uma tela "não faz nada" sem explicação.
   */
  ignoradas: Array<{ chave: string; nivel: 'turma' | 'participacao'; motivo: string }>;
}

function definido(v: unknown): boolean {
  return v !== undefined;
}

/** Merge raso: chave a chave, o nível mais específico vence. `??`, nunca `||`. */
function mesclarRaso(base: any, sobre: any): any {
  if (!sobre || typeof sobre !== 'object' || Array.isArray(sobre)) return sobre ?? base;
  if (!base || typeof base !== 'object' || Array.isArray(base)) return { ...sobre };
  const out: Record<string, any> = { ...base };
  for (const [k, v] of Object.entries(sobre)) if (definido(v)) out[k] = v;
  return out;
}

function combinar(estrategia: EstrategiaChave, base: any, sobre: any): any {
  if (!definido(sobre)) return base;
  if (estrategia === 'raso') return mesclarRaso(base, sobre);
  // 'escalar' e 'substitui' têm o mesmo efeito no resultado — o que muda é a
  // INTENÇÃO declarada, que o guard e a revisão humana leem. Array que
  // "substitui" existe para deixar explícito que NÃO se concatena.
  return sobre;
}

/**
 * Resolve o sys_config efetivo.
 *
 * @example
 *   const { config } = resolverConfigEfetiva({ empresa: emp.sys_config, turma: t.sys_config });
 *   canAccessMapeamentoCenarios(config);   // gate lê a config EFETIVA, não a da empresa
 */
export function resolverConfigEfetiva(fontes: FontesConfig): ResultadoConfig {
  const empresa = fontes.empresa || {};
  const turma = fontes.turma || {};
  const participacao = fontes.participacao || {};

  const config: ConfigEfetiva = {};
  const procedencia: ProcedenciaConfig = {};
  const ignoradas: ResultadoConfig['ignoradas'] = [];

  // 1) Base: tudo o que a empresa define. Chave sem spec ainda passa — o
  //    sys_config é JSONB livre e há chaves institucionais legadas
  //    (`origem`, `migrado_em`, `pulse_stage`…) que não interessam ao resolvedor
  //    mas não podem sumir de quem lê a config da empresa.
  for (const [chave, valor] of Object.entries(empresa)) {
    if (!definido(valor)) continue;
    config[chave] = valor;
    procedencia[chave] = 'empresa';
  }

  // 2) Legado do colaborador ANTES da turma — e isso não é detalhe.
  //    A precedência de hoje é `colab.programa_modo || empresa.sys_config.…`
  //    (resolverModoColab): o override individual VENCE a empresa. Medido em
  //    13/08: `acme` tem `programa_modo: 'regular'` na empresa e 1 colaborador
  //    marcado 'piloto'. Aplicar o legado por último faria essa pessoa cair em
  //    regular_duo — regressão silenciosa num tenant vivo. A turma continua
  //    vencendo o legado (é o mecanismo que veio substituí-lo), mas a empresa não.
  const legado = fontes.colaboradorLegado?.programa_modo;
  if (definido(legado) && legado !== null) {
    config.programa_modo = legado;
    procedencia.programa_modo = 'colaborador_legado';
  }

  // 3) Turma e participação, nessa ordem, só onde têm direito.
  for (const [nivel, fonte] of [['turma', turma], ['participacao', participacao]] as const) {
    for (const [chave, valor] of Object.entries(fonte)) {
      if (!definido(valor)) continue;
      const spec = SPEC_CONFIG[chave];
      if (!spec) {
        ignoradas.push({ chave, nivel, motivo: 'chave sem spec — declare em lib/turmas/chaves.ts' });
        continue;
      }
      if (spec.escopo === 'empresa') {
        ignoradas.push({ chave, nivel, motivo: 'chave institucional: só a empresa define' });
        continue;
      }
      config[chave] = combinar(spec.estrategia, config[chave], valor);
      procedencia[chave] = nivel;
    }
  }

  return { config, procedencia, ignoradas };
}

/**
 * Atalho para quem só quer a config (a maioria dos call-sites).
 */
export function configEfetiva(fontes: FontesConfig): ConfigEfetiva {
  return resolverConfigEfetiva(fontes).config;
}

/**
 * Rótulo de modo do programa para uma NOVA geração, já considerando a turma.
 *
 * ⚠️ Isto é a precedência de GERAÇÃO. O RUNTIME de uma trilha existente segue
 * lendo o carimbo (`getProgramaConfigDaTrilha`) — trilha em andamento não muda
 * de regra porque a turma mudou.
 */
export function resolverModoDaTurma(fontes: FontesConfig): string {
  const { config } = resolverConfigEfetiva(fontes);
  const bruto = config.programa_modo;
  if (bruto === 'jornada') return 'jornada';
  if (bruto === 'onboarding' || bruto === 'regular_single' || bruto === 'piloto' || bruto === 'custom') return bruto;
  if (bruto === 'regular_duo' || bruto === 'regular') return 'regular_duo';
  return 'regular_duo';
}
