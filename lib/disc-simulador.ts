/**
 * Núcleo do mapeamento SIMULADO (usado por `actions/simulador-disc.ts`).
 *
 * Regra de ouro: o simulado tem que ser indistinguível do real em ESTRUTURA —
 * mesma soma, mesmas fórmulas derivadas, mesmo formato de perfil. O que muda é
 * só a origem dos números (aleatória em vez de respostas do colaborador), e
 * isso fica registrado em `disc_resultados.origem = 'simulado'`.
 *
 * Antes daqui, o simulador tinha régua PRÓPRIA em tudo (medido em 24/08/2026):
 *   - DISC somava 100, o real soma 200
 *   - liderança era `0,7·D + 0,3·C`, o real é `D/2`
 *   - competências eram ruído aleatório (`biased`), o real é a regressão
 *     `computeDiscCompetenciesNatural`
 *   - perfil dominante era só a letra maior; o real concatena TODAS ≥ 50 —
 *     e com soma 100 um combo ("CS", "ID") era aritmeticamente quase
 *     impossível, então o simulador nunca produzia um. No real, 137 de 201
 *     pessoas têm duas letras.
 * Resultado: `projetomacae` (13 pessoas) e `acme` (4) nasceram com dados que a
 * plataforma real nunca produz.
 *
 * Núcleo em `lib/` (e não dentro da action) porque todo export de um arquivo
 * `'use server'` vira endpoint HTTP — e porque assim dá para testar.
 */
import { computeDiscCompetenciesNatural } from './disc-competencias';
import {
  normalizarDisc,
  computeLeadership,
  deriveProfile,
  DISC_SOMA_ALVO,
  type DiscScores,
} from './disc-mapeamento';

const rand = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;

/**
 * Sorteia um DISC bruto com uma dimensão dominante e normaliza para somar 200.
 *
 * Parâmetros calibrados contra a população real (201 colaboradores com soma
 * exata 200, medidos em 24/08/2026): fator dominante entre 53 e 95 (média 70),
 * fator menor entre 13 e 47 (média 32), e 68% das pessoas com duas letras
 * ≥ 50. Um sorteio uniforme sem esse empurrão na dominante gera perfis chapados
 * que o instrumento real não produz.
 */
export const DOMINANTE_MIN = 53;
export const DOMINANTE_MAX = 95;

export function sortearDisc(): DiscScores {
  const dims: (keyof DiscScores)[] = ['D', 'I', 'S', 'C'];
  let ultimo: DiscScores = { D: 50, I: 50, S: 50, C: 50 };
  // A normalização amplifica sorteios extremos (um fator alto com três baixos
  // vira 119, que a população real nunca produziu). Reamostra até cair na faixa
  // observada em vez de clampar — clampar quebraria a soma 200.
  for (let tentativa = 0; tentativa < 50; tentativa++) {
    const dominante = dims[rand(0, 3)];
    const bruto: DiscScores = { D: 0, I: 0, S: 0, C: 0 };
    for (const d of dims) bruto[d] = rand(18, 60);
    bruto[dominante] += rand(12, 32);
    ultimo = normalizarDisc(bruto, DISC_SOMA_ALVO);
    const maior = Math.max(ultimo.D, ultimo.I, ultimo.S, ultimo.C);
    if (maior >= DOMINANTE_MIN && maior <= DOMINANTE_MAX) return ultimo;
  }
  return ultimo; // fallback: soma 200 garantida, só a faixa não convergiu
}

/**
 * Payload completo de um mapeamento simulado — as MESMAS colunas que o
 * mapeamento real grava, pelas MESMAS fórmulas.
 */
export function gerarMapeamentoSimulado(discEntrada?: DiscScores) {
  const disc = discEntrada ? normalizarDisc(discEntrada, DISC_SOMA_ALVO) : sortearDisc();
  const lead = computeLeadership(disc);
  const comp = computeDiscCompetenciesNatural(disc);

  return {
    perfil_dominante: deriveProfile(disc),
    d_natural: disc.D, i_natural: disc.I, s_natural: disc.S, c_natural: disc.C,

    // Liderança — idem mapeamento-actions: executivo/motivador com 1 casa,
    // metódico/sistemático inteiros.
    lid_executivo: lead.Executivo,
    lid_motivador: lead.Motivador,
    lid_metodico: Math.round(lead.Metódico),
    lid_sistematico: Math.round(lead.Sistemático),

    // 16 competências pela regressão canônica (mesma chamada do servidor real).
    comp_ousadia: comp.Ousadia,
    comp_comando: comp.Comando,
    comp_objetividade: comp.Objetividade,
    comp_assertividade: comp.Assertividade,
    comp_persuasao: comp['Persuasão'],
    comp_extroversao: comp['Extroversão'],
    comp_entusiasmo: comp.Entusiasmo,
    comp_sociabilidade: comp.Sociabilidade,
    comp_empatia: comp.Empatia,
    comp_paciencia: comp['Paciência'],
    comp_persistencia: comp['Persistência'],
    comp_planejamento: comp.Planejamento,
    comp_organizacao: comp['Organização'],
    comp_detalhismo: comp.Detalhismo,
    comp_prudencia: comp['Prudência'],
    comp_concentracao: comp['Concentração'],

    // Preferências de aprendizagem (1-5) — não há fórmula canônica; o
    // instrumento real as coleta por pergunta direta, então aqui é sorteio.
    pref_video_curto: rand(2, 5),
    pref_video_longo: rand(1, 5),
    pref_texto: rand(1, 5),
    pref_audio: rand(1, 5),
    pref_infografico: rand(1, 5),
    pref_exercicio: rand(2, 5),
    pref_mentor: rand(2, 5),
    pref_estudo_caso: rand(1, 5),

    mapeamento_em: new Date().toISOString(),
    disc_resultados: JSON.stringify({ origem: 'simulado', natural: disc }),

    // Invalida caches de relatório
    comportamental_pdf_path: null,
    report_texts: null,
    report_generated_at: null,
    insights_executivos: null,
    insights_executivos_at: null,
  };
}
