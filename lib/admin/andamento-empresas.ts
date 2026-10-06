import { requireAdminSupabase } from '@/lib/admin-supabase';
import { carregarPanoramaRH } from '@/lib/home/loaders';
import { isInternalEmail } from '@/lib/internal-emails';
import { listarTurmasDoTenant } from '@/lib/turmas';
import { resolverEscopoDeLote } from '@/lib/turmas/escopo';

export type RecorteAndamento = 'empresa' | 'cargo' | 'turma';

export type FaixaMapeamento = { feitas: number; total: number; pessoas: number };

export type AndamentoLinha = {
  pessoas: number;
  comPerfil: number;
  comMapeamento: number;
  /** Degraus do mapeamento: N pessoas com `feitas` de `total` competências. */
  progressoMapeamento: FaixaMapeamento[];
  emJornada: number;
  indisponivel: boolean;
};

export type AndamentoGrupo = AndamentoLinha & { rotulo: string };

export type AndamentoEmpresa = AndamentoLinha & {
  id: string;
  nome: string;
  /** Vazio quando o recorte é só a empresa. */
  grupos: AndamentoGrupo[];
};

type Panorama = Awaited<ReturnType<typeof carregarPanoramaRH>>;

const linhaDe = (p: Panorama): AndamentoLinha => ({
  pessoas: p.pessoas,
  comPerfil: p.comPerfil,
  comMapeamento: p.comMapeamento,
  progressoMapeamento: p.progressoMapeamento,
  emJornada: p.emJornada,
  indisponivel: p.indisponivel,
});

/**
 * Quantas pessoas de cada empresa já fizeram o DISC e o mapeamento de competências.
 *
 * Não reinventa a régua: chama `carregarPanoramaRH`, a MESMA função da home do
 * RH, então o número desta tela é o que o cliente vê na dele. `comPerfil` conta
 * `perfil_dominante` (ou o PDF externo, quando a empresa usa OPQ32/Hogan) e
 * `comMapeamento` exige o Top 5 do cargo inteiro avaliado — quem fez metade
 * não conta. Ambos excluem `role='rh'`, que não participa do programa, e as
 * contas da equipe Vertho (`@vertho.ai`, `lib/internal-emails.ts`).
 *
 * Recorte por cargo ou turma: cada grupo é a MESMA função com `colaboradorIds`,
 * nunca uma segunda implementação da régua. O "x de N" depende do cargo (o Top 5
 * de um cargo pode ter 1 ou 2 competências), então misturar cargos numa linha só
 * mistura escalas — o recorte por cargo existe também para isso.
 *
 * Demos ficam de fora: somariam pessoas fictícias ao levantamento real.
 */
export async function carregarAndamentoEmpresas(por: RecorteAndamento = 'empresa'): Promise<AndamentoEmpresa[]> {
  const sb = await requireAdminSupabase();
  const { data, error } = await sb.from('empresas').select('id, nome, is_demo').order('nome');
  if (error) throw new Error(`empresas: ${error.message}`);

  const reais = (data || []).filter((e: any) => !e.is_demo);
  const linhas = await Promise.all(reais.map(async (e: any): Promise<AndamentoEmpresa> => {
    const base = linhaDe(await carregarPanoramaRH(e.id));
    if (por === 'empresa' || base.pessoas === 0) return { id: e.id, nome: e.nome, ...base, grupos: [] };

    const { data: colabs, error: erroColabs } = await sb.from('colaboradores')
      .select('id, cargo, role, email')
      .eq('empresa_id', e.id)
      .neq('role', 'rh');
    if (erroColabs) throw new Error(`colaboradores de ${e.nome}: ${erroColabs.message}`);
    // Equipe fora do agrupamento: o panorama já a descarta dos números, e sem isto
    // um cargo só com contas internas apareceria como grupo de 0 pessoas.
    const pessoas = ((colabs || []) as Array<{ id: string; cargo: string | null; email: string | null }>)
      .filter((p) => !isInternalEmail(p.email));

    const porRotulo = new Map<string, string[]>();
    const separar = (rotulo: string, id: string) => {
      const ids = porRotulo.get(rotulo) || [];
      ids.push(id);
      porRotulo.set(rotulo, ids);
    };

    if (por === 'cargo') {
      for (const p of pessoas) separar(p.cargo?.trim() || 'Sem cargo', p.id);
    } else {
      const turmas = await listarTurmasDoTenant(sb, e.id);
      const emTurma = new Set<string>();
      for (const t of turmas) {
        const escopo = await resolverEscopoDeLote(sb, e.id, { tipo: 'turma', turmaId: t.id });
        const nela = new Set(escopo.colaboradorIds);
        for (const p of pessoas) {
          if (!nela.has(p.id)) continue;
          separar(t.nome, p.id);
          emTurma.add(p.id);
        }
      }
      for (const p of pessoas) if (!emTurma.has(p.id)) separar('Sem turma', p.id);
    }

    const grupos = await Promise.all([...porRotulo].map(async ([rotulo, ids]): Promise<AndamentoGrupo> => ({
      rotulo,
      ...linhaDe(await carregarPanoramaRH(e.id, { colaboradorIds: ids })),
    })));
    grupos.sort((a, b) => b.pessoas - a.pessoas);
    return { id: e.id, nome: e.nome, ...base, grupos };
  }));

  return linhas.filter((l) => l.pessoas > 0).sort((a, b) => b.pessoas - a.pessoas);
}
