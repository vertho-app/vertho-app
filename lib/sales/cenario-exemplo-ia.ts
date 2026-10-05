// Geração do exemplo de cenário da proposta, pelo caminho do Banco de Cenários (IA3).
//
// NÃO é um gerador novo: usa os prompts de `lib/ia3-cenarios.ts` SEM alterá-los (o golden
// em tests/unit/ia3/prompt-golden.test.ts prende o texto), o modelo da task `ia3_cenarios`
// e a auditoria por outra família da task `ia3_check` (gerador e auditor de famílias
// diferentes, como no pipeline). O que muda é só o ENTORNO: não há tenant, então não há
// `cargos_empresa`, PPP nem valores de uma empresa. A ficha do cargo vem colada pela
// pessoa (ou não vem: a IA parte do nome do cargo e do segmento, como faz para qualquer
// cargo sem ficha), e nada é gravado em `banco_cenarios`.
//
// UMA rodada por chamada (gera + audita, ~1 a 2 min). Quem repete até a nota mínima é a
// tela, passando o feedback do auditor: o `maxDuration` da rota é de 300 s, e três
// rodadas num pedido só passariam disso. O servidor fica sem estado.
//
// Reaproveita as tasks `ia3_cenarios` e `ia3_check` (sem `empresaId`, então o custo cai em
// "Plataforma Vertho (sem tenant)"): criar task nova exigiria registrá-la em seis lugares de
// `lib/ai-tasks.ts` e no par Dual-IA, para separar centavos. O custo entra na conta da IA3,
// e isso está dito aqui para quem for ler a média por cenário.
import { callAI } from '@/actions/ai-client';
import { extractJSON } from '@/actions/utils';
import {
  buildCheckIA3SystemPrompt,
  buildIA3SystemPrompt,
  buildIA3UserPrompt,
  montarAlternativasIA3,
  montarFeedbackRegeneracaoIA3,
  normalizarResultadoCheckIA3,
  validarRespostaIA3,
} from '@/lib/ia3-cenarios';
import { linhasDaVariante } from '@/lib/simuladores/lideranca/matriz-global';
import {
  NOTA_MINIMA_EXEMPLO,
  normalizarExemploGravado,
  rotuloCurtoValido,
  rotuloDoBloco,
  rotuloPeloDescritor,
  type EntradaValida,
  type ExemploGravado,
} from './cenario-exemplo';

/** O gerador leva ~100 tokens/s: 16.000 de teto são ~160 s, e o auditor soma ~30 s. Cabe nos 300 s da rota. */
const MAX_TOKENS_GERACAO = 16000;
const TIMEOUT_GERACAO_MS = 200_000;
const TIMEOUT_AUDITORIA_MS = 60_000;

/**
 * Valores que o prompt exige para o dilema ético. NÃO são os de nenhum cliente: o exemplo
 * é genérico por construção, e o fecho do documento diz que é um exemplo.
 */
const VALORES_GENERICOS = ['Respeito às pessoas', 'Transparência', 'Responsabilidade pelos resultados'];

/** Instruções só deste uso, anexadas ao prompt do usuário (o prompt de sistema da IA3 não é tocado). */
const BLOCO_USO_NA_PROPOSTA = `═══ USO DO CENÁRIO ═══
Este cenário é o EXEMPLO de uma proposta comercial, lido por quem contrata o programa. Não nomeie empresas, marcas, redes nem cidades reais.
Em cada item de "perguntas", acrescente o campo "rotulo": uma ou duas palavras (máximo 16 caracteres) que nomeiam o que a pergunta pede ao avaliado (por exemplo: Abertura, Divergência, Acordo). Isso não altera nenhuma outra regra do formato.`;

const REGRAS_DA_REGENERACAO = `═══ REGRAS DA REGENERAÇÃO ═══
1. Corrigir NÃO é adicionar: prefira REMOVER/enxugar a acrescentar.
2. Os limites de sobriedade são inegociáveis: contexto ≤900 caracteres (conte antes de finalizar), máx 2 tensões, máx 2 stakeholders.
3. Se o feedback pedir mais cobertura, obtenha-a REFORMULANDO perguntas — nunca inflando o contexto.`;

