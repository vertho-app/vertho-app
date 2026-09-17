/**
 * Régua de CONVERGÊNCIA — como um descritor é classificado ao comparar a nota
 * de partida (T0, mapeamento) com a nota do fechamento (T1, cenário da semana
 * 14) e a leitura qualitativa da semana 13.
 *
 * POR QUE ISTO VIVE NUM ARQUIVO PRÓPRIO (01/09/2026): a função nasceu privada
 * dentro de `evolution-report-core.ts`, e no instante em que um segundo produtor
 * apareceu (o fixture de evolução da ACME Demo) ela teria sido reimplementada
 * ali. É exatamente o caminho que a régua nota→nível já percorreu uma vez, com
 * NOVE cópias e 42 de 288 descritores de Macaé exibindo um nível que contradizia
 * o texto da própria avaliação. Régua duplicada não diverge só no código: ela
 * vaza para o documento que a pessoa recebe.
 *
 * Quem consome: `evolution-report-core` (produção) e `lib/demo/acme-evolucao-fixture`
 * (demonstração). Guard de paridade: `tests/unit/convergencia-regua.test.ts`.
 */

/**
 * Os três vereditos possíveis, no VALOR gravado em `trilhas.evolution_report`.
 *
 * 🔑 NÃO EXISTE VEREDITO DE REGRESSÃO, e a ausência é uma decisão do dono do
 * produto (01/09/2026): **ninguém desaprende uma competência**. Uma nota que
 * cai entre o diagnóstico e o fechamento não descreve alguém que piorou;
 * descreve a variação do instrumento, que avalia conversas diferentes com
 * prompts diferentes. Carimbar isso como "regressão" seria transformar ruído
 * de medição numa afirmação sobre a pessoa, dentro de um relatório que o
 * gestor dela lê.
 *
 * Queda entra em `ESTAVEL`: o patamar de partida se manteve, e é só isso que a
 * medição sustenta. Foi removido antes de existir um único registro
 * (`Medido:` 0 linhas com `regressao` em todos os tenants), então não há
 * histórico a migrar.
 */
export const CONVERGENCIA = {
  CONFIRMADA: 'evolucao_confirmada',
  PARCIAL: 'evolucao_parcial',
  ESTAVEL: 'estagnacao',
} as const;

export type Convergencia = typeof CONVERGENCIA[keyof typeof CONVERGENCIA];

/**
 * Cortes da régua. Ficam nomeados para que mudar a calibragem seja uma decisão
 * visível num diff, e não um número solto no meio de um `if`.
 *
 * 📏 RUÍDO DO INSTRUMENTO, medido em 09/09/2026 (11 conversas reais de Ibipeba,
 * semana 4, repontuadas K=5 com o prompt e o modelo de produção — detalhe em
 * `docs/CUSTO-QUALIDADE.md` §09/09, script `scripts/_medir-ruido-extrator.ts`):
 * a média por conversa, que é o que o relatório compara com o T0, varia com
 * desvio-padrão de **0,07** e amplitude máxima de **0,33** quando a MESMA
 * conversa é relida.
 *
 * O que isso diz de cada corte:
 *   · `CORTE_CONFIRMADA` (0,5) está FORA do ruído — com folga, e ainda somado à
 *     exigência de qualitativa positiva e de alcançar N3. Evolução confirmada
 *     não sai de repontuação.
 *   · 🔴 `CORTE_PARCIAL` (0,2) está DENTRO do ruído. Um delta entre 0,20 e 0,33
 *     é indistinguível de reler a mesma conversa, e é essa a faixa que hoje
 *     produz "evolução parcial". Calibrar isto é decisão do dono do produto; o
 *     número está aqui para que a decisão não seja tomada sem ele.
 */
export const CORTE_CONFIRMADA = 0.5;
export const CORTE_PARCIAL = 0.2;

/**
 * 🔴 CONFIRMADA NÃO EXIGE MAIS CHEGAR AO NÍVEL 3 (decisão do dono, 17/09/2026).
 *
 * De 02/09 a 17/09 a régua só confirmava quem alcançava N3: "quem saiu de 1,68
 * e chegou a 2,58 evoluiu bastante, mas ainda não está proficiente". No papel
 * isso virou uma contradição que a pessoa não tinha como entender: "+1,1" em
 * verde claro ("parcial") ao lado de "+1,0" em verde escuro, porque o card
 * mostra o avanço e não o nível. `Medido:` 25 descritores gravados com avanço de
 * 0,5 ou mais saíram parciais, TODOS por não chegar ao N3 (15 só por isso, 10
 * também com conversa fraca). Os relatórios gravados não foram reclassificados
 * nesta mudança.
 *
 * O nível da COMPETÊNCIA continua no relatório (nível de partida e de chegada);
 * o que saiu foi o nível como condição do veredito de cada descritor.
 */

