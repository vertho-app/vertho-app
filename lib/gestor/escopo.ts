/**
 * A régua de ESCOPO do gestor: quem cada papel enxerga.
 *
 * Mora em `lib/` e não em `app/dashboard/gestor/actions.ts` porque aquele arquivo é `'use server'`: todo
 * export dele é um ENDPOINT, e esta função recebe o CLIENTE DO BANCO como primeiro argumento (reanálise de
 * 05/10/2026). Um argumento serializado do cliente não tem `.from`, então não era explorável, mas é a mesma
 * classe do `sb` forjado que a análise de 05/10 fechou em outros pontos (`sb || await requireEmpresaSupabase`).
 * Aqui ela deixa de ser alcançável de fora.
 */
import { isTenantDemo } from '@/lib/demo/envio-guard';
import { recortarElencoDemo } from '@/lib/demo/elenco-visivel';
import { registrarLeituraIndisponivel } from '@/lib/gestor/leitura-indisponivel';
/** Colunas que a home do gestor pede de cada liderado. */
const COLS_LIDERADO = 'id, nome_completo, cargo, email, area_depto, perfil_dominante, d_natural, i_natural, s_natural, c_natural, perfil_externo_dados, perfil_externo_pdf_path, foto_url, gestor_email, role';

/**
 * QUEM cada papel enxerga — a régua de escopo, em um lugar só.
 *
 * Gestor: liderados por `colaboradores.gestor_email` (NÃO existe gestor_id; o
 * type em types/index.d.ts está aspiracional). RH/admin: a empresa toda.
 * Fail-closed nos dois: sem match, lista vazia.
 *
 * Existe como função porque a home do gestor e a tela de engajamento do time
 * precisam do MESMO recorte. Duas cópias desta regra divergiriam calado — e o
 * modo de falhar é o pior possível: um gestor vendo gente que não é dele.
 *
 * Em tenant de DEMONSTRAÇÃO o recorte ainda passa por `recortarElencoDemo`: a
 * visão de RH da sala de apresentação abre para qualquer prospect, e sem isso
 * ela listava pelo nome os convidados da degustação (medido em 16/09/2026).
 */
export async function resolverEscopoDoGestor(
  sb: any,
  { empresaId, meuId, meuEmail, isGestor }: {
    empresaId: string; meuId: string; meuEmail?: string | null;
    isGestor: boolean;
  },
): Promise<{ liderados: any[]; liderIds: string[]; indisponivel?: boolean }> {
  const emailNormalizado = meuEmail?.toLowerCase().trim();
  let colabQ = sb.from('colaboradores')
    .select(COLS_LIDERADO)
    .eq('empresa_id', empresaId)
    .neq('id', meuId);
  if (isGestor && emailNormalizado) {
    colabQ = colabQ.ilike('gestor_email', emailNormalizado);
  }
  const { data: colabs, error } = await colabQ;
  if (error) {
    // Lista vazia aqui era lida como "você não tem liderados" (R-139). Devolve a marca de
    // que a leitura falhou: quem chama diz "indisponível", e a falha vai para o
    // `degradacao_log` em vez de morrer num `console.error`.
    await registrarLeituraIndisponivel(empresaId, 'escopo-do-gestor', error.message);
    return { liderados: [], liderIds: [], indisponivel: true };
  }
  // `ilike` trata `_` e `%` como curinga — e-mail com underscore (comum) faria a
  // listagem casar gestores que NÃO são o mesmo. Refina em código com igualdade
  // exata (case-insensitive): é a MESMA régua do gate de posse em
  // getPerfilExternoPdfUrl, então ver e abrir nunca divergem.
  const doEscopo = (colabs || []).filter((c: any) =>
    c.role !== 'rh' && (!isGestor || !emailNormalizado || (c.gestor_email || '').toLowerCase().trim() === emailNormalizado),
  );
  const liderados = recortarElencoDemo(doEscopo, await isTenantDemo(empresaId));
  return { liderados, liderIds: liderados.map((c: any) => c.id) };
}
