/* eslint-disable */
// Liga o modo sem marca de um tenant e REGERA os PDFs de PDI já existentes.
//
//   npx tsx scripts/_regerar-pdi-sem-marca.ts <slug> [--aplicar] [--logo-tenant]
//
// Por que regerar em vez de só ligar a flag: o PDF do PDI é gerado UMA vez e
// reusado (`if (!path)` em `baixarMeuPdiPdf`). Mudar o componente não toca nos
// arquivos já no Storage — quem já tem `pdf_path` continuaria baixando o PDF com
// a marca antiga para sempre.
//
// Não apaga os arquivos antigos do Storage: eles ficam órfãos (inofensivo) e o
// `pdf_path` passa a apontar para o novo. Apagar é irreversível e não é preciso.
//
// ⚠️ `renderToBuffer` e `components/pdf/styles` entram por import ESTÁTICO: sob
// `tsx`, o dinâmico resolve outra cópia do módulo e o render morre com
// "Font family not registered" (F-I18 do FMEA).
process.loadEnvFile('.env.local');
import React from 'react';
import '@/components/pdf/styles';
import { renderToBuffer } from '@react-pdf/renderer';
import { createSupabaseAdmin } from '@/lib/supabase';
import RelatorioIndividualPDF from '@/components/pdf/RelatorioIndividual';
import { storageSlug } from '@/lib/storage-slug';

const SLUG = process.argv[2] || 'macae';
const APLICAR = process.argv.includes('--aplicar');
const LOGO_TENANT = process.argv.includes('--logo-tenant');

async function main() {
  const sb = createSupabaseAdmin();
  const { data: emp, error: errEmp } = await sb.from('empresas')
    .select('id, nome, sys_config, ui_config').eq('slug', SLUG).maybeSingle();
  if (errEmp) throw new Error(errEmp.message);
  if (!emp) throw new Error(`empresa não encontrada: ${SLUG}`);
  const empresaId = (emp as any).id;
  const sysAtual = ((emp as any).sys_config || {}) as Record<string, any>;

  const { data: rels, error: errRel } = await sb.from('relatorios')
    .select('id, conteudo, colaborador_id, pdf_path, gerado_em')
    .eq('empresa_id', empresaId).eq('tipo', 'individual')
    .order('gerado_em', { ascending: true });
  if (errRel) throw new Error(errRel.message);

  console.log(`${SLUG} (${(emp as any).nome})`);
  console.log(`  sys_config: ${Object.keys(sysAtual).length} chaves · pdf_sem_marca atual: ${sysAtual.pdf_sem_marca ?? '(ausente)'}`);
  console.log(`  logo do cliente na capa: ${LOGO_TENANT ? 'SIM (--logo-tenant)' : 'não'}`);
  console.log(`  PDIs: ${rels?.length || 0} · com pdf_path: ${(rels || []).filter((r: any) => r.pdf_path).length}`);
  if (!APLICAR) { console.log('\n(dry-run — rode com --aplicar)'); return; }

  // 1) Flag, com MERGE (update de JSONB substitui a coluna inteira).
  const novoSys = { ...sysAtual, pdf_sem_marca: true, ...(LOGO_TENANT ? { pdf_logo_tenant: true } : {}) };
  const { error: errFlag } = await sb.from('empresas').update({ sys_config: novoSys }).eq('id', empresaId);
  if (errFlag) throw new Error(`falha ao gravar a flag: ${errFlag.message}`);
  const { data: conf } = await sb.from('empresas').select('sys_config').eq('id', empresaId).maybeSingle();
  const perdidas = Object.keys(sysAtual).filter((k) => !(k in ((conf as any)?.sys_config || {})));
  if (perdidas.length) throw new Error(`merge perdeu chaves: ${perdidas.join(', ')}`);
  console.log(`  ✅ flag ligada · ${Object.keys((conf as any).sys_config).length} chaves preservadas`);

  // 2) Regerar. `resolverMarcaPdf` é importado DEPOIS da flag para o cache não
  //    guardar o estado anterior.
  const { resolverMarcaPdf, resetMarcaPdfCache } = await import('@/lib/pdf-marca');
  resetMarcaPdfCache();
  const marca = await resolverMarcaPdf(empresaId);
  console.log(`  marca resolvida: mostrarVertho=${marca.mostrarVertho} · logo=${marca.logoBase64 ? 'sim' : 'nenhum'}`);
  if (marca.mostrarVertho) throw new Error('a flag não pegou — abortando antes de regerar com a marca errada');

  let ok = 0, falhas = 0;
  for (const [i, rel] of (rels || []).entries()) {
    const r: any = rel;
    try {
      const { data: colab } = await sb.from('colaboradores')
        .select('nome_completo, cargo')
        .eq('id', r.colaborador_id).eq('empresa_id', empresaId).maybeSingle();
      const conteudo = typeof r.conteudo === 'string' ? JSON.parse(r.conteudo) : r.conteudo;
      const data = {
        ...r, conteudo,
        colaborador_nome: (colab as any)?.nome_completo || '',
        colaborador_cargo: (colab as any)?.cargo || '',
      };
      const buffer = await renderToBuffer(
        React.createElement(RelatorioIndividualPDF as any, {
          data, empresaNome: (emp as any).nome,
          logoBase64: marca.logoBase64 || undefined,
          mostrarVertho: marca.mostrarVertho,
        }) as any,
      );
      const slug = storageSlug((colab as any)?.nome_completo || 'pdi', 'pdi');
      const path = `${empresaId}/individual-${slug}-${Date.now()}.pdf`;
      const { error: upErr } = await sb.storage.from('relatorios-pdf')
        .upload(path, Buffer.from(buffer), { contentType: 'application/pdf', upsert: true });
      if (upErr) throw new Error(upErr.message);
      const { error: updErr } = await sb.from('relatorios').update({ pdf_path: path }).eq('id', r.id);
      if (updErr) throw new Error(updErr.message);
      ok++;
      console.log(`  [${i + 1}/${rels!.length}] ✅ ${(colab as any)?.nome_completo || r.id} — ${(buffer.length / 1024).toFixed(0)} KB`);
    } catch (e: any) {
      falhas++;
      console.log(`  [${i + 1}/${rels!.length}] ❌ ${r.id}: ${e?.message || e}`);
    }
  }
  console.log(`\n${ok} regerado(s) · ${falhas} falha(s)`);
}

main().catch((e) => { console.error('ERRO:', e?.message || e); process.exit(1); });
