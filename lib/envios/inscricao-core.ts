/**
 * Inscrição na cadência semanal — NÚCLEO sem gate.
 *
 * POR QUE FORA DA ACTION
 * ──────────────────────
 * `fase4_envios` é o que o motor (`triggerDiario`) varre: sem linha lá, a
 * cadência não manda nada, por mais pronta que a trilha esteja. Abrir uma turma
 * é, portanto, uma operação de OPERAÇÃO — acontece em janela marcada, às vezes
 * fora do horário de alguém abrir a tela, e precisa ser repetível por script.
 *
 * 🔴 O caminho headless é ESTE, e não uma flag na action. Num arquivo
 * `'use server'` todo export é endpoint HTTP, e um parâmetro que pula o gate
 * passa a ser escolhido pelo CLIENTE — o furo que esta base já pagou em
 * `gerarBlueprint`. A action aplica `requireAdminAction` SEMPRE e delega aqui.
 *
 * ⚠️ Idempotente por `(empresa_id, email)`: reinscrever reativa sem duplicar e
 * sem zerar carimbo — o `upsert` mantém a linha existente atualizada.
 */
import { TRILHA, ENVIO } from '@/lib/status';

export interface ResultadoInscricao {
  success: boolean;
  inscritos: number;
  message: string;
}

/** Data de hoje em YYYY-MM-DD (UTC). */
function hojeYMD(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Inscreve em `fase4_envios` (status `ativo`, semana 1) quem tem trilha ATIVA.
 *
 * `tdb` é um `tenantDb(empresaId)` — o escopo de tenant vem dele, não de um
 * `empresa_id` solto no payload.
 */
export async function inscreverNaCadencia(
  tdb: any,
  opts: { colabIds?: string[] } = {},
): Promise<ResultadoInscricao> {
  const { data: trilhas, error: errTrilhas } = await tdb.from('trilhas')
    .select('colaborador_id')
    .eq('status', TRILHA.ATIVA);
  if (errTrilhas) return { success: false, inscritos: 0, message: errTrilhas.message };

  let idsAtivos: string[] = Array.from(new Set(
    (trilhas || []).map((t: any) => t.colaborador_id).filter(Boolean) as string[],
  ));
  if (opts.colabIds?.length) {
    const filtro = new Set(opts.colabIds);
    idsAtivos = idsAtivos.filter((id) => filtro.has(id));
  }
  if (!idsAtivos.length) {
    return { success: true, inscritos: 0, message: 'Nenhum colaborador com trilha ativa para inscrever' };
  }

  const { data: colabs, error: errColabs } = await tdb.from('colaboradores')
    .select('id, nome_completo, email, cargo, whatsapp')
    .in('id', idsAtivos);
  if (errColabs) return { success: false, inscritos: 0, message: errColabs.message };

  const hoje = hojeYMD();
  const rows = (colabs || [])
    // `fase4_envios.email` é NOT NULL — quem não tem e-mail fica de fora aqui, e
    // o número disso é o que a mensagem devolve (silêncio esconderia a lacuna).
    .filter((c: any) => c.email)
    .map((c: any) => ({
      colaborador_id: c.id,
      email: c.email,
      nome: c.nome_completo || null,
      cargo: c.cargo || null,
      whatsapp: c.whatsapp || null,
      data_inicio: hoje,
      semana_atual: 1,
      status: ENVIO.ATIVO, // MINÚSCULO — a query do cron filtra .eq('status','ativo')
    }));

  if (!rows.length) {
    return { success: true, inscritos: 0, message: 'Nenhum colaborador elegível (sem e-mail)' };
  }

  const { error: errUp } = await tdb.from('fase4_envios')
    .upsert(rows, { onConflict: 'empresa_id,email' });
  if (errUp) return { success: false, inscritos: 0, message: errUp.message };

  const semEmail = (colabs || []).length - rows.length;
  return {
    success: true,
    inscritos: rows.length,
    message: `${rows.length} colaborador(es) inscrito(s) no envio semanal`
      + (semEmail ? ` · ${semEmail} sem e-mail ficaram de fora` : ''),
  };
}
