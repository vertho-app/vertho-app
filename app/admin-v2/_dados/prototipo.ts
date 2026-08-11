/**
 * Dados ILUSTRATIVOS do protótipo /admin-v2.
 *
 * ⚠️ Nomes e números são fictícios de propósito: este repositório é público, e a
 * versão em `deliverables/mockup-admin-proposto.html` (fora do repo) é a que usa
 * o tenant real. Ao ligar cada fila a uma consulta de verdade, apague a entrada
 * correspondente daqui em vez de deixar as duas fontes convivendo.
 */

export type Severidade = 'critica' | 'atencao' | 'informativa';

export type ItemFila = {
  rotulo: string;
  detalhe: string;
  onde: string;
};

export type Fila = {
  id: string;
  contagem: string;
  titulo: string;
  periodo: string;
  severidade: Severidade;
  itens: ItemFila[];
  acao: string;
};

export const FILAS: Fila[] = [
  {
    id: 'jobs-erro',
    contagem: '3',
    titulo: 'Jobs de IA com erro',
    periodo: 'últimas 24 h',
    severidade: 'critica',
    itens: [
      { rotulo: 'Roteiro de vídeo', detalhe: 'lote batch', onde: 'Rede Aurora' },
      { rotulo: 'Kit semanal', detalhe: 'descritor sem cobertura', onde: 'Instituto Cedro' },
      { rotulo: 'IA4 mapeamento', detalhe: '2 de 40 falharam', onde: 'Grupo Meridiano' },
    ],
    acao: 'Abrir jobs e reprocessar',
  },
  {
    id: 'bloqueados',
    contagem: '2',
    titulo: 'Clientes bloqueados',
    periodo: 'não avançam de fase',
    severidade: 'atencao',
    itens: [
      { rotulo: 'Vertex Saúde', detalhe: 'perfil externo pendente', onde: 'F1' },
      { rotulo: 'Instituto Cedro', detalhe: 'competências não autoradas', onde: 'F0' },
    ],
    acao: 'Ver bloqueadores',
  },
  {
    id: 'aprovacao',
    contagem: '4',
    titulo: 'Aguardando aprovação',
    periodo: 'curadoria humana',
    severidade: 'informativa',
    itens: [
      { rotulo: '16 de 25 cenários', detalhe: 'revisados', onde: 'Grupo Meridiano' },
      { rotulo: '3 propostas', detalhe: 'do canal comercial', onde: 'fila do canal' },
      { rotulo: '4 avaliações IA4', detalhe: 'em check', onde: 'Rede Aurora' },
    ],
    acao: 'Continuar de onde parei',
  },
  {
    id: 'lancar',
    contagem: '1',
    titulo: 'Pronto para lançar',
    periodo: 'turma com pré-requisitos ok',
    severidade: 'informativa',
    itens: [{ rotulo: 'Instituto Cedro', detalhe: '50 pessoas, jornada 7×2', onde: 'F3' }],
    acao: 'Abrir preflight de lançamento',
  },
  {
    id: 'sem-acesso',
    contagem: '12',
    titulo: 'Pessoas sem acesso',
    periodo: 'importadas, sem conta',
    severidade: 'atencao',
    itens: [{ rotulo: '12 de 158', detalhe: 'sem conta de login criada', onde: 'Rede Aurora' }],
    acao: 'Provisionar acesso',
  },
  {
    id: 'envios',
    contagem: '5',
    titulo: 'Envios com falha',
    periodo: 'WhatsApp e e-mail',
    severidade: 'critica',
    itens: [{ rotulo: '5 de 50', detalhe: 'convites não entregues', onde: 'Instituto Cedro' }],
    acao: 'Ver motivo e reenviar',
  },
];

/**
 * Estado VISUAL do card de fase no protótipo. Deliberadamente NÃO reusa os
 * literais de `lib/status.ts` (PROGRESSO/TRILHA/ENVIO): aqui é rótulo de tela,
 * não status de tabela, e amarrar os dois faria um label de UI mudar junto com
 * o schema — é o acoplamento que o `status-literal-guard` existe para impedir.
 */
export type EstadoFase = 'feito' | 'revisao' | 'bloqueado' | 'aguardando';

