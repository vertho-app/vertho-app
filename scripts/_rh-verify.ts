/* eslint-disable */
// INTERNO/descartável: regenera o PDF de um relatorio RH a partir do conteudo
// JÁ salvo (sem re-rodar IA), pelo componente corrigido. Salva em ~/Downloads e
// sobrescreve o cache no storage (relatorios-pdf) se houver pdf_path.
// Rodar: npx tsx scripts/_rh-verify.ts
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import React from 'react';
import { renderToBuffer } from '@react-pdf/renderer';
import RelatorioRHPDF from '@/components/pdf/RelatorioRH';
import { getLogoCoverBase64 } from '@/lib/pdf-assets';
import { createClient } from '@supabase/supabase-js';

const ENV = fs.readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
const pick = (k: string) => ENV.match(new RegExp('^' + k + '=(.*)$', 'm'))?.[1]?.trim();
const sb = createClient(pick('NEXT_PUBLIC_SUPABASE_URL')!, pick('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

(async () => {
  const { data: emp } = await sb.from('empresas').select('id, nome').ilike('nome', '%Ibipeba%').limit(1).single();
  const { data: rel } = await sb.from('relatorios').select('id, conteudo, gerado_em, pdf_path')
    .eq('empresa_id', emp!.id).eq('tipo', 'rh').order('gerado_em', { ascending: false }).limit(1).single();
  const conteudo = typeof rel!.conteudo === 'string' ? JSON.parse(rel!.conteudo) : rel!.conteudo;
  const buf = Buffer.from(await renderToBuffer(
    // @ts-ignore - JSX com renderToBuffer (mesmo padrão de app/api/radar/lead-pdf/route.ts)
    React.createElement(RelatorioRHPDF, { data: { conteudo, gerado_em: rel!.gerado_em }, empresaNome: emp!.nome, logoBase64: getLogoCoverBase64() || undefined }),
  ));

  // 1. cópia local pra conferência
  const slug = String(emp!.nome).replace(/[^\w]+/g, '-').toLowerCase();
  const out = path.join(os.homedir(), 'Downloads', `vertho-rh-ibipeba-EXEMPLO-2.pdf`);
  fs.writeFileSync(out, buf);
  console.log('local:', out, (buf.length / 1024 | 0) + 'KB');

  // 2. sobrescreve o cache no storage (se houver), pra a versao live tambem ficar correta
  if (rel!.pdf_path) {
    const up = await sb.storage.from('relatorios-pdf').upload(rel!.pdf_path, buf, { contentType: 'application/pdf', upsert: true });
    console.log('cache storage:', up.error ? `ERRO ${up.error.message}` : `sobrescrito (${rel!.pdf_path})`);
  } else {
    console.log('cache storage: sem pdf_path (app gera on-the-fly)');
  }
})().catch((e) => { console.error(e); process.exit(1); });
