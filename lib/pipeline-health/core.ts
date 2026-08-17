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
import { regrasPreflight, regrasPostflight, checarHorizonteKits, checarDestinoDoAlerta, checarMbForaDaRegua, checarDegradacoes, checarCelulaVideoEmError, checarPushDegradado, checarPushSemVapid, checarCanalEntradaWhatsapp, checarTemplatesLigados } from './regras';
import { webPushConfigurado } from '@/lib/notifications/providers/webpush';
import { inspecionarCloudApi } from '@/lib/whatsapp/cloud-api';
import { inspecionarTemplatesLigados } from '@/lib/whatsapp/templates-ligados';
import { coletarEntregasPrevistas, coletarEnviosDoDia, coletarHorizonteKits, coletarMbForaDaRegua, coletarDegradacoes, coletarPushDiario, coletarCelulasVideoSemDeck, diaDaSemanaBRT, pilulaDoDia } from './coleta';

/**
 * Empresas elegíveis a envio: exclui demo (não envia comunicação real).
 *
 * ⚠️ LANÇA se a query falhar, em vez de devolver `[]`. O supabase-js **retorna**
 * `{ error }` — não lança — e sem esta checagem uma falha aqui virava lista
 * vazia: os três modos que dependem dela varreriam zero empresas, devolveriam
 * zero resultados, e `executarHealthCheck` reportaria
 * "0 run(s) · 0 crítico(s) · 0 aviso(s)". Um health-check que não conseguiu
 * olhar nada diria exatamente o mesmo que um que olhou tudo e não achou
 * problema — que é a falha mais cara possível num instrumento de alarme.
 *
 * Lançar é o certo aqui (e não devolver um achado): quem chama está DENTRO do
 * `executarHealthCheck`, o cron transforma exceção em 500 observável, e o
 * try/catch por empresa lá embaixo cobre o caso oposto — uma empresa quebrada
 * não pode cegar a varredura das outras.
 */
