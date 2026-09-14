/**
 * Chaves de `empresas.sys_config` que NÃO podem ser gravadas pelo formulário de
 * configurações da empresa — só por action própria, com gate de plataforma.
 *
 * POR QUE A LISTA EXISTE (medido 13/09/2026): `salvarConfig` tem gate
 * `settings.company.manage`, que o papel `rh` possui, e num `'use server'` todo
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
] as const;

export type ChaveSoPlataforma = (typeof CHAVES_SO_PLATAFORMA)[number];
