/**
 * Entradas do teste golden dos prompts do Cenário A (IA3). Cobrem os ramos
 * opcionais de `buildIA3UserPrompt`: detalhe do cargo completo e vazio,
 * gabarito com e sem as telas, PPP presente, longo (corte em 3000) e ausente.
 */
const DESCRITORES = [
  {
    cod_desc: 'C007_D1', nome_curto: 'Escuta das partes', descritor_completo: 'Escuta as partes antes de decidir',
    n1_gap: 'Decide sem ouvir', n2_desenvolvimento: 'Ouve uma das partes', n3_meta: 'Ouve as duas partes', n4_referencia: 'Cria rotina de escuta',
  },
  {
    cod_desc: 'C007_D2', nome_curto: null, descritor_completo: 'Media com critério explícito',
    n1_gap: 'Evita o conflito', n2_desenvolvimento: null, n3_meta: 'Media com critério', n4_referencia: null,
  },
];

export const FIXTURES_GOLDEN_IA3 = {
  completo: {
    empresa: { nome: 'Rede Municipal Exemplo', segmento: 'educacao' },
    cargoNome: 'Diretor(a) Escolar',
    cargoDetalhe: {
      descricao: 'Dirige a unidade escolar.',
      principais_entregas: 'Plano de gestão; clima escolar.',
      stakeholders: 'Professores; famílias; Secretaria.',
      decisoes_recorrentes: 'Mediação de conflitos entre professores.',
      tensoes_comuns: 'Pressão por resultados com equipe reduzida.',
    },
    comp: { cod_comp: 'C007', nome: 'GERENCIAMENTO DE CONFLITOS', descricao: 'Media conflitos com critério.' },
    descritores: DESCRITORES,
    valores: ['Ética e integridade', 'Respeito'],
    contextoPPP: 'Escola urbana, 600 alunos, foco em convivência.',
    gabCIS: {
      tela4: { D: { min: 40, max: 70 }, I: { min: 30, max: 60 }, S: { min: 20, max: 50 }, C: { min: 30, max: 60 } },
      tela3: { executor: 30, motivador: 25, metodico: 25, sistematico: 20 },
    },
  },
  minimo: {
    empresa: { nome: 'Empresa Sem Segmento', segmento: null },
    cargoNome: 'Professor(a)',
    cargoDetalhe: {},
    comp: { cod_comp: null, nome: 'Autocuidado', descricao: null },
    descritores: [],
    valores: [],
    contextoPPP: '',
    gabCIS: null,
  },
  parcial: {
    empresa: { nome: 'Rede Parcial', segmento: 'educacao' },
    cargoNome: 'Coordenação Pedagógica',
    cargoDetalhe: { tensoes_comuns: 'Tempo curto para formar professores.' },
    comp: { cod_comp: 'COO03', nome: 'Autocuidado e resiliência emocional', descricao: '' },
    descritores: DESCRITORES.slice(0, 1),
    valores: ['Cuidado'],
    contextoPPP: 'X'.repeat(3500),
    gabCIS: { tela3: { executor: 10, motivador: 40, metodico: 30, sistematico: 20 } },
  },
} as const;