async function empresasAtivas(sb: any) {
  const { data, error } = await sb.from('empresas').select('id, slug, nome, sys_config, is_demo');
  if (error) throw new Error(`health-check não conseguiu listar empresas: ${error.message}`);
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

/**
 * Hora UTC em que a cadência dispara (`trigger_diario` no `vercel.json`).
 *
 * Vive aqui porque é o que dá SENTIDO ao pós-voo: "o que ia sair, saiu?" só é uma
 * pergunta respondível depois que o envio terminou.
 */
const HORA_DISPARO_UTC = 11;

/**
 * Quanto tempo esperar depois do disparo antes de julgar a entrega.
 *
 * 🔴 POR QUE ISTO EXISTE (medido em 17/08/2026)
 * ─────────────────────────────────────────────
 * O pós-voo rodava DENTRO do mesmo request do `trigger_diario`. Isso funcionava
 * enquanto o trigger enviava; quando ele virou **dispatcher** (fan-out de uma
 * task QStash por empresa), o check passou a medir logo após o ENFILEIRAMENTO —
 * antes de qualquer worker gravar carimbo.
 *
 * O resultado não foi silêncio, foi MENTIRA: em 17/08 o run das 11:00:21 gritou
 * *"Nenhum WhatsApp saiu hoje"*, *"Nenhum e-mail saiu hoje"* e *"36 pessoas não
 * receberam por canal nenhum"* — enquanto as 36 pílulas saíam entre 11:00:28 e
 * 11:00:43 e chegavam como `delivered`. Mesmo padrão em 03/08.
 *
 * ⚠️ O timing já estava DESCRITO num comentário do `app/api/cron/route.ts` ("este
 * postflight roda logo após o enfileiramento"), e o alarme continuou disparando
 * assim mesmo: **aviso em comentário não é mecanismo**. O cron passou a rodar às
 * 11:45 e esta guarda é a segunda linha — se alguém reencaixar o pós-voo cedo,
 * ele diz "ainda não dá para saber" em vez de inventar uma pane.
 *
 * 45 min de folga no cron, 25 aqui: a janela entre os dois é a margem para o
 * fan-out atrasar sem que o check vire ruído.
 */
export const MINUTOS_MINIMOS_APOS_DISPARO = 25;

/** Minutos desde o disparo do dia. Negativo = ainda não disparou. */
export function minutosDesdeODisparo(agora: Date, dataAlvo: Date): number {
  const disparo = new Date(Date.UTC(
    dataAlvo.getUTCFullYear(), dataAlvo.getUTCMonth(), dataAlvo.getUTCDate(), HORA_DISPARO_UTC, 0, 0,
  ));
  return Math.floor((agora.getTime() - disparo.getTime()) / 60_000);
}

export async function rodarPostflight(
  dataAlvo: Date,
  empresaIdFiltro?: string,
  agora: Date = new Date(),
): Promise<ResultadoCheck[]> {
  const decorridos = minutosDesdeODisparo(agora, dataAlvo);
  if (decorridos < MINUTOS_MINIMOS_APOS_DISPARO) {
    // Registra em vez de sumir: "silêncio por exceção é indistinguível de
    // silêncio por estar tudo bem" vale também para o check que se absteve.
    return [{
      modo: 'postflight', empresaId: null, empresaSlug: null,
      dataAlvo: dataAlvo.toISOString().slice(0, 10),
      severidade: 'aviso', duracaoMs: 0,
      achados: [{
        id: 'postflight-cedo-demais',
        severidade: 'aviso',
        titulo: 'Pós-voo não julgou: cedo demais para saber',
        contagem: 1,
        detalhe: `Só ${decorridos} min desde o disparo das ${HORA_DISPARO_UTC}:00 UTC, e o envio é assíncrono (uma task por empresa). Julgar agora produziria "nenhum canal saiu" com as mensagens ainda em voo — foi o que aconteceu em 03/08 e 17/08.`,
        acao: `Rodar de novo pelo menos ${MINUTOS_MINIMOS_APOS_DISPARO} min após o disparo (o cron postflight_entrega já faz isso às ${HORA_DISPARO_UTC}:45 UTC).`,
      }],
    }];
  }

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

    // O alarme tem destinatário? Sem isso, todo o resto deste arquivo é decorativo
    // (R8 — medido em 27/07: a env não existia em nenhum ambiente).
    achados.push(checarDestinoDoAlerta(destinosDoAlerta().join(',')));

    // R9: MB publicado com descritor fora da régua — ancora o conteúdo no assunto vizinho.
    achados.push(checarMbForaDaRegua(await coletarMbForaDaRegua(sb)));

    // R10: célula que falhou e segue sem deck — o `video-stale` acima só pega presos,
    // e quem termina em `error` sai do radar da entrega em silêncio (F-V3).
    achados.push(checarCelulaVideoEmError(await coletarCelulasVideoSemDeck(sb)));

    // R10: telemetria de degradação (FMEA §3.3) — fallback existe, nunca invisível.
    achados.push(checarDegradacoes(await coletarDegradacoes(sb)));

    // R11: saúde do canal push em 24h. Aqui e não no pós-voo porque o pós-voo
    // roda logo após o ENFILEIRAMENTO do fan-out, antes de os workers enviarem.
    achados.push(checarPushDegradado(await coletarPushDiario(sb)));

    // R11b: o caso que a R11 é ESTRUTURALMENTE incapaz de ver. Sem VAPID o envio
    // aborta antes de gravar entrega — total 0, falhas 0, achado nulo. A env
    // responde de graça e sem ambiguidade; inferir de tabela vazia confundiria
    // "ninguém aderiu", "cron não rodou", "flag desligada" e "VAPID ausente".
    achados.push(checarPushSemVapid(
      webPushConfigurado(),
      await contar('notification_endpoints', (q: any) => q.eq('enabled', true)),
    ));

    // R12: o canal de ENTRADA do WhatsApp. Único check deste arquivo que sai
    // para a rede — e tem que ser assim: o inbound não deixa rastro no banco
    // quando cai, então não há tabela onde inferir. Ver `checarCanalEntradaWhatsapp`.
    achados.push(...checarCanalEntradaWhatsapp(await inspecionarCloudApi()));

    // R13: qual template está LIGADO em cada papel da cadência. Também sai para
    // a rede, e pela mesma razão do R12 — a resposta não existe em tabela
    // nenhuma. O nome vem de env *Sensitive* (ilegível até pelo CLI), então
    // sem este check a única forma de descobrir que a pílula aponta para um
    // template MARKETING é a fatura. Ver `checarTemplatesLigados`.
    achados.push(...checarTemplatesLigados(await inspecionarTemplatesLigados()));

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
  // Soma as OCORRÊNCIAS, não os tipos de achado. Contar achados fazia o assunto dizer
  // "2 lacunas" para 42 DISC de kit faltando (medido 27/07) — um alerta que subnotifica
  // não provoca ação, que é a única razão de ele existir.
  const total = graves.reduce((s, r) => s + r.achados.reduce((n, a) => n + (a.contagem || 1), 0), 0);
  // O ASSUNTO tem que dizer de que o alerta trata, porque é a única linha que a pessoa lê
  // antes de decidir se abre. Dois modos não avaliam data de entrega (`dataAlvo` null) e
  // cair no "entrega de hoje" manda corrigir a coisa errada — medido na prova de canal de
  // 28/07, em que um run ESTRUTURAL saiu como "1 problema na entrega de hoje".
  const modos = new Set(graves.map((r) => r.modo));
  const soDe = (m: ResultadoCheck['modo']) => modos.size === 1 && modos.has(m);
  const dataAlvo = graves.find((r) => r.dataAlvo)?.dataAlvo;
  const escopo = soDe('horizonte') ? `${total} lacuna(s) de conteúdo nas próximas semanas`
    : soDe('estrutural') ? `${total} problema(s) de integridade`
    : `${total} problema(s) na entrega de ${dataAlvo || 'hoje'}`;
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
    assunto: `[Vertho] ${escopo}`,
    html: `<div style="font-family:system-ui,Arial,sans-serif;max-width:640px;color:#1a1a1a;line-height:1.5">
<p>O health-check do pipeline encontrou problemas <strong>críticos</strong>.</p>${linhas}
<p style="color:#666;font-size:12px;margin-top:20px">Pré-voo roda ~25h antes do envio (dá tempo de corrigir o que já existe); o horizonte roda semanalmente e olha ${HORIZONTE_SEMANAS} semanas à frente, porque PRODUZIR conteúdo não cabe em 25h. Detalhe em /admin/vertho/pipeline-health.</p></div>`,
  };
}

