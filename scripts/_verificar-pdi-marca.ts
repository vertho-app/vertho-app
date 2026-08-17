/* eslint-disable */
// Baixa os PDFs de PDI que o tenant serve HOJE (pelo `pdf_path` gravado) e
// procura o termo em TODAS as páginas. Prova no artefato, não no código.
//
//   npx tsx scripts/_verificar-pdi-marca.ts <slug> [termo]
process.loadEnvFile('.env.local');
import path from 'node:path';
import { createSupabaseAdmin } from '@/lib/supabase';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

const SLUG = process.argv[2] || 'macae';
const TERMO = process.argv[3] || 'vertho';
const standardFontDataUrl = path.resolve('node_modules/pdfjs-dist/standard_fonts').replaceAll('\\', '/') + '/';

async function main() {
  const sb = createSupabaseAdmin();
  const { data: emp } = await sb.from('empresas').select('id').eq('slug', SLUG).maybeSingle();
  if (!emp) throw new Error(`empresa não encontrada: ${SLUG}`);

  const { data: rels } = await sb.from('relatorios')
    .select('id, pdf_path, colaborador_id')
    .eq('empresa_id', (emp as any).id).eq('tipo', 'individual')
    .order('gerado_em', { ascending: true });

  const re = new RegExp(TERMO, 'i');
  let comTermo = 0, semPath = 0, erros = 0, paginas = 0;

  for (const rel of (rels || []) as any[]) {
    if (!rel.pdf_path) { semPath++; console.log(`  ⚠️ ${rel.id}: sem pdf_path`); continue; }
    try {
      const { data: blob, error } = await sb.storage.from('relatorios-pdf').download(rel.pdf_path);
      if (error || !blob) throw new Error(error?.message || 'download vazio');
      const doc = await getDocument({
        data: new Uint8Array(await blob.arrayBuffer()),
        standardFontDataUrl, useWorkerFetch: false, isEvalSupported: false, disableFontFace: true,
      }).promise;
      let achou = false;
      for (let p = 1; p <= doc.numPages; p++) {
        const txt = (await doc.getPage(p)).getTextContent
          ? (await (await doc.getPage(p)).getTextContent()).items.map((i: any) => i.str).join(' ')
          : '';
        if (re.test(txt)) { achou = true; break; }
      }
      paginas += doc.numPages;
      if (achou) { comTermo++; console.log(`  ❌ ${rel.pdf_path} contém "${TERMO}"`); }
    } catch (e: any) {
      erros++;
      console.log(`  ⚠️ ${rel.pdf_path}: ${e?.message || e}`);
    }
  }

  const total = (rels || []).length;
  console.log(`\n${total} PDI(s) · ${paginas} páginas lidas · sem pdf_path: ${semPath} · erros: ${erros}`);
  console.log(comTermo === 0
    ? `✅ nenhum PDF servido contém "${TERMO}"`
    : `❌ ${comTermo} PDF(s) ainda contêm "${TERMO}"`);
}

main().catch((e) => { console.error('ERRO:', e?.message || e); process.exit(1); });
