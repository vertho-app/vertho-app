/**
 * Cenário B INTEGRADOR do Onboarding (R-21, 04/10/2026).
 *
 * O fechamento só serve o Cenário B que cobre TODAS as competências da trilha
 * (`escolherCenarioB`), e o lote da Fase 5 gera um B por célula (cargo x
 * competência). O Onboarding fecha nas 5 competências de uma vez, então nenhum B
 * por célula serve a ele: a pessoa chegava ao fim do programa e recebia 424
 * ("Cenário B não cadastrado para A + B + C..."). O integrador cadastrado à mão
 * existia só para Ibipeba (duas competências); para o Onboarding não havia quem o
 * escrevesse. Este módulo é esse escritor.
 *
 * O QUE É: UMA situação do dia a dia do cargo que exige as competências da trilha
 * ao mesmo tempo, com uma pergunta por competência. A pessoa responde numa conversa
 * só, e o scorer do fechamento pontua POR DESCRITOR a partir dela (ele já agrupa a
 * régua pela competência de cada descritor, como no integrador de duas competências
 * de Ibipeba): não há scorer novo.
 *
 * ONDE FICA: `banco_cenarios`, `tipo_cenario = 'cenario_b'`, o mesmo lugar e o mesmo
 * formato do B por célula, com estas diferenças deliberadas:
 *   - `competencia_id = null`. O índice único `uq_banco_cenarios_b_celula` (mig 261)
 *     é por (empresa, cargo, competencia_id) e NULL não colide: ancorar numa das 5
 *     competências esbarraria no B dela (23505) e faria a reavaliação, que indexa o
 *     B por competência_id, servir o integrador no lugar do B simples.
 *   - `alternativas.competencias_integradas` declara a cobertura (é o que
 *     `escolherCenarioB` lê) e `alternativas.cobertura_exata = true` limita o B ao
 *     conjunto IDÊNTICO de competências: ele não serve uma trilha de uma competência
 *     só e não conta como B das células que cobre.
 *   - tem uma pergunta por competência (`p1..pN`, N = nº de competências), com o nome
 *     da competência em `alternativas.competencia_por_pergunta`. Só `p1..p4` existem
 *     como COLUNAS; as demais vivem em `alternativas`, que é o que a rota lê
 *     (`perguntasDoCenarioB`).
 *
 * O PROMPT é novo: o do B por célula pede UM caso, UMA competência e quatro
 * perguntas fixas (situação, ação, raciocínio, autossensibilidade), e a regra dele é
 * ser estruturalmente diferente do cenário A DA MESMA competência. Aqui a regra é
 * outra: o caso é único, todas as competências entram nele, cada pergunta ancora em
 * uma. As regras que valem para os dois (dilema real, poder discriminante, contexto
 * do cargo, anonimização) vêm dos mesmos blocos de `lib/ia3-cenarios.ts`.
 *
 * Sem auditor de 2ª IA (fora do pedido desta onda): o `cenarios_b_check` audita UMA
 * competência e descontaria um integrador por escopo (docs/FMEA-PIPELINE.md F-C14).
 * A trava é a validação em código (`normalizarCenarioBIntegrador`) e a leitura do
 * texto pelo admin antes da semana abrir.
 *
 * Headless: sem gate de sessão. A action `'use server'` aplica o gate e delega.
 */
import { tenantDb } from '@/lib/tenant-db';
import { callAI, type AIConfig } from '@/actions/ai-client';
import { extractJSON } from '@/actions/utils';
import { getModelForTask } from '@/lib/ai-tasks';
import { lerTudoPaginado } from '@/lib/paginacao';
import { chaveMapeamento } from '@/lib/mapeamento-competencias';
import { normalizarComp } from '@/lib/workshop-competencias';
import { carregarConfigsEfetivasEmLote } from '@/lib/turmas';
import { buscarDescritoresDaCompetencia } from '@/lib/matriz-por-cargo';
import { getProgramaConfigByModo, normalizarModoPrograma } from '@/lib/season-engine/programa-config';
import { competenciasDoOnboardingDoCargo } from '@/lib/season-engine/onboarding-competencias';
import { aReferenciaDaCelula, escolherCenarioB, perguntasDoCenarioB } from '@/lib/season-engine/cenario-b';
import { sobreposicaoDeTexto } from '@/lib/cenarios-b';
import {
  REGRA_ANONIMIZACAO_INSTITUICOES,
  blocoEmpresaIA3,
  blocoCargoIA3,
  blocoContextoOrganizacionalIA3,
  blocoValoresIA3,
  blocoPerfilIdealIA3,
  blocoPppIA3,
  montarContextoIA3,
} from '@/lib/ia3-cenarios';

// ── Constantes ──────────────────────────────────────────────────────────────

