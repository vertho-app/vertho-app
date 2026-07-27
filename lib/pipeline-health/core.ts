/**
 * Health-check do pipeline — núcleo headless (sem gate; `'use server'` fica na action).
 *
 * Quatro modos:
 *  · preflight  — roda ANTES da entrega, com folga p/ corrigir. Pergunta: "a pílula
 *                 de amanhã está pronta e o que ela promete existe?"
 *  · postflight — roda DEPOIS do envio. Pergunta: "o que dizia que ia sair, saiu?"
 *  · estrutural — integridade que independe de entrega (duplicatas, presos, órfãos).
 *  · horizonte  — roda SEMANALMENTE e olha semanas à frente. Pergunta: "o que as
 *                 próximas semanas vão pedir e ainda não existe?" O pré-voo avisa em
 *                 25h, e isso basta para reenviar um e-mail — não para PRODUZIR. Kit
 *                 leva ~5min por DISC, e um bloco novo de competência pode significar
 *                 dezenas. Sem este modo, o alarme sempre chega tarde demais.
 *
 * Por que existe: o FMEA já catalogava 27 modos de falha e três deles morderam de
 * novo em 27/07. O gargalo nunca foi diagnóstico — era não haver nada que rodasse
 * sozinho e reclamasse. Um check que só um humano dispara é documentação.
 */
import { createSupabaseAdmin } from '@/lib/supabase';
import { severidadeGlobal, achado, type Achado, type ResultadoCheck } from './types';
import { regrasPreflight, regrasPostflight, checarHorizonteKits } from './regras';
import { coletarEntregasPrevistas, coletarEnviosDoDia, coletarHorizonteKits, diaDaSemanaBRT, pilulaDoDia } from './coleta';

/** Empresas elegíveis a envio: exclui demo (não envia comunicação real). */
async function empresasAtivas(sb: any) {
  const { data } = await sb.from('empresas').select('id, slug, nome, sys_config, is_demo');
  return ((data as any[]) || []).filter((e) => !e.is_demo);
}

// ── PRÉ-VOO ────────────────────────────────────────────────────────────────────

export async function rodarPreflight(dataAlvo: Date, empresaIdFiltro?: string): Promise<ResultadoCheck[]> {
  const sb = createSupabaseAdmin();
  const empresas = (await empresasAtivas(sb)).filter((e) => !empresaIdFiltro || e.id === empresaIdFiltro);
  const out: ResultadoCheck[] = [];

  for (const emp of empresas) {
    const t0 = Date.now();
    // try/catch POR EMPRESA: sem isso, uma empresa quebrada cega a varredura das
    // outras — o mesmo defeito que o cron de envio tem (FMEA §1.3).
    try {
      const { entregas, pilulaAlvo } = await coletarEntregasPrevistas(sb, emp.id, dataAlvo);
      if (!pilulaAlvo || !entregas.length) continue; // nada sai nesse dia p/ essa empresa
      const achados = regrasPreflight(entregas);
      out.push({
        modo: 'preflight', empresaId: emp.id, empresaSlug: emp.slug,
        dataAlvo: dataAlvo.toISOString().slice(0, 10),
        severidade: severidadeGlobal(achados), achados, duracaoMs: Date.now() - t0,
      });
    } catch (err: any) {
      out.push({
        modo: 'preflight', empresaId: emp.id, empresaSlug: emp.slug,
        dataAlvo: dataAlvo.toISOString().slice(0, 10),
        severidade: 'critico', duracaoMs: Date.now() - t0,
        erro: String(err?.message || err).slice(0, 300),
        achados: [{
          id: 'check-falhou', severidade: 'critico', titulo: 'O próprio health-check falhou',
          contagem: 1,
          detalhe: 'Sem resultado não há garantia nenhuma — silêncio por exceção é indistinguível de silêncio por estar tudo bem.',
          acao: 'Ver o erro no run e corrigir; não tratar como "sem problemas".',
        }],
      });
    }
  }
  return out;
}

// ── PÓS-VOO ────────────────────────────────────────────────────────────────────

