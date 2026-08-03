/* eslint-disable */
// READ-ONLY: simula o envio de segunda da semana 4 de Ibipeba com os dados REAIS
// do banco (missão gravada como JSON cru em 33/36) — prova que a mensagem sai
// limpa e com a acao_principal resolvida pelo normalize.
process.loadEnvFile('.env.local');
import { createSupabaseAdmin } from '@/lib/supabase';
import { normalizeTemporadaPlano } from '@/lib/season-engine/normalize-temporada-plano';
import { templateWhatsAppMissao } from '@/lib/notifications/pilula-envio';
import { tenantUrl } from '@/lib/domain';

const EMP = '0d99fed1-1710-40e3-b32e-7a95c7d023fe';

async function main() {
  const sb = createSupabaseAdmin();
  const { data } = await sb.from('trilhas')
    .select('temporada_plano, colaboradores(nome_completo)')
    .eq('empresa_id', EMP).eq('status', 'ativa');
  let comAcao = 0, semAcao = 0, vazandoJson = 0;
  const baseUrl = tenantUrl('ibipeba');
  let exemplo = '';
  for (const t of (data as any[]) || []) {
    const planoNorm = normalizeTemporadaPlano(t.temporada_plano);
    const plan = planoNorm.find((s: any) => Number(s.semana) === 4);
    const acao = plan?.missao?.acao_principal || null;
    if (acao) comAcao++; else semAcao++;
    const msg = templateWhatsAppMissao(t.colaboradores?.nome_completo?.split(' ')[0] || 'Colaborador',
      { semana: 4, baseUrl, acaoPrincipal: acao });
    if (msg.includes('```') || msg.includes('acao_principal"')) vazandoJson++;
    if (!exemplo && acao) exemplo = msg;
  }
  console.log(`com acao_principal: ${comAcao} | sem: ${semAcao} | mensagem vazando JSON: ${vazandoJson}`);
  console.log('\n──── EXEMPLO DE MENSAGEM ────\n' + exemplo);
}

main().catch((e) => { console.error('ERRO FATAL:', e?.message || e); process.exit(1); });
