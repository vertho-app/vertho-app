/**
 * Enriquecimento de contatos das escolas (Mercado Potencial): tipos e regras comuns.
 *
 * Pipeline por escola: busca web (só fontes oficiais) -> conferência de cada dado contra a página
 * que o modelo citou -> Hunter (e-mail direto de quem decide) -> uma linha gravada de uma vez.
 * Só entra dado CONFIRMADO. Medido no piloto de Campinas (16/10/2026, 30 escolas): site em 29, telefone
 * confirmado em 26, e-mail institucional em 17, e 4 dos 159 dados conferíveis não estavam na página citada.
 */

/** Escola a enriquecer: nome, lugar e o endereço público do Censo (separa homônimos e unidades). */
export interface EscolaAlvo {
  codigo_inep: string;
  nome: string;
  municipio: string;
  uf: string;
  endereco?: string | null;
  bairro?: string | null;
  cep?: string | null;
}

export interface ItemContato { rotulo: string; fonte_url: string }
export interface ItemTelefone extends ItemContato { numero: string }
export interface ItemEmail extends ItemContato { endereco: string }

/** DADO PESSOAL. `email_origem` diz de onde veio o e-mail; `fonte_url` é nula quando o nome veio do Hunter. */
export interface ItemResponsavel {
  nome: string;
  cargo: string;
  fonte_url: string | null;
  email?: string | null;
  email_status?: string | null;
  email_score?: number | null;
  email_origem?: 'hunter_finder' | 'hunter_domain' | null;
}

/** 'a_completar' = a etapa do Hunter ainda não rodou; 'sem_creditos' e 'indisponivel' = tentou e não pôde. */
export type HunterStatus = 'ok' | 'a_completar' | 'sem_nomes' | 'sem_creditos' | 'indisponivel';
/** Os três que podem ser completados depois SEM pagar a busca web de novo. */
export const HUNTER_COMPLETAVEL: readonly HunterStatus[] = ['a_completar', 'sem_creditos', 'indisponivel'];

export type Nivel = 'A' | 'B' | 'C';

/** A linha da tabela `mercado_escola_contatos`. */
export interface LinhaContato {
  codigo_inep: string;
  site: string | null;
  site_confere_endereco: boolean | null;
  telefones: ItemTelefone[];
  emails: ItemEmail[];
  whatsapp: ItemTelefone[];
  responsaveis: ItemResponsavel[];
  nivel: Nivel | null;
  hunter_status: HunterStatus;
  observacao: string | null;
  custo_usd: number;
  hunter_creditos: number;
  coletado_por: string;
  coletado_em: string;
  expira_em: string;
}

/** Escolas por chamada ao servidor: mantém cada chamada abaixo do limite de tempo da função (300 s). */
export const TAMANHO_LOTE = 5;
/** Máximo de escolas por rodada, na ordem da tela. A rodada seguinte pega as próximas (as prontas saem da fila). */
export const TETO_RODADA = 200;

/** Validade do dado pessoal guardado. */
export const VALIDADE_DIAS = 180;

/** Custo médio da busca web por escola: MEDIDO em 32 chamadas (US$ 2,82; faixa 0,036 a 0,138). */
export const CUSTO_BUSCA_USD = 0.09;
/** Créditos do Hunter por escola, medidos no piloto de 20 escolas (46 créditos), com a verificação inclusa. */
export const CREDITOS_HUNTER_POR_ESCOLA = 2.3;

/** Cargo que decide: só estes seguem para o Hunter e só estes ficam guardados com e-mail. */
export const CARGO_DECISOR = /diretor|diretora|director|presiden|coordenador|coordenadora|gerente|superintend|reitor|mantenedor|propriet|fundador|\bceo\b|\bhead\b|principal|manager|owner|founder|administrador/i;

/**
 * Domínios que NÃO são da escola: provedor de e-mail gratuito ou de internet, plataforma de site e rede social.
 * O Hunter em cima deles devolve gente de outras empresas, então não servem como domínio de busca.
 */
export const PROVEDORES_GRATIS = new Set([
  'gmail.com', 'hotmail.com', 'outlook.com', 'live.com', 'yahoo.com', 'yahoo.com.br', 'uol.com.br', 'bol.com.br', 'terra.com.br',
  'ig.com.br', 'globo.com', 'icloud.com', 'msn.com', 'r7.com', 'zipmail.com.br', 'osite.com.br', 'correionet.com.br',
  'wixsite.com', 'wordpress.com', 'blogspot.com', 'google.com', 'facebook.com', 'instagram.com', 'linktr.ee', 'weebly.com',
]);

const DOMINIO_DUPLO = new Set(['com.br', 'org.br', 'net.br', 'g12.br', 'edu.br', 'gov.br']);

/** "https://www.escola.com.br/contato" -> "escola.com.br"; texto sem domínio válido -> null. */
export function dominioRegistravel(entrada: unknown): string | null {
  const bruto = String(entrada ?? '').trim().toLowerCase().replace(/^[a-z]+:\/\//, '').split('/')[0].split('?')[0].split('@').pop() || '';
  const p = bruto.replace(/^www\./, '').split('.').filter(Boolean);
  if (p.length < 2 || p.some((x) => !/^[a-z0-9-]+$/.test(x))) return null;
  const fim2 = p.slice(-2).join('.');
  return DOMINIO_DUPLO.has(fim2) && p.length >= 3 ? p.slice(-3).join('.') : fim2;
}

/** Tira honoríficos para o Hunter ("Pe. Fulano de Tal" -> "Fulano de Tal"). */
export function nomeParaBusca(nome: string): string {
  const H = /^(pe\.?|padre|irm[ãa]|ir\.?|prof\.?|profa\.?|dr\.?|dra\.?|sr\.?|sra\.?|frei|c[ôo]nego|ms\.?)\s+/i;
  let s = String(nome).trim();
  while (H.test(s)) s = s.replace(H, '');
  return s.trim();
}

export const soDigitos = (s: unknown): string => String(s ?? '').replace(/\D/g, '');

/** 8 últimos dígitos do número, sem ramal ("(19) 2138-8300, ramal 1000" -> "21388300"). */
export function finalDoTelefone(numero: unknown): string {
  return soDigitos(String(numero ?? '').replace(/(ramal|ramais|r\.)\s*.*$/i, '')).slice(-8);
}

export function nivelDe(l: Pick<LinhaContato, 'site' | 'telefones' | 'emails'>): Nivel {
  if (l.site && l.telefones.length && l.emails.length) return 'A';
  if (l.telefones.length || l.emails.length) return 'B';
  return 'C';
}
