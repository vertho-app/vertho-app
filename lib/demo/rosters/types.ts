/**
 * Formato de um ROSTER de demonstração: o elenco de um segmento.
 *
 * Um tenant demo é a soma de duas coisas: a IDENTIDADE (nome, marca, PPP,
 * valores — `DEMO_TENANT_PROFILES`) e o ROSTER (cargos, competências, personas).
 * A primeira já era parametrizada; a segunda estava presa no motor do reset,
 * e é ela que muda quando o segmento muda.
 */

/**
 * Cargo construído no CÓDIGO (não vem do fixture): competências, descritores,
 * Top 10 e cenários nascem daqui.
 *
 * `codPrefix` e `ehLideranca` são DADO, não regra. O motor os derivava do nome
 * ('Analista' → FIN, quem contém 'Coordenador'/'Gerente' é liderança), o que
 * funcionava por acidente num elenco só: num roster escolar, "Coordenação
 * Pedagógica" casaria a heurística por outro motivo, e "Professor(a)" não
 * casaria nenhuma.
 */
export type DemoRosterCargo = {
  nome: string;
  codPrefix: string;
  ehLideranca: boolean;
  area_depto: string;
  pilar: string;
  descricao: string;
  principais_entregas: string;
  stakeholders: string;
  decisoes_recorrentes: string;
  tensoes_comuns: string;
  contexto_cultural: string;
  competencias_foco: string[];
  /** [nome, descrição] por competência; os descritores N1-N4 saem do motor. */
  competencias: string[][];
};

/** Persona navegável: passa pela régua DISC, recebe artefatos e entra no ranking. */
export type DemoRosterPersona = {
  key: string;
  nome_completo: string;
  email: string;
  cargo: string;
  role: string;
  area_depto: string;
  gestor_nome: string | null;
  gestor_email: string | null;
  gestor_whatsapp: string | null;
  perfil_dominante: string;
  d_natural: number;
  i_natural: number;
  s_natural: number;
  c_natural: number;
  scenario: string;
  /** Competências que a persona responde no assessment (vazio = só diagnóstico). */
  responder: string[];
};

/**
 * Quem administra o programa no tenant. Fica FORA das personas de propósito:
 * não percorre a jornada, não tem DISC e não entra no ranking — só consome o
 * panorama e os relatórios.
 */
export type DemoRosterAdministradora = {
  key: string;
  nome_completo: string;
  email: string;
  cargo: string;
  role: string;
  area_depto: string;
};

export type DemoRoster = {
  key: string;
  /**
   * Cargo que vem do FIXTURE e tem o Top 5 fixado pelo roster. O fixture guarda
   * o Top 5 histórico da origem; para o cargo principal a ordem é decisão de
   * demonstração, não herança.
   */
  cargoPrincipal: string;
  cargoPrincipalTop5: string[];
  cargoPrincipalFoco: string[];
  /** Cargos do fixture que o roster NÃO semeia (vêm construídos, ou saíram). */
  cargosExcluidosDoFixture: Set<string>;
  cargosConstruidos: DemoRosterCargo[];
  personas: DemoRosterPersona[];
  administradora: DemoRosterAdministradora;
};