/** Mesma temperatura do B por célula (`TEMP` de actions/fase5/_shared). */
const TEMPERATURA = 0.4;
/** A saída são ~3 mil tokens; o teto folgado evita truncar o JSON (que custaria o retry). */
export const INTEGRADOR_MAX_TOKENS = 16_000;
/** Geração + uma correção. Mais que isso é pagar três vezes pelo mesmo prompt. */
const MAX_TENTATIVAS = 2;
const PALAVRAS_MIN = 60;
const PALAVRAS_MAX = 450;
/** Acima disso o caso é tão parecido com um cenário do Mapeamento que mede a memória, não a competência. */
const SOBREPOSICAO_MAX = 0.6;
const COLUNAS_DESCRITOR = 'cod_desc, nome_curto, descritor_completo, n1_gap, n2_desenvolvimento, n3_meta, n4_referencia';

// ── Prompt ──────────────────────────────────────────────────────────────────

export const SYSTEM_CENARIO_B_INTEGRADOR = `Você é um especialista em avaliação de competências comportamentais e em desenho de instrumentos diagnósticos da Vertho.

═══ TAREFA ═══
Criar o CENÁRIO B INTEGRADOR do fechamento do Onboarding.
O Onboarding trabalha várias competências do cargo em sequência, e a avaliação final mede todas de uma vez, numa conversa só. Por isso o cenário final não é um caso por competência: é UMA situação do dia a dia do cargo que exige todas as competências da lista ao mesmo tempo, seguida de perguntas que dão evidência de CADA competência.
O texto que você escrever é lido pela pessoa avaliada. A resposta dela alimenta a nota final de cada descritor, em triangulação com as evidências das semanas de conteúdo.

═══ REGRAS INEGOCIÁVEIS ═══

1. UMA SITUAÇÃO SÓ
   Um lugar, um momento, um problema central. No máximo 2 pessoas com nome, as que criam a tensão; as demais aparecem pelo papel (a coordenadora, um cliente, a equipe). Nomes brasileiros, sem teatralidade. Lendo só o caso, o problema central tem que ficar claro em poucos segundos.

2. TODAS AS COMPETÊNCIAS ENTRAM NO CASO
   Cada competência da lista precisa ser exigida pelo que acontece no caso, como parte do que a pessoa tem de perceber, decidir ou fazer. Competência que só aparece no enunciado da pergunta, sem sustentação no caso, falha.
   Não monte um circuito de mini-cenários colados. As competências se encontram e se tensionam na mesma situação.

3. UMA PERGUNTA POR COMPETÊNCIA, NA ORDEM RECEBIDA
   Exatamente uma pergunta por competência, na ordem da lista. Cada pergunta:
   - ancora em UMA competência e pede o que dá evidência dela: o que a pessoa faria, decidiria ou diria, e por quê;
   - se entende sozinha, lida depois do caso, sem depender de outra pergunta nem de resposta anterior;
   - pede escolha e justificativa, nunca a definição de um conceito;
   - não entrega a resposta no próprio enunciado.
   O campo "competencia" de cada pergunta repete o nome da competência EXATAMENTE como veio na lista.

4. DILEMA REAL
   O caso tem uma escolha difícil, com custo nos dois lados. Se dá para responder bem sem escolher nada, o cenário falhou. Resposta genérica, que serviria para qualquer situação, tem que falhar em todas as perguntas.

5. PODER DISCRIMINANTE EM CADA COMPETÊNCIA
   Use a régua N1 a N4 de cada competência para decidir o que a pergunta provoca. Em cada pergunta, quem está em N1 e quem está em N3 precisam responder de forma visivelmente diferente.

6. QUEM ESTÁ ENTRANDO
   O Onboarding atende quem começa no cargo ou na função. A situação precisa ser plausível para essa pessoa, sem exigir autoridade, histórico ou repertório que o cargo ainda não dá. O cenário continua separando N1 de N4, mas ninguém precisa estar em N4 para ir bem.

7. CONTEXTO DO CARGO
   Situe o caso nas entregas, decisões e tensões do CONTEXTO ORGANIZACIONAL do cargo, quando houver. Não invente atribuições nem autoridade além delas.

8. DILEMA ÉTICO EMBUTIDO
   Uma tensão ética sutil e natural, ligada a um dos VALORES ORGANIZACIONAIS, sem tom didático.

9. OUTRO CASO, NÃO UMA REPETIÇÃO DO MAPEAMENTO
   A pessoa já respondeu cenários na etapa de Mapeamento (listados abaixo, quando houver). O caso final tem outro gatilho, outro ambiente e outra estrutura.

10. ${REGRA_ANONIMIZACAO_INSTITUICOES}

11. PONTUAÇÃO
   Não use travessão, nem o longo nem o médio, em nenhum texto que escrever. Use vírgula, dois-pontos ou ponto final.

═══ FORMATO JSON (APENAS JSON, sem markdown) ═══

{
  "titulo": "título curto do caso",
  "descricao": "texto do caso (150 a 250 palavras)",
  "perguntas": [
    {
      "competencia": "nome da competência, exatamente como na lista",
      "pergunta": "texto da pergunta",
      "objetivo_diagnostico": "o que esta pergunta quer revelar nesta competência (1 frase)"
    }
  ],
  "por_que_integra": "como as competências se encontram neste caso (1 a 2 frases)",
  "tradeoff_testado": "qual escolha difícil está no centro",
  "armadilha_de_resposta_generica": "por que resposta vaga não resolve",
  "stakeholders_centrais": ["Nome1", "Nome2"],
  "referencia_avaliacao": {
    "nivel_1": "como responderia N1",
    "nivel_2": "como responderia N2",
    "nivel_3": "como responderia N3",
    "nivel_4": "como responderia N4"
  },
  "dilema_etico_embutido": {
    "valor_testado": "valor em tensão",
    "caminho_facil": "solução mais fácil",
    "caminho_etico": "solução alinhada ao valor"
  },
  "confianca_cenario": 0.85,
  "riscos_do_cenario": ["risco 1", "risco 2"]
}`;

