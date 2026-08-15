import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { checarAcessoPlataforma } from '@/lib/authz-plataforma';
import { requireAdminSupabase } from '@/lib/admin-supabase';
import { csrfCheck } from '@/lib/csrf';
import { classificarMidia, BUCKET_ANEXOS } from '@/lib/inbox/anexos';

/**
 * POST /api/inbox/anexo/assinar — URL para o navegador subir o anexo DIRETO.
 *
 * POR QUE O ARQUIVO NÃO PASSA MAIS PELO SERVIDOR
 * ──────────────────────────────────────────────
 * Porque ele não cabe: o corpo de uma request na Vercel para em 4,5 MB (413
 * `FUNCTION_PAYLOAD_TOO_LARGE`), e isso mordeu no primeiro envio real, em
 * 15/08/2026 — um PDF nem chegava ao nosso código. Aqui o servidor só ASSINA; o
 * binário vai do navegador para o Storage, e a Meta busca de lá.
 *
 * ⚠️ O NOME DO ARQUIVO NÃO ENTRA NO CAMINHO. Um `filename` vindo do cliente é
 * escolhido por quem chama, e caminho de storage montado com valor externo é
 * como se escapa de prefixo (`../`). O path é UUID + extensão derivada do MIME
 * já validado; o nome original viaja em metadado, para a pessoa ver, nunca como
 * chave — é a mesma regra do `storageSlug()` do resto do projeto.
 */

export const runtime = 'nodejs';

const EXTENSAO: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png',
  'audio/aac': 'aac', 'audio/amr': 'amr', 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/ogg': 'ogg',
  'video/3gpp': '3gp', 'video/mp4': 'mp4',
  'application/pdf': 'pdf', 'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.ms-powerpoint': 'ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'text/plain': 'txt',
};

export async function POST(req: Request) {
  // Sessão por cookie viaja sozinha numa requisição cross-site: sem CSRF, um
  // site qualquer aberto na mesma máquina faria a equipe assinar uploads no
  // nosso bucket. O guard de CI cobra isto de toda rota mutativa por cookie.
  const csrf = csrfCheck(req);
  if (csrf) return csrf;

  const acesso = await checarAcessoPlataforma();
  if (!acesso.authorized) {
    return NextResponse.json({ error: 'não autorizado' }, { status: 401 });
  }

  let corpo: any;
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ error: 'corpo inválido' }, { status: 400 });
  }

  const mime = String(corpo?.mime || '').toLowerCase();
  const tamanho = Number(corpo?.tamanho) || 0;
  const empresaId = String(corpo?.empresaId || '');

  // A MESMA régua da tela e do envio. Assinar antes de validar seria pagar um
  // upload de 100 MB para recusar depois.
  const classe = classificarMidia(mime, tamanho);
  if (!classe.ok) return NextResponse.json({ error: classe.motivo }, { status: 400 });

  const ext = EXTENSAO[mime] || 'bin';
  const pasta = empresaId.replace(/[^a-zA-Z0-9-]/g, '') || 'sem-empresa';
  const path = `${pasta}/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.${ext}`;

  const sb = await requireAdminSupabase();
  const { data, error } = await sb.storage.from(BUCKET_ANEXOS).createSignedUploadUrl(path);
  if (error) {
    console.error('[inbox/anexo/assinar]', error.message);
    return NextResponse.json({ error: 'não foi possível preparar o envio' }, { status: 500 });
  }

  return NextResponse.json({ signedUrl: data.signedUrl, token: data.token, path: data.path });
}