export async function rodarPostflight(dataAlvo: Date, empresaIdFiltro?: string): Promise<ResultadoCheck[]> {
  const sb = createSupabaseAdmin();
  const empresas = (await empresasAtivas(sb)).filter((e) => !empresaIdFiltro || e.id === empresaIdFiltro);
  const dia = diaDaSemanaBRT(dataAlvo);
  const out: ResultadoCheck[] = [];

  for (const emp of empresas) {
    const t0 = Date.now();
    const pilula = pilulaDoDia((emp.sys_config as any)?.cadencia, dia);
    if (!pilula) continue;
    try {
      const envios = await coletarEnviosDoDia(sb, emp.id, dataAlvo, pilula);
      if (!envios.length) continue;
      const achados = regrasPostflight(envios);
      out.push({
        modo: 'postflight', empresaId: emp.id, empresaSlug: emp.slug,
        dataAlvo: dataAlvo.toISOString().slice(0, 10),
        severidade: severidadeGlobal(achados), achados, duracaoMs: Date.now() - t0,
      });
    } catch (err: any) {
      out.push({
        modo: 'postflight', empresaId: emp.id, empresaSlug: emp.slug,
        dataAlvo: dataAlvo.toISOString().slice(0, 10),
        severidade: 'critico', duracaoMs: Date.now() - t0,
        erro: String(err?.message || err).slice(0, 300), achados: [],
      });
    }
  }
  return out;
}

// ── ESTRUTURAL ─────────────────────────────────────────────────────────────────

/**
 * Integridade que independe de entrega. Estes números CRESCEM sozinhos quando falta
 * constraint: duplicatas de célula de vídeo eram 18 em 17/07 e 22 em 27/07. A série
 * histórica é o que mostra a tendência — uma foto isolada, não.
 */
export async function rodarEstrutural(): Promise<ResultadoCheck> {
  const sb = createSupabaseAdmin();
  const t0 = Date.now();
  const achados: (Achado | null)[] = [];
  try {
    // Contagem por query direta (head+count): sem DDL nova e sem SQL cru.
    // ⚠️ O `error` é PROPAGADO de propósito. Engolir aqui devolveria 0 — e "0
    // duplicatas" por falha de query é indistinguível de "0 duplicatas" de verdade.
    // É o mesmo defeito de `precarregarKits` (F-C4), que retorna Map vazio truthy
    // quando a query falha e desliga a personalização da coorte inteira em silêncio.
    const contar = async (tabela: string, filtro: (q: any) => any): Promise<number> => {
      const { count, error } = await filtro(sb.from(tabela).select('id', { count: 'exact', head: true }));
      if (error) throw new Error(`${tabela}: ${error.message}`);
      return count || 0;
    };

    const kitsPresos = await contar('kits', (q: any) => q.eq('status', 'generating'));
    achados.push(achado('kit-preso-generating', 'aviso', 'Kit preso em "generating"', kitsPresos,
      'Crash entre o upsert inicial e o update final deixa a linha nesse estado para sempre; o overlay ignora e re-runs empilham conteúdo no mesmo kit.',
      { acao: 'Marcar como error e regerar o tema (conteúdo→kits→brief).' }));

    const doisH = new Date(Date.now() - 2 * 3600_000).toISOString();
    const videoStale = await contar('videos_gerados', (q: any) =>
      q.in('status', ['processing', 'rendering', 'render_queued']).lt('created_at', doisH));
    achados.push(achado('video-stale', 'aviso', 'Vídeo travado há mais de 2h', videoStale,
      'A tela mostra "estamos preparando seu vídeo" para sempre — não há detecção de stale nesse caminho.',
      { acao: 'Re-disparar a célula; a linha antiga fica invisível para a entrega.' }));

    const persoPresos = await contar('videos_personalizados', (q: any) =>
      q.in('status', ['processing', 'pending']).lt('created_at', doisH));
    achados.push(achado('personalizado-preso', 'aviso', 'Vídeo personalizado travado', persoPresos,
      'A pessoa cai no deck genérico e perde a saudação com o nome — degradação silenciosa, ninguém percebe.',
      { acao: 'Job de reconciliação (FMEA F-V1) ou re-disparo manual.' }));

    const jobsPresos = await contar('kit_jobs', (q: any) =>
      q.in('status', ['queued', 'running']).lt('updated_at', new Date(Date.now() - 3600_000).toISOString()));
    achados.push(achado('kit-job-preso', 'aviso', 'Job de kit parado há mais de 1h', jobsPresos,
      'Sem watchdog: o polling da tela desiste em ~40min e ninguém é avisado.',
      { acao: 'Conferir o Trigger.dev e re-enfileirar.' }));

    // Duplicatas de célula de vídeo: cada cópia é um render HeyGen pago e a entrega
    // escolhe uma arbitrariamente (sem ORDER BY). Não há UNIQUE (F-C5), então o
    // número CRESCE sozinho — 18 em 17/07, 22 em 27/07. Medir aqui é o que torna a
    // tendência visível; a consolidação é delicada porque as cópias carregam
    // videos_personalizados prontos (125 em 27/07).
    const { data: celulas, error: errCel } = await sb
      .from('videos_gerados').select('modulo_base_id, empresa_id, cargo, disc_dominante').neq('status', 'error');
    if (errCel) throw new Error(`videos_gerados: ${errCel.message}`);
    const vistos = new Map<string, number>();
    for (const v of (celulas as any[] || [])) {
      const k = `${v.modulo_base_id}|${v.empresa_id}|${v.cargo}|${v.disc_dominante}`;
      vistos.set(k, (vistos.get(k) || 0) + 1);
    }
    const dupCelulas = [...vistos.values()].filter((n) => n > 1).length;
    achados.push(achado('celula-video-duplicada', 'aviso', 'Célula de vídeo com cópias', dupCelulas,
      'Cada cópia é um render pago e a entrega serve uma delas sem critério — a pessoa pode ver um vídeo diferente a cada acesso.',
      { acao: 'Consolidar migrando videos_personalizados para a célula vencedora ANTES de apagar (há personalizados prontos nas cópias).' }));

    const ungrounded = await contar('kit_briefs', (q: any) => q.is('modulo_base_id', null));
    achados.push(achado('brief-ungrounded', 'aviso', 'Brief sem módulo-base', ungrounded,
      'O kit inteiro nasce sem matéria-prima canônica: conteúdo genérico com status "published".',
      { acao: 'Publicar o módulo-base do tema e regerar o brief.' }));

    const a = achados.filter(Boolean) as Achado[];
    return { modo: 'estrutural', empresaId: null, dataAlvo: null, severidade: severidadeGlobal(a), achados: a, duracaoMs: Date.now() - t0 };
  } catch (err: any) {
    return {
      modo: 'estrutural', empresaId: null, dataAlvo: null, severidade: 'critico',
      duracaoMs: Date.now() - t0, erro: String(err?.message || err).slice(0, 300),
      achados: [{
        id: 'check-falhou', severidade: 'critico', titulo: 'O próprio health-check falhou',
        contagem: 1, detalhe: 'Sem resultado não há garantia nenhuma.',
        acao: 'Ver o erro no run.',
      }],
    };
  }
}

