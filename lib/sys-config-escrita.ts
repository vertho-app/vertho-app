/**
 * Escrita em `empresas.sys_config` — read-modify-write com TRAVA OTIMISTA.
 *
 * POR QUE (medido 13/09/2026): são NOVE call-sites em quatro arquivos que
 * gravam o objeto INTEIRO — configurações da empresa (3), prontidão (2),
 * votação (3), perfil externo (1). Cada um lê, muta a sua chave e regrava tudo.
 * Duas abas abertas (ou um admin e um cron) = o último write apaga a chave que
 * o outro acabou de gravar, sem erro em lugar nenhum. Não é corrida teórica: a
 * tela de Configurações carrega o objeto inteiro no state e o devolve minutos
 * depois, então ela regrava um retrato VELHO de tudo o que não está no
 * formulário.
 *
 * `jsonb_set` resolveria no banco, mas o PostgREST não expõe expressão no
 * UPDATE — exigiria RPC, e RPC é DDL (decisão do dono). A trava aqui usa o que
 * a tabela já tem: `empresas` tem trigger `set_updated_at` BEFORE UPDATE, então
 * `updated_at` muda a cada escrita e serve de versão. O update leva
 * `.eq('updated_at', lido)`: se alguém gravou no meio, zero linhas são
 * afetadas — a mutação é REAPLICADA sobre o estado novo (uma vez) em vez de
 * sobrescrever. É o `if_version` do resto da base, sem migration.
 *
 * A mutação entra como FUNÇÃO, não como objeto pronto, justamente para poder
 * ser reaplicada: quem passa um objeto já montado guardou uma leitura velha
 * dentro dele.
 */

export type MutacaoSysConfig = (atual: Record<string, any>) => Record<string, any> | { erro: string };

/**
 * Forma ÚNICA, não união discriminada: com `strict: false` o TypeScript não
 * estreita união por campo booleano (`if (!r.ok)` não tipa `r.erro`) — ver
 * `reference_tsconfig_strict_false`. Quem lê checa `r.ok` e usa `r.erro`.
 */
export type ResultadoSysConfig = {
  ok: boolean;
  sysConfig?: Record<string, any>;
  erro?: string;
  /** Duas tentativas perderam a corrida: outra pessoa está editando a mesma empresa. */
  conflito?: boolean;
};

/** Quantas vezes reaplicar a mutação quando outro write entrou no meio. */
const TENTATIVAS = 2;

export async function gravarSysConfig(
  sb: any,
  empresaId: string,
  mutar: MutacaoSysConfig,
): Promise<ResultadoSysConfig> {
  if (!empresaId) return { ok: false, erro: 'empresaId obrigatório' };
  // `empresas` não tem coluna `empresa_id`: sob tenantDb a leitura vai pelo raw
  // (o filtro de tenant aqui é o próprio `.eq('id', empresaId)`).
  const base = sb?.raw || sb;

  for (let tentativa = 1; tentativa <= TENTATIVAS; tentativa++) {
    const { data: atual, error: erroLeitura } = await base.from('empresas')
      .select('sys_config, updated_at').eq('id', empresaId).maybeSingle();
    if (erroLeitura) return { ok: false, erro: `não foi possível ler a configuração: ${erroLeitura.message}` };
    if (!atual) return { ok: false, erro: 'Empresa não encontrada.' };

    const proximo = mutar({ ...(atual.sys_config || {}) });
    if (proximo && typeof proximo === 'object' && 'erro' in proximo) return { ok: false, erro: (proximo as { erro: string }).erro };

    // `updated_at` é a versão: o trigger o move a cada UPDATE. Linha nenhuma
    // afetada = outro write entrou entre a leitura e esta escrita.
    const { data: escritas, error } = await base.from('empresas')
      .update({ sys_config: proximo })
      .eq('id', empresaId)
      .eq('updated_at', atual.updated_at)
      .select('id');
    if (error) return { ok: false, erro: error.message };
    if (escritas?.length) return { ok: true, sysConfig: proximo as Record<string, any> };
  }

  return {
    ok: false,
    conflito: true,
    erro: 'A configuração desta empresa foi alterada por outra pessoa enquanto você editava. Recarregue a tela e refaça a mudança.',
  };
}
