'use server';

import { tenantDb } from '@/lib/tenant-db';
import { requireUserAction } from '@/lib/auth/action-context';
import { findColabByEmail, canViewColabJourney } from '@/lib/authz';
import { calcularParticipacao, isTrilhaPiloto } from '@/lib/season-engine/participacao';
import { TRILHA } from '@/lib/status';
import { fetchPublico } from '@/lib/net-guard';

const LOGO_MAX_BYTES = 3 * 1024 * 1024;
const LOGO_MAX_DIM = 600; // px — cap da conversão (logo de rodapé é pequeno)

/** Host do Supabase Storage — único destino permitido pro logo do tenant. */
function hostSupabaseStorage(): string | null {
  try { return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).host; } catch { return null; }
}

/**
 * Rasteriza qualquer imagem (webp/svg/…) pra PNG — `@react-pdf` `<Image>` só
 * renderiza PNG/JPEG. `sharp` vem com o Next (`next → sharp`); import dinâmico
 * com fallback (ausente → null → nome em texto). SVG precisa de `density` p/ sair
 * nítido; `resize inside` limita o raster.
 */
async function paraPngDataUri(buf: Buffer, mime: string): Promise<string | null> {
  try {
    const sharp = (await import('sharp')).default;
    const png = await sharp(buf, mime.includes('svg') ? { density: 220 } : undefined)
      .resize({ width: LOGO_MAX_DIM, height: LOGO_MAX_DIM, fit: 'inside', withoutEnlargement: true })
      .png()
      .toBuffer();
    return `data:image/png;base64,${png.toString('base64')}`;
  } catch { return null; }
}

/**
 * Baixa o logo do tenant como data URI PNG/JPEG (convertendo webp/svg quando
 * preciso) ou null. NÃO é export — arquivo 'use server', export viraria endpoint.
 *
 * SSRF (logo_url é config do admin do tenant → destino atacável), defesa em
 * camadas: (1) allowlist ao host do nosso Supabase Storage — trava o destino no
 * nosso domínio (não alcança localhost/metadata/rede interna); (2) `fetchPublico`
 * (lib/net-guard) bloqueia IP privado/rebinding no connect; (3) `redirect:'error'`
 * impede um redirect fugir do host; (4) timeout + cap de tamanho.
 */
async function carregarLogoTenant(logoUrl: unknown): Promise<string | null> {
  if (!logoUrl || typeof logoUrl !== 'string') return null;
  const permitido = hostSupabaseStorage();
  let host: string;
  try { host = new URL(logoUrl).host; } catch { return null; }
  if (!permitido || host !== permitido) return null; // só o nosso Storage
  try {
    const res = await fetchPublico(logoUrl, { redirect: 'error', signal: AbortSignal.timeout(6000) });
    if (!res.ok) return null;
    const mime = (res.headers.get('content-type') || '').toLowerCase();
    if (!mime.startsWith('image/')) return null;
    const declarado = Number(res.headers.get('content-length') || 0);
    if (declarado && declarado > LOGO_MAX_BYTES) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > LOGO_MAX_BYTES) return null;
    // PNG/JPEG: react-pdf renderiza direto. webp/svg/outros: rasteriza pra PNG.
    if (mime.includes('png') || mime.includes('jpeg') || mime.includes('jpg')) {
      return `data:${mime};base64,${buf.toString('base64')}`;
    }
    return await paraPngDataUri(buf, mime);
  } catch { return null; }
}

/**
 * Carrega os dados do Certificado de Conclusão da temporada mais recente do
 * colaborador. Mesmo gate de posse de `temporada-concluida.ts` (auditoria
 * 23/07, grupo C): o email vem do CLIENTE — passam o próprio colab, gestor da
 * mesma área, RH/tutor do tenant e platform admin.
 *
 * Regras de emissão (produto): temporada concluída + participação ≥ 75%
 * (calcularParticipacao). Piloto (degustação) NÃO emite certificado.
 *
 * Retorna `{ error, motivo }` nos bloqueios — motivo: 'piloto' |
 * 'participacao' — pra rota responder 409 e a UI explicar o critério.
 */