/** Uma competência da trilha com o que o prompt precisa dela. */
export interface CompetenciaDoIntegrador {
  nome: string;
  cod_comp?: string | null;
  descricao?: string | null;
  descritores: any[];
}

/** O cenário A (de rede) que a pessoa já respondeu no Mapeamento, por competência. */
export interface CenarioADoMapeamento {
  competencia: string;
  titulo?: string | null;
  descricao?: string | null;
}

export interface ContextoIntegrador {
  empresa: { nome: string; segmento?: string | null };
  cargoNome: string;
  cargoDetalhe: any;
  valores: string[];
  contextoPPP: string;
  gabCIS: any;
  competencias: CompetenciaDoIntegrador[];
  cenariosA: CenarioADoMapeamento[];
}

/** Bloco de UMA competência: nome, descrição e régua N1 a N4 de cada descritor. Sem travessão, nem como separador. */
export function blocoCompetenciaDoIntegrador(comp: CompetenciaDoIntegrador, posicao: number): string {
  let bloco = `Competência ${posicao}: ${comp.nome}`;
  if (comp.cod_comp) bloco += `\nCódigo: ${comp.cod_comp}`;
  if (comp.descricao) bloco += `\nDescrição: ${comp.descricao}`;
  bloco += `\nDescritores (${comp.descritores.length}):`;
  for (const d of comp.descritores) {
    bloco += `\n  - ${d.nome_curto || d.descritor_completo || d.cod_desc || ''}`;
    if (d.n1_gap) bloco += `\n    N1 (lacuna): ${d.n1_gap}`;
    if (d.n2_desenvolvimento) bloco += `\n    N2 (em desenvolvimento): ${d.n2_desenvolvimento}`;
    if (d.n3_meta) bloco += `\n    N3 (meta): ${d.n3_meta}`;
    if (d.n4_referencia) bloco += `\n    N4 (referência): ${d.n4_referencia}`;
  }
  return bloco;
}

export function buildCenarioBIntegradorPrompts(ctx: ContextoIntegrador, feedbackExtra = ''): { system: string; user: string } {
  const n = ctx.competencias.length;
  const blocos: string[] = [blocoEmpresaIA3(ctx.empresa), blocoCargoIA3(ctx.cargoNome)];
  const organizacional = blocoContextoOrganizacionalIA3(ctx.cargoDetalhe || {});
  if (organizacional) blocos.push(organizacional);
  blocos.push(`═══ COMPETÊNCIAS DA TRILHA (${n}), NA ORDEM EM QUE AS PERGUNTAS DEVEM VIR ═══\n\n`
    + ctx.competencias.map((c, i) => blocoCompetenciaDoIntegrador(c, i + 1)).join('\n\n'));
  blocos.push(blocoValoresIA3(ctx.valores || []));
  const perfil = blocoPerfilIdealIA3(ctx.gabCIS);
  if (perfil) blocos.push(perfil);
  const ppp = blocoPppIA3(ctx.contextoPPP || '');
  if (ppp) blocos.push(ppp);
  if (ctx.cenariosA.length) {
    blocos.push('═══ CENÁRIOS DO MAPEAMENTO (A PESSOA JÁ RESPONDEU; NÃO REPETIR O GATILHO NEM A ESTRUTURA) ═══\n\n'
      + ctx.cenariosA.map((a) => `Competência: ${a.competencia}\nTítulo: ${a.titulo || ''}\nDescrição: ${String(a.descricao || '').slice(0, 700)}`).join('\n\n'));
  }
  blocos.push(`═══ INSTRUÇÃO ═══
Escreva UM caso e ${n} perguntas, uma por competência, na ordem da lista acima.
1. Decida a tensão central do caso e de que modo ela exige cada uma das ${n} competências.
2. Escreva cada pergunta a partir da régua: o que separa N1 de N3 naquela competência.
3. Confira: o caso se sustenta sem as perguntas? Todas as competências aparecem nele? Uma resposta genérica falharia nas ${n} perguntas?
4. ANONIMIZE: o nome da empresa, escola, rede ou cidade acima é só para CONTEXTO. No texto do caso use nomes FICTÍCIOS de instituições, nunca os reais.`);
  if (feedbackExtra) blocos.push(`═══ CORREÇÃO NECESSÁRIA (REFAÇA CORRIGINDO ESTES PONTOS) ═══\n${feedbackExtra}`);
  return { system: SYSTEM_CENARIO_B_INTEGRADOR, user: blocos.join('\n\n') };
}

