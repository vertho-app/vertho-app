/**
 * Resolve o REGISTRO LINGUÍSTICO e o DOMÍNIO DE EXEMPLOS por público, para os
 * prompts de conteúdo (texto/case/kit) adaptarem como escrevem e de onde tiram
 * cenários. Determinístico (sem IA).
 *
 * EIXO PRINCIPAL = CARGO, não segmento. Empresas sociais (ex.: "Macaé - MEI &
 * Empregabilidade") têm UM segmento (às vezes "corporativo" por default) mas
 * DOIS públicos distintos, separados pelo cargo ("MEI" vs "Em busca"). Por isso
 * o cargo manda; o segmento é só fallback quando o cargo não revela o público.
 */

export type RegistroPublico = {
  chave: 'corporativo' | 'educacao' | 'mei' | 'empregabilidade';
  nivelLeitura: 'simples' | 'intermediario' | 'avancado';
  registroInstrucao: string;   // COMO escrever (frases, vocabulário)
  dominioExemplos: string;     // DE ONDE tirar exemplos/cenários
  termosEvitar: string[];      // jargão a banir para este público
  proibirContextoEducacional: boolean; // bloqueia vazamento "escola/pedagógico"
  minCharsPdf: number;         // extensão-alvo (texto/case) — menor p/ baixa escolaridade
};

