/**
 * Prova ponta a ponta do `pdi_check` (bloco C).
 *
 * O guard cobre o módulo puro e o consumidor. Só a GERAÇÃO REAL prova que a
 * auditoria roda, que o auditor cross-família aceita o corpo, e que o veredito
 * chega persistido. Alvo: tenant de DEMO — o ACME é resetado toda madrugada
 * pelo fixture, então o artefato criado aqui é transitório por construção.
 *
 *   npx tsx --env-file=.env.local scripts/_probe-pdi-check.ts <colaboradorId>
 */
import { gerarRelatorioIndividualCore } from '../lib/relatorios/individual-core';
import { createSupabaseAdmin } from '../lib/supabase';

const EMPRESA_DEMO = '455f9366-fb4f-4c58-a79e-f94193464744'; // ACME Demo

async function main() {
  const colaboradorId = process.argv[2];
  if (!colaboradorId) throw new Error('uso: _probe-pdi-check.ts <colaboradorId>');

  const sb = createSupabaseAdmin();

  // Cinto de segurança: este script SÓ roda em tenant de demo. Gerar PDI é
  // escrever um documento sobre uma pessoa; se o alvo não for demo, para.
  const { data: emp, error: errEmp } = await sb
    .from('empresas').select('nome, is_demo').eq('id', EMPRESA_DEMO).single();
  if (errEmp) throw new Error(`empresa: ${errEmp.message}`);
  if (!emp?.is_demo) throw new Error(`"${emp?.nome}" NÃO é tenant de demo — recusando.`);
  console.log(`tenant: ${emp.nome} (is_demo)\n`);

  const t0 = Date.now();
  const r = await gerarRelatorioIndividualCore(sb, EMPRESA_DEMO, colaboradorId);
  console.log(`geração: ${r.success ? 'ok' : 'FALHOU'} · ${Math.round((Date.now() - t0) / 1000)}s`
    + `${r.error ? ` · ${r.error}` : ''} · pdf=${r.pdfPath ? 'sim' : 'não'}\n`);
  if (!r.success) process.exit(1);

  const { data, error } = await sb
    .from('relatorios')
    .select('conteudo')
    .eq('empresa_id', EMPRESA_DEMO).eq('colaborador_id', colaboradorId).eq('tipo', 'individual')
    .single();
  if (error) throw new Error(error.message);

  const a = (data?.conteudo as any)?.auditoria;
  if (!a) {
    console.log('🔴 o PDI foi persistido SEM `auditoria` — o consumidor não gravou o veredito.');
    process.exitCode = 1;
    return;
  }

  console.log(`veredito: ${a.status.toUpperCase()} · ${a.competenciasAuditadas} competência(s) auditada(s)`);
  console.log(`resumo: ${a.resumo}\n`);
  for (const c of a.checks) {
    const sinal = c.status === 'pass' ? '✅' : c.status === 'warn' ? '⚠️ ' : '🔴';
    console.log(`  ${sinal} [${c.categoria}] ${c.titulo}`);
    for (const o of (c.ocorrencias || []).slice(0, 3)) console.log(`       · ${o}`);
  }

  const semantica = a.checks.filter((c: any) => c.categoria === 'semantica');
  console.log(`\ncamada semântica: ${semantica.length} check(s).`);
  if (semantica.some((c: any) => c.id === 'semantica-indisponivel')) {
    console.log('🔴 a 2ª IA não rodou — o par cross-família não está de pé.');
    process.exitCode = 1;
  } else if (!semantica.length) {
    console.log('✅ auditor semântico rodou e não achou nada a apontar.');
  } else {
    console.log('✅ auditor semântico rodou e produziu achados.');
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
