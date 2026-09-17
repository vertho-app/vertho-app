import { MODULOS, canUseModulo } from '@/lib/access-gates/modulos';
import { CHAVE_CONFIG, type ConfigProntidaoLideranca } from '@/lib/prontidao-lideranca/config';

/**
 * Simulador de liderança nos ambientes de demonstração: o que o reset noturno
 * PRESERVA e o que ele reconstrói.
 *
 * 🔑 POR QUE PRESERVAR, E NÃO SÓ CONGELAR. O dono ligou o módulo no ACME demo
 * pelo painel em 17/09/2026 (12:08) e passou a curar os cenários do trilho ali
 * mesmo, reauditando um a um. O reset reconstrói `sys_config` a partir do
 * fixture e apaga `cargos_empresa`, `competencias` e `banco_cenarios`: sem esta
 * peça, às 04:00 o módulo desligava e os dez cenários sumiam. Congelar um retrato
 * no código também não bastava, porque a próxima reauditoria pelo painel seria
 * descartada na noite seguinte.
 *
 * Então: a configuração do módulo e os cenários da matriz que ESTÃO no banco
 * atravessam o reset; o perfil do ambiente e o fixture só entram quando o banco
 * não tem nada (tenant recém-criado ou dado perdido).
 */

export type CenarioLiderancaCongelado = {
  /** O cargo-âncora da variante ("Líder" ou "Futuro Líder"). */
  cargo: string;
  /** Nome da competência na matriz global: é por ele que o cenário volta a apontar. */
  competencia: string;
  cod_comp?: string | null;
  /** As colunas de `banco_cenarios`, sem as de identidade. */
  conteudo: Record<string, unknown>;
};

/** Colunas de identidade: o reset as remonta para as linhas novas. */
const COLUNAS_DE_IDENTIDADE = new Set(['id', 'empresa_id', 'competencia_id', 'cargo', 'created_at', 'updated_at']);

/**
 * Leva a configuração do simulador de liderança do `sys_config` ATUAL para o
 * novo. O que o painel gravou vence o padrão do perfil, inclusive o módulo
 * DESLIGADO: quem desliga pelo painel não pode ver o reset religar.
 */
export function sysConfigComSimuladorLideranca(
  novo: Record<string, any>,
  atual: Record<string, any> | null | undefined,
  padraoDoPerfil: ConfigProntidaoLideranca | null | undefined,
): Record<string, any> {
  const modulosAtuais = (atual?.modulos && typeof atual.modulos === 'object') ? atual.modulos : {};
  const moduloNoBanco = Object.prototype.hasOwnProperty.call(modulosAtuais, MODULOS.PRONTIDAO_LIDERANCA);
  const configNoBanco = atual?.[CHAVE_CONFIG] != null;

  if (moduloNoBanco || configNoBanco) {
    return {
      ...novo,
      ...(moduloNoBanco
        ? { modulos: { ...(novo.modulos || {}), [MODULOS.PRONTIDAO_LIDERANCA]: modulosAtuais[MODULOS.PRONTIDAO_LIDERANCA] === true } }
        : {}),
      ...(configNoBanco ? { [CHAVE_CONFIG]: atual![CHAVE_CONFIG] } : {}),
    };
  }
  if (!padraoDoPerfil) return novo;
  return {
    ...novo,
    modulos: { ...(novo.modulos || {}), [MODULOS.PRONTIDAO_LIDERANCA]: true },
    [CHAVE_CONFIG]: { ...padraoDoPerfil, escopo: { ...padraoDoPerfil.escopo } },
  };
}

export function simuladorLiderancaLigado(sysConfig: unknown): boolean {
  return canUseModulo(sysConfig as any, MODULOS.PRONTIDAO_LIDERANCA).allowed;
}

/**
 * Retrato dos cenários da matriz que estão no banco, por (cargo, competência).
 * Cenário cuja competência não é da matriz fica de fora: não haveria para onde
 * apontá-lo depois da reinstalação.
 */
export function congelarCenariosLideranca(
  cenarios: Array<Record<string, any>>,
  competencias: Array<{ id: string; nome: string; cargo: string; cod_comp?: string | null }>,
): CenarioLiderancaCongelado[] {
  const porId = new Map(competencias.map((c) => [c.id, c]));
  const congelados: CenarioLiderancaCongelado[] = [];
  for (const cenario of cenarios) {
    const competencia = porId.get(cenario.competencia_id);
    if (!competencia || competencia.cargo !== cenario.cargo) continue;
    const conteudo = Object.fromEntries(Object.entries(cenario).filter(([coluna]) => !COLUNAS_DE_IDENTIDADE.has(coluna)));
    congelados.push({ cargo: cenario.cargo, competencia: competencia.nome, cod_comp: competencia.cod_comp ?? null, conteudo });
  }
  return congelados;
}

/** A curadoria do banco vence; o fixture só entra quando o banco não tem nenhum. */
export function cenariosLiderancaParaReinserir(
  doBanco: CenarioLiderancaCongelado[],
  doFixture: CenarioLiderancaCongelado[],
): CenarioLiderancaCongelado[] {
  return doBanco.length > 0 ? doBanco : doFixture;
}

/**
 * Linhas de `banco_cenarios` para a matriz recém-instalada. O cenário aponta
 * para a linha-cabeçalho da competência (`cod_desc` nulo) ou, sem ela, para a
 * primeira: a mesma régua de `listarFilaIA3`. A tela de mapeamento aceita
 * qualquer linha da competência, mas a fila da IA3 marca "já gerado" por esta.
 */
export function linhasDosCenariosLideranca(
  cenarios: CenarioLiderancaCongelado[],
  competencias: Array<{ id: string; nome: string; cargo: string; cod_desc?: string | null }>,
  empresaId: string,
): { linhas: Array<Record<string, unknown>>; semCompetencia: string[] } {
  const linhas: Array<Record<string, unknown>> = [];
  const semCompetencia: string[] = [];
  for (const cenario of cenarios) {
    const daCompetencia = competencias.filter((c) => c.cargo === cenario.cargo && c.nome === cenario.competencia);
    const principal = daCompetencia.find((c) => !c.cod_desc) || daCompetencia[0];
    if (!principal) {
      semCompetencia.push(`${cenario.cargo} / ${cenario.competencia}`);
      continue;
    }
    const conteudo = Object.fromEntries(Object.entries(cenario.conteudo).filter(([coluna]) => !COLUNAS_DE_IDENTIDADE.has(coluna)));
    linhas.push({
      ...conteudo,
      // O reset recria o PPP e as pessoas com ids novos: um id antigo aqui
      // derrubaria o insert por chave estrangeira. O trilho de liderança é da
      // empresa inteira (sem PPP de escola) e não é cenário de uma pessoa.
      ppp_escola_id: null,
      colaborador_id: null,
      empresa_id: empresaId,
      cargo: cenario.cargo,
      competencia_id: principal.id,
    });
  }
  return { linhas, semCompetencia };
}
