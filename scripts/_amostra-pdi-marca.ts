/* eslint-disable */
// Gera amostras do PDI para conferir a marca ANTES de regerar em lote.
//
//   npx tsx scripts/_amostra-pdi-marca.ts <slug> [pasta-de-saida]
//
// Sai com três arquivos: como está hoje (marca Vertho), sem marca COM o logo do
// tenant, e sem marca SEM logo nenhum.
//
// ⚠️ `renderToBuffer` vem do import ESTÁTICO daqui, junto com `components/pdf/styles`
// (que registra a NotoSans): sob `tsx`, o import dinâmico resolve outra cópia do
// módulo e o render morre com "Font family not registered". Ver F-I18 do FMEA.
process.loadEnvFile('.env.local');
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import React from 'react';
import '@/components/pdf/styles';
import { renderToBuffer } from '@react-pdf/renderer';
import { createSupabaseAdmin } from '@/lib/supabase';
import RelatorioIndividualPDF from '@/components/pdf/RelatorioIndividual';
import { getLogoCoverBase64 } from '@/lib/pdf-assets';

const SLUG = process.argv[2] || 'macae';
const SAIDA = process.argv[3] || join(process.env.USERPROFILE || '.', 'Downloads', 'amostra-pdi');

async function logoDoTenant(url?: string | null): Promise<string | null> {
  if (!url) return null;
  const r = await fetch(url);
  if (!r.ok) return null;
  const buf = Buffer.from(await r.arrayBuffer());
  const mime = (r.headers.get('content-type') || 'image/jpeg').split(';')[0];
  return `data:${mime};base64,${buf.toString('base64')}`;
}

async function main() {
  const sb = createSupabaseAdmin();
  const { data: emp } = await sb.from('empresas')
    .select('id, nome, ui_config').eq('slug', SLUG).maybeSingle();
  if (!emp) throw new Error(`empresa não encontrada: ${SLUG}`);

  const { data: rel } = await sb.from('relatorios')
    .select('id, conteudo, colaborador_id, gerado_em')
    .eq('empresa_id', (emp as any).id).eq('tipo', 'individual')
    .order('gerado_em', { ascending: false }).limit(1).maybeSingle();
  if (!rel) throw new Error('nenhum relatório individual neste tenant');

  const { data: colab } = await sb.from('colaboradores')
    .select('nome_completo, cargo')
    .eq('id', (rel as any).colaborador_id).eq('empresa_id', (emp as any).id).maybeSingle();

  const conteudo = typeof (rel as any).conteudo === 'string'
    ? JSON.parse((rel as any).conteudo) : (rel as any).conteudo;
  const data = {
    ...(rel as any), conteudo,
    colaborador_nome: (colab as any)?.nome_completo || '(sem nome)',
    colaborador_cargo: (colab as any)?.cargo || '',
  };
  const empresaNome = (emp as any).nome;
  const logoTenant = await logoDoTenant((emp as any).ui_config?.logo_url);
  console.log(`tenant: ${SLUG} · PDI de ${data.colaborador_nome} · logo do tenant: ${logoTenant ? 'OK' : 'ausente'}`);

  mkdirSync(SAIDA, { recursive: true });
  const variantes = [
    { nome: '1-hoje-com-marca-vertho.pdf', props: { logoBase64: getLogoCoverBase64() || undefined, mostrarVertho: true } },
    { nome: '2-sem-marca-com-logo-do-cliente.pdf', props: { logoBase64: logoTenant || undefined, mostrarVertho: false } },
    { nome: '3-sem-marca-sem-logo.pdf', props: { logoBase64: undefined, mostrarVertho: false } },
  ];

  for (const v of variantes) {
    const buf = await renderToBuffer(
      React.createElement(RelatorioIndividualPDF as any, { data, empresaNome, ...v.props }) as any,
    );
    const destino = join(SAIDA, v.nome);
    writeFileSync(destino, Buffer.from(buf));
    console.log(`  ${v.nome} — ${(buf.length / 1024).toFixed(0)} KB`);
  }
  console.log(`\n✅ ${SAIDA}`);
}

main().catch((e) => { console.error('ERRO:', e?.message || e); process.exit(1); });