// ── Validação e formato gravado (puros) ─────────────────────────────────────

export interface PerguntaDoIntegrador {
  /** Nome canônico da competência (o da lista que a trilha usa). */
  competencia: string;
  pergunta: string;
  objetivo_diagnostico: string | null;
}

export interface CenarioBIntegradorNormalizado {
  titulo: string;
  descricao: string;
  perguntas: PerguntaDoIntegrador[];
  bruto: any;
}

const contaPalavras = (t: string) => t.trim().split(/\s+/).filter(Boolean).length;

/**
 * Confere a resposta do modelo e a põe na forma que a escolha e o fechamento leem.
 *
 * O que NÃO pode passar (cada item é um defeito que o B por célula também teria, e
 * que num integrador de 5 competências custa mais caro): competência da trilha sem
 * pergunta (o scorer pontuaria os descritores dela sem evidência nenhuma), pergunta
 * de competência que a trilha não tem, pergunta demais (a pessoa responde tudo por
 * escrito antes da arguição) e um caso calcado num cenário do Mapeamento. As perguntas
 * saem na ORDEM das competências da trilha, qualquer que seja a ordem do modelo, com o
 * nome canônico (o da lista) no lugar do que ele escreveu.
 */
export function normalizarCenarioBIntegrador(
  dados: any,
  competencias: string[],
  cenariosA: CenarioADoMapeamento[] = [],
): { ok: true; cenario: CenarioBIntegradorNormalizado } | { ok: false; erros: string[] } {
  const erros: string[] = [];
  if (!dados || typeof dados !== 'object') return { ok: false, erros: ['A resposta não trouxe um JSON de cenário'] };

  const titulo = typeof dados.titulo === 'string' ? dados.titulo.trim() : '';
  const descricao = typeof dados.descricao === 'string' ? dados.descricao.trim() : '';
  if (!titulo) erros.push('Cenário sem título');
  if (!descricao) erros.push('Cenário sem descrição');
  else {
    const palavras = contaPalavras(descricao);
    if (palavras < PALAVRAS_MIN) erros.push(`Descrição curta demais (${palavras} palavras; o caso precisa de pelo menos ${PALAVRAS_MIN})`);
    if (palavras > PALAVRAS_MAX) erros.push(`Descrição longa demais (${palavras} palavras; no máximo ${PALAVRAS_MAX})`);
  }

  const canonica = new Map(competencias.map((c) => [normalizarComp(c), c]));
  const lista: PerguntaDoIntegrador[] = [];
  if (!Array.isArray(dados.perguntas) || dados.perguntas.length === 0) {
    erros.push('Faltam as perguntas (lista "perguntas" vazia ou ausente)');
  } else {
    dados.perguntas.forEach((p: any, i: number) => {
      const texto = typeof p?.pergunta === 'string' ? p.pergunta.trim() : '';
      const comp = canonica.get(normalizarComp(p?.competencia));
      if (!texto) { erros.push(`A pergunta ${i + 1} está vazia`); return; }
      if (!comp) { erros.push(`A pergunta ${i + 1} cita a competência "${String(p?.competencia ?? '')}", que não é uma das competências da trilha`); return; }
      lista.push({
        competencia: comp,
        pergunta: texto,
        objetivo_diagnostico: typeof p?.objetivo_diagnostico === 'string' && p.objetivo_diagnostico.trim() ? p.objetivo_diagnostico.trim() : null,
      });
    });
    const semPergunta = competencias.filter((c) => !lista.some((p) => p.competencia === c));
    if (semPergunta.length) erros.push(`Faltam perguntas para: ${semPergunta.join(', ')}. Cada competência precisa de uma pergunta`);
    if (dados.perguntas.length > competencias.length + 1) {
      erros.push(`Perguntas demais (${dados.perguntas.length}): uma por competência, no máximo ${competencias.length + 1}`);
    }
  }

  if (typeof dados.confianca_cenario === 'number' && (dados.confianca_cenario < 0 || dados.confianca_cenario > 1)) erros.push('confianca fora de 0-1');
  if (Array.isArray(dados.stakeholders_centrais) && dados.stakeholders_centrais.length > 2) erros.push('Max 2 stakeholders');

  if (descricao) {
    for (const a of cenariosA) {
      const sobreposicao = sobreposicaoDeTexto(descricao, String(a.descricao || ''));
      if (sobreposicao > SOBREPOSICAO_MAX) {
        erros.push(`Semelhança excessiva com o cenário do Mapeamento de "${a.competencia}" (${Math.round(sobreposicao * 100)}% de palavras em comum)`);
      }
    }
  }

  if (erros.length) return { ok: false, erros };

  // Ordem da trilha; dentro da mesma competência, a ordem do modelo (sort estável).
  const ordem = new Map(competencias.map((c, i) => [c, i]));
  const perguntas = [...lista].sort((a, b) => (ordem.get(a.competencia) ?? 0) - (ordem.get(b.competencia) ?? 0));
  return { ok: true, cenario: { titulo, descricao, perguntas, bruto: dados } };
}

