/**
 * Diretório da Rede de Escolas ACME: as pessoas que dão ESCALA ao ambiente.
 *
 * Espelha o papel do `ACME_DEMO_REPORT_DIRECTORY` no elenco comercial. As
 * personas do roster (`PERSONAS_ESCOLARES`) são navegáveis e caras — respondem
 * assessment, recebem artefatos congelados, abrem a sala de apresentação. Estas
 * aqui não têm acesso próprio: existem para que o Panorama, o DNA, a leitura por
 * cargo e o painel de Evolução tenham massa.
 *
 * POR QUE PRECISOU EXISTIR (01/09/2026): com 5 participantes, o painel de
 * evolução saía com duas competências de 2-3 pessoas — média de n pequeno
 * apresentada com o mesmo peso de uma média de turma, que é justamente a
 * leitura que um painel de evolução não pode induzir. A rede passa a ter 19
 * participantes, e aí cada competência medida tem pelo menos três.
 *
 * A distribuição pelas três unidades não é enfeite: a rede é o formato do
 * cliente escolar, e o corte que a direção abre é comparar unidades. Um elenco
 * concentrado numa escola só tornaria esse recorte vazio.
 */

import { UNIDADES_ESCOLARES } from '@/lib/demo/rosters/escolar';

const VILA_NOVA = UNIDADES_ESCOLARES[0].nome;
const PARQUE = UNIDADES_ESCOLARES[1].nome;
const CENTRO = UNIDADES_ESCOLARES[2].nome;

const DOCENCIA = 'Professor(a)';
const COORDENACAO = 'Coordenador(a) Pedagógico(a)';

/** A coordenação de cada unidade responde como gestora dos professores dela. */
const COORD_VILA_NOVA = { nome: 'Renata Coelho', email: 'renata.demo@vertho.ai' };
const COORD_PARQUE = { nome: 'Sérgio Bastos', email: 'sergio.demo@vertho.ai' };
const COORD_CENTRO = { nome: 'Heloísa Pimentel', email: 'heloisa.demo@vertho.ai' };

export type DiretorioEscolarPessoa = {
  key: string;
  nome_completo: string;
  email: string;
  cargo: string;
  role: 'colaborador' | 'gestor';
  area_depto: string;
  gestor_nome: string | null;
  gestor_email: string | null;
  d_natural: number;
  i_natural: number;
  s_natural: number;
  c_natural: number;
};

/**
 * ⚠️ O DISC soma 200 em todas as linhas — é a régua do produto
 * (`lib/disc-mapeamento.ts`), e o motor de fit lê as colunas `comp_*` derivadas
 * dela. Uma linha fora da soma produz um perfil que a plataforma real não gera,
 * e a demo passa a exibir reprovação impossível no ranking.
 */
