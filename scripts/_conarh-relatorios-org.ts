/**
 * CONARH 52 — gera os relatórios ORGANIZACIONAIS da etapa 5 (Perfil
 * Organizacional e DNA Organizacional) para o tenant de DEMONSTRAÇÃO, com os
 * agregadores e componentes REAIS do produto.
 *
 *   npx --yes tsx scripts/_conarh-relatorios-org.ts
 *   → public/conarh/media/perfil-organizacional.pdf
 *   → public/conarh/media/dna-organizacional.pdf
 *
 * São os dois agregados que a tela de Relatórios oferece ao lado de PDI, Gestor
 * e RH. O "perfil" da etapa 5 é ESTE (a leitura da organização) — o individual
 * já aparece na etapa 4, no card da Camada 2.
 *
 * ⚠️ SÓ tenant `is_demo`. O DNA chama IA para a narrativa (1 chamada); o Perfil
 * Organizacional é 100% agregação, sem custo.
 *
 * ⚠️ Anonimato por construção: o Perfil Organizacional omite cargos com menos
 * de 3 pessoas. Num tenant de demo pequeno, esperar poucos blocos por cargo é
 * o comportamento correto — não um bug do script.
 */
import fs from 'node:fs';
import path from 'node:path';

const LINHAS_ENV = fs.existsSync('.env.local') ? fs.readFileSync('.env.local', 'utf-8').split(/\r?\n/) : [];
for (const linha of LINHAS_ENV) {
  const m = linha.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
}

import '@/components/pdf/styles';
import { createSupabaseAdmin } from '@/lib/supabase';
import { aggregatePerfilOrg } from '@/lib/perfil-organizacional/aggregate';
import { renderPerfilOrgPDF } from '@/lib/perfil-organizacional-pdf';
import { aggregateDna } from '@/lib/dna-organizacional/aggregate';
import { renderDnaPDF } from '@/lib/dna-organizacional-pdf';
import { gerarNarrativaDna } from '@/lib/dna-organizacional/narrative';

const DESTINO_PERFIL = 'public/conarh/media/perfil-organizacional.pdf';
const DESTINO_DNA = 'public/conarh/media/dna-organizacional.pdf';

function hoje(): string {
  return new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
}

async function salvar(destino: string, bytes: Uint8Array) {
  const alvo = path.join(process.cwd(), destino);
  fs.mkdirSync(path.dirname(alvo), { recursive: true });
  fs.writeFileSync(alvo, Buffer.from(bytes));
  console.log(`OK ${destino} — ${(Buffer.from(bytes).length / 1024) | 0} KB`);
}

async function main() {
  const sb = createSupabaseAdmin();
  const { data: empresa } = await sb
    .from('empresas').select('id, nome, segmento, is_demo').eq('is_demo', true).limit(1).maybeSingle();
  if (!empresa) throw new Error('nenhuma empresa is_demo — recusando gerar com dados de cliente');

  console.log('agregando perfil organizacional…');
  const p = await aggregatePerfilOrg(sb, empresa.id);
  await salvar(DESTINO_PERFIL, await renderPerfilOrgPDF({ empresaNome: empresa.nome, dataRef: hoje(), p }));

  console.log('agregando DNA + narrativa…');
  const dna = await aggregateDna(sb, empresa.id);
  const narrativa = await gerarNarrativaDna(dna, {
    empresaNome: empresa.nome,
    segmento: empresa.segmento,
    aiConfig: {},
  });
  await salvar(DESTINO_DNA, await renderDnaPDF({
    empresaNome: empresa.nome,
    dataRef: hoje(),
    segmento: empresa.segmento,
    dna,
    narrativa,
  }));
}

main().catch((e) => { console.error(e?.message || e); process.exit(1); });
