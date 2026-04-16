/**
 * Domain types Vertho. Manuais (não gerados) — conforme schema em produção.
 * Quando subirmos `supabase gen types`, este arquivo vira complemento só pra
 * tipos de negócio que o Supabase não infere (UserContext, Role, etc.).
 */

export type Role = 'colaborador' | 'gestor' | 'rh';
export type PerfilDISC = 'D' | 'I' | 'S' | 'C' | null;

export interface Colaborador {
  id: string;
  nome_completo: string;
  email: string;
  cargo?: string | null;
  area_depto?: string | null;
  empresa_id: string;
  role?: Role;
  perfil_dominante?: PerfilDISC;
  gestor_id?: string | null;
  ativo?: boolean;
}

export interface UserContext {
  colaborador: Colaborador | null;
  role: Role;
  empresaId: string | null;
  isPlatformAdmin: boolean;
}

export interface Trilha {
  id: string;
  colaborador_id: string;
  empresa_id: string;
  data_inicio?: string | null;
  semana_atual?: number;
  status?: 'ativa' | 'concluida' | 'cancelada';
  criado_em?: string;
}

export interface ProgressoSemana {
  id: string;
  trilha_id: string;
  semana: number;
  concluida?: boolean;
  concluida_em?: string | null;
}

export interface ActionResult<T = unknown> {
  ok?: boolean;
  error?: string;
  data?: T;
}

export interface Empresa {
  id: string;
  nome: string;
  slug: string;
  ativa?: boolean;
}