// ── HORIZONTE ──────────────────────────────────────────────────────────────────

/** Semanas à frente que o horizonte enxerga. 4 cobre o pior caso medido (bloco novo). */
export const HORIZONTE_SEMANAS = 4;

export async function rodarHorizonte(
  semanasAdiante: number = HORIZONTE_SEMANAS,
  empresaIdFiltro?: string,
): Promise<ResultadoCheck[]> {
  const sb = createSupabaseAdmin();
  const empresas = (await empresasAtivas(sb)).filter((e) => !empresaIdFiltro || e.id === empresaIdFiltro);
  const out: ResultadoCheck[] = [];

  for (const emp of empresas) {
    const t0 = Date.now();
    try {
      const lacunas = await coletarHorizonteKits(sb, emp.id, semanasAdiante);
      if (!lacunas.length) continue;   // coorte sem demanda futura pendente
      const achados = checarHorizonteKits(lacunas);
      if (!achados.length) continue;
      out.push({
        modo: 'horizonte', empresaId: emp.id, empresaSlug: emp.slug,
        dataAlvo: null,   // não é uma data de entrega: é uma janela
        severidade: severidadeGlobal(achados), achados, duracaoMs: Date.now() - t0,
      });
    } catch (err: any) {
      out.push({
        modo: 'horizonte', empresaId: emp.id, empresaSlug: emp.slug, dataAlvo: null,
        severidade: 'critico', duracaoMs: Date.now() - t0,
        erro: String(err?.message || err).slice(0, 300),
        achados: [{
          id: 'check-falhou', severidade: 'critico', titulo: 'O próprio health-check falhou',
          contagem: 1,
          detalhe: 'Sem resultado não há garantia nenhuma — silêncio por exceção é indistinguível de silêncio por estar tudo bem.',
          acao: 'Ver o erro no run e corrigir; não tratar como "sem problemas".',
        }],
      });
    }
  }
  return out;
}

// ── Persistência + alerta ──────────────────────────────────────────────────────

export async function persistirResultados(resultados: ResultadoCheck[]): Promise<void> {
  if (!resultados.length) return;
  const sb = createSupabaseAdmin();
  const { error } = await sb.from('pipeline_health_runs').insert(
    resultados.map((r) => ({
      modo: r.modo, empresa_id: r.empresaId, data_alvo: r.dataAlvo,
      severidade: r.severidade, total_achados: r.achados.length,
      achados: r.achados, duracao_ms: r.duracaoMs, erro: r.erro ?? null,
    })),
  );
  if (error) console.error('[pipeline-health] persistência falhou:', error.message);
}

