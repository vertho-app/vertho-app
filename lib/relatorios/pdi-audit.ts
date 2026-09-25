/**
 * Auditoria do PDI individual — o check que faltava no bloco C.
 *
 * Por que existe (27/08/2026): o exercício de custo/qualidade de 25-27/08 nasceu
 * da frase "os artefatos IRREVERSÍVEIS não têm auditor", e depois passou três
 * dias otimizando modelos DENTRO desse buraco. O PDI é o caso mais agudo: sai
 * em PDF, vai para a pessoa avaliada, e ninguém confere nada além do que o
 * próprio gerador decidiu escrever.
 *
 * Duas camadas, como em `lib/blueprint/audit.ts`:
 *
 *  1) ESTRUTURAL (código, determinístico, grátis) — verifica as promessas
 *     LITERAIS do prompt. Não é opinião: o prompt manda `sprint.acao_principal`
 *     ser IGUAL à do blueprint, `checklist` ter EXATAMENTE 3 itens, a descrição
 *     do perfil falar em 2ª pessoa e o texto não usar jargão em inglês. Tudo
 *     isso um `===` resolve, e o que um `===` resolve não deve custar uma
 *     chamada de IA.
 *
 *  2) SEMÂNTICA (2ª IA, cross-família) — o julgamento que o código não faz: a
 *     análise se sustenta na evidência ou é elogio genérico? a recomendação é
 *     proporcional ao gap? há afirmação sobre a pessoa que não vem dos dados?
 *
 * 🔑 A camada 1 é a que mais paga: os números do PDI JÁ estão protegidos por um
 * overlay em `individual-core` (nível e nota vêm dos dados reais, não da IA), e
 * o que ficou sem rede foi exatamente a PROSA e o SPRINT — que é a parte que a
 * pessoa lê e executa.
 *
 * PURO (sem I/O), como o auditor do blueprint. Quem orquestra é o core.
 */

export type PdiAuditStatus = 'pass' | 'warn' | 'fail';

export interface PdiAuditCheck {
  id: string;
  categoria: 'estrutura' | 'semantica';
  titulo: string;
  status: PdiAuditStatus;
  detalhe: string;
  /** O que motivou o status, nominalmente — nunca "algumas competências". */
  ocorrencias: string[];
}

export interface PdiAuditReport {
  status: PdiAuditStatus;
  checks: PdiAuditCheck[];
  resumo: string;
  /** Quantas competências o auditor de fato olhou — o denominador. */
  competenciasAuditadas: number;
}

/**
 * Objetivo do blueprint, na forma que o prompt promete copiar para o sprint.
 * A lista chega na ORDEM do blueprint: a ordem é o ciclo (obj-1 = 1º ciclo).
 */
export interface ObjetivoBlueprint {
  competencia: string;
  id?: string;
  acao_principal?: string;
  acao_apoio?: string;
  ritual?: string;
}

const norm = (s: unknown) => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

/** Comparação de AÇÃO copiada: ponto final a mais ou a menos não é outra ação. */
const normAcao = (s: unknown) => norm(s).replace(/[\s.;:!]+$/, '');

/** Os campos do sprint que o prompt manda COPIAR (igual) do blueprint. */
export const CAMPOS_SPRINT_COPIADOS = ['acao_principal', 'acao_apoio', 'ritual'] as const;

/**
 * O objetivo que o sprint de cada competência reproduz: o do 1º CICLO, isto é,
 * o primeiro da competência na ordem do blueprint.
 *
 * 🔴 POR QUE "O PRIMEIRO" E NÃO "UM DELES" (25/09/2026): na jornada a
 * competência é uma só com 2-3 objetivos (um por ciclo), e o sprint é um só. O
 * prompt dizia "derivado dos objetivos da mesma competência" sem dizer de QUAL,
 * e o modelo misturava: ação principal do objetivo 1 e, como "apoio", a ação
 * principal do objetivo 2 (16 de 58 PDIs medidos). O PDF rotula o sprint como
 * "Ciclo 1 · Semanas 1–6", então é o objetivo 1 que ele tem de reproduzir.
 */
export function objetivoDoPrimeiroCiclo(
  objetivos: ObjetivoBlueprint[] | null | undefined,
  competencia: unknown,
): ObjetivoBlueprint | null {
  const alvo = norm(competencia);
  return (objetivos || []).find((o) => norm(o.competencia) === alvo) ?? null;
}