/**
 * Rótulos de APRESENTAÇÃO. O valor gravado no banco (`estagnacao`) é
 * vocabulário de engenharia; o que a pessoa lê é outra coisa. Trocar o valor
 * exigiria migrar histórico e reescrever a régua do gestor por nada — trocar o
 * rótulo custa uma linha e é reversível.
 *
 * ⚠️ Toda tela que mostrar convergência usa esta função. Escrever "Estagnação"
 * à mão numa tela recria a divergência que este arquivo existe para impedir.
 */
const ROTULOS: Record<Convergencia, string> = {
  [CONVERGENCIA.CONFIRMADA]: 'Evolução confirmada',
  [CONVERGENCIA.PARCIAL]: 'Evolução parcial',
  [CONVERGENCIA.ESTAVEL]: 'Estável',
};

export function rotuloConvergencia(valor: string | null | undefined): string {
  if (!valor) return 'Sem medição';
  return ROTULOS[valor as Convergencia] || 'Sem medição';
}

/**
 * O AVANÇO exibido, com piso em zero.
 *
 * Decisão do dono do produto (14/09/2026), corolário da ausência de veredito de
 * regressão: se a régua não afirma que alguém regrediu, a TELA não pode mostrar
 * "-0,2" ao lado de "Estável". Aquele número é a variação do instrumento (0,07
 * de desvio e até 0,33 de amplitude ao reler a mesma conversa, medido em 09/09),
 * e exibido como queda ele afirma sobre a pessoa, para o gestor dela, uma piora
 * que a medição não sustenta.
 *
 * O par de notas também sai das telas: "2,0 → 2,3" convida a comparar pessoas
 * por uma nota de partida que nenhuma delas escolheu. O que a leitura pede é
 * quanto andou e qual o veredito.
 *
 * `null` quando falta nota: ausência não é zero.
 */
export function avancoExibido(notaPre: unknown, notaPos: unknown): number | null {
  // 🔴 `Number(null)` é 0 e `Number('')` também: sem esta guarda, nota ausente
  // no início vira "partiu de zero" e o avanço sai do tamanho da nota final.
  if (notaPre == null || notaPre === '' || notaPos == null || notaPos === '') return null;
  const pre = Number(notaPre);
  const pos = Number(notaPos);
  if (!Number.isFinite(pre) || !Number.isFinite(pos)) return null;
  // Arredonda ANTES de aplicar o piso: +0,04 exibido como "+0.0" seria um avanço
  // que a casa decimal não mostra.
  const arredondado = Math.round((pos - pre) * 10) / 10;
  return Math.max(0, arredondado);
}

/** O mesmo avanço já em texto: `+0.3` quando andou, `0.0` quando manteve. */
export function formatarAvanco(notaPre: unknown, notaPos: unknown): string | null {
  return formatarValorAvanco(avancoExibido(notaPre, notaPos));
}

/** Um avanço JÁ calculado (piso zero) em texto: `+0.3` ou `0.0`; `null` se não há. */
export function formatarValorAvanco(avanco: number | null | undefined): string | null {
  if (avanco == null || !Number.isFinite(avanco)) return null;
  return avanco > 0 ? `+${avanco.toFixed(1)}` : '0.0';
}

/**
 * Avanço de um CONJUNTO de descritores (uma competência, uma pessoa): a MÉDIA
 * dos avanços exibidos, cada um já com piso zero, em uma casa decimal.
 *
 * 🔴 NÃO é "média das notas finais menos média das iniciais" (16/09/2026). Essa
 * conta leva para dentro as quedas que o documento não mostra: num PDF real,
 * "Apoio técnico e monitoramento das unidades" listava +0,1, 0,0,
 * +0,3, +0,3 e 0,0, e o cabeçalho dizia "Avanço médio 0,0", porque Registro e
 * devolutiva (2,0 → 1,4) e Presença junto às unidades (2,9 → 2,2) puxavam a
 * média das notas para baixo. Se a queda não existe no descritor, não pode
 * existir escondida no agregado. O dono estranhou na hora.
 *
 * `null` quando nenhum descritor tem as duas notas.
 */
