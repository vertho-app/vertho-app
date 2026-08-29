/**
 * Baixa e valida localmente os artefatos persistidos da demo Grupo Sinal.
 * Uso: npx --yes tsx scripts/_qa-gruposinal-artifacts.ts
 */
import './_env';
import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { PDFParse } from 'pdf-parse';
import { createSupabaseAdmin } from '@/lib/supabase';

const SLUG = 'gruposinal';
const PDF_BUCKET = 'relatorios-pdf';
const CONTENT_BUCKET = 'conteudos';
const ROOT = path.resolve('tmp');
const PDF_DIR = path.join(ROOT, 'pdfs', SLUG);
const AUDIO_DIR = path.join(ROOT, 'audio', SLUG);
const sb = createSupabaseAdmin();

function safeName(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

async function download(bucket: string, storagePath: string, outputPath: string, kind: 'pdf' | 'audio') {
  const { data, error } = await sb.storage.from(bucket).download(storagePath);
  if (error || !data) throw new Error(`${bucket}/${storagePath}: ${error?.message || 'download vazio'}`);
  const buffer = Buffer.from(await data.arrayBuffer());
  if (buffer.length < 1000) throw new Error(`${storagePath}: arquivo pequeno demais (${buffer.length} bytes)`);
  if (kind === 'pdf' && buffer.subarray(0, 5).toString('ascii') !== '%PDF-') {
    throw new Error(`${storagePath}: assinatura PDF inválida`);
  }
  let pdfMeta: { pages: number; textChars: number } | undefined;
  if (kind === 'pdf') {
    const parser = new PDFParse({ data: buffer });
    try {
      const parsed = await parser.getText();
      pdfMeta = { pages: parsed.total, textChars: parsed.text.trim().length };
      if (pdfMeta.pages < 1 || pdfMeta.textChars < 100) {
        throw new Error(`${storagePath}: PDF sem páginas ou texto suficiente`);
      }
    } finally {
      await parser.destroy();
    }
  }
  await writeFile(outputPath, buffer);
  return { bytes: buffer.length, outputPath, ...pdfMeta };
}

async function latestContentPdf(folder: string, empresaId: string): Promise<string> {
  const { data, error } = await sb.storage.from(CONTENT_BUCKET).list(folder, { limit: 100, search: empresaId });
  if (error) throw new Error(`${folder}: ${error.message}`);
  const name = (data || []).filter((item: any) => item.name.startsWith(`${empresaId}-`)
    && item.name.endsWith('.pdf') && Number(item.metadata?.size || 0) > 0)
    .sort((a: any, b: any) => b.name.localeCompare(a.name))[0]?.name;
  if (!name) throw new Error(`${folder}: PDF do tenant não encontrado`);
  return `${folder}/${name}`;
}

async function main() {
  await mkdir(PDF_DIR, { recursive: true });
  await mkdir(AUDIO_DIR, { recursive: true });

  const { data: empresa, error: empresaError } = await sb.from('empresas')
    .select('id,nome,slug,is_demo').eq('slug', SLUG).maybeSingle();
  if (empresaError || !empresa) throw new Error(empresaError?.message || 'tenant não encontrado');
  if (empresa.is_demo !== true) throw new Error('guardrail: tenant não é demo');

  const { data: colabs, error: colabsError } = await sb.from('colaboradores')
    .select('id,nome_completo,email,role,perfil_dominante,comportamental_pdf_path,comportamental_audio_path')
    .eq('empresa_id', empresa.id).order('nome_completo');
  if (colabsError || !colabs) throw new Error(colabsError?.message || 'colaboradores não encontrados');
  const participantes = colabs.filter((c) => c.perfil_dominante);
  if (participantes.length !== 6) throw new Error(`esperados 6 perfis DISC, encontrados ${participantes.length}`);

  const { data: relatorios, error: relatoriosError } = await sb.from('relatorios')
    .select('id,tipo,colaborador_id,pdf_path,gerado_em')
    .eq('empresa_id', empresa.id).in('tipo', ['individual', 'gestor', 'rh']);
  if (relatoriosError || !relatorios) throw new Error(relatoriosError?.message || 'relatórios não encontrados');
  const byId = new Map(colabs.map((c) => [c.id, c.nome_completo]));
  const expectedReports = relatorios.filter((r) => r.pdf_path && (
    r.tipo === 'gestor' || r.tipo === 'rh'
    || (r.tipo === 'individual' && ['Bruna Costa', 'Mariana Lopes'].includes(byId.get(r.colaborador_id) || ''))
  ));
  const reportKinds = expectedReports.map((r) => `${r.tipo}:${r.colaborador_id ? byId.get(r.colaborador_id) : 'empresa'}`);
  for (const expected of ['individual:Bruna Costa', 'individual:Mariana Lopes', 'gestor:Carla Menezes', 'rh:empresa']) {
    if (!reportKinds.includes(expected)) throw new Error(`relatório ausente: ${expected}`);
  }

  const { data: cargo, error: cargoError } = await sb.from('cargos_empresa')
    .select('competencia_foco,competencias_foco').eq('empresa_id', empresa.id)
    .eq('nome', 'Analista Financeiro').maybeSingle();
  if (cargoError || !cargo || !Array.isArray(cargo.competencias_foco) || cargo.competencias_foco.length !== 2) {
    throw new Error(cargoError?.message || 'foco do cargo Financeiro não persistido');
  }

  const manifest: any = {
    tenant: { id: empresa.id, nome: empresa.nome, slug: empresa.slug },
    cargoFinanceiro: cargo,
    pdfs: [],
    audios: [],
  };

  for (const colab of participantes) {
    if (!colab.comportamental_pdf_path || !colab.comportamental_audio_path) {
      throw new Error(`${colab.nome_completo}: PDF ou áudio comportamental ausente`);
    }
    const stem = safeName(colab.nome_completo);
    const pdf = await download(PDF_BUCKET, colab.comportamental_pdf_path, path.join(PDF_DIR, `comportamental-${stem}.pdf`), 'pdf');
    const audio = await download(PDF_BUCKET, colab.comportamental_audio_path, path.join(AUDIO_DIR, `devolutiva-${stem}.mp3`), 'audio');
    manifest.pdfs.push({ tipo: 'comportamental', nome: colab.nome_completo, storagePath: colab.comportamental_pdf_path, ...pdf });
    manifest.audios.push({ nome: colab.nome_completo, storagePath: colab.comportamental_audio_path, ...audio });
  }

  for (const report of expectedReports) {
    const owner = report.colaborador_id ? byId.get(report.colaborador_id) || 'colaborador' : 'empresa';
    const filename = report.tipo === 'individual' ? `pdi-${safeName(owner)}.pdf`
      : report.tipo === 'gestor' ? 'relatorio-gestor-carla-menezes.pdf'
      : 'relatorio-rh-grupo-sinal.pdf';
    const file = await download(PDF_BUCKET, report.pdf_path, path.join(PDF_DIR, filename), 'pdf');
    manifest.pdfs.push({ tipo: report.tipo, nome: owner, storagePath: report.pdf_path, ...file });
  }

  for (const item of [
    { tipo: 'perfil-organizacional', filename: 'perfil-organizacional-grupo-sinal.pdf', storagePath: await latestContentPdf('final/perfil-org', empresa.id) },
    { tipo: 'dna-organizacional', filename: 'dna-organizacional-grupo-sinal.pdf', storagePath: await latestContentPdf('final/dna', empresa.id) },
  ]) {
    const file = await download(CONTENT_BUCKET, item.storagePath, path.join(PDF_DIR, item.filename), 'pdf');
    manifest.pdfs.push({ ...item, ...file });
  }

  if (manifest.pdfs.length !== 12) throw new Error(`esperados 12 PDFs, encontrados ${manifest.pdfs.length}`);
  if (manifest.audios.length !== 6) throw new Error(`esperados 6 áudios, encontrados ${manifest.audios.length}`);
  const manifestPath = path.join(ROOT, 'gruposinal-artifacts-manifest.json');
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(JSON.stringify({ ok: true, pdfs: manifest.pdfs.length, audios: manifest.audios.length, pdfDir: PDF_DIR, audioDir: AUDIO_DIR, manifestPath }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