/**
 * Copia para o sprint, EM CÓDIGO, as ações do objetivo do 1º ciclo.
 *
 * O prompt já declarava que "apenas as AÇÕES (sprint) são fixadas pelo
 * blueprint", e o que um `===` resolve não deve depender do modelo: medido em
 * 25/09/2026, só 22 de 58 PDIs copiavam os três campos de um mesmo objetivo. É a
 * mesma lógica do overlay de nível e nota que o core já aplica.
 *
 * Competência sem objetivo no blueprint fica INTOCADA: não há de onde copiar, e
 * o check estrutural acusa. Devolve os nomes das competências sobrescritas.
 */
export function aplicarSprintDoBlueprint(relatorio: any, objetivos: ObjetivoBlueprint[] | null): string[] {
  const comps: any[] = Array.isArray(relatorio?.competencias) ? relatorio.competencias : [];
  const tocadas: string[] = [];
  for (const c of comps) {
    const o = objetivoDoPrimeiroCiclo(objetivos, c?.nome);
    if (!o) continue;
    const sprint = { ...(c.sprint && typeof c.sprint === 'object' ? c.sprint : {}) };
    let mudou = false;
    for (const campo of CAMPOS_SPRINT_COPIADOS) {
      if (o[campo]) { sprint[campo] = o[campo]; mudou = true; }
    }
    if (mudou) { c.sprint = sprint; tocadas.push(String(c.nome)); }
  }
  return tocadas;
}

/**
 * Jargão que o prompt PROÍBE explicitamente no texto que sai para a pessoa.
 * `feedback` é o caso emblemático: o prompt manda usar "devolutiva".
 *
 * ⚠️ Só casa palavra INTEIRA. `case` como substring pega "casos", "casa",
 * "casamento" — e um auditor que acusa "casos" ensina a ignorá-lo.
 */
const JARGAO_PROIBIDO = ['feedback', 'case', 'skill', 'skills', 'insight', 'insights', 'mindset'];

function acharJargao(texto: string): string[] {
  const achados = new Set<string>();
  for (const j of JARGAO_PROIBIDO) {
    if (new RegExp(`\\b${j}\\b`, 'i').test(texto)) achados.add(j);
  }
  return [...achados];
}

function checar(
  id: string,
  categoria: PdiAuditCheck['categoria'],
  titulo: string,
  ocorrencias: string[],
  detalheOk: string,
  detalheRuim: string,
  severidade: PdiAuditStatus = 'fail',
): PdiAuditCheck {
  return {
    id,
    categoria,
    titulo,
    status: ocorrencias.length ? severidade : 'pass',
    detalhe: ocorrencias.length ? detalheRuim : detalheOk,
    ocorrencias,
  };
}

/**
 * Camada 1 — as promessas literais do prompt, conferidas em código.
 *
 * `objetivos` é o blueprint achatado por competência. Quando ele não existe
 * (PDI sem blueprint), os checks de sprint são PULADOS explicitamente em vez de
 * passarem por vacuidade — check que passa por não ter o que olhar é o modo de
 * falha que este projeto já catalogou.
 */