/**
 * A linha de `banco_cenarios` do integrador. `competencia_id` nulo e
 * `cobertura_exata` são de propósito (ver o cabeçalho). As colunas `p1..p4` levam as
 * quatro primeiras perguntas, como no B por célula; a pergunta 5 em diante só existe
 * em `alternativas`.
 */
export function montarDadosCenarioBIntegrador(cargo: string, competencias: string[], cenario: CenarioBIntegradorNormalizado) {
  const { perguntas, bruto } = cenario;
  const alt: Record<string, any> = {};
  const porPergunta: Record<string, string> = {};
  const objetivos: Record<string, string> = {};
  perguntas.forEach((p, i) => {
    const chave = `p${i + 1}`;
    alt[chave] = p.pergunta;
    porPergunta[chave] = p.competencia;
    if (p.objetivo_diagnostico) objetivos[chave] = p.objetivo_diagnostico;
  });
  const colunas: Record<string, string> = {};
  perguntas.slice(0, 4).forEach((p, i) => { colunas[`p${i + 1}`] = p.pergunta; });
  return {
    cargo,
    competencia_id: null,
    titulo: cenario.titulo,
    descricao: cenario.descricao,
    ...colunas,
    alternativas: {
      ...alt,
      competencias_integradas: competencias,
      cobertura_exata: true,
      competencia_por_pergunta: porPergunta,
      faceta_avaliada: competencias.join(' + '),
      por_que_integra: bruto.por_que_integra || null,
      tradeoff_testado: bruto.tradeoff_testado || null,
      armadilha_de_resposta_generica: bruto.armadilha_de_resposta_generica || null,
      objetivo_diagnostico: objetivos,
      referencia_avaliacao: bruto.referencia_avaliacao || null,
      dilema_etico: bruto.dilema_etico_embutido || null,
      confianca_cenario: typeof bruto.confianca_cenario === 'number' ? Math.max(0, Math.min(1, bruto.confianca_cenario)) : null,
      riscos_do_cenario: Array.isArray(bruto.riscos_do_cenario) ? bruto.riscos_do_cenario : [],
      origem: 'cenarios_b_integrador',
    },
    tipo_cenario: 'cenario_b',
  };
}

// ── Contexto (leituras) ─────────────────────────────────────────────────────

type ResultadoContexto =
  | { ok: true; ctx: ContextoIntegrador }
  | { ok: false; motivo: 'competencia-sem-matriz' | 'competencia-sem-descritores' | 'contexto' | 'leitura'; erro: string };

/**
 * O contexto do integrador: o do B por célula (empresa, cargo, valores, perfil, PPP
 * de rede), lido UMA vez, mais a régua de cada competência e o cenário A de rede que
 * a pessoa já respondeu em cada uma. Falha ALTO (régua da construção): competência
 * da trilha que não está na matriz do cargo, ou sem descritor, é erro com o nome, e
 * não um prompt com buraco.
 */