export type Fase = {
  sigla: string;
  rotulo: string;
  titulo: string;
  meta: string;
  proximaAcao?: string;
  estado: EstadoFase;
};

export const FASES: Fase[] = [
  { sigla: 'F0', rotulo: 'base', titulo: 'Base da empresa', meta: '6 colaboradores · 3 cargos · 1 PPP', estado: 'feito' },
  {
    sigla: 'F1', rotulo: 'régua', titulo: 'Perfil ideal',
    meta: 'Top 10: 3/3 · Top 5: 4/4 · Cenários: 25',
    proximaAcao: '9 de 25 cenários aprovados · continuar curadoria',
    estado: 'revisao',
  },
  {
    sigla: 'F2', rotulo: 'diag', titulo: 'Diagnóstico',
    meta: 'Enviados: 0 · Respondidos: 0 de 6',
    proximaAcao: 'convidar as 6 pessoas para o assessment',
    estado: 'bloqueado',
  },
  { sigla: 'F3', rotulo: 'jornada', titulo: 'Temporadas', meta: 'Respostas: 12 · Avaliadas: 12/12', estado: 'aguardando' },
  { sigla: 'F4', rotulo: 'evol', titulo: 'Evolução', meta: 'Reavaliação e cenários B', estado: 'aguardando' },
];

export type PassoRegua = {
  titulo: string;
  descricao: string;
  denominador: string;
  estado: 'aprovado' | 'revisando';
};

export const REGUA: PassoRegua[] = [
  { titulo: 'Banco de competências', descricao: 'Régua base e por cargo', denominador: '14 competências ativas', estado: 'aprovado' },
  { titulo: 'Top 10 por cargo', descricao: 'IA1 sobre a descrição do cargo', denominador: '3 de 3 cargos', estado: 'aprovado' },
  { titulo: 'Top 5 e votação', descricao: 'Curadoria humana + votação da equipe', denominador: '4 de 4 cargos', estado: 'aprovado' },
  { titulo: 'Competências foco', descricao: 'Recorte que entra na jornada', denominador: '5 selecionadas', estado: 'aprovado' },
  { titulo: 'Perfil ideal (gabarito)', descricao: 'IA2 gera o nível esperado por descritor', denominador: '3 de 3 cargos', estado: 'aprovado' },
  { titulo: 'Cenários situacionais', descricao: 'IA3', denominador: '9 de 25 aprovados · 16 aguardam revisão', estado: 'revisando' },
];

export type LinhaPreflight = { rotulo: string; valor: string; tom?: 'ok' | 'atencao' };

export const PREFLIGHT: LinhaPreflight[] = [
  { rotulo: 'Cliente e escopo', valor: 'Grupo Meridiano · 2 cargos sem cenário' },
  { rotulo: 'Pessoas afetadas', valor: '6 colaboradores' },
  { rotulo: 'Pré-requisitos', valor: 'Gabarito aprovado nos 2 cargos', tom: 'ok' },
  { rotulo: 'O que será criado', valor: '10 cenários (5 por cargo)' },
  { rotulo: 'O que será sobrescrito', valor: 'Nada — cargos sem cenário', tom: 'atencao' },
  { rotulo: 'Reversível', valor: 'Sim, até a aprovação', tom: 'ok' },
  { rotulo: 'Custo estimado', valor: 'US$ 0,74' },
  { rotulo: 'Tempo estimado', valor: '~3 min · roda em background' },
];

export const ETAPAS_CLIENTE = [
  { chave: 'visao', rotulo: 'Visão geral', estado: 'feito' as const },
  { chave: 'preparar', rotulo: 'Preparar', estado: 'agora' as const },
  { chave: 'regua', rotulo: 'Definir régua', estado: 'agora' as const },
  { chave: 'selecao', rotulo: 'Seleção e Talentos', estado: 'neutro' as const },
  { chave: 'diagnosticar', rotulo: 'Diagnosticar', estado: 'neutro' as const },
  { chave: 'executar', rotulo: 'Executar jornada', estado: 'neutro' as const },
  { chave: 'acompanhar', rotulo: 'Acompanhar', estado: 'neutro' as const },
  { chave: 'resultados', rotulo: 'Resultados', estado: 'neutro' as const },
  { chave: 'qualidade', rotulo: 'Qualidade interna', estado: 'neutro' as const },
];