export function avancoMedioExibido(
  descritores: Array<{ nota_pre?: unknown; nota_pos?: unknown }> | null | undefined,
): number | null {
  const avancos = (Array.isArray(descritores) ? descritores : [])
    .map((d) => avancoExibido(d?.nota_pre, d?.nota_pos))
    .filter((a): a is number => a != null);
  if (!avancos.length) return null;
  return Math.round((avancos.reduce((soma, a) => soma + a, 0) / avancos.length) * 10) / 10;
}

/**
 * A leitura qualitativa deste descritor tem base na conversa?
 *
 * O extrator marca `forca_evidencia: 'fraca'` para descritor que não foi
 * discutido, e o validador dá `nivel_percebido` **default 2.0** quando o campo
 * falta. Até 17/09/2026 isto decidia se a leitura VOTAVA no veredito; desde
 * então o veredito é só pelo número (ver `classificarConvergencia`), e a função
 * serve à INFORMAÇÃO: a tela de admin avisa quando a conversa não tocou no
 * descritor, para quem lê o "Antes/Depois" saber o peso daquele texto.
 */
export function qualitativaSustenta(q: { forca_evidencia?: string | null } | null | undefined): boolean {
  const f = q?.forca_evidencia;
  return f != null && f !== 'fraca';
}

/**
 * Classifica um descritor SÓ PELO AVANÇO exibido entre nota_pre (início da
 * temporada) e nota_pos (cenário do fechamento):
 *
 *   · confirmada: avanço de 0,5 ou mais;
 *   · parcial:    avanço de 0,2 ou mais;
 *   · estável:    o resto, inclusive queda.
 *
 * 🔴 A CONVERSA NÃO VOTA MAIS NO VEREDITO (decisão do dono, 17/09/2026). No mesmo
 * dia saíram as duas exigências que o número não mostrava: chegar ao Nível 3
 * (de 02/09) e a leitura qualitativa sustentar a mudança. No papel, "+1,1" em
 * verde claro ao lado de "+1,0" em verde escuro, e o contador "Avanço de pelo
 * menos 0,5" ficava falso. A conversa continua no relatório onde ela sempre
 * falou: nos comentários de cada descritor ("Antes/Depois" vêm da leitura
 * qualitativa) e nos textos da competência (devolutiva e mensagem final).
 * "Não vamos complicar" (dono): sem selo, sem veredito paralelo.
 *
 * Antes, também na mesma semana: "+0,1" com a conversa positiva deixou de ser
 * parcial. Nenhuma dessas mudanças reclassificou relatório gravado.
 */
export function classificarConvergencia({
  nota_pre,
  nota_pos,
}: {
  nota_pre: number;
  nota_pos: number;
}): Convergencia {
  const delta = nota_pos - nota_pre;

  // 🔴 AVANÇO EXIBIDO 0,0 É ESTÁVEL, sem exceção (decisão do dono, 16/09/2026).
  // A leitura qualitativa sustentava "parcial" sozinha mesmo com a nota do
  // cenário caindo, e o relatório passou a mostrar "0,0 · Evolução parcial"
  // (caso real, "Intervenção baseada em evidências": 2,5 → 2,3 com qualitativa
  // 3), um veredito de avanço ao lado de um avanço zero. `Medido:` 4 descritores
  // em 4 relatórios de Ibipeba. A régua decide pelo MESMO número que a pessoa lê
  // (arredondado e com piso), então os dois não se contradizem mais.
  //
  // 🔴 E os CORTES também comparam o avanço exibido, não o delta cru (16/09/2026).
  // Em ponto flutuante `1.2 - 1.0` é 0,19999…, abaixo de `CORTE_PARCIAL`, e a
  // tela arredonda para "+0,2": três descritores gravados, em dois relatórios
  // reais, saíram "+0,2 · Estável". O teste antigo passava porque
  // `2 + CORTE_PARCIAL` arredonda para cima. Nota ausente não tem avanço
  // exibido; aí vale o delta, como antes.
  const avanco = avancoExibido(nota_pre, nota_pos);
  if (avanco === 0) return CONVERGENCIA.ESTAVEL;
  const medido = avanco ?? delta;
  if (medido >= CORTE_CONFIRMADA) return CONVERGENCIA.CONFIRMADA;
  if (medido >= CORTE_PARCIAL) return CONVERGENCIA.PARCIAL;
  // Queda cai aqui de propósito: sem veredito de regressão, o piso da régua é
  // "manteve o patamar". Ver o cabeçalho de CONVERGENCIA.
  return CONVERGENCIA.ESTAVEL;
}
