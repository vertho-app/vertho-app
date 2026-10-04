'use server';

import { tenantDb } from '@/lib/tenant-db';
import { findColabByEmail } from '@/lib/authz';
import { TRILHA } from '@/lib/status';

/**
 * A temporada CONCLUÍDA que a "Minha evolução" da PESSOA abre.
 *
 * 🔴 ESTA TELA NÃO MOSTRA MAIS NOTA (R-08, 04/10/2026). Ela desenhava o par de
 * notas com duas casas ("2,10 → 2,40"), a queda em vermelho com sinal negativo,
 * uma barra proporcional à nota, "Nota média X de 4.0" e o comportamento que
 * caiu como "ponto de atenção". A decisão do dono (decisão 1 da revisão de
 * 02/10) é que ninguém do cliente vê nota decimal, que a evolução é só avanço
 * (piso zero, nunca regressão) e que "Minha evolução vai ao relatório da
 * temporada": o relatório que já existe (`/dashboard/temporada/concluida`) mostra
 * nível por competência, avanço com piso zero e o fecho, e o PDF e o certificado
 * saem dele. Manter aqui uma segunda tela com a mesma informação recriaria a
 * régua paralela que as outras telas de evolução já perderam.
 *
 * Então esta action só responde "qual relatório abrir": a temporada concluída
 * mais recente que TEM relatório de evolução. A leitura segue pela fonte de
 * sempre, `trilhas.evolution_report` (a única que o motor de fechamento grava;
 * as tabelas `evolucao*` estão vazias, ver o histórico em `docs/ARQUITETURA.md`).
 * O relatório do piloto e o do Personalizado sem fechamento entram também: a tela
 * de destino sabe mostrá-los como ponto de partida, sem avanço.
 *
 * O destino recebe o `id` da trilha (`?trilha=`): sem ele a rota do PDF e a do
 * certificado pegavam a trilha mais recente, que depois do encadeamento da
 * Jornada é a seguinte, ainda aberta (R-16).
 */
export async function loadEvolucao() {
  const { getAuthenticatedEmailFromAction } = await import('@/lib/auth/action-context');
  const email = await getAuthenticatedEmailFromAction();
  if (!email) return { error: 'Não autenticado' };

  const colab = await findColabByEmail(email, 'id, nome_completo, empresa_id');
  if (!colab) return { error: 'Colaborador não encontrado' };

  // tenantDb injeta .eq('empresa_id') em toda query: `colaborador_id` sozinho
  // não isola tenant (um id de outra empresa devolveria a linha dele).
  const tdb = tenantDb(colab.empresa_id);

  // O supabase-js RETORNA `{ error }` em vez de lançar: sem checar, uma falha
  // de leitura viraria "você ainda não concluiu nenhuma temporada" na tela de
  // alguém que concluiu.
  const { data: trilhas, error } = await tdb.from('trilhas')
    .select('id, numero_temporada, evolution_report, evolution_generated_at')
    .eq('colaborador_id', colab.id)
    .eq('status', TRILHA.CONCLUIDA)
    .not('evolution_report', 'is', null)
    .order('evolution_generated_at', { ascending: false });
  if (error) return { error: `Não foi possível carregar sua evolução: ${error.message}` };

  // Relatório sem descritores (forma desconhecida) não tem o que mostrar.
  const comRelatorio = (trilhas || []).filter((t: any) => Array.isArray(t.evolution_report?.descritores));

  return {
    /** A temporada mais recente com relatório; `null` = nenhuma concluída ainda. */
    trilhaId: (comRelatorio[0]?.id as string | undefined) ?? null,
    totalTemporadas: comRelatorio.length,
  };
}
