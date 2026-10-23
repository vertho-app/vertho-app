'use server';

// Portal do Representante — atividade semanal de cada RC, SÓ para o admin
// (decisão do dono de 23/10/2026). É acompanhamento do canal, não meta de
// atividade nem controle de jornada: o representante autônomo organiza o próprio
// trabalho (contrato, 9.2 e 9.4), e o RC não vê este painel.
//
// Semana = segunda a domingo, em dias de Brasília.
import { createSupabaseAdmin } from '@/lib/supabase';
import { requireCommercialAdminAction } from '@/lib/sales/permissions';
import { dataBRT, segundaDaSemana, somarDias } from '@/lib/dre/semana';
import { valorDeFiltro } from '@/lib/postgrest-valor';

export type SemanaDeAtividade = {
  inicio: string;
  contatos: number;
  registros: number;
  mudancasDeEstagio: number;
  propostasCriadas: number;
  propostasEnviadas: number;
};

export type AtividadeDoRc = {
  representanteId: string;
  nome: string;
  status: string;
  semanas: SemanaDeAtividade[];
  ultimaMovimentacao: string | null;
};

const semanaDe = (instante: string) => segundaDaSemana(dataBRT(new Date(instante)));

/** As últimas `quantas` semanas (a atual incluída) de cada RC, da mais antiga para a atual. */
export async function getAtividadeSemanal(quantas = 4) {
  await requireCommercialAdminAction(false);
  const n = Math.min(12, Math.max(1, Math.floor(Number(quantas) || 4)));
  const atual = segundaDaSemana(dataBRT(new Date()));
  const inicios = Array.from({ length: n }, (_, i) => somarDias(atual, -7 * (n - 1 - i)));
  // 00h de Brasília da primeira segunda (UTC−3, sem horário de verão desde 2019).
  const desde = `${inicios[0]}T03:00:00.000Z`;

  const sb = createSupabaseAdmin();
  const [reps, notas, registros, propostas, movimentos] = await Promise.all([
    sb.from('sales_representatives').select('id, name, status').order('name'),
    sb.from('sales_activity_notes').select('representante_id, kind, note, created_at').gte('created_at', desde),
    sb.from('sales_opportunities').select('representante_id, created_at').gte('created_at', desde),
    sb.from('sales_proposals').select('representante_id, created_at, sent_to_client_at')
      .not('representante_id', 'is', null).or(`created_at.gte.${valorDeFiltro(desde)},sent_to_client_at.gte.${valorDeFiltro(desde)}`),
    sb.from('sales_opportunities').select('representante_id, last_movement_at').not('last_movement_at', 'is', null),
  ]);
  for (const r of [reps, notas, registros, propostas, movimentos]) {
    if (r.error) return { success: false as const, error: r.error.message };
  }

  const linhas: AtividadeDoRc[] = ((reps.data || []) as { id: string; name: string; status: string }[]).map((rep) => {
    const semanas: SemanaDeAtividade[] = inicios.map((inicio) => ({
      inicio, contatos: 0, registros: 0, mudancasDeEstagio: 0, propostasCriadas: 0, propostasEnviadas: 0,
    }));
    const na = (instante: string | null | undefined) => (instante ? semanas.find((s) => s.inicio === semanaDe(instante)) : undefined);
    for (const nota of (notas.data || []) as any[]) {
      if (nota.representante_id !== rep.id) continue;
      const s = na(nota.created_at);
      if (!s) continue;
      if (nota.kind === 'contato') s.contatos++;
      else if (String(nota.note || '').startsWith('Estágio:')) s.mudancasDeEstagio++;
    }
    for (const o of (registros.data || []) as any[]) {
      if (o.representante_id === rep.id) { const s = na(o.created_at); if (s) s.registros++; }
    }
    for (const p of (propostas.data || []) as any[]) {
      if (p.representante_id !== rep.id) continue;
      const criada = na(p.created_at);
      if (criada) criada.propostasCriadas++;
      const enviada = na(p.sent_to_client_at);
      if (enviada) enviada.propostasEnviadas++;
    }
    const ultimaMovimentacao = ((movimentos.data || []) as any[])
      .filter((m) => m.representante_id === rep.id)
      .map((m) => String(m.last_movement_at))
      .sort()
      .pop() ?? null;
    return { representanteId: rep.id, nome: rep.name, status: rep.status, semanas, ultimaMovimentacao };
  });

  return { success: true as const, inicios, linhas };
}