export async function carregarContextoIntegrador(
  sbRaw: any, empresaId: string, cargo: string, competencias: string[],
): Promise<ResultadoContexto> {
  const tdb = tenantDb(empresaId);

  const linhas = await lerTudoPaginado((de, ate) => tdb.from('competencias')
    .select('id, nome, cod_comp, cod_desc, pilar, descricao, cargo')
    .eq('cargo', cargo).order('id').range(de, ate));
  if (linhas.error) return { ok: false, motivo: 'leitura', erro: `Falha ao ler as competências do cargo "${cargo}": ${linhas.error}` };

  const principais: any[] = [];
  const ausentes: string[] = [];
  for (const nome of competencias) {
    const doNome = linhas.data.filter((l: any) => chaveMapeamento(l.nome) === chaveMapeamento(nome));
    // A linha da competência (sem descritor) leva a descrição; na falta dela, qualquer linha do mesmo nome.
    const principal = doNome.find((l: any) => !l.cod_desc) ?? doNome[0];
    if (principal) principais.push(principal); else ausentes.push(nome);
  }
  if (ausentes.length) {
    return { ok: false, motivo: 'competencia-sem-matriz', erro: `O cargo "${cargo}" não tem na matriz de competências: ${ausentes.join(', ')}. O integrador não pode ser escrito sem a régua delas` };
  }

  const base = await montarContextoIA3(sbRaw, empresaId, cargo, principais[0].id, null);
  if ('error' in base) return { ok: false, motivo: 'contexto', erro: base.error };
  const { empresa, valores, contextoPPP, cargoDetalhe, gabCIS } = base.ctx;

  const comps: CompetenciaDoIntegrador[] = [];
  for (let i = 0; i < principais.length; i++) {
    const p = principais[i];
    let descritores: any[];
    if (i === 0) descritores = base.ctx.descritores;
    else {
      try {
        descritores = await buscarDescritoresDaCompetencia(tdb, { cod_comp: p.cod_comp, cargo: p.cargo }, COLUNAS_DESCRITOR);
      } catch (e: any) {
        return { ok: false, motivo: 'leitura', erro: e?.message || String(e) };
      }
    }
    if (!descritores.length) {
      return { ok: false, motivo: 'competencia-sem-descritores', erro: `A competência "${competencias[i]}" do cargo "${cargo}" não tem descritores na matriz` };
    }
    comps.push({ nome: competencias[i], cod_comp: p.cod_comp, descricao: p.descricao, descritores });
  }

  // O A de rede de cada competência (o mesmo que o B por célula usa como referência).
  const { data: cenA, error: errA } = await tdb.from('banco_cenarios')
    .select('id, titulo, descricao, cargo, competencia_id, ppp_escola_id, created_at')
    .eq('cargo', cargo)
    .in('competencia_id', principais.map((p) => p.id))
    .or('tipo_cenario.is.null,tipo_cenario.neq.cenario_b');
  if (errA) return { ok: false, motivo: 'leitura', erro: `Falha ao ler os cenários A do cargo "${cargo}": ${errA.message}` };
  const cenariosA: CenarioADoMapeamento[] = [];
  principais.forEach((p, i) => {
    const ref = aReferenciaDaCelula<any>((cenA || []).filter((a: any) => a.competencia_id === p.id));
    if (ref) cenariosA.push({ competencia: competencias[i], titulo: ref.titulo, descricao: ref.descricao });
  });

  return { ok: true, ctx: { empresa, cargoNome: cargo, cargoDetalhe, valores, contextoPPP, gabCIS, competencias: comps, cenariosA } };
}

// ── Quem precisa de um integrador ───────────────────────────────────────────

export interface AlvoIntegrador {
  cargo: string;
  /** As competências do Onboarding deste cargo, na ordem da trilha. */
  competencias: string[];
  /** Pessoas em Onboarding que vão fechar nestas competências. */
  pessoas: number;
  /** Já existe o B que o fechamento delas escolheria (a mesma régua do fechamento). */
  jaTem: boolean;
  cenarioId: string | null;
}

export type ListaAlvosIntegrador =
  | { ok: true; alvos: AlvoIntegrador[]; avisos: string[]; pessoasOnboarding: number }
  | { ok: false; erro: string };

/**
 * Os (cargo x competências) que o Onboarding da empresa vai fechar, e se cada um já
 * tem integrador. "Em Onboarding" é o que a GERAÇÃO resolveria para a pessoa (config
 * efetiva: participação, turma, override do colaborador, empresa), e as competências
 * são as da geração (`competenciasDoOnboardingDoCargo`). Cargo cujas competências a
 * geração recusaria vira AVISO com o motivo, e não some da lista.
 */