/**
 * Destinatários do alerta. `HEALTH_ALERT_EMAILS` primeiro, `ADMIN_EMAILS` como fallback.
 *
 * Por que duas envs (medido 28/07): `ADMIN_EMAILS` **não é só uma lista de e-mails** — é
 * usada como **fallback de AUTORIZAÇÃO** de platform-admin em `app/admin/admin-actions.ts`
 * e `app/admin/vertho/board/actions.ts`. Ou seja, adicionar alguém ali para que ele
 * "receba os alertas" **concede acesso de admin da plataforma**. Um dia isso vira
 * incidente com o e-mail de um cliente. `HEALTH_ALERT_EMAILS` existe para poder avisar
 * gente sem promover ninguém; o fallback fica só para não quebrar o que já está posto.
 */
export function destinosDoAlerta(): string[] {
  const bruto = process.env.HEALTH_ALERT_EMAILS || process.env.ADMIN_EMAILS || '';
  return bruto.split(',').map((s) => s.trim()).filter(Boolean);
}

/** Envia o alerta para os admins da plataforma. Nunca lança. */
export async function alertar(resultados: ResultadoCheck[]): Promise<boolean> {
  const alerta = montarAlerta(resultados);
  if (!alerta) return false;
  const destinos = destinosDoAlerta();
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
    // O dia alvo é HOJE e o relógio é o mesmo — é `rodarPostflight` que decide se
    // já dá para julgar (ver `MINUTOS_MINIMOS_APOS_DISPARO`).
    resultados = await rodarPostflight(agora, undefined, agora);
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
