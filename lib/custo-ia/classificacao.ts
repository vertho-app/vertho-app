/**
 * A régua que separa OPERAÇÃO de P&D no relatório de custo de IA.
 *
 * Pedido do dono em 02/09/2026, depois de ver que a Ibipeba aparecia com 58,2%
 * de uma semana sendo que 62% do que estava no nome dela era experimento nosso
 * usando os dados dela, não entrega para o cliente. Sem a separação, o número
 * por tenant não serve para precificar nem para conversar com o cliente.
 *
 * ── DUAS PORTAS, e a ordem importa ───────────────────────────────────────────
 *
 * **1. O `source`.** É declarado no call-site por quem dispara, e o repositório
 * já usava isso antes deste relatório existir: `lib/season-engine/simulador-core.ts`
 * marca `source='simulator'` justamente para "isolar a rodada de medição do
 * tráfego real", e chama o custo do aluno simulado de "netável". Esta porta é a
 * forte, porque carrega INTENÇÃO — a mesma feature (`ia3_check`) é operação
 * quando o admin gera e é medição quando entra num braço de comparação.
 *
 * **2. A feature.** Necessária porque o `source` default (`wrapper`) não diz
 * nada, e foi sob ele que rodaram os US$ 38,73 do Modo Cena. Aqui a régua é
 * verificável: são features cujo motor **não tem consumidor de produção**.
 * `tests/unit/security/custo-ia-pd-guard.test.ts` confere isso contra o código
 * e falha se algum desses módulos passar a ser importado por rota, action ou
 * task — que é exatamente o dia em que a feature deixa de ser P&D. Sem o guard,
 * esta lista viraria a classificação que envelhece calada.
 *
 * ⚠️ **Não escreva esta lista como padrão `like 'cena_%'`.** Em SQL o `_` é
 * curinga de um caractere, então `cena_%` casa `cenarios_b` e `cenarios_b_check`
 * — que são o fechamento da trilha, operação pura. Aconteceu comigo na medição
 * de 02/09 e inflou o P&D em US$ 2,78 antes de eu conferir feature a feature.
 * Lista explícita, sem curinga.
 */

/** `source` que declara medição: a rodada existe para comparar, não para entregar. */
export const SOURCES_DE_MEDICAO: Record<string, string> = {
  simulator: 'Simulador de trilha',
  eval: 'Evals',
  experimento: 'Experimentos',
  medicao: 'Medições',
  calibracao: 'Calibração',
  controle: 'Braço de controle',
  '3familias': 'Comparação de famílias',
  canario: 'Canário de contrato',
  probe: 'Sondas técnicas',
  piloto: 'Rodadas piloto',
};

/**
 * Features de P&D que rodam sob o `source` default, com a frente a que pertencem.
 *
 * O valor é o rótulo que aparece no e-mail. A chave é conferida pelo guard: cada
 * uma tem que continuar sem consumidor de produção.
 */
export const FEATURES_DE_PD: Record<string, string> = {
  // Modo Cena: núcleo em `lib/season-engine/cena/`, cujo cabeçalho declara que
  // não há rota, action nem tela chamando — instrumento de avaliação em teste.
  cena_turno: 'Modo Cena',
  cena_extracao: 'Modo Cena',
  cena_juiz_beat: 'Modo Cena',
  cena_triagem: 'Modo Cena',
  cena_persona: 'Modo Cena',
  cena_guarda: 'Modo Cena',
  cena_guarda_interlocutor: 'Modo Cena',
  // O aluno simulado. Normalmente chega com `source='simulator'`, mas 60 linhas
  // dos últimos 30 dias vieram sob o default — a feature é inequívoca.
  sim_aluno: 'Simulador de trilha',
  // Comparação de modelos de PDI entre 07 e 08/2026.
  pdi_compare_0708: 'PDI (comparação de modelos)',
};

/**
 * Módulos que implementam frentes de P&D. O guard confere que nenhum deles é
 * importado por `app/`, `actions/` ou `trigger/`, direta ou transitivamente.
 *
 * Só entram aqui as frentes que TÊM módulo próprio: as demais são classificadas
 * pelo `source`, que não é análise estática e não precisa desta prova.
 */
export const MODULOS_DE_PD = ['lib/season-engine/cena/'] as const;

