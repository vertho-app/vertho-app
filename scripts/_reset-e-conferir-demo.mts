/* eslint-disable */
// Roda o reset canônico do acme-demo e confere as invariantes da régua nova:
// soma 200, liderança = DISC/2, comp_* pela regressão canônica.
import './_env';
import { resetAcmeDemo } from '@/lib/demo/reset-acme-demo';
import { createSupabaseAdmin } from '@/lib/supabase';
import { computeDiscCompetenciesNatural } from '@/lib/disc-competencias';
import { deriveProfile } from '@/lib/disc-mapeamento';

async function main() {
  const r = await resetAcmeDemo();
  console.log('reset:', r.ok ? 'OK' : `FALHOU: ${r.error}`, JSON.stringify(r.counts || {}));
  if (!r.ok) process.exit(1);

  const sb = createSupabaseAdmin();
  const { data: colabs } = await sb.from('colaboradores')
    .select('*').eq('empresa_id', r.empresaId).order('nome_completo');

  console.log('\nInvariantes por persona:');
  for (const c of colabs || []) {
    const disc = { D: Number(c.d_natural), I: Number(c.i_natural), S: Number(c.s_natural), C: Number(c.c_natural) };
    const soma = disc.D + disc.I + disc.S + disc.C;
    const canon = computeDiscCompetenciesNatural(disc);
    const okComp = Math.abs(Number(c.comp_persistencia) - canon['Persistência']) < 0.05
      && Math.abs(Number(c.comp_persuasao) - canon['Persuasão']) < 0.05;
    const okLid = Math.abs(Number(c.lid_executivo) - disc.D / 2) < 0.06;
    const okPerfil = c.perfil_dominante === deriveProfile(disc);
    console.log(
      `  ${(c.nome_completo + '').padEnd(15)} D${disc.D} I${disc.I} S${disc.S} C${disc.C} ` +
      `soma ${soma}${soma === 200 ? ' ✓' : ' ✗'} · perfil ${c.perfil_dominante}${okPerfil ? ' ✓' : ' ✗'} · ` +
      `comp ${okComp ? '✓' : '✗'} · lid ${okLid ? '✓' : '✗'} · ` +
      `persistência ${c.comp_persistencia} · persuasão ${c.comp_persuasao} · report ${c.report_texts ? 'congelado' : 'AUSENTE'}`
    );
  }
}

main().catch((e) => { console.error('FALHOU:', e?.message || e); process.exit(1); });
