/**
 * Converte uma row da tabela `colaboradores` no shape `CISRawData` esperado
 * pelo prompt do relatório comportamental e pelo PDF.
 *
 * Várias colunas (índices, adaptado das 16 competências, tipo psicológico
 * numérico) podem ainda não estar preenchidas no banco — quando não estão,
 * o mapper aplica fallbacks razoáveis para que o relatório consiga ser
 * gerado mesmo num mapeamento legado.
 */

const num = (v, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

// Quando o adaptado da competência i não existe, usamos o valor natural
// — significa "sem adaptação significativa".
const compPair = (row, base) => ({
  natural: num(row[base], 0),
  adaptado: row[`${base}_adapt`] != null ? num(row[`${base}_adapt`]) : num(row[base], 0),
});

const COMPETENCIAS = [
  ['Ousadia', 'comp_ousadia'],
  ['Comando', 'comp_comando'],
  ['Objetividade', 'comp_objetividade'],
  ['Assertividade', 'comp_assertividade'],
  ['Persuasão', 'comp_persuasao'],
  ['Extroversão', 'comp_extroversao'],
  ['Entusiasmo', 'comp_entusiasmo'],
  ['Sociabilidade', 'comp_sociabilidade'],
  ['Empatia', 'comp_empatia'],
  ['Paciência', 'comp_paciencia'],
  ['Persistência', 'comp_persistencia'],
  ['Planejamento', 'comp_planejamento'],
  ['Organização', 'comp_organizacao'],
  ['Detalhismo', 'comp_detalhismo'],
  ['Prudência', 'comp_prudencia'],
  ['Concentração', 'comp_concentracao'],
];

// Deriva a sigla do tipo psicológico (ex: "ENT") a partir dos 3 percentuais.
function deriveTipoPsicologico(extroversao, intuicao, pensamento) {
  const e = extroversao >= 50 ? 'E' : 'I';
  const n = intuicao >= 50 ? 'N' : 'S';
  const t = pensamento >= 50 ? 'T' : 'F';
  return `${e}${n}${t}`;
}

export function mapSupabaseToCISRawData(row) {
  if (!row) return null;

  // Tipo psicológico — temos colunas legadas TEXT (tp_*) e colunas numéricas
  // novas. Preferimos as numéricas; se não existirem, derivamos das textuais.
  const extroversao =
    row.extroversao != null
      ? num(row.extroversao)
      : row.tp_introvertido_extrovertido?.toLowerCase().startsWith('extr')
      ? 65
      : row.tp_introvertido_extrovertido?.toLowerCase().startsWith('intr')
      ? 35
      : 50;
  const intuicao =
    row.intuicao != null
      ? num(row.intuicao)
      : row.tp_sensor_intuitivo?.toLowerCase().startsWith('intu')
      ? 65
      : row.tp_sensor_intuitivo?.toLowerCase().startsWith('sens')
      ? 35
      : 50;
  const pensamento =
    row.pensamento != null
      ? num(row.pensamento)
      : row.tp_racional_emocional?.toLowerCase().startsWith('rac')
      ? 65
      : row.tp_racional_emocional?.toLowerCase().startsWith('emo')
      ? 35
      : 50;

  return {
    nome: row.nome_completo || row.nome || '',
    data_realizacao: row.mapeamento_em || row.created_at || new Date().toISOString(),
    perfil_dominante: row.perfil_dominante || '',
    disc_natural: {
      D: num(row.d_natural),
      I: num(row.i_natural),
      S: num(row.s_natural),
      C: num(row.c_natural),
    },
    disc_adaptado: {
      D: row.d_adaptado != null ? num(row.d_adaptado) : num(row.d_natural),
      I: row.i_adaptado != null ? num(row.i_adaptado) : num(row.i_natural),
      S: row.s_adaptado != null ? num(row.s_adaptado) : num(row.s_natural),
      C: row.c_adaptado != null ? num(row.c_adaptado) : num(row.c_natural),
    },
    indices: {
      positividade: row.positividade != null ? num(row.positividade) : 0.5,
      estima: row.estima != null ? num(row.estima) : 0.5,
      flexibilidade: row.flexibilidade != null ? num(row.flexibilidade) : 0.5,
    },
    lideranca: {
      executivo: num(row.lid_executivo),
      motivador: num(row.lid_motivador),
      metodico: num(row.lid_metodico),
      sistematico: num(row.lid_sistematico),
    },
    tipo_psicologico: {
      tipo: row.tipo_psicologico || deriveTipoPsicologico(extroversao, intuicao, pensamento),
      extroversao,
      intuicao,
      pensamento,
    },
    competencias: COMPETENCIAS.map(([nome, base]) => ({ nome, ...compPair(row, base) })),
  };
}

// Lista de colunas necessárias para a query do colaborador.
export const CIS_COLUMNS = [
  'id', 'nome_completo', 'cargo', 'empresa_id', 'perfil_dominante', 'mapeamento_em', 'created_at',
  // DISC
  'd_natural', 'i_natural', 's_natural', 'c_natural',
  'd_adaptado', 'i_adaptado', 's_adaptado', 'c_adaptado',
  // Liderança
  'lid_executivo', 'lid_motivador', 'lid_metodico', 'lid_sistematico',
  // Índices
  'positividade', 'estima', 'flexibilidade',
  // Tipo psicológico (novo + legado)
  'tipo_psicologico', 'extroversao', 'intuicao', 'pensamento',
  'tp_sensor_intuitivo', 'tp_racional_emocional', 'tp_introvertido_extrovertido',
  // 16 competências natural + adaptado
  ...COMPETENCIAS.flatMap(([, base]) => [base, `${base}_adapt`]),
  // Cache
  'report_texts', 'report_generated_at',
].join(', ');