/**
 * Tenants que NÃO são cliente, e por isso não entram em operação (decisão do
 * dono, 07/09/2026). A régua principal é `empresas.is_demo`, que vem do banco:
 * é a mesma coluna que o guardrail de envio usa, então um ambiente de demo novo
 * entra na conta sem ninguém lembrar de editar lista nenhuma.
 *
 * Esta lista cobre só o que `is_demo` não alcança — e a razão de ela existir é
 * medida: dos três tenants com "ACME" no nome, **`acme` tem `is_demo = false`**
 * (só `acme-demo` e `escolas-acme` estão marcados). Uma régua que fosse só
 * `is_demo` deixaria o ACME original contado como cliente.
 *
 * `teste-piloto` e `bett` entram pelo mesmo motivo dos ACME: ambiente de teste
 * e de feira não é cliente. Juntos custaram US$ 1,35 em 30 dias — o efeito é
 * pequeno, mas mantê-los em "operação" é dizer que a Vertho tem 8 clientes
 * quando tem 2.
 */
export const SLUGS_NAO_CLIENTE = ['acme', 'teste-piloto', 'bett'] as const;

export type Natureza = 'operacao' | 'pd';

/** O que a régua precisa saber de uma linha para classificá-la. */
export interface LinhaClassificavel {
  feature: string;
  source: string | null;
  empresaId: string | null;
  empresaSlug: string | null;
  empresaIsDemo: boolean;
}

/**
 * OPERAÇÃO é o custo de atender um cliente de verdade. Tudo o mais é interno.
 *
 * ⚠️ A porta do `empresaId` nulo é a que mais move dinheiro e a que tem a
 * ressalva mais importante: **parte do trabalho sem tenant É entrega** — em
 * 31/08–06/09, cerca de US$ 11 de `conteudo_layout_plan`, `ia3_cenarios`,
 * `ia2_gabarito` e afins, que só estão sem dono porque o `empresa_id` não foi
 * gravado na chamada. Contá-los como interno subestima o custo real de operar
 * os clientes. O conserto não é aqui, é no call-site que deixa de passar
 * `empresaId` (o dono fechou dois desses em 01/09); enquanto isso, o e-mail diz
 * na nota de cobertura que o bloco de plataforma contém entrega não atribuída.
 */
export function naturezaDaLinha(l: LinhaClassificavel): Natureza {
  if (!l.empresaId) return 'pd';
  if (l.empresaIsDemo) return 'pd';
  if (l.empresaSlug && (SLUGS_NAO_CLIENTE as readonly string[]).includes(l.empresaSlug)) return 'pd';
  if (l.source && SOURCES_DE_MEDICAO[l.source]) return 'pd';
  if (FEATURES_DE_PD[l.feature]) return 'pd';
  return 'operacao';
}

/**
 * Rótulo de features que já são P&D pelo `source`, mas cujo nome genérico não
 * ajudaria: `pdi_experimento` sob `source='experimento'` vira "Experimentos", e
 * "Experimentos" não diz o que foi experimentado.
 *
 * Só rótulo — nenhuma feature aqui é classificada como P&D por estar nesta
 * lista. É `FEATURES_DE_PD` que decide natureza.
 */
export const ROTULO_POR_FEATURE: Record<string, string> = {
  pdi_experimento: 'PDI (experimento)',
  pdi_experimento_check: 'PDI (experimento)',
  pdi_leitura_cega: 'PDI (leitura cega)',
  ia4_medicao_sem_censura: 'Medição da IA4',
  canario_contrato: 'Canário de contrato',
};

/**
 * A frente de P&D de uma linha, do sinal mais específico para o mais genérico.
 *
 * ⚠️ **Declaração vence heurística.** A primeira versão testava prefixo
 * (`feature.startsWith('ia3_')`) ANTES do `source`, e com isso um `ia3_check`
 * disparado de dentro do simulador virava "Medição da IA3" em vez de "Simulador
 * de trilha" — o gasto aparecia sob o assunto em vez de sob quem o causou.
 * Quem disparou é declarado no call-site; prefixo é palpite sobre o nome. Hoje
 * não há palpite nenhum: o que não está nos mapas cai em "Outras medições",
 * que é uma lacuna visível em vez de um rótulo inventado.
 */
export function frenteDePD(l: LinhaClassificavel): string {
  // A frente por FEATURE vem primeiro mesmo quando a linha tem tenant demo ou
  // nenhum tenant: uma cena rodada sem `empresa_id` continua sendo Modo Cena, e
  // dizer "Plataforma" ali esconderia a frente que gastou.
  const porFeature = FEATURES_DE_PD[l.feature]
    || ROTULO_POR_FEATURE[l.feature]
    || (l.source ? SOURCES_DE_MEDICAO[l.source] : undefined);
  if (porFeature) return porFeature;

  if (!l.empresaId) return 'Plataforma Vertho (sem tenant)';
  return 'Ambientes internos e demonstração';
}