export async function listarAlvosDoIntegrador(sbRaw: any, empresaId: string): Promise<ListaAlvosIntegrador> {
  const tdb = tenantDb(empresaId);
  const { data: empresa, error: errEmp } = await sbRaw.from('empresas').select('sys_config').eq('id', empresaId).maybeSingle();
  if (errEmp) return { ok: false, erro: `Falha ao ler a empresa: ${errEmp.message}` };
  if (!empresa) return { ok: false, erro: 'Empresa não encontrada' };

  const colabs = await lerTudoPaginado((de, ate) => tdb.from('colaboradores')
    .select('id, cargo, programa_modo').order('id').range(de, ate));
  if (colabs.error) return { ok: false, erro: `Falha ao ler os colaboradores: ${colabs.error}` };

  let configs: Map<string, any>;
  try {
    configs = await carregarConfigsEfetivasEmLote(sbRaw, empresaId, colabs.data, empresa.sys_config || {});
  } catch (e: any) {
    return { ok: false, erro: e?.message || String(e) };
  }

  const n = getProgramaConfigByModo('onboarding').numCompetencias || 5;
  const grupos = new Map<string, { cargo: string; cfg: any; pessoas: number }>();
  let pessoasOnboarding = 0;
  let semCargo = 0;
  for (const c of colabs.data) {
    const cfg = configs.get(c.id) || {};
    if (normalizarModoPrograma(cfg.programa_modo) !== 'onboarding') continue;
    pessoasOnboarding++;
    const cargo = String(c.cargo || '').trim();
    if (!cargo) { semCargo++; continue; }
    const override = (Array.isArray(cfg.competencias_onboarding) ? cfg.competencias_onboarding : []).map(chaveMapeamento).join('|');
    const chave = `${chaveMapeamento(cargo)}#${override}`;
    const atual = grupos.get(chave);
    if (atual) atual.pessoas++; else grupos.set(chave, { cargo, cfg, pessoas: 1 });
  }

  const avisos: string[] = [];
  if (semCargo) avisos.push(`${semCargo} pessoa(s) em Onboarding sem cargo: o Cenário B é por cargo, então elas não entram na lista`);

  const porConjunto = new Map<string, AlvoIntegrador>();
  for (const g of grupos.values()) {
    const r = await competenciasDoOnboardingDoCargo(tdb, g.cargo, g.cfg, n);
    if ('error' in r) { avisos.push(`Cargo "${g.cargo}" (${g.pessoas} pessoa(s)): ${r.error}`); continue; }
    const chave = `${chaveMapeamento(g.cargo)}#${r.competencias.map(chaveMapeamento).sort().join('|')}`;
    const atual = porConjunto.get(chave);
    if (atual) { atual.pessoas += g.pessoas; continue; }
    porConjunto.set(chave, { cargo: g.cargo, competencias: r.competencias, pessoas: g.pessoas, jaTem: false, cenarioId: null });
  }

  const alvos = [...porConjunto.values()];
  for (const a of alvos) {
    try {
      // A MESMA escolha do fechamento: "tem integrador" é "o fechamento desta trilha o encontraria".
      const { cenario } = await escolherCenarioB(sbRaw, empresaId, a.cargo, a.competencias, { registrar: false });
      a.jaTem = !!cenario;
      a.cenarioId = cenario?.id ?? null;
    } catch (e: any) {
      return { ok: false, erro: e?.message || String(e) };
    }
  }
  return { ok: true, alvos, avisos, pessoasOnboarding };
}

// ── Geração ─────────────────────────────────────────────────────────────────

export type ResultadoIntegrador =
  | { ok: true; status: 'gerado'; cenarioId: string; titulo: string; perguntas: number; tentativas: number }
  | { ok: true; status: 'ja-existe'; cenarioId: string; titulo: string | null; perguntas: number; tentativas: 0 }
  | { ok: false; motivo: 'entrada' | 'leitura' | 'competencia-sem-matriz' | 'competencia-sem-descritores' | 'contexto' | 'ia' | 'validacao' | 'gravacao'; erro: string; erros?: string[]; tentativas?: number };

/**
 * Gera e grava o integrador de UM (cargo x competências). Idempotente: se o
 * fechamento destas competências já acharia um B, devolve `ja-existe` sem chamar a
 * IA. Nada é gravado enquanto a resposta não passar na validação, e a validação
 * reprovada tem UMA nova tentativa, com os erros no prompt (como o B por célula).
 * Todo caminho de falha devolve o motivo e o texto: nada some calado.
 */