export async function loadCertificadoData(email: string) {
  const ctx = await requireUserAction();
  if (!email) return { error: 'Não autenticado' };

  // findColabByEmail resolve o TENANT (multi-tenant → query direta quebrava).
  const colab = await findColabByEmail(email, 'id, nome_completo, cargo, empresa_id') as any;
  if (!colab) return { error: 'Colaborador não encontrado' };
  if (!canViewColabJourney(ctx, colab)) return { error: 'Sem permissão' };

  // Escopado ao tenant DO COLAB (resolvido acima, não vindo do cliente): o gate
  // de posse já passou, e o filtro garante que trilha/progresso lidos são dele.
  const tdb = tenantDb(colab.empresa_id);

  const { data: trilha, error: errTrilha } = await tdb.from('trilhas')
    .select('id, numero_temporada, competencia_foco, competencias_foco, data_inicio, evolution_generated_at, temporada_plano, evolution_report, programa_modo, empresa_id, status')
    .eq('colaborador_id', colab.id)
    .order('criado_em', { ascending: false })
    .limit(1).maybeSingle();
  // Falha de banco ≠ "não tem trilha": a segunda manda a pessoa procurar o RH.
  if (errTrilha) return { error: `Não foi possível ler a sua trilha agora: ${errTrilha.message}`, motivo: 'falha_leitura' };
  if (!trilha) return { error: 'Nenhuma trilha encontrada' };
  if (trilha.status !== TRILHA.CONCLUIDA) return { error: 'Temporada ainda não concluída' };

  // Piloto (degustação) não emite certificado — decisão de produto.
  if (isTrilhaPiloto(trilha)) return { error: 'Piloto não emite certificado', motivo: 'piloto' };

  const { data: progressos, error: errProg } = await tdb.from('temporada_semana_progresso')
    .select('semana, tipo, reflexao, feedback')
    .eq('trilha_id', trilha.id);

  // 🔴 F15 da auditoria: sem esta checagem, o `{ error }` do supabase-js passava
  // batido, `progressos` vinha null, `calcularParticipacao` recebia `[]` e a
  // pessoa levava **"Participação abaixo do mínimo (75%)" com pct 0**.
  //
  // Não é um erro exibido no lugar errado — é uma ACUSAÇÃO. Quem concluiu as 14
  // semanas lê que não participou, e o RH lê a mesma coisa na tela dele. Um
  // timeout de pool não pode virar um julgamento sobre o esforço de alguém.
  if (errProg) {
    return { error: `Não foi possível conferir a sua participação agora: ${errProg.message}`, motivo: 'falha_leitura' };
  }

  const participacao = calcularParticipacao(trilha.temporada_plano, progressos || []);
  if (!participacao.elegivel) {
    return { error: 'Participação abaixo do mínimo (75%)', motivo: 'participacao', participacao };
  }

  // `empresas` é a RAIZ do tenant (id === empresa_id) → não tem coluna
  // `empresa_id` pra tdb filtrar; vai pelo raw, com o id vindo da trilha já
  // escopada acima.
  const { data: empresa } = await tdb.raw.from('empresas')
    .select('nome, ui_config, default_locale')
    .eq('id', trilha.empresa_id).maybeSingle();

  // Logo do tenant (branding em `ui_config.logo_url`) → data URI. react-pdf em
  // Node não resolve URL remota + só rasteriza PNG/JPEG (SVG/webp NÃO renderiza
  // como <Image>) → só embutimos raster; senão o rodapé cai pro nome em texto.
  //
  // SSRF: `logo_url` é config do admin do tenant → destino atacável. Defesa em
  // camadas: (1) allowlist ao host do próprio Supabase Storage — onde 100% dos
  // logos vivem hoje (upload no branding), elimina o fetch arbitrário; (2)
  // `fetchPublico` (bloqueia IP privado/metadata/rebinding) como backstop se a
  // allowlist for afrouxada; (3) `redirect: 'error'` pra um redirect não fugir
  // da allowlist; (4) timeout. Host externo → cai pro nome em texto.
  const logoEmpresaBase64 = await carregarLogoTenant((empresa?.ui_config as any)?.logo_url);

  return {
    ok: true,
    colab: { nome: colab.nome_completo, cargo: colab.cargo },
    trilha: {
      numeroTemporada: trilha.numero_temporada,
      competencias: Array.isArray(trilha.competencias_foco) && trilha.competencias_foco.length
        ? trilha.competencias_foco
        : [trilha.competencia_foco].filter(Boolean),
      dataInicio: trilha.data_inicio,
      dataConclusao: trilha.evolution_generated_at,
    },
    empresa: { nome: empresa?.nome || '', locale: empresa?.default_locale || 'pt-BR' },
    participacao,
    logoEmpresaBase64,
  };
}
