'use server';

// Portal do Representante — busca de escola na base do Mercado Potencial para o
// cadastro da conta no CRM (decisão do dono de 23/10/2026: só escolas, só a rede
// privada, que é o mercado dos RCs).
//
// O que sai daqui é dado público do Censo Escolar (nome, município, UF, INEP e as
// contagens de professores e gestores). NUNCA sai: os contatos enriquecidos
// (`mercado_escola_contatos`, responsáveis e e-mails), que são internos, e se a
// escola está com outro representante (isso deixaria o RC mapear a carteira dos
// outros; a conferência do registro diz só o que precisa, quando ele registra).
import { createSupabaseAdmin } from '@/lib/supabase';
import { requireRepresentativeOrAdminAction } from '@/lib/sales/permissions';
import { escaparLike } from '@/lib/sql-like';

const UFS = new Set(['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO']);
const LIMITE = 20;

export type EscolaDoMercado = {
  codigo_inep: string;
  nome: string;
  municipio: string | null;
  uf: string | null;
  professores: number | null;
  coordenadores: number | null;
  diretores: number | null;
  etapas: string[];
};

/** Sem acento e em maiúsculas: os nomes do Censo vêm assim ("COLEGIO SAO JOSE"). */
function semAcento(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/**
 * O município vem do Censo COM acento ("São Paulo"): cada letra que pode levar
 * acento vira o curinga de um caractere do LIKE, e "sao paulo" acha "São Paulo".
 */
function padraoDeMunicipio(s: string): string {
  return escaparLike(semAcento(s).toLowerCase()).replace(/[aeiouc]/g, '_');
}

/**
 * Escolas privadas da UF cujo nome contém todas as palavras digitadas (e, se
 * informado, do município). Até 20, as de mais professores primeiro.
 */
export async function buscarEscolasDoMercado(input: { termo: string; uf: string; municipio?: string }) {
  await requireRepresentativeOrAdminAction();
  const uf = String(input?.uf || '').trim().toUpperCase();
  if (!UFS.has(uf)) return { success: false as const, error: 'Escolha a UF da escola' };
  const palavras = semAcento(String(input?.termo || '')).toUpperCase().split(/[^0-9A-Z]+/).filter((p) => p.length >= 2);
  if (!palavras.length || palavras.join('').length < 3) return { success: false as const, error: 'Digite ao menos 3 letras do nome da escola' };

  const sb = createSupabaseAdmin();
  let q = sb.from('diag_mv_mercado_escola')
    .select('codigo_inep, nome, municipio, uf, qt_professores, qt_coord_pedag, qt_diretor_proxy, etapas')
    .eq('uf', uf).eq('rede', 'PRIVADA');
  for (const p of palavras.slice(0, 5)) q = q.ilike('nome', `%${escaparLike(p)}%`);
  const municipio = String(input?.municipio || '').trim();
  if (municipio) q = q.ilike('municipio', `%${padraoDeMunicipio(municipio)}%`);
  const { data, error } = await q.order('qt_professores', { ascending: false, nullsFirst: false }).limit(LIMITE);
  if (error) return { success: false as const, error: `Não foi possível buscar na base de escolas: ${error.message}` };

  const escolas: EscolaDoMercado[] = (data || []).map((e: any) => ({
    codigo_inep: e.codigo_inep,
    nome: e.nome,
    municipio: e.municipio ?? null,
    uf: e.uf ?? null,
    professores: e.qt_professores ?? null,
    coordenadores: e.qt_coord_pedag ?? null,
    diretores: e.qt_diretor_proxy ?? null,
    etapas: Array.isArray(e.etapas) ? e.etapas : [],
  }));
  return { success: true as const, escolas, limite: LIMITE };
}