const norm = (s?: string) => String(s || '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

// Jargão abstrato a banir para nível de leitura simples.
const TERMOS_EVITAR_SIMPLES = [
  'sinergia', 'assimetria', 'vácuo colaborativo', 'hipótese verificável',
  'operação relacional', 'operação processual', 'visibilidade ativa',
  'dissolução de papéis', 'interfaces', 'stakeholders', 'escopo', 'checkpoint',
  'interdisciplinar', 'curricular', 'pedagógico', 'mensurável', 'proatividade',
  'alinhamento', 'entregável', 'priorização', 'engajamento',
];

const REGISTRO_SIMPLES =
  'Frases curtas, uma ideia por frase. Linguagem do dia a dia, como uma conversa franca. ' +
  'Toda palavra abstrata precisa vir com um exemplo concreto ao lado (entre travessões ou parênteses); ' +
  'se não der pra exemplificar, troque por expressão do cotidiano. ' +
  'Tom acolhedor e direto, sem tom professoral, sem jargão de escritório, sem "linguês corporativo". ' +
  'Ex.: escreva "aquele pedaço do trabalho que fica largado" em vez de "vácuo colaborativo".';

const PERFIS: Record<RegistroPublico['chave'], RegistroPublico> = {
  mei: {
    chave: 'mei', nivelLeitura: 'simples',
    registroInstrucao: REGISTRO_SIMPLES,
    dominioExemplos:
      'Situações reais de quem toca o próprio negócio de bairro: vender, atender cliente, ' +
      'controlar o caixa, comprar material, calcular preço, divulgar no WhatsApp, fazer parceria ' +
      'com outro empreendedor local, contar com a ajuda da família no negócio, vender em feira ou ' +
      'evento de bairro. NUNCA escritório corporativo, reunião de diretoria, equipe pedagógica ou banca avaliadora.',
    termosEvitar: TERMOS_EVITAR_SIMPLES,
    proibirContextoEducacional: true,
    minCharsPdf: 5000,
  },
  empregabilidade: {
    chave: 'empregabilidade', nivelLeitura: 'simples',
    registroInstrucao: REGISTRO_SIMPLES,
    dominioExemplos:
      'Situações reais de quem está buscando ou começando um emprego: dinâmica de grupo em processo ' +
      'seletivo, período de experiência numa equipe de loja, restaurante, obra ou logística, primeiro ' +
      'emprego, mutirão ou trabalho comunitário, conversa com colega de turma de um curso. NUNCA ' +
      '"catalogar 43 fontes", "sumário executivo", "literatura sobre intervenção pedagógica" nem ambiente acadêmico.',
    termosEvitar: TERMOS_EVITAR_SIMPLES,
    proibirContextoEducacional: true,
    minCharsPdf: 5000,
  },
  educacao: {
    chave: 'educacao', nivelLeitura: 'avancado',
    registroInstrucao:
      'Linguagem profissional, clara e madura, adequada a educadores e gestores escolares. ' +
      'O contexto pedagógico é legítimo aqui — use-o quando ajudar.',
    dominioExemplos:
      'Cotidiano de escola e rede de ensino: sala de aula, conselho de classe, planejamento ' +
      'pedagógico, relação com famílias, coordenação, formação de professores.',
    termosEvitar: [],
    proibirContextoEducacional: false,
    minCharsPdf: 8000,
  },
  corporativo: {
    chave: 'corporativo', nivelLeitura: 'intermediario',
    registroInstrucao:
      'Linguagem profissional brasileira, clara e humana. Evite jargão excessivo; quando usar um ' +
      'termo técnico, deixe o sentido claro. Tom de conversa inteligente com um profissional adulto.',
    dominioExemplos:
      'Ambiente de trabalho genérico: equipe, projetos, prazos, reuniões, atendimento, processos do dia a dia.',
    termosEvitar: [],
    proibirContextoEducacional: true,
    minCharsPdf: 8000,
  },
};

/** Mapas de reconhecimento por CARGO (prioritário) e por SEGMENTO (fallback). */
function chavePorCargo(cargo: string): RegistroPublico['chave'] | null {
  const c = norm(cargo);
  if (!c || c === 'todos') return null;
  if (/\bmei\b|microempreend|empreend|dono.*negocio|negocio proprio|autonomo|aut[oô]noma/.test(c)) return 'mei';
  if (/em busca|empregab|primeiro emprego|recoloca|insercao profissional|procurando emprego|desempreg|aprendiz|estagi/.test(c)) return 'empregabilidade';
  return null;
}
function chavePorSegmento(segmento: string): RegistroPublico['chave'] | null {
  const s = norm(segmento);
  if (!s) return null;
  if (/mei|microempreend|empreend|geracao de renda/.test(s)) return 'mei';
  if (/empregab|insercao|primeiro emprego|recoloca/.test(s)) return 'empregabilidade';
  if (/educac|escola|ensino|secretaria|pedagog/.test(s)) return 'educacao';
  if (/corporativ/.test(s)) return 'corporativo';
  return null;
}

/**
 * Resolve o perfil de público. CARGO tem precedência (sinal forte e específico
 * da pessoa); o segmento entra só quando o cargo não identifica o público.
 */
export function resolverPerfilPublico(segmento?: string, cargo?: string): RegistroPublico {
  const chave = chavePorCargo(cargo || '') || chavePorSegmento(segmento || '') || 'corporativo';
  return PERFIS[chave];
}

/** Carrega o segmento da empresa e resolve o perfil (cargo-primeiro). Best-effort. */
export async function resolverPerfilPublicoDaEmpresa(sb: any, empresaId?: string | null, cargo?: string): Promise<RegistroPublico> {
  let segmento: string | undefined;
  if (empresaId) {
    try {
      const { data } = await sb.from('empresas').select('segmento').eq('id', empresaId).maybeSingle();
      segmento = data?.segmento || undefined;
    } catch { /* segue só com o cargo */ }
  }
  return resolverPerfilPublico(segmento, cargo);
}

/** Bloco de calibração injetável no system prompt (reutilizado por texto/case/kit). */
export function blocoCalibracaoPublico(p: RegistroPublico): string {
  const linhas = [
    '',
    '## PÚBLICO E REGISTRO (OBRIGATÓRIO — vale mais que qualquer outra instrução de estilo)',
    `- Nível de leitura: ${p.nivelLeitura}.`,
    `- Como escrever: ${p.registroInstrucao}`,
    `- De onde tirar TODOS os exemplos, cenários e personagens: ${p.dominioExemplos}`,
  ];
  if (p.termosEvitar.length) {
    linhas.push(`- NÃO use estes termos (troque por linguagem do cotidiano, sempre com exemplo concreto): ${p.termosEvitar.join(', ')}.`);
  }
  if (p.proibirContextoEducacional) {
    linhas.push('- PROIBIDO cenário, vocabulário ou exemplo de escola/ensino/pedagogia (equipe pedagógica, banca, currículo, intervenção pedagógica, material didático, conselho de classe). O público NÃO está nesse mundo.');
  }
  return linhas.join('\n');
}
