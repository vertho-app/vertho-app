import { requireAdminSupabase } from '@/lib/admin-supabase';
import { carregarPanoramaRH } from '@/lib/home/loaders';

export type AndamentoEmpresa = {
  id: string;
  nome: string;
  pessoas: number;
  comPerfil: number;
  comMapeamento: number;
  emJornada: number;
  indisponivel: boolean;
};

/**
 * Quantas pessoas de cada empresa já fizeram o DISC e o mapeamento de competências.
 *
 * Não reinventa a régua: chama `carregarPanoramaRH`, a MESMA função da home do
 * RH, então o número desta tela é o que o cliente vê na dele. `comPerfil` conta
 * `perfil_dominante` (ou o PDF externo, quando a empresa usa OPQ32/Hogan) e
 * `comMapeamento` exige o Top 5 do cargo inteiro avaliado — quem fez metade
 * não conta. Ambos excluem `role='rh'`, que não participa do programa.
 *
 * Demos ficam de fora: somariam pessoas fictícias ao levantamento real.
 */
export async function carregarAndamentoEmpresas(): Promise<AndamentoEmpresa[]> {
  const sb = await requireAdminSupabase();
  const { data, error } = await sb.from('empresas').select('id, nome, is_demo').order('nome');
  if (error) throw new Error(`empresas: ${error.message}`);

  const reais = (data || []).filter((e: any) => !e.is_demo);
  const linhas = await Promise.all(reais.map(async (e: any): Promise<AndamentoEmpresa> => {
    const p = await carregarPanoramaRH(e.id);
    return {
      id: e.id,
      nome: e.nome,
      pessoas: p.pessoas,
      comPerfil: p.comPerfil,
      comMapeamento: p.comMapeamento,
      emJornada: p.emJornada,
      indisponivel: p.indisponivel,
    };
  }));

  return linhas.filter((l) => l.pessoas > 0).sort((a, b) => b.pessoas - a.pessoas);
}