export function auditarPdiEstrutural(
  relatorio: any,
  objetivos: ObjetivoBlueprint[] | null,
): PdiAuditCheck[] {
  const checks: PdiAuditCheck[] = [];
  const comps: any[] = Array.isArray(relatorio?.competencias) ? relatorio.competencias : [];

  // 0. Cegueira primeiro: sem competências não há o que auditar, e um relatório
  //    de zero achados sobre zero competências não é "aprovado".
  if (!comps.length) {
    return [{
      id: 'sem-competencias',
      categoria: 'estrutura',
      titulo: 'O PDI não trouxe competências',
      status: 'fail',
      detalhe: 'Nenhuma competência no artefato — não há o que auditar, e isso não é aprovação.',
      ocorrencias: [],
    }];
  }

  // 1. Gap sem ação. Competência com flag (nível < 3) que não diz o que melhorar
  //    é o defeito mais caro: a pessoa lê que está abaixo e não recebe caminho.
  const gapsSemAcao = comps
    .filter((c) => c?.flag === true)
    .filter((c) => !(Array.isArray(c?.melhorar) && c.melhorar.length)
      || !(Array.isArray(c?.dicas_desenvolvimento) && c.dicas_desenvolvimento.length))
    .map((c) => String(c?.nome ?? '(sem nome)'));
  checks.push(checar(
    'gap-sem-acao', 'estrutura', 'Toda competência em gap recebe caminho',
    gapsSemAcao,
    'Todas as competências sinalizadas trazem o que melhorar e como.',
    'Competência marcada como gap sem "melhorar" ou sem dicas: a pessoa lê que está abaixo e não recebe caminho.',
  ));

  // 2. Checklist com exatamente 3 itens — exigência textual do prompt.
  const checklistErrado = comps
    .filter((c) => c?.sprint)
    .filter((c) => !Array.isArray(c.sprint?.checklist) || c.sprint.checklist.length !== 3)
    .map((c) => `${c?.nome}: ${Array.isArray(c?.sprint?.checklist) ? c.sprint.checklist.length : 0} item(ns)`);
  checks.push(checar(
    'checklist-3', 'estrutura', 'O checklist do sprint tem 3 itens',
    checklistErrado,
    'Todos os sprints trazem checklist de 3 itens.',
    'O prompt exige EXATAMENTE 3 itens no checklist.',
    'warn',
  ));

  // 3. O sprint COPIA o blueprint. Esta é a promessa mais forte e mais fácil de
  //    quebrar: o prompt diz "acao_principal ← acao_principal (igual)". Se o
  //    modelo reescreveu, o PDI promete uma ação que a trilha não sustenta.
  //
  //    🔴 Até 25/09/2026 este check reprovava 58 de 60 PDIs POR DEFEITO PRÓPRIO:
  //    indexava os objetivos num `Map` por competência, e com 2-3 objetivos na
  //    mesma competência (a jornada) o Map guardava o ÚLTIMO e comparava o sprint,
  //    tirado do 1º, com o objetivo errado. A régua é o objetivo do 1º ciclo
  //    (`objetivoDoPrimeiroCiclo`), o mesmo que o core copia.
  if (!objetivos || !objetivos.length) {
    checks.push({
      id: 'sprint-do-blueprint',
      categoria: 'estrutura',
      titulo: 'O sprint veio do blueprint',
      status: 'warn',
      detalhe: 'PDI gerado SEM blueprint — não há com o que comparar o sprint. Não é aprovação: é ausência de fonte.',
      ocorrencias: [],
    });
  } else {
    const divergentes: string[] = [];
    for (const c of comps) {
      if (!c?.sprint) continue;
      const o = objetivoDoPrimeiroCiclo(objetivos, c?.nome);
      // Sprint numa competência que o blueprint não cobre é ação inventada: não
      // há objetivo de onde ela possa ter vindo. Antes isto era PULADO, e a
      // competência passava por vacuidade.
      if (!o) {
        divergentes.push(`${c.nome}: sprint sem objetivo correspondente no blueprint`);
        continue;
      }
      const qual = o.id || '1º objetivo';
      for (const campo of CAMPOS_SPRINT_COPIADOS) {
        const doPdi = normAcao(c.sprint?.[campo]);
        const doBlueprint = normAcao(o[campo]);
        if (doBlueprint && doPdi !== doBlueprint) {
          divergentes.push(`${c.nome} · ${campo}: "${String(c.sprint?.[campo] ?? '').slice(0, 60)}…" ≠ ${qual}`);
        }
      }
    }
    checks.push(checar(
      'sprint-do-blueprint', 'estrutura', 'O sprint veio do blueprint',
      divergentes,
      'Ações do sprint idênticas às do objetivo do 1º ciclo no blueprint.',
      'O sprint não reproduz o objetivo do 1º ciclo do blueprint: promete o que a trilha não sustenta.',
    ));
  }

  // 4. Perfil em 2ª pessoa. O prompt diz "NUNCA em 3ª pessoa" e dá o exemplo
  //    exato do erro ("O perfil de Elizângela..."). Verificação por PRESENÇA do
  //    padrão proibido, não por ausência do certo.
  const desc = String(relatorio?.perfil_comportamental?.descricao ?? '');
  // `[Oo]` explícito em vez da flag `i`: a MAIÚSCULA logo depois é justamente o
  // sinal de que vem um NOME próprio ("O perfil de Elizângela"). Com `i` a
  // classe casaria minúscula também e a heurística perderia o que a distingue.
  const terceiraPessoa = /\b[Oo] perfil d[eoa]\s+[A-ZÁÉÍÓÚÂÊÔÃÕÇ]/.test(desc) ? ['perfil_comportamental.descricao'] : [];
  checks.push(checar(
    'perfil-2a-pessoa', 'estrutura', 'O perfil fala COM a pessoa, não SOBRE ela',
    terceiraPessoa,
    'Descrição do perfil em 2ª pessoa.',
    'A descrição do perfil está em 3ª pessoa — o prompt proíbe, e o efeito é um documento que fala sobre a pessoa na frente dela.',
    'warn',
  ));

  // 5. Jargão em inglês no texto que a pessoa lê. O prompt proíbe nominalmente.
  const camposDeProsa: Array<[string, string]> = [
    ['mensagem_final', String(relatorio?.mensagem_final ?? '')],
    ['perfil_comportamental.descricao', desc],
    ...comps.flatMap((c: any): Array<[string, string]> => [
      [`${c?.nome}.feedback`, String(c?.feedback ?? '')],
      ...(Array.isArray(c?.estudo_recomendado)
        ? c.estudo_recomendado.map((e: any, i: number): [string, string] => [`${c?.nome}.estudo[${i}].titulo`, String(e?.titulo ?? '')])
        : []),
    ]),
  ];
  const comJargao = camposDeProsa
    .map(([onde, txt]) => [onde, acharJargao(txt)] as const)
    .filter(([, js]) => js.length)
    .map(([onde, js]) => `${onde}: ${js.join(', ')}`);
  checks.push(checar(
    'jargao-ingles', 'estrutura', 'Sem jargão em inglês no texto que sai',
    comJargao,
    'Nenhum termo em inglês proibido no texto voltado à pessoa.',
    'Termo em inglês que o prompt proíbe apareceu no documento entregue.',
    'warn',
  ));

  return checks;
}

