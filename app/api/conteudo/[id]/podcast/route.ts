import { NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabase';
import { requireUser, assertColabAccess } from '@/lib/auth/request-context';
import { logAdminAction } from '@/lib/audit';
import { servirComoDownload } from '@/lib/conteudo/download';
import {
  assinarAudioPersonalizado,
  BUCKET_AUDIO_PERSONALIZADO,
  localizarAudioPersonalizado,
  salvarAudioPersonalizado,
  type ChaveAudioPersonalizado,
} from '@/lib/conteudo/audio-personalizado';
import { extractNarration, generatePersonalizedPodcastAudio } from '@/lib/gemini-tts';

export const runtime = 'nodejs';
export const maxDuration = 300; // fallback on-demand p/ colab sem cache pré-aquecido

function redirectTo(url: string) {
  const res = NextResponse.redirect(url, { status: 302 });
  // O destino do áudio personalizado é um link ASSINADO que expira: o 302 não
  // pode ficar em cache (do browser ou de CDN) apontando para um link morto.
  res.headers.set('Cache-Control', 'private, no-store');
  return res;
}

/**
 * `?download=1` — o mesmo arquivo, com nome e como anexo.
 *
 * O 302 leva ao Storage, que serve `inline` e com nome de hash; e o atributo
 * `download` do `<a>` e ignorado entre origens. Sem isto, "baixar o podcast da
 * Taluana" entrega um `a7f3….mp3` que nao diz de quem e.
 */
async function entregar(url: string, req: Request): Promise<Response> {
  const q = new URL(req.url).searchParams;
  if (q.get('download') !== '1') return redirectTo(url);
  return servirComoDownload(url, q.get('name'), 'mp3');
}

async function downloadBaseAudio(sb: ReturnType<typeof createSupabaseAdmin>, content: any): Promise<Buffer | null> {
  if (content.storage_path) {
    const { data, error } = await sb.storage.from('conteudos').download(content.storage_path);
    if (!error && data) return Buffer.from(await data.arrayBuffer());
  }

  if (!content.url) return null;
  const response = await fetch(content.url);
  if (!response.ok) return null;
  return Buffer.from(await response.arrayBuffer());
}

/**
 * Material NOMINAL saindo da plataforma deixa rastro — mas so quando e de OUTRA
 * pessoa. O colaborador ouvindo o proprio podcast e uso normal, nao evento de
 * auditoria; registrar isso encheria o log e escondria o que importa.
 */
async function registrarAuditoria(
  auth: any,
  alvo: { id: string; nome_completo?: string | null } | null,
  conteudoId: string,
  req: Request,
): Promise<void> {
  if (!alvo || alvo.id === auth.colaborador?.id) return;
  const baixou = new URL(req.url).searchParams.get('download') === '1';
  await logAdminAction({
    adminEmail: auth.email,
    acao: baixou ? 'conteudo.download_podcast' : 'conteudo.abrir_podcast',
    alvo: alvo.nome_completo || alvo.id,
    detalhes: { conteudoId, colaboradorId: alvo.id },
    resultado: 'ok',
  });
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  // Relógio da REQUISIÇÃO, não da síntese: o portão precisa saber quanto falta para a
  // função morrer, e o que já se gastou em auth/leitura conta contra o mesmo orçamento.
  const inicioMs = Date.now();
  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;

  const { id } = await params;
  const sb = createSupabaseAdmin();
  const { data: content, error } = await sb
    .from('micro_conteudos')
    .select('id, formato, titulo, url, storage_path, conteudo_inline, competencia, empresa_id')
    .eq('id', id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!content) return NextResponse.json({ error: 'Conteúdo não encontrado' }, { status: 404 });
  if (content.formato !== 'audio') return NextResponse.json({ error: 'Conteúdo não é podcast' }, { status: 400 });

  if (content.empresa_id && !auth.isPlatformAdmin && content.empresa_id !== auth.empresaId) {
    return NextResponse.json({ error: 'sem acesso a este conteúdo' }, { status: 403 });
  }

  // AUDITORIA (admin/rh/gestor): `?colaboradorId=` serve o áudio COM a saudação da
  // PESSOA — o mesmo que ela ouve. O parâmetro é AUTORIZADO por assertColabAccess
  // (que já cobre platform admin, o próprio colab e rh/gestor do tenant), nunca
  // confiado em silêncio. NÃO é o padrão de bypass em que o chamador passa a
  // identidade e o gate é PULADO (ver `gerarConteudoFinalPersonalizado({colab})`).
  let alvo: { id: string; nome_completo?: string | null; empresa_id?: string | null } | null = auth.colaborador || null;
  const pedido = new URL(req.url).searchParams.get('colaboradorId');
  if (pedido && pedido !== auth.colaborador?.id) {
    const denied = await assertColabAccess(auth, pedido);
    if (denied) return denied;
    const { data: outro, error: erroOutro } = await sb
      .from('colaboradores')
      .select('id, nome_completo, empresa_id')
      .eq('id', pedido)
      .eq('empresa_id', content.empresa_id)
      .maybeSingle();
    if (erroOutro) return NextResponse.json({ error: 'não foi possível conferir o colaborador agora' }, { status: 503 });
    if (!outro) return NextResponse.json({ error: 'colaborador não encontrado neste conteúdo' }, { status: 404 });
    alvo = outro;
  }

  const nome = alvo?.nome_completo?.trim();
  if (!nome) {
    // Sem colaborador (ex.: admin): serve o áudio-base pré-gerado (sem nome).
    return content.url
      ? entregar(content.url, req)
      : NextResponse.json({ error: 'Podcast ainda não gerado' }, { status: 404 });
  }

  // O áudio com o nome é dado DA PESSOA: mora no bucket privado, na pasta da
  // empresa dela, e sai só por link assinado (`lib/conteudo/audio-personalizado.ts`).
  // Até 03/10/2026 esta rota autorizava e depois entregava a URL PÚBLICA e
  // permanente do bucket `conteudos` (continuação do R-74).
  const empresaDaPessoa = alvo?.empresa_id || null;
  if (!empresaDaPessoa) {
    console.error('[podcast personalizado] pessoa sem empresa; servindo o áudio-base', { colaboradorId: alvo?.id });
    return content.url
      ? entregar(content.url, req)
      : NextResponse.json({ error: 'Podcast ainda não gerado' }, { status: 404 });
  }
  const chave: ChaveAudioPersonalizado = { empresaId: empresaDaPessoa, conteudoId: content.id, colaboradorId: alvo!.id };

  const achado = await localizarAudioPersonalizado(sb.storage, chave);
  if ('url' in achado) {
    await registrarAuditoria(auth, alvo, content.id, req);
    return entregar(achado.url, req);
  }
  if ('erro' in achado) {
    // Storage fora: NÃO gerar de novo. Seria pagar TTS e prender a pessoa por
    // minutos por um arquivo que provavelmente já existe.
    console.error('[podcast personalizado] cache indisponível', { conteudoId: content.id, erro: achado.erro });
    return NextResponse.json({ error: 'podcast indisponível agora, tente de novo em instantes' }, { status: 503 });
  }

  try {
    const narracao = extractNarration(content.conteudo_inline || '');
    if (narracao.length >= 20) {
      // Sob demanda (a pessoa está esperando): o portão refaz em SÉRIE, e só enquanto
      // couber no que resta dos 300 s da rota. `Medido 10/09/2026` em 83 sínteses reais:
      // o take leva p50 99 s / p90 141 s / máx 174 s, a reprovação é de 7,4% por take, e
      // 27 de 27 episódios saíram na tentativa 1 — disparar 3 sempre pagava o pior caso
      // em 100% dos casos (US$ 0,17 por episódio contra US$ 0,06 assim).
      const audio = await generatePersonalizedPodcastAudio(narracao, nome, {
        feature: 'tts_podcast_personalizado',
        empresaId: content.empresa_id,
        colaboradorId: alvo!.id,
      }, { prazoAteMs: inicioMs + maxDuration * 1000 });
      const salvo = await salvarAudioPersonalizado(sb.storage, chave, audio.buffer, audio.contentType);
      if ('erro' in salvo) throw new Error(`upload do áudio personalizado: ${salvo.erro}`);

      const assinado = await assinarAudioPersonalizado(sb.storage, { bucket: BUCKET_AUDIO_PERSONALIZADO, caminho: salvo.caminho });
      if (!('url' in assinado)) throw new Error(`link do áudio personalizado: ${'erro' in assinado ? assinado.erro : 'não encontrado'}`);
      await registrarAuditoria(auth, alvo, content.id, req);
      return entregar(assinado.url, req);
    }
  } catch (err) {
    console.error('[podcast personalizado]', err);
  }

  const base = await downloadBaseAudio(sb, content);
  if (base) {
    return new NextResponse(new Uint8Array(base), {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'private, max-age=300',
      },
    });
  }

  return NextResponse.json({ error: 'Podcast ainda não gerado' }, { status: 404 });
}