export const DIRETORIO_ESCOLAR: DiretorioEscolarPessoa[] = [
  // ── Coordenação (a de Vila Nova e a do Parque são personas do roster) ──
  { key: 'heloisa', nome_completo: 'Heloísa Pimentel', email: 'heloisa.demo@vertho.ai', cargo: COORDENACAO, role: 'gestor', area_depto: CENTRO, gestor_nome: null, gestor_email: null, d_natural: 38, i_natural: 52, s_natural: 62, c_natural: 48 },
  { key: 'wagner', nome_completo: 'Wagner Portela', email: 'wagner.demo@vertho.ai', cargo: COORDENACAO, role: 'gestor', area_depto: VILA_NOVA, gestor_nome: null, gestor_email: null, d_natural: 56, i_natural: 44, s_natural: 50, c_natural: 50 },
  { key: 'lurdes', nome_completo: 'Lurdes Sampaio', email: 'lurdes.demo@vertho.ai', cargo: COORDENACAO, role: 'gestor', area_depto: PARQUE, gestor_nome: null, gestor_email: null, d_natural: 30, i_natural: 46, s_natural: 74, c_natural: 50 },
  { key: 'otavio', nome_completo: 'Otávio Queiroz', email: 'otavio.demo@vertho.ai', cargo: COORDENACAO, role: 'gestor', area_depto: CENTRO, gestor_nome: null, gestor_email: null, d_natural: 44, i_natural: 38, s_natural: 54, c_natural: 64 },

  // ── Docência: Vila Nova ───────────────────────────────────────────────
  { key: 'juliane', nome_completo: 'Juliane Peçanha', email: 'juliane.demo@vertho.ai', cargo: DOCENCIA, role: 'colaborador', area_depto: VILA_NOVA, gestor_nome: COORD_VILA_NOVA.nome, gestor_email: COORD_VILA_NOVA.email, d_natural: 26, i_natural: 58, s_natural: 72, c_natural: 44 },
  { key: 'anderson', nome_completo: 'Anderson Vilela', email: 'anderson.demo@vertho.ai', cargo: DOCENCIA, role: 'colaborador', area_depto: VILA_NOVA, gestor_nome: COORD_VILA_NOVA.nome, gestor_email: COORD_VILA_NOVA.email, d_natural: 52, i_natural: 60, s_natural: 44, c_natural: 44 },
  { key: 'silvana', nome_completo: 'Silvana Toledo', email: 'silvana.demo@vertho.ai', cargo: DOCENCIA, role: 'colaborador', area_depto: VILA_NOVA, gestor_nome: COORD_VILA_NOVA.nome, gestor_email: COORD_VILA_NOVA.email, d_natural: 22, i_natural: 40, s_natural: 68, c_natural: 70 },
  { key: 'edson', nome_completo: 'Edson Mariano', email: 'edson.demo@vertho.ai', cargo: DOCENCIA, role: 'colaborador', area_depto: VILA_NOVA, gestor_nome: COORD_VILA_NOVA.nome, gestor_email: COORD_VILA_NOVA.email, d_natural: 60, i_natural: 36, s_natural: 48, c_natural: 56 },

  // ── Docência: Parque das Águas ────────────────────────────────────────
  { key: 'carolina', nome_completo: 'Carolina Bastos', email: 'carolina.demo@vertho.ai', cargo: DOCENCIA, role: 'colaborador', area_depto: PARQUE, gestor_nome: COORD_PARQUE.nome, gestor_email: COORD_PARQUE.email, d_natural: 34, i_natural: 66, s_natural: 58, c_natural: 42 },
  { key: 'rogerio', nome_completo: 'Rogério Andrade', email: 'rogerio.demo@vertho.ai', cargo: DOCENCIA, role: 'colaborador', area_depto: PARQUE, gestor_nome: COORD_PARQUE.nome, gestor_email: COORD_PARQUE.email, d_natural: 48, i_natural: 32, s_natural: 56, c_natural: 64 },
  { key: 'fabiana', nome_completo: 'Fabiana Correia', email: 'fabiana.demo@vertho.ai', cargo: DOCENCIA, role: 'colaborador', area_depto: PARQUE, gestor_nome: COORD_PARQUE.nome, gestor_email: COORD_PARQUE.email, d_natural: 28, i_natural: 62, s_natural: 66, c_natural: 44 },

  // ── Docência: Centro ──────────────────────────────────────────────────
  { key: 'mauricio', nome_completo: 'Maurício Delgado', email: 'mauricio.demo@vertho.ai', cargo: DOCENCIA, role: 'colaborador', area_depto: CENTRO, gestor_nome: COORD_CENTRO.nome, gestor_email: COORD_CENTRO.email, d_natural: 54, i_natural: 42, s_natural: 52, c_natural: 52 },
  { key: 'beatriz_e', nome_completo: 'Beatriz Fontoura', email: 'beatriz.escola.demo@vertho.ai', cargo: DOCENCIA, role: 'colaborador', area_depto: CENTRO, gestor_nome: COORD_CENTRO.nome, gestor_email: COORD_CENTRO.email, d_natural: 24, i_natural: 54, s_natural: 70, c_natural: 52 },
  { key: 'ivan', nome_completo: 'Ivan Sobral', email: 'ivan.demo@vertho.ai', cargo: DOCENCIA, role: 'colaborador', area_depto: CENTRO, gestor_nome: COORD_CENTRO.nome, gestor_email: COORD_CENTRO.email, d_natural: 40, i_natural: 48, s_natural: 60, c_natural: 52 },
  { key: 'tereza', nome_completo: 'Tereza Bulhões', email: 'tereza.demo@vertho.ai', cargo: DOCENCIA, role: 'colaborador', area_depto: PARQUE, gestor_nome: COORD_PARQUE.nome, gestor_email: COORD_PARQUE.email, d_natural: 32, i_natural: 44, s_natural: 74, c_natural: 50 },
];

/**
 * Quem NÃO conclui a jornada, e por quê.
 *
 * A persona navegável fica de fora porque a jornada EM ANDAMENTO dela é o
 * roteiro da apresentação: concluí-la silenciaria a demo da experiência do
 * professor. As outras três são o recorte "quem ainda está no meio", sem o qual
 * o painel vira uma tela em que 100% terminou — que não é o que um cliente vê
 * no meio de um ciclo.
 */
export const ESCOLAR_SHOWCASE_KEY = 'marina';
export const ESCOLAR_BEHIND_KEYS = ['otavio', 'edson', 'tereza'];