export async function gerarCenarioBIntegradorCore(sbRaw: any, args: {
  empresaId: string;
  cargo: string;
  competencias: string[];
  aiConfig?: AIConfig;
  /**
   * Refaz um integrador que já existe: o texto novo SUBSTITUI o antigo, na mesma
   * linha, e só depois de passar na validação. Trilha que já abriu o fechamento
   * guarda o cenário que viu no próprio slot, então não muda.
   */
  substituir?: boolean;
}): Promise<ResultadoIntegrador> {
  const { empresaId } = args;
  const cargo = String(args.cargo || '').trim();
  const competencias = [...new Map((args.competencias || []).map((c) => [normalizarComp(c), String(c).trim()] as const).filter(([k]) => k)).values()];
  if (!empresaId || !cargo) return { ok: false, motivo: 'entrada', erro: 'Informe a empresa e o cargo' };
  if (competencias.length < 2) return { ok: false, motivo: 'entrada', erro: 'O integrador cobre duas ou mais competências' };
  const tdb = tenantDb(empresaId);

  const jaExiste = async (): Promise<ResultadoIntegrador | null> => {
    try {
      const { cenario } = await escolherCenarioB(sbRaw, empresaId, cargo, competencias, { registrar: false });
      if (!cenario) return null;
      return { ok: true, status: 'ja-existe', cenarioId: cenario.id, titulo: cenario.titulo, perguntas: perguntasDoCenarioB(cenario.alternativas).length, tentativas: 0 };
    } catch (e: any) {
      return { ok: false, motivo: 'leitura', erro: e?.message || String(e) };
    }
  };
  const existente = await jaExiste();
  if (existente && !args.substituir) return existente;
  // `in`, e não `.ok`: com `strict: false` a união por booleano não estreita.
  if (args.substituir && !(existente && !('erro' in existente))) {
    return { ok: false, motivo: 'entrada', erro: existente && 'erro' in existente ? existente.erro : 'Não há integrador para substituir neste cargo e conjunto de competências' };
  }

  const contexto = await carregarContextoIntegrador(sbRaw, empresaId, cargo, competencias);
  if ('erro' in contexto) return { ok: false, motivo: contexto.motivo, erro: contexto.erro };

  const aiConfig: AIConfig = args.aiConfig?.model
    ? args.aiConfig
    : { ...(args.aiConfig || {}), model: await getModelForTask(empresaId, 'cenarios_b_integrador') };

  let feedback = '';
  let ultimosErros: string[] = [];
  let normalizado: CenarioBIntegradorNormalizado | null = null;
  let tentativas = 0;
  for (let t = 1; t <= MAX_TENTATIVAS && !normalizado; t++) {
    tentativas = t;
    const { system, user } = buildCenarioBIntegradorPrompts(contexto.ctx, feedback);
    let resposta: string;
    try {
      resposta = await callAI(system, user, aiConfig, INTEGRADOR_MAX_TOKENS, {
        temperature: TEMPERATURA, taskKey: 'cenarios_b_integrador', empresaId,
      });
    } catch (e: any) {
      return { ok: false, motivo: 'ia', erro: `A IA não respondeu: ${e?.message || String(e)}`, tentativas };
    }
    const dados = await extractJSON(resposta);
    const r = normalizarCenarioBIntegrador(dados, competencias, contexto.ctx.cenariosA);
    if ('erros' in r) {
      ultimosErros = r.erros;
      feedback = r.erros.join('\n');
    } else normalizado = r.cenario;
  }
  if (!normalizado) {
    return { ok: false, motivo: 'validacao', erro: `O cenário gerado não passou na validação: ${ultimosErros.join('; ')}`, erros: ultimosErros, tentativas };
  }

  const linha = montarDadosCenarioBIntegrador(cargo, competencias, normalizado);

  if (args.substituir && existente && !('erro' in existente)) {
    // `p1..p4` e `alternativas` são sobrescritos por inteiro; sobra só o que o
    // integrador novo não preenche (ex.: a coluna p4 de um integrador com 3 perguntas).
    const colunas = { p1: null, p2: null, p3: null, p4: null, ...linha };
    const { error: errUp } = await tdb.from('banco_cenarios')
      .update(colunas).eq('id', existente.cenarioId).eq('tipo_cenario', 'cenario_b');
    if (errUp) return { ok: false, motivo: 'gravacao', erro: `Não foi possível substituir o cenário: ${errUp.message}`, tentativas };
    return { ok: true, status: 'gerado', cenarioId: existente.cenarioId, titulo: normalizado.titulo, perguntas: normalizado.perguntas.length, tentativas };
  }

  // Outro disparo pode ter gravado o integrador enquanto este gerava (não há índice
  // único para ele: `competencia_id` é nulo). Relê antes de gravar, e descarta o gerado.
  const depois = await jaExiste();
  if (depois) return depois;

  const { data, error } = await tdb.from('banco_cenarios')
    .insert(linha)
    .select('id, titulo').single();
  if (error || !data) return { ok: false, motivo: 'gravacao', erro: `Não foi possível gravar o cenário: ${error?.message || 'sem retorno'}`, tentativas };
  return { ok: true, status: 'gerado', cenarioId: data.id, titulo: data.titulo ?? normalizado.titulo, perguntas: normalizado.perguntas.length, tentativas };
}
