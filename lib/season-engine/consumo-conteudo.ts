/**
 * FONTE ÚNICA da pergunta "esta pessoa consumiu o conteúdo desta semana?".
 *
 * POR QUE EXISTE (medido 25/08/2026)
 * ──────────────────────────────────
 * `temporada_semana_progresso.conteudo_consumido` carrega DUAS perguntas
 * diferentes no mesmo campo, porque tem dois escritores com semânticas
 * distintas:
 *
 *   - `marcarConteudoConsumido` (a pessoa clicou "Marcar como realizado")
 *     grava o BOOLEAN `true` — "consumiu o conteúdo da semana".
 *   - `concluirPilulaSeMapeada` (video-tracking do Bunny) grava um ARRAY
 *     `[{ semana, concluido, concluido_em }]` — "quais CURSOS foram concluídos".
 *
 * E cada leitor inventou a sua régua. Levantamento dos 7 leitores:
 *
 *   | leitor                                | régua        | array vazio    |
 *   |---------------------------------------|--------------|----------------|
 *   | tela da semana                        | `!v`         | LIBERA         |
 *   | `engajamento.ts::consumiuFlag`        | `some()`     | não consumido  |
 *   | `engagement-evolution.ts::consumedFlag`| `some()`    | não consumido  |
 *   | `conteudos-metrics.ts`                | truthy       | conta          |
 *   | `tira-duvidas/route.ts`               | truthy       | LIBERA         |
 *   | `trilha-core.ts::temTrabalhoDoColaborador` | truthy   | BLOQUEIA regen |
 *   | `praticar-actions` / `home/loaders`   | lista de cursos (outra pergunta) |
 *
 * Duas dessas linhas são catraca de ESTADO, não texto de tela: a da regeneração
 * decide se a semana pode ser reescrita, e a do tira-dúvidas decide se a rota
 * responde. Régua divergente ali não produz um rótulo errado — produz trabalho
 * de gente apagado, ou uma porta que abre para um e fecha para outro.
 *
 * 🔑 O ESTADO MEDIDO, e ele importa para não inflar o achado: **das 941 linhas
 * de `temporada_semana_progresso`, ZERO estão em formato array** (838 `false`,
 * 103 `true` — censo, não amostra). E o ramo que grava array é HOJE
 * INALCANÇÁVEL: ele exige `trilhas.cursos[].bunny_video_id`, e **0 de 87
 * trilhas** têm `cursos` preenchido. Ou seja, a divergência ainda não mordeu
 * ninguém. Isto aqui não é conserto de incidente — é tirar da mesa uma
 * divergência que só espera o primeiro curso ser cadastrado para começar a
 * valer, num campo que já é catraca de duas decisões.
 *
 * NÃO removi o ramo do array: cursos é feature de produto (a tela `/dashboard/
 * praticar` e a home leem essa lista), e apagá-la seria decisão de produto que
 * ninguém tomou. O que este módulo faz é garantir que TODO leitor da pergunta
 * booleana use a MESMA régua, e que as duas escritas parem de se destruir.
 */

/** Item do array gravado pelo video-tracking. */
export interface CursoConcluido {
  semana?: number;
  concluido?: boolean;
  concluido_em?: string;
}

/**
 * A pessoa consumiu o conteúdo da semana?
 *
 * `true` literal (marcação da pessoa) OU pelo menos um curso concluído no array.
 *
 * 🔴 ARRAY VAZIO É `false`, e esta é a única escolha defensável: um array sem
 * nenhum `concluido` significa que o video-tracking tocou a linha e nada foi
 * concluído. A régua `!v` da tela dava o oposto (array vazio é truthy em JS,
 * logo "consumido") — e era ela que destravava o botão de Evidências. Bastaria
 * um array vazio para a tela dizer "consumido" enquanto o painel de engajamento
 * dizia "não".
 */
export function consumiuConteudo(valor: unknown): boolean {
  if (valor === true) return true;
  if (Array.isArray(valor)) return valor.some((c: CursoConcluido) => c?.concluido === true);
  return false;
}

/**
 * Os cursos concluídos registrados na linha — a OUTRA pergunta.
 *
 * Separada de propósito: `/dashboard/praticar` e a home querem a lista, não o
 * booleano. Misturar as duas num só helper reconstruiria a ambiguidade que este
 * módulo existe para acabar.
 */
export function cursosConcluidos(valor: unknown): CursoConcluido[] {
  return Array.isArray(valor) ? valor.filter((c: CursoConcluido) => c?.concluido === true) : [];
}

/**
 * O valor a GRAVAR quando a pessoa marca a semana como consumida, preservando o
 * que já estiver lá.
 *
 * 🔴 POR QUE NÃO É SÓ `true`. Hoje `marcarConteudoConsumido` grava `true`
 * incondicionalmente e `concluirPilulaSeMapeada` grava o array
 * incondicionalmente — **cada escrita apaga a outra**. Se um dia houver curso
 * cadastrado, marcar uma semana como consumida apagaria a lista de cursos da
 * pessoa (e a tela `/dashboard/praticar` a perderia), enquanto assistir a um
 * vídeo apagaria a marcação da semana.
 *
 * Com isto, quem já está em formato de lista continua em lista (com a semana
 * marcada dentro dela) e quem está em booleano continua em booleano. Nenhuma
 * das duas escritas destrói a outra, e nenhum backfill é necessário — o que
 * importa porque as 941 linhas de hoje são todas booleanas.
 */
export function marcarSemanaConsumida(atual: unknown, semana: number): true | CursoConcluido[] {
  if (!Array.isArray(atual)) return true;

  const lista = [...(atual as CursoConcluido[])];
  const i = lista.findIndex((c) => Number(c?.semana) === Number(semana));
  const carimbo = { semana, concluido: true, concluido_em: new Date().toISOString() };
  if (i >= 0) lista[i] = { ...lista[i], ...carimbo };
  else lista.push(carimbo);
  return lista;
}

/**
 * O valor a GRAVAR quando o video-tracking conclui um curso, preservando um
 * `true` que já exista.
 *
 * O simétrico do de cima: sem ele, `Array.isArray(x) ? [...x] : []` transforma
 * um `true` (a pessoa marcou a semana) num array que não sabe dessa marcação —
 * e a semana volta a contar como não consumida em `consumiuConteudo`.
 */
export function marcarCursoConcluido(atual: unknown, semana: number): CursoConcluido[] {
  const base: CursoConcluido[] = Array.isArray(atual) ? [...(atual as CursoConcluido[])] : [];
  // `true` anterior = a semana JÁ estava consumida; entra na lista para não
  // sumir na conversão de formato.
  if (atual === true && !base.some((c) => Number(c?.semana) === Number(semana))) {
    base.push({ semana, concluido: true, concluido_em: new Date().toISOString() });
    return base;
  }
  const i = base.findIndex((c) => Number(c?.semana) === Number(semana));
  const carimbo = { semana, concluido: true, concluido_em: new Date().toISOString() };
  if (i >= 0) {
    if (base[i].concluido) return base; // já concluído — idempotente
    base[i] = { ...base[i], ...carimbo };
  } else {
    base.push(carimbo);
  }
  return base;
}
