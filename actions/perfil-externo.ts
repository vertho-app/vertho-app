'use server';

import { createSupabaseAdmin } from '@/lib/supabase';
import { tenantDb } from '@/lib/tenant-db';
import { requireAdminAction } from '@/lib/auth/action-context';
import {
  montarOPQ32Profile,
  extrairMetadadosOPQ32,
  detectarTipoSHL,
  type OPQ32Profile,
} from '@/lib/perfil-externo/opq32-parser';

const BUCKET = 'perfis-externos';
const MAX_BYTES = 5 * 1024 * 1024;

// ── Empresa: ler / setar fonte externa ──────────────────────────────

export async function getEmpresaFonteExterna(empresaId: string): Promise<{
  fonte: 'opq32' | 'hogan' | 'mbti' | 'big5' | null;
}> {
  await requireAdminAction();
  const sb = createSupabaseAdmin();
  const { data } = await sb
    .from('empresas')
    .select('sys_config')
    .eq('id', empresaId)
    .maybeSingle();
  const fonte = (data?.sys_config as any)?.perfil_externo_fonte ?? null;
  return { fonte };
}

export async function setEmpresaFonteExterna(
  empresaId: string,
  fonte: 'opq32' | 'hogan' | 'mbti' | 'big5' | null,
): Promise<{ success: boolean; error?: string }> {
  await requireAdminAction();
  const sb = createSupabaseAdmin();
  const { data: emp } = await sb
    .from('empresas')
    .select('sys_config')
    .eq('id', empresaId)
    .maybeSingle();
  const cfg = (emp?.sys_config as any) || {};
  if (fonte) cfg.perfil_externo_fonte = fonte;
  else delete cfg.perfil_externo_fonte;
  const { error } = await sb
    .from('empresas')
    .update({ sys_config: cfg })
    .eq('id', empresaId);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

// ── Listar colaboradores com status do perfil externo ──────────────

export type PerfilExternoStatus =
  | 'sem_pdf'
  | 'pdf_carregado'
  | 'extraido'
  | 'erro_extracao';

export type ColaboradorPerfilExterno = {
  id: string;
  nome_completo: string;
  email: string;
  cargo: string | null;
  status: PerfilExternoStatus;
  perfil_externo_fonte: string | null;
  perfil_externo_pdf_path: string | null;
  perfil_externo_extraido_em: string | null;
  resumo?: { altas: number; baixas: number; cns: number | null } | null;
};

export async function listarPerfisExternos(empresaId: string): Promise<{
  colaboradores: ColaboradorPerfilExterno[];
  fonte: string | null;
}> {
  await requireAdminAction();
  const sb = createSupabaseAdmin();
  const tdb = tenantDb(empresaId);

  const { data: emp } = await sb
    .from('empresas')
    .select('sys_config')
    .eq('id', empresaId)
    .maybeSingle();
  const fonte = (emp?.sys_config as any)?.perfil_externo_fonte ?? null;

  const { data } = await tdb
    .from('colaboradores')
    .select(
      'id, nome_completo, email, cargo, perfil_externo_fonte, perfil_externo_dados, perfil_externo_pdf_path, perfil_externo_extraido_em',
    )
    .order('nome_completo');

  const colaboradores: ColaboradorPerfilExterno[] = (data || []).map((c: any) => {
    const temPdf = !!c.perfil_externo_pdf_path;
    const temDados = !!c.perfil_externo_dados;
    const status: PerfilExternoStatus = temDados
      ? 'extraido'
      : temPdf
        ? 'pdf_carregado'
        : 'sem_pdf';
    const dados = c.perfil_externo_dados as OPQ32Profile | null;
    return {
      id: c.id,
      nome_completo: c.nome_completo,
      email: c.email,
      cargo: c.cargo,
      status,
      perfil_externo_fonte: c.perfil_externo_fonte,
      perfil_externo_pdf_path: c.perfil_externo_pdf_path,
      perfil_externo_extraido_em: c.perfil_externo_extraido_em,
      resumo: dados
        ? {
            altas: dados.resumo?.altas?.length ?? 0,
            baixas: dados.resumo?.baixas?.length ?? 0,
            cns: dados.cns ?? null,
          }
        : null,
    };
  });

  return { colaboradores, fonte };
}

// ── Upload do PDF ───────────────────────────────────────────────────

/**
 * Recebe FormData com:
 *   colab_id, fonte ('opq32' default), file (PDF)
 *
 * Salva em perfis-externos/<empresa_id>/<colab_id>.pdf, atualiza colaborador.
 * NÃO extrai automaticamente — chamador chama extrairPerfilExterno depois.
 */
export async function uploadPerfilPdf(
  empresaId: string,
  formData: FormData,
): Promise<{ success: boolean; error?: string; path?: string }> {
  await requireAdminAction();
  const colabId = String(formData.get('colab_id') || '');
  const fonte = String(formData.get('fonte') || 'opq32') as 'opq32';
  const file = formData.get('file') as File | null;

  if (!colabId) return { success: false, error: 'colab_id obrigatório' };
  if (!file || file.size === 0) return { success: false, error: 'PDF não enviado' };
  if (file.size > MAX_BYTES) return { success: false, error: `PDF maior que ${MAX_BYTES / 1024 / 1024}MB` };
  if (file.type && file.type !== 'application/pdf') {
    return { success: false, error: 'Apenas arquivos PDF são aceitos' };
  }
  if (!['opq32', 'hogan', 'mbti', 'big5'].includes(fonte)) {
    return { success: false, error: `Fonte desconhecida: ${fonte}` };
  }

  const sb = createSupabaseAdmin();
  const tdb = tenantDb(empresaId);

  // Confirma que colaborador existe e pertence à empresa
  const { data: colab } = await tdb
    .from('colaboradores')
    .select('id')
    .eq('id', colabId)
    .maybeSingle();
  if (!colab) return { success: false, error: 'Colaborador não encontrado nesta empresa' };

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const path = `${empresaId}/${colabId}.pdf`;

  const { error: upErr } = await sb.storage
    .from(BUCKET)
    .upload(path, buffer, { contentType: 'application/pdf', upsert: true });
  if (upErr) return { success: false, error: `Upload falhou: ${upErr.message}` };

  const { error: updErr } = await tdb
    .from('colaboradores')
    .update({
      perfil_externo_fonte: fonte,
      perfil_externo_pdf_path: path,
      // Limpa dados antigos pra forçar re-extração
      perfil_externo_dados: null,
      perfil_externo_extraido_em: null,
    })
    .eq('id', colabId);
  if (updErr) return { success: false, error: updErr.message };

  return { success: true, path };
}

// ── Extração ────────────────────────────────────────────────────────

/**
 * Lê o PDF do bucket, extrai texto, parseia conforme a fonte (OPQ32 hoje),
 * e salva o JSON em colaboradores.perfil_externo_dados.
 */
export async function extrairPerfilExterno(
  empresaId: string,
  colabId: string,
): Promise<{ success: boolean; error?: string; profile?: OPQ32Profile }> {
  await requireAdminAction();
  const sb = createSupabaseAdmin();
  const tdb = tenantDb(empresaId);

  const { data: colab } = await tdb
    .from('colaboradores')
    .select('id, nome_completo, perfil_externo_fonte, perfil_externo_pdf_path')
    .eq('id', colabId)
    .maybeSingle();
  if (!colab) return { success: false, error: 'Colaborador não encontrado' };
  if (!colab.perfil_externo_pdf_path) return { success: false, error: 'Sem PDF carregado' };

  const fonte = (colab.perfil_externo_fonte as string) || 'opq32';
  if (fonte !== 'opq32') {
    return { success: false, error: `Parser para ${fonte} ainda não implementado` };
  }

  // Baixa PDF do bucket
  const { data: blob, error: dlErr } = await sb.storage
    .from(BUCKET)
    .download(colab.perfil_externo_pdf_path);
  if (dlErr || !blob) return { success: false, error: `Download PDF falhou: ${dlErr?.message || 'sem dados'}` };

  const arrayBuffer = await blob.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // Extrai texto via unpdf (serverless-safe)
  let texto = '';
  try {
    const { extractText } = await import('unpdf');
    const result = await extractText(new Uint8Array(buffer));
    texto = Array.isArray(result.text) ? result.text.join('\n\n') : result.text || '';
  } catch (err: any) {
    return { success: false, error: `Falha extraindo texto do PDF: ${err.message}` };
  }

  if (!texto || texto.length < 200) {
    return { success: false, error: 'PDF parece vazio ou corrompido' };
  }

  // Detecta o tipo de relatório antes de tentar parsear
  const tipo = detectarTipoSHL(texto);
  if (tipo === 'shl_dev_report') {
    return {
      success: false,
      error:
        'Este parece ser um Development Report da SHL (relatório narrativo de desenvolvimento). O sistema espera o "OPQ32 Perfil" — relatório de ~3 páginas com a tabela de Stens (1-10) e o bloco "Dados do Candidato" na última página. Procure pelo arquivo cujo nome inclui "OPQ32Profile".',
    };
  }
  if (tipo === 'shl_outro') {
    return {
      success: false,
      error:
        'Relatório SHL identificado, mas não é o "OPQ32 Perfil" suportado. Suba o relatório de tipo "OPQ32 Profile" (3 páginas, com tabela de Stens 1-10 e bloco "Dados do Candidato").',
    };
  }
  if (tipo === 'desconhecido') {
    return {
      success: false,
      error:
        'Não foi possível identificar este PDF como um relatório SHL OPQ32. Confirme que o arquivo é o "OPQ32 Perfil" oficial.',
    };
  }

  // tipo === 'opq32_profile' — segue parseando
  const meta = extrairMetadadosOPQ32(texto);
  const profile = montarOPQ32Profile({
    textoPdf: texto,
    nome: meta.nome ?? colab.nome_completo,
    dataAplicacao: meta.dataAplicacao,
    grupoComparacao: meta.grupoComparacao,
  });

  if (!profile) {
    return {
      success: false,
      error:
        'O PDF foi reconhecido como OPQ32 Perfil, mas não consegui extrair os 32 stens da página 3 (esperado >= 30 escalas). Pode ser uma versão mais antiga ou layout diferente. Me envia esse PDF pra ajustar o parser.',
    };
  }

  const { error: updErr } = await tdb
    .from('colaboradores')
    .update({
      perfil_externo_dados: profile as any,
      perfil_externo_extraido_em: new Date().toISOString(),
    })
    .eq('id', colabId);
  if (updErr) return { success: false, error: updErr.message };

  return { success: true, profile };
}

// ── Signed URL pra ver PDF ─────────────────────────────────────────

export async function getPerfilPdfUrl(
  empresaId: string,
  colabId: string,
): Promise<{ url?: string; error?: string }> {
  await requireAdminAction();
  const sb = createSupabaseAdmin();
  const tdb = tenantDb(empresaId);

  const { data: colab } = await tdb
    .from('colaboradores')
    .select('perfil_externo_pdf_path')
    .eq('id', colabId)
    .maybeSingle();
  if (!colab?.perfil_externo_pdf_path) return { error: 'Sem PDF' };

  const { data, error } = await sb.storage
    .from(BUCKET)
    .createSignedUrl(colab.perfil_externo_pdf_path, 60 * 30); // 30 min
  if (error || !data) return { error: error?.message || 'Falha gerando URL' };
  return { url: data.signedUrl };
}

// ── Deletar perfil externo ─────────────────────────────────────────

export async function deletarPerfilExterno(
  empresaId: string,
  colabId: string,
): Promise<{ success: boolean; error?: string }> {
  await requireAdminAction();
  const sb = createSupabaseAdmin();
  const tdb = tenantDb(empresaId);

  const { data: colab } = await tdb
    .from('colaboradores')
    .select('perfil_externo_pdf_path')
    .eq('id', colabId)
    .maybeSingle();

  if (colab?.perfil_externo_pdf_path) {
    await sb.storage.from(BUCKET).remove([colab.perfil_externo_pdf_path]);
  }

  const { error } = await tdb
    .from('colaboradores')
    .update({
      perfil_externo_fonte: null,
      perfil_externo_dados: null,
      perfil_externo_pdf_path: null,
      perfil_externo_extraido_em: null,
    })
    .eq('id', colabId);
  if (error) return { success: false, error: error.message };

  return { success: true };
}