/** Consolida os checks num veredito. Um `fail` derruba; `warn` não. */
export function consolidarAuditoriaPdi(checks: PdiAuditCheck[], competenciasAuditadas: number): PdiAuditReport {
  const falhas = checks.filter((c) => c.status === 'fail');
  const avisos = checks.filter((c) => c.status === 'warn');
  const status: PdiAuditStatus = falhas.length ? 'fail' : avisos.length ? 'warn' : 'pass';
  const resumo = falhas.length
    ? `${falhas.length} falha(s): ${falhas.map((f) => f.titulo).join('; ')}`
    : avisos.length
      ? `${avisos.length} aviso(s): ${avisos.map((a) => a.titulo).join('; ')}`
      : 'Nenhum problema estrutural ou semântico encontrado.';
  return { status, checks, resumo, competenciasAuditadas };
}

// ── Camada 2: semântica (2ª IA, cross-família) ─────────────────────────────

/**
 * 🔴 RECALIBRADO EM 25/09/2026: a versão anterior reprovava 46 de 55 PDIs só
 * neste auditor. Ela não dizia o que é afirmação SOBRE A PESSOA nem quando um
 * achado é grave, e o modelo tratava como "sem lastro" (e como `fail`) a leitura
 * do perfil em tom de tendência (seção que existe para isso) e as ações do
 * sprint, que são prescrição copiada do blueprint. Com tudo em `fail`, o
 * veredito deixou de separar PDI bom de ruim. Os achados reais (DISC afirmado
 * como fato, detalhe inventado do cenário) continuam `fail`.
 */