export type RodadaGerada = {
  exemplo: ExemploGravado;
  nota: number | null;
  status: string;
  /** Nota do auditor >= NOTA_MINIMA_EXEMPLO e sem erro de validação. */
  aprovado: boolean;
  /** O que o auditor pediu para melhorar: entra no prompt da próxima rodada. */
  feedbackParaProxima: string;
  pontoFraco: string | null;
};

function promptDoCheck(
  cargo: string,
  competencia: string,
  descritores: { cod_desc: string; nome_curto: string }[],
  cand: { titulo: string; descricao: string; alternativas: Record<string, any> },
): { system: string; user: string } {
  const alt = cand.alternativas;
  const perguntas = (alt.perguntas || []).map((p: any) => {
    let t = `P${p.numero}: ${p.texto}`;
    if (p.objetivo_diagnostico) t += `\n  Objetivo: ${p.objetivo_diagnostico}`;
    if (Array.isArray(p.descritores_primarios)) t += `\n  Descritores primários: ${p.descritores_primarios.map((d: any) => `D${d}`).join(', ')}`;
    if (p.o_que_diferencia_niveis) t += `\n  Diferenciação: ${p.o_que_diferencia_niveis}`;
    return t;
  }).join('\n\n');
  let user = `═══ CARGO ═══\n${cargo}\n\n═══ COMPETÊNCIA ═══\n${competencia}`;
  user += `\n\n═══ DESCRITORES ═══\n${descritores.map((d, i) => `D${i + 1}: ${d.cod_desc} — ${d.nome_curto}`).join('\n')}`;
  user += `\n\n═══ CENÁRIO ═══\nTítulo: ${cand.titulo}\nContexto: ${cand.descricao}`;
  if (alt.faceta_testada_principal) user += `\nFaceta testada: ${alt.faceta_testada_principal}`;
  if (alt.tradeoff_testado) user += `\nTrade-off: ${alt.tradeoff_testado}`;
  if (alt.armadilha_de_resposta_generica) user += `\nArmadilha anti-genérico: ${alt.armadilha_de_resposta_generica}`;
  if (alt.riscos_do_cenario) user += `\nRiscos declarados: ${alt.riscos_do_cenario}`;
  user += `\n\n═══ PERGUNTAS ═══\n${perguntas}`;
  if (alt.mapa_cobertura_descritores) user += `\n\n═══ MAPA DE COBERTURA ═══\n${JSON.stringify(alt.mapa_cobertura_descritores)}`;
  user += `\n\n═══ INSTRUÇÃO ═══\nSe o cenário for bem escrito mas metodologicamente fraco, PENALIZE. Prefira rigor metodológico a elegância textual.`;
  return { system: buildCheckIA3SystemPrompt(), user };
}

/**
 * Uma rodada: gera, valida o formato, converte para o exemplo gravado e audita.
 * Lança com mensagem acionável quando a IA não devolve um cenário aproveitável.
 */
