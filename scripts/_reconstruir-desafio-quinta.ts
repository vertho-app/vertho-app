/* eslint-disable */
// READ-ONLY: reconstrói EXATAMENTE o texto do desafio da quinta enviado hoje (semana 1)
// replicando a lógica do cron triggerDiario. Mostra 1 exemplo completo + corpos distintos por (cargo,DISC).
process.loadEnvFile('.env.local');
import { createSupabaseAdmin } from '@/lib/supabase';
import { resolverDesafioDoKit } from '@/lib/season-engine/kit/desafio-semana';
import { templateWhatsAppDesafioQuinta } from '@/lib/notifications';

const EMP = '0d99fed1-1710-40e3-b32e-7a95c7d023fe';
const SEMANA = 1; // o desafio de hoje (quinta) cobrou a semana 1 (antes do avanço p/ 2)

async function desafioDe(sb: any, colab: any, plan: any, competenciaFoco: any): Promise<string> {
  const disc = String(colab.perfil_dominante || '').charAt(0).toUpperCase();
  const cargo = colab.cargo;
  const conteudosDia = (Array.isArray(plan?.conteudos_dia) && plan.conteudos_dia.length) ? plan.conteudos_dia : [];
  const linhas = await Promise.all(conteudosDia.map(async (e: any) => {
    const k = await resolverDesafioDoKit(sb, { empresaId: EMP, competencia: e.competencia || competenciaFoco, descritor: e.descritor, disc, cargo }).catch(() => null);
    return k?.desafio_texto || e.conteudo?.desafio_texto;
  }));
  return linhas.filter(Boolean).join('\n\n');
}

async function main() {
  const sb = createSupabaseAdmin();
  const { data: trilhas } = await sb.from('trilhas').select('colaborador_id,temporada_plano,competencia_foco').eq('empresa_id', EMP).eq('status', 'ativa');
  const ids = (trilhas || []).map((t: any) => t.colaborador_id);
  const { data: cs } = await sb.from('colaboradores').select('id,nome_completo,cargo,perfil_dominante,whatsapp').in('id', ids);
  const colabs = Object.fromEntries((cs || []).map((c: any) => [c.id, c]));

  const porChave = new Map<string, { texto: string; exemploNome: string; qtd: number }>();
  let exemploFull = '';
  for (const t of (trilhas || [])) {
    const c = colabs[(t as any).colaborador_id]; if (!c) continue;
    const disc = String(c.perfil_dominante || '').charAt(0).toUpperCase();
    const plano = ((t as any).temporada_plano || []) as any[];
    const plan = plano.find((s: any) => Number(s.semana) === SEMANA) || plano[SEMANA - 1];
    if (!plan) continue;
    const desafioTexto = await desafioDe(sb, c, plan, (t as any).competencia_foco);
    if (!desafioTexto) continue;
    const chave = `${c.cargo} · ${disc}`;
    if (!porChave.has(chave)) porChave.set(chave, { texto: desafioTexto, exemploNome: c.nome_completo, qtd: 0 });
    porChave.get(chave)!.qtd++;
    if (!exemploFull) exemploFull = templateWhatsAppDesafioQuinta(c.nome_completo.split(' ')[0], desafioTexto);
  }

  console.log('══════════ EXEMPLO COMPLETO (texto real enviado por WhatsApp) ══════════\n');
  console.log(exemploFull);
  console.log(`\n══════════ CORPOS DISTINTOS DO DESAFIO por (cargo · DISC) — ${porChave.size} variações ══════════\n`);
  for (const [chave, v] of porChave) {
    console.log(`── ${chave}  (${v.qtd} colab, ex.: ${v.exemploNome.split(' ')[0]}) ──`);
    console.log(v.texto);
    console.log('');
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