/** Texto do alerta. Separado do envio para ser testável sem rede. */
export function montarAlerta(resultados: ResultadoCheck[]): { assunto: string; html: string } | null {
  const graves = resultados.filter((r) => r.severidade === 'critico');
  if (!graves.length) return null;
  const total = graves.reduce((s, r) => s + r.achados.length, 0);
  // O horizonte não avalia uma DATA de entrega (dataAlvo é null): dizer "entrega de
  // hoje" num alerta que fala de semanas à frente mandaria corrigir a coisa errada.
  const soHorizonte = graves.every((r) => r.modo === 'horizonte');
  const quando = soHorizonte ? 'próximas semanas' : (graves.find((r) => r.dataAlvo)?.dataAlvo || 'hoje');
  const linhas = graves.map((r) => {
    const itens = r.achados.map((a) => `
      <li style="margin:8px 0">
        <strong>${a.titulo}</strong> — ${a.contagem}<br>
        <span style="color:#555;font-size:13px">${a.detalhe}</span>
        ${a.amostra?.length ? `<br><span style="color:#777;font-size:12px">${a.amostra.join(' · ')}</span>` : ''}
        ${a.acao ? `<br><span style="color:#0b6;font-size:12px">→ ${a.acao}</span>` : ''}
      </li>`).join('');
    return `<p style="margin:16px 0 4px"><strong>${r.empresaSlug || r.empresaId || 'global'}</strong> · ${r.modo}${r.erro ? ` · <span style="color:#c00">erro: ${r.erro}</span>` : ''}</p><ul style="padding-left:18px;margin:0">${itens}</ul>`;
  }).join('');
  return {
    assunto: soHorizonte
      ? `[Vertho] ${total} lacuna(s) de conteúdo nas próximas semanas`
      : `[Vertho] ${total} problema(s) na entrega de ${quando}`,
    html: `<div style="font-family:system-ui,Arial,sans-serif;max-width:640px;color:#1a1a1a;line-height:1.5">
<p>O health-check do pipeline encontrou problemas <strong>críticos</strong>.</p>${linhas}
<p style="color:#666;font-size:12px;margin-top:20px">Pré-voo roda ~25h antes do envio (dá tempo de corrigir o que já existe); o horizonte roda semanalmente e olha ${HORIZONTE_SEMANAS} semanas à frente, porque PRODUZIR conteúdo não cabe em 25h. Detalhe em /admin/vertho/pipeline-health.</p></div>`,
  };
}

/** Envia o alerta para os admins da plataforma. Nunca lança. */
export async function alertar(resultados: ResultadoCheck[]): Promise<boolean> {
  const alerta = montarAlerta(resultados);
  if (!alerta) return false;
  const destinos = String(process.env.ADMIN_EMAILS || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!destinos.length) {
    // Sem destino, o alerta morreria em silêncio — exatamente o que este sistema
    // existe para evitar. Loga alto para aparecer no Sentry/Vercel.
    console.error('[pipeline-health] ALERTA CRÍTICO SEM DESTINO (ADMIN_EMAILS vazia):', alerta.assunto);
    return false;
  }
  try {
    const { enviarEmailPilula } = await import('@/lib/notifications/pilula-envio');
    for (const to of destinos) await enviarEmailPilula(to, alerta.assunto, alerta.html);
    return true;
  } catch (e: any) {
    console.error('[pipeline-health] envio do alerta falhou:', e?.message);
    return false;
  }
}

/** Orquestra um modo completo: roda, persiste, alerta. Usado pelo cron. */
export async function executarHealthCheck(modo: 'preflight' | 'postflight' | 'estrutural' | 'horizonte') {
  const agora = new Date();
  let resultados: ResultadoCheck[];
  if (modo === 'preflight') {
    // Avalia a entrega de AMANHÃ — o ponto é sobrar tempo para corrigir.
    resultados = await rodarPreflight(new Date(agora.getTime() + 24 * 3600_000));
  } else if (modo === 'postflight') {
    resultados = await rodarPostflight(agora);
  } else if (modo === 'horizonte') {
    resultados = await rodarHorizonte();
  } else {
    resultados = [await rodarEstrutural()];
  }
  await persistirResultados(resultados);
  const alertou = await alertar(resultados);
  const criticos = resultados.filter((r) => r.severidade === 'critico').length;
  const avisos = resultados.filter((r) => r.severidade === 'aviso').length;
  return {
    message: `${modo}: ${resultados.length} run(s) · ${criticos} crítico(s) · ${avisos} aviso(s)${alertou ? ' · alerta enviado' : ''}`,
    criticos, avisos, resultados,
  };
}