export async function gerarRodadaExemplo(entrada: EntradaValida): Promise<RodadaGerada> {
  const linhas = linhasDaVariante('lider').filter((l) => l.nome === entrada.competencia);
  if (linhas.length !== 6) throw new Error(`Matriz de liderança sem os 6 descritores de "${entrada.competencia}".`);
  const comp = { cod_comp: linhas[0].cod_comp, nome: linhas[0].nome, descricao: linhas[0].descricao };
  const descritores = linhas.map((l) => ({
    cod_desc: l.cod_desc, nome_curto: l.nome_curto, descritor_completo: l.descritor_completo,
    n1_gap: l.n1_gap, n2_desenvolvimento: l.n2_desenvolvimento, n3_meta: l.n3_meta, n4_referencia: l.n4_referencia,
  }));

  const { getModelForTask } = await import('@/lib/ai-tasks');
  const modeloGerador = await getModelForTask(null, 'ia3_cenarios');
  const modeloAuditor = await getModelForTask(null, 'ia3_check');

  // Sem tenant, o "nome da empresa" do prompt é um marcador: a regra de anonimização da IA3
  // proíbe o nome real, e aqui não há um a proteger.
  const empresa = { nome: 'Empresa do cliente (exemplo)', segmento: entrada.segmento || 'Não informado' };
  const cargoDetalhe = entrada.ficha ? { descricao: entrada.ficha } : {};

  const system = buildIA3SystemPrompt();
  let user = buildIA3UserPrompt(empresa, entrada.cargo, cargoDetalhe, comp, descritores, VALORES_GENERICOS, '', null);
  user += `\n\n${BLOCO_USO_NA_PROPOSTA}`;
  if (entrada.feedback) {
    user += `\n\nFEEDBACK DA REVISÃO ANTERIOR (CORRIJA ESTES PONTOS):\n${entrada.feedback}\n\n${REGRAS_DA_REGENERACAO}`;
  }

  const resposta = await callAI(
    system, user, { model: modeloGerador }, MAX_TOKENS_GERACAO,
    { taskKey: 'ia3_cenarios', timeoutMs: TIMEOUT_GERACAO_MS, locale: 'pt-BR' },
  );
  const json = await extractJSON(resposta);
  const norm = json ? validarRespostaIA3(json, descritores.length) : null;
  if (!norm) throw new Error('A IA não devolveu um cenário válido. Tente de novo.');
  if (norm.errors.length > 0) throw new Error(`O cenário saiu fora do formato (${norm.errors.join('; ')}). Tente de novo.`);

  const alternativas = montarAlternativasIA3(json, norm.cen, norm.perguntas, descritores);
  const nomesDosDescritores = descritores.map((d) => d.nome_curto);
  const usados = new Set<string>();
  const perguntas = norm.perguntas.map((p: any, i: number) => ({
    nome: rotuloCurtoValido(p?.rotulo) ?? rotuloPeloDescritor(i, p?.descritores_primarios, nomesDosDescritores, usados),
    pergunta: String(p?.texto ?? ''),
  }));

  const candidato = {
    rotulo: rotuloDoBloco(entrada.cargo),
    situacao: String(norm.cen.contexto ?? norm.contexto ?? ''),
    perguntas,
    origem: null,
  };
  // Valida contra os limites do que será gravado ANTES de gastar a auditoria.
  if (!normalizarExemploGravado(candidato)) {
    throw new Error('O texto gerado passou dos limites do documento (situação ou pergunta longa demais). Tente de novo.');
  }

  const { system: sysChk, user: userChk } = promptDoCheck(
    entrada.cargo, comp.nome, descritores,
    { titulo: norm.cen.titulo || norm.titulo, descricao: candidato.situacao, alternativas },
  );
  const respChk = await callAI(
    sysChk, userChk, { model: modeloAuditor }, 7000,
    { taskKey: 'ia3_check', timeoutMs: TIMEOUT_AUDITORIA_MS, locale: 'pt-BR' },
  );
  const normed = normalizarResultadoCheckIA3(await extractJSON(respChk));
  if (!normed) throw new Error('A auditoria do cenário não devolveu resultado. Tente de novo.');

  const r = normed.resultado;
  const nota = typeof r.nota === 'number' ? r.nota : null;
  const exemplo = normalizarExemploGravado({
    ...candidato,
    origem: {
      cargo: entrada.cargo,
      segmento: entrada.segmento,
      competencia: comp.nome,
      nota,
      status: normed.statusCheck,
      gerador: modeloGerador,
      auditor: modeloAuditor,
      geradoEm: new Date().toISOString(),
      comFicha: !!entrada.ficha,
      editado: false,
    },
  });
  if (!exemplo) throw new Error('O exemplo gerado não passou na validação final. Tente de novo.');

  return {
    exemplo,
    nota,
    status: normed.statusCheck,
    aprovado: nota != null && nota >= NOTA_MINIMA_EXEMPLO,
    feedbackParaProxima: montarFeedbackRegeneracaoIA3({
      justificativa_check: r.justificativa,
      sugestao_check: r.sugestao,
      alertas_check: {
        ponto_mais_fraco: r.ponto_mais_fraco,
        descritores_sem_cobertura: r.descritores_sem_cobertura,
        perguntas_com_risco: r.perguntas_com_risco,
      },
    }),
    pontoFraco: typeof r.ponto_mais_fraco === 'string' ? r.ponto_mais_fraco : null,
  };
}