export const PDI_AUDIT_SYSTEM = `Você é o AUDITOR de Planos de Desenvolvimento Individual da Vertho.

Você NÃO reescreve o PDI e NÃO dá nota à pessoa. Você audita o DOCUMENTO: o que ele
AFIRMA sobre a pessoa se sustenta na evidência que recebeu, ou é inventado?

═══ O QUE É AUDITADO ═══
Afirmações DESCRITIVAS sobre a pessoa: o que ela fez, faz, sente, pensa, consegue
ou não consegue, e os resultados que teve. Elas moram na análise por competência
(feedback, fez_bem, melhorar), no resumo, no acolhimento e na mensagem final.

═══ O QUE NÃO É ACHADO (não liste) ═══
- As AÇÕES do plano: sprint (foco, ação principal, ação de apoio, ritual, evidência
  esperada, checklist), dicas e estudos recomendados. São prescrição copiada do
  blueprint, não afirmação sobre a pessoa.
- A leitura do perfil comportamental em tom de TENDÊNCIA ("seu perfil sugere que
  você tende a…", "pessoas com esse perfil costumam…", "isso pode significar…").
  Essa seção existe para ler o perfil; o que se exige dela é a forma cautelosa.
- Estilo, tamanho e formatação: outra camada cuida disso.

═══ O QUE VOCÊ PROCURA ═══
1. sem_lastro: afirmação sobre a pessoa que não aparece na evidência fornecida.
2. generico: elogio ou crítica que caberia em qualquer pessoa ("boa comunicação").
3. desproporcao: recomendação que não corresponde ao tamanho do gap (N1 recebendo
   ajuste fino; N3 recebendo refundação).
4. contradicao: o texto diz uma coisa num lugar e o contrário noutro.

═══ GRAVIDADE (fail devolve o PDI para revisão humana) ═══
fail, SÓ quando entregar o documento como está faria a pessoa ler algo FALSO sobre si:
  - afirma como FATO um comportamento, dificuldade, sentimento ou histórico que a
    evidência não mostra;
  - inventa detalhe do cenário ou das respostas (atribui a ela o que ela não escreveu);
  - contradição que muda o que ela deve fazer.
warn, para todo o resto que vale apontar: extrapolação em tom cauteloso, imprecisão
  menor, frase genérica, desproporção leve.

═══ EXEMPLOS ═══
- fail (sem_lastro): "Você costuma aceitar tudo para não decepcionar a coordenação",
  quando a resposta só mostra que ela aceitou UMA demanda extra no cenário.
- fail (sem_lastro): "o pedido de um projeto novo", quando o cenário fala de um
  projeto já em andamento.
- warn (sem_lastro): "Talvez você deixe para pedir ajuda quando a situação já
  apertou", extrapolação cautelosa de uma resposta que não menciona apoio.
- warn (generico): "Você é uma profissional dedicada e comprometida."
- NÃO é achado: "Seu perfil indica que você tende a render mais com um método
  definido" (leitura do perfil em tom de tendência).
- NÃO é achado: sprint.acao_principal "Toda segunda-feira, antes da primeira aula,
  preencho uma lista com as tarefas da semana" (ação do plano).

═══ REGRAS ═══
- Cada achado cita o TRECHO literal e a competência. Achado sem trecho não conta.
- Ausência de evidência para uma afirmação DESCRITIVA sobre a pessoa É o achado.
- Se o documento está sólido, diga isso com "achados": [] e veredito "pass".
  Auditor que sempre acha algo não discrimina nada.

═══ SAÍDA (APENAS JSON) ═══
{
  "achados": [
    {"tipo": "sem_lastro|generico|desproporcao|contradicao",
     "competencia": "nome ou null se for do texto geral",
     "trecho": "citação literal do PDI",
     "porque": "1 frase objetiva",
     "gravidade": "fail|warn"}
  ],
  "veredito": "pass|warn|fail",
  "resumo": "1-2 frases"
}`;

export function promptAuditoriaPdi(relatorio: any, evidencia: string): { system: string; user: string } {
  return {
    system: PDI_AUDIT_SYSTEM,
    user: `═══ EVIDÊNCIA DISPONÍVEL (o que a avaliação produziu) ═══
${evidencia}

═══ PDI GERADO (auditar) ═══
${JSON.stringify(relatorio, null, 1).slice(0, 60000)}

Audite.`,
  };
}

/**
 * Converte a resposta do auditor em checks. Fail-loud: resposta que não parseia
 * NÃO vira "pass" — vira um check `fail` dizendo que a auditoria não rodou.
 * Auditoria ausente lida como aprovação é o modo de falha que este projeto já
 * pagou caro ("N ok, 0 erros" ≠ aprovado).
 */
export function parseAuditoriaPdi(bruto: any): PdiAuditCheck[] {
  if (!bruto || !Array.isArray(bruto?.achados)) {
    return [{
      id: 'semantica-indisponivel',
      categoria: 'semantica',
      titulo: 'A auditoria semântica não produziu resultado',
      status: 'fail',
      detalhe: 'O auditor não devolveu JSON utilizável. Isto NÃO é aprovação: é ausência de auditoria.',
      ocorrencias: [],
    }];
  }
  const porTipo = new Map<string, any[]>();
  for (const a of bruto.achados) {
    const t = String(a?.tipo || 'outro');
    porTipo.set(t, [...(porTipo.get(t) || []), a]);
  }
  const TITULOS: Record<string, string> = {
    sem_lastro: 'Afirmação sem lastro na evidência',
    generico: 'Análise genérica (caberia em qualquer pessoa)',
    desproporcao: 'Recomendação desproporcional ao gap',
    contradicao: 'Contradição interna no texto',
  };
  const checks: PdiAuditCheck[] = [];
  for (const [tipo, achados] of porTipo) {
    checks.push({
      id: `sem-${tipo}`,
      categoria: 'semantica',
      titulo: TITULOS[tipo] || `Achado: ${tipo}`,
      status: achados.some((a) => a?.gravidade === 'fail') ? 'fail' : 'warn',
      detalhe: String(bruto?.resumo || '').slice(0, 300),
      ocorrencias: achados.map((a) => `${a?.competencia || 'geral'}: "${String(a?.trecho || '').slice(0, 90)}…" — ${a?.porque || ''}`),
    });
  }
  return checks;
}
