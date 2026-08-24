/**
 * Núcleo do trigger diário PARA UMA EMPRESA (fan-out F-C*: uma task QStash por
 * empresa → o worker app/api/webhooks/qstash/trigger-diario-empresa processa
 * UMA empresa por invocação, com maxDuration próprio — o loop sequencial
 * monolítico estourava a lambda e as empresas do fim ficavam sem envio).
 *
 * Sem gate de auth e sem 'use server' (regra do repo: export de 'use server'
 * vira endpoint). Quem chama é o dispatcher (actions/cron-jobs.ts →
 * triggerDiario, que detém o lock diário) ou o worker QStash. Precedente de
 * extração: conarhFollowup → lib/conarh/regua.ts.
 *
 * Diferenças em relação ao corpo original embutido em cron-jobs.ts:
 *  1. N+1 de trilhas morto: UMA query `trilhas` com `.in('colaborador_id', …)`
 *     antes do loop + redução em JS (antes: 1 query por envio).
 *  2. delay() por empresa: o espaçamento de 2s/mensagem era um contador GLOBAL
 *     compartilhado entre empresas; com o fan-out cada empresa é uma lambda,
 *     então o espaçamento é por empresa (índice da mensagem dentro dela).
 *  3. Carimbo de WhatsApp só APÓS envio confirmado: o publish carrega
 *     `fase4EnvioId`/`carimboCampo` e quem grava `ultima_pilulaN_whatsapp_em`
 *     é o webhook whatsapp-cis, depois do sendWhatsapp ok (F-C4).
 */
import { mesmoDiaUTC, pilulaPendente } from '@/lib/notifications/carimbo-canal';
import { tenantDb } from '@/lib/tenant-db';
import { APP_URL, tenantUrl } from '@/lib/domain';
import { templateWhatsAppPilula, templateWhatsAppEvidencia, templateWhatsAppNudgeDesafio } from '@/lib/notifications';
import { textoPilulaWhatsapp, emailPilula, enviarEmailPilula, deepLinkSemana, templateWhatsAppMissao, emailMissao, emailEvidencia } from '@/lib/notifications/pilula-envio';
import { enviarPilulaPorTemplate, enviarPorTemplate } from '@/lib/notifications/pilula-template';
import { derivarPrioridadeFormatos } from '@/lib/season-engine/formato-preferido';
import { formatosEntregaveis, escolherFormatoAnunciado } from '@/lib/season-engine/formato-anunciado';
import { normalizeTemporadaPlano } from '@/lib/season-engine/normalize-temporada-plano';
import { totalSemanasDoPlano } from '@/lib/season-engine/trilha-runtime';
import { primeiraSemanaAcessivel } from '@/lib/season-engine/week-gating';
import { publicarWhatsappCis } from '@/lib/qstash-publish';
import { assertFilaDoProvedorLimpa } from '@/lib/whatsapp';
import { criarRelogioCadencia, maxPorDisparo } from '@/lib/whatsapp/cadencia';
import { registrarDegradacao, DEGRADACAO } from '@/lib/degradacao';
import { enviarPush } from '@/lib/notifications/push-core';
import { pushPilula, pushMissao, pushEvidencia } from '@/lib/notifications/push-copy';
import { temaPilula } from '@/lib/notifications/pilula-envio';
import { ENVIO } from '@/lib/status';

const TOTAL_SEMANAS = 14;
const SEMANAS_IMPL = [4, 8, 12]; // Semanas de implementação (sem pílula nova)

/**
 * A pílula anuncia a semana que a pessoa CONSEGUE ABRIR (default) ou a do
 * calendário (`CADENCIA_SEMANA_ACESSIVEL=0`).
 *
 * Existe como interruptor, e não como decisão fixa, porque isto entrou na
 * véspera de um disparo real (23/08) e muda o que 74 pessoas recebem: se a
 * entrega de segunda estranhar, desligar é uma variável de ambiente, não um
 * deploy. Lida no MÓDULO, então vale para o worker QStash e para o caminho
 * inline igualmente.
 *
 * Desligar restaura exatamente o comportamento anterior — a semana volta a ser
 * `fase4_envios.semana_atual` em todos os pontos.
 */
const SEMANA_ACESSIVEL_LIGADA = process.env.CADENCIA_SEMANA_ACESSIVEL !== '0';

export interface EmpresaDiario {
  id: string;
  nome?: string | null;
  slug?: string | null;
  is_demo?: boolean | null;
  sys_config?: any;
}

export interface ResumoEmpresaDiario {
  pilulas: number;
  emails: number;
  evidencias: number;
  nudges: number;
  erros: number;
  /**
   * Mensagens de WhatsApp que o teto de volume (ou a fila suja do provedor)
   * deixou para o próximo dia. NÃO são erros — e não podem ser somadas a eles:
   * erro é coisa a consertar, adiado é a proteção funcionando. Sem este campo,
   * "36 pílulas" com 200 pessoas na coorte parece cobertura total.
   */
  adiadosPorTeto: number;
}

/**
 * Processa a cadência de HOJE de uma empresa (1ª pílula, missão, 2ª pílula DUO,
 * evidência + avanço de semana). LANÇA em falha inesperada — o isolamento por
 * empresa (try/catch) fica no chamador: no dispatcher inline ele impede uma
 * empresa quebrada de calar as outras; no worker QStash a exceção vira 5xx e
 * a task é retentada (idempotente no mesmo dia graças aos carimbos por canal).
 */
export async function processarEmpresaDiario(
  empresa: EmpresaDiario,
  { hoje, hojeUTC }: { hoje: number; hojeUTC: string },
): Promise<ResumoEmpresaDiario> {
  let pilulas = 0, emails = 0, evidencias = 0, nudges = 0, erros = 0, adiadosPorTeto = 0;

  const cadencia = (empresa as any).sys_config?.cadencia || {};
  const diaP1 = cadencia.fase4_dia_pilula ?? 1;            // default segunda
  const diaP2 = cadencia.fase4_dia_pilula2 ?? 2;           // default terça (2ª pílula DUO)
  const diaEv = cadencia.fase4_dia_evidencia ?? 4;         // default quinta
  if (hoje !== diaP1 && hoje !== diaP2 && hoje !== diaEv) {
    return { pilulas, emails, evidencias, nudges, erros, adiadosPorTeto }; // empresa sem nada hoje
  }

  // Deep-link da pílula = URL do TENANT (ibipeba.vertho.ai), não a genérica.
  const baseUrl = (empresa as any).slug ? tenantUrl((empresa as any).slug) : APP_URL;
  // Demo NÃO envia comunicação real (e-mail); WhatsApp já não vai por falta de telefone.
  const ehDemo = !!(empresa as any).is_demo;

  const tdb = tenantDb(empresa.id);
  /**
   * Deck de vídeo por (core × cargo × DISC), reusado no disparo inteiro.
   *
   * Sem ele seriam duas consultas por PESSOA para responder a mesma pergunta —
   * numa coorte, dezenas compartilham a mesma célula de vídeo.
   */
  const cacheDeck = new Map<string, boolean>();
  const { data: envios } = await tdb.from('fase4_envios')
    .select('id, colaborador_id, semana_atual, status, ultima_evidencia_em, ultima_evidencia_whatsapp_em, ultima_evidencia_email_em, ultima_evidencia_push_em, ultima_pilula1_em, ultima_pilula2_em, ultima_pilula1_whatsapp_em, ultima_pilula1_email_em, ultima_pilula1_push_em, ultima_pilula2_whatsapp_em, ultima_pilula2_email_em, ultima_pilula2_push_em, colaboradores!inner(nome_completo, whatsapp, telefone, email, perfil_dominante, cargo, pref_video_curto, pref_video_longo, pref_texto, pref_audio, pref_estudo_caso)')
    .eq('status', ENVIO.ATIVO);
  if (!envios?.length) return { pilulas, emails, evidencias, nudges, erros, adiadosPorTeto };

  // Trilha mais recente de CADA colaborador em UMA query (era 1 query por
  // envio — N+1). Ordenada por numero_temporada desc, a PRIMEIRA ocorrência
  // de cada colaborador na redução é a trilha latest (byte-igual ao
  // `.order(...).limit(1).maybeSingle()` anterior).
  const trilhaPorColab = new Map<string, any>();
  /** Progresso por colaborador — insumo de `avaliarAcessoSemana` (ver o loop). */
  const progressoPorColab = new Map<string, any[]>();
  /**
   * 🔴 O redirecionamento só vale se o progresso foi REALMENTE lido.
   *
   * Sem esta trava, uma falha na leitura cairia no `catch` abaixo (que só faz
   * `warn`) e deixaria o mapa VAZIO — e mapa vazio, para `avaliarAcessoSemana`,
   * é indistinguível de "ninguém concluiu nada". O resultado seria a coorte
   * INTEIRA recebendo a pílula da semana 1, incluindo quem está em dia. Falha de
   * leitura tem que degradar para o comportamento antigo (calendário), nunca
   * para uma conclusão sobre dado que não foi lido.
   */
  let progressoConfiavel = false;
  try {
    const colabIds = [...new Set((envios as any[]).map((e) => e.colaborador_id))];
    // `data_inicio`: o gate de acesso precisa dele para o ramo temporal. Sem o
    // campo, `semanaLiberadaPorData` é fail-closed (devolve false) e TODA semana
    // pareceria bloqueada por data — o redirecionamento nunca aconteceria e o
    // silêncio seria indistinguível de "ninguém está travado".
    const { data: trilhas } = await tdb.from('trilhas')
      .select('id, colaborador_id, numero_temporada, temporada_plano, competencia_foco, data_inicio')
      .in('colaborador_id', colabIds)
      .order('numero_temporada', { ascending: false });
    for (const t of (trilhas || []) as any[]) {
      if (!trilhaPorColab.has(t.colaborador_id)) trilhaPorColab.set(t.colaborador_id, t);
    }

    // UMA query para a coorte inteira (não uma por pessoa): o gate precisa do
    // progresso de TODAS as semanas, não só da anterior, porque `avaliarAcesso`
    // procura o registro pela semana dentro da lista.
    const trilhaIds = [...trilhaPorColab.values()].map((t: any) => t.id).filter(Boolean);
    if (trilhaIds.length) {
      const { data: progs, error: errProg } = await tdb.from('temporada_semana_progresso')
        .select('trilha_id, colaborador_id, semana, status, reflexao, feedback')
        .in('trilha_id', trilhaIds);
      // supabase-js RETORNA `{ error }`. Sem checar, uma falha viraria "ninguém
      // concluiu nada" e a cadência inteira seria redirecionada para a semana 1
      // — uma leitura quebrada mandaria a coorte toda de volta ao começo.
      if (errProg) throw new Error(`progresso: ${errProg.message}`);
      for (const p of (progs || []) as any[]) {
        const lista = progressoPorColab.get(p.colaborador_id) || [];
        lista.push(p);
        progressoPorColab.set(p.colaborador_id, lista);
      }
      progressoConfiavel = true;
    }
  } catch (e: any) {
    // `progressoConfiavel` fica false → o loop mantém o calendário.
    console.warn('[triggerDiario] trilhas/progresso bulk:', e?.message);
  }

  // ── Cadência do canal (política única: lib/whatsapp/cadencia) ─────────────
  //
  // Era `msgsAgendadas++ * 2` — 2s por mensagem, ~30/min, EXATAMENTE a taxa que
  // bloqueou o número em 11/08/2026 (50 entregues, 105 não). A correção daquele
  // dia cobriu os dois disparos manuais e deixou este, que é o de maior volume
  // e o único que ninguém observa: roda sozinho, de madrugada, todo dia.
  //
  // Agravante que só existe aqui: com o fan-out, cada empresa é uma lambda, e
  // o espaçamento é POR EMPRESA — duas empresas em paralelo somam taxa no MESMO
  // número. O intervalo por empresa é, portanto, um teto otimista.
  const relogio = criarRelogioCadencia();

  // ── Trava de fila: `connected` não basta ──────────────────────────────────
  //
  // O provedor pode estar de pé com mensagens presas da rodada anterior, que ele
  // descarrega em rajada ao estabilizar. Aqui a trava NÃO aborta a empresa (como
  // faz no disparo manual, onde há um humano lendo o erro): ela desliga o canal
  // WhatsApp do dia e deixa e-mail e push seguirem. Abortar calaria os três.
  //
  // Só é consultada se alguém desta empresa tem telefone: sem essa condição, um
  // tenant 100% e-mail pagaria a chamada de rede todo dia E registraria
  // `whatsapp-fila-suja` por um canal que ele não usa — alarme sobre população
  // errada é como um painel começa a ser ignorado.
  const alguemNoWhatsapp = (envios as any[]).some((e) => e.colaboradores?.whatsapp || e.colaboradores?.telefone);
  let canalWhatsappAtivo = true;
  try {
    if (alguemNoWhatsapp) await assertFilaDoProvedorLimpa(0);
  } catch (e: any) {
    canalWhatsappAtivo = false;
    await registrarDegradacao({
      fluxo: 'envio',
      tipo: DEGRADACAO.WHATSAPP_FILA_SUJA,
      chave: `diario:${empresa.id}`,
      empresaId: empresa.id,
      severidade: 'critico',
      detalhe: { motivo: e?.message || String(e) },
    });
  }

  /**
   * Enfileira UMA mensagem do dia respeitando cadência e teto.
   *
   * Devolve `false` quando NÃO enviou por política (canal desligado ou teto
   * atingido) — o chamador não conta isso como erro nem como envio. Lança o que
   * `publicarWhatsappCis` lançar, para os `catch` existentes seguirem contando
   * falha de verdade.
   *
   * O teto ADIA, não descarta: como o carimbo do canal (`ultima_pilulaN_whatsapp_em`)
   * só é gravado pelo webhook após a entrega, quem fica de fora continua pendente
   * e entra na execução do dia seguinte. É o que torna o corte aceitável aqui —
   * num disparo manual o excedente precisa de um segundo clique; num cron diário
   * o "depois" já existe.
   */
  const agendarWhatsapp = async (payload: Record<string, any>): Promise<boolean> => {
    if (!canalWhatsappAtivo || relogio.tetoAtingido()) { adiadosPorTeto++; return false; }
    await publicarWhatsappCis(payload, relogio.proximo());
    return true;
  };

  // ── Ordem do dia: quem esperou mais vai primeiro ──────────────────────────
  //
  // O teto corta a CAUDA da lista, então a ordem decide quem fica de fora. Sem
  // este sort a fila seria a do banco — estável entre execuções — e as mesmas
  // pessoas ficariam para depois todo santo dia, o que transformaria um atraso
  // rotativo em exclusão permanente. Nulo (nunca recebeu WhatsApp) vem primeiro.
  const ultimoWppMs = (e: any) => [e.ultima_pilula1_whatsapp_em, e.ultima_pilula2_whatsapp_em]
    .filter(Boolean).map((d: any) => new Date(d).getTime()).sort((a, b) => b - a)[0] ?? 0;
  (envios as any[]).sort((a, b) => ultimoWppMs(a) - ultimoWppMs(b));

  // Quem tem push ativo nesta empresa. UMA query por execução, não uma por
  // pessoa: sem este conjunto, saber "o canal push é aplicável a fulano?" custaria
  // um SELECT por colaborador só para decidir a pendência.
  // Empresa sem a flag nem consulta — o custo do canal novo escala com adoção,
  // não com o tamanho do tenant.
  // Flag lida do `sys_config` que a empresa JÁ traz (o dispatcher e o worker
  // ambos o carregam), não por query.
  //
  // `pushHabilitado()` faz sentido nas ROTAS, onde só existe o empresaId. Aqui
  // seria query redundante — e, pior, ela é fail-closed: qualquer erro de
  // leitura devolveria `false`, o canal sumiria da pendência e o resultado seria
  // indistinguível de "o tenant não ligou push". Exatamente o tipo de silêncio
  // que este bloco existe para eliminar, entrando pela porta dos fundos.
  const pushLigado = (empresa as any).sys_config?.notificacoes_push === true;
  const comPush = new Set<string>();
  if (pushLigado) {
    const { data: eps, error: errEps } = await tdb
      .from('notification_endpoints')
      .select('colaborador_id')
      .eq('enabled', true);
    // supabase-js RETORNA `{ error }`: sem checar, uma falha viraria "ninguém
    // tem push" e o canal sumiria da pendência em silêncio — exatamente o tipo
    // de ausência que já foi confundida com "ninguém quis".
    //
    // FALHA ALTO, e isto é seguro justamente AQUI: a leitura acontece ANTES do
    // loop, então nada foi enviado ainda e o retry do QStash recomeça a empresa
    // do zero sem duplicar (os carimbos por canal seguram o que já saiu em
    // execuções anteriores). Seguir com `comPush` vazio devolveria 200, o worker
    // não retentaria, e o dia inteiro ficaria sem push com o painel dizendo
    // "tudo certo" — a falha mais cara de todas, a que parece sucesso.
    if (errEps) {
      await registrarDegradacao({
        fluxo: 'envio',
        tipo: DEGRADACAO.TELEMETRIA_ENTREGA_FALHOU,
        chave: `endpoints:${empresa.id}`,
        empresaId: empresa.id,
        severidade: 'critico',
        detalhe: { motivo: errEps.message, onde: 'leitura de notification_endpoints' },
      });
      throw new Error(`[triggerDiario] falha ao ler endpoints de push: ${errEps.message}`);
    }
    for (const e of (eps as any[]) || []) comPush.add(e.colaborador_id);
  }

  for (const envio of (envios as any[])) {
    /**
     * DUAS semanas, e confundi-las quebra coisas diferentes:
     *
     *  - `semanaCalendario` (`fase4_envios.semana_atual`) é o RELÓGIO do
     *    programa. Só ela avança na quinta e só ela decide o fim da temporada.
     *  - `semana` é a que a pessoa CONSEGUE ABRIR hoje, e é ela que escolhe
     *    conteúdo, tema, formato e link.
     *
     * 🔴 POR QUE ELAS SE SEPARARAM (medido 23/08/2026). O gate da tela exige a
     * semana anterior CONCLUÍDA — e quem conclui é a conversa de evidências.
     * Enquanto a pílula anunciava sempre o calendário, 32 das 36 pessoas de
     * Ibipeba e 34 das 38 de Macaé recebiam o tema de uma semana que a tela não
     * abria. E não era um atraso de um passo: 51 das 74 estavam presas na
     * semana 1, 45 delas sem nenhum turno de conversa. Anunciar a semana 6 para
     * quem precisa concluir a 1 é um convite para uma porta fechada.
     */
    const semanaCalendario = envio.semana_atual || 1;
    let semana = semanaCalendario;

    let plan: any = null, conteudosDia: any[] = [], competenciaFoco: any = null;
    let plano: any[] = [];
    let totalSemanas = TOTAL_SEMANAS;
    const trilha = trilhaPorColab.get(envio.colaborador_id);
    plano = (trilha?.temporada_plano || []) as any[];

    /**
     * A régua é `avaliarAcessoSemana` — a MESMA que a página da semana aplica.
     * Não é reimplementada aqui de propósito: em 20/08 esta decisão morava em
     * três lugares com critérios diferentes, a porta mais permissiva virou a
     * promessa e a mais restritiva virou a experiência (F-I21). Uma cópia a mais
     * recriaria exatamente esse defeito, agora entre a mensagem e a tela.
     *
     * `motivo: 'data'` NÃO redireciona: aí não existe semana anterior para
     * oferecer (`semanaPendente` vem indefinido) e o calendário segue mandando,
     * como antes.
     */
    if (SEMANA_ACESSIVEL_LIGADA && progressoConfiavel) {
      try {
        // `primeiraSemanaAcessivel` = a régua aplicada até o PONTO FIXO. O gate
        // cru desce um degrau por vez, e um degrau não basta aqui: no dry-run de
        // Ibipeba as 32 bloqueadas apontavam todas para a semana 5, com 18 delas
        // presas na 1 — o link cairia noutra porta fechada.
        semana = primeiraSemanaAcessivel({
          dataInicio: trilha?.data_inicio,
          plano,
          progresso: progressoPorColab.get(envio.colaborador_id) || [],
          semana: semanaCalendario,
        });
      } catch (e: any) {
        // Degrada para o comportamento antigo em vez de calar a pessoa: pílula
        // no calendário é pior que na semana certa, mas é muito melhor que
        // nenhuma pílula.
        console.warn('[triggerDiario] acesso-semana:', e?.message);
      }
    }

    // Plano da semana (temporada_plano) → conteúdos do dia (DUO) p/ pílula e
    // desafio + TAMANHO REAL do plano. O avanço de semana pára no fim do
    // plano (piloto/custom têm 1–4 semanas — antes o cron avançava cego até
    // 14, nudgeando semanas que não existem). Sem trilha/plano → fallback 14
    // (colabs legados, byte-igual ao comportamento anterior).
    try {
      competenciaFoco = trilha?.competencia_foco;
      totalSemanas = totalSemanasDoPlano(plano, TOTAL_SEMANAS);
      plan = plano.find((s: any) => Number(s.semana) === Number(semana)) || plano[semana - 1] || null;
      if (plan) {
        conteudosDia = (Array.isArray(plan.conteudos_dia) && plan.conteudos_dia.length)
          ? plan.conteudos_dia
          : (plan.conteudo ? [{ competencia: competenciaFoco, descritor: plan.descritor, conteudo: plan.conteudo }] : []);
      }
    } catch (e: any) { console.warn('[triggerDiario] plano:', e?.message); }

    // Fim da temporada é do CALENDÁRIO: usar a semana de entrega aqui deixaria
    // quem está travado na 1 rodando para sempre, sem nunca concluir o envio.
    if (semanaCalendario > totalSemanas) {
      if (hoje === diaEv) await tdb.from('fase4_envios').update({ status: ENVIO.CONCLUIDO }).eq('id', envio.id);
      continue;
    }
    const nome = envio.colaboradores.nome_completo || 'Colaborador';
    // Telefone: coluna `whatsapp` ou, no fallback, `telefone` (muitos tenants só têm este).
    const telefone = envio.colaboradores.whatsapp || envio.colaboradores.telefone;
    const email = !ehDemo ? (envio.colaboradores.email || null) : null;
    // Preferência DECLARADA. Vira promessa só depois de cruzar com o que o
    // conteúdo do dia realmente tem — ver `enviarPilulaDia`.
    const formatoPref = derivarPrioridadeFormatos(envio.colaboradores)[0];
    // ultimo_envio DERIVADO em JS (não existe coluna): o mais recente dos 3 carimbos.
    const ultimoEnvio = [envio.ultima_pilula1_em, envio.ultima_pilula2_em, envio.ultima_evidencia_em]
      .filter(Boolean).map((d: any) => new Date(d).getTime()).sort((a, b) => b - a)[0] || null;

    // Envia a pílula do dia por WhatsApp E e-mail (cada canal best-effort), no
    // formato preferido + deep-link do tenant. Carimba o timestamp da pílula.
    const enviarPilulaDia = async (item: any, stampCol: 'ultima_pilula1_em' | 'ultima_pilula2_em') => {
      const pilula = stampCol === 'ultima_pilula1_em' ? 1 : 2;   // atribuição de abertura (?p=)
      const wppCol = pilula === 1 ? 'ultima_pilula1_whatsapp_em' : 'ultima_pilula2_whatsapp_em';
      const mailCol = pilula === 1 ? 'ultima_pilula1_email_em' : 'ultima_pilula2_email_em';
      const pushCol = pilula === 1 ? 'ultima_pilula1_push_em' : 'ultima_pilula2_push_em';

      /*
       * 🔴 O FORMATO ANUNCIADO É O QUE EXISTE, não o preferido (17/08/2026).
       *
       * `derivarPrioridadeFormatos[0]` é a preferência da PESSOA, e o default de
       * quem nunca declarou nenhuma é `video`. O pré-voo da abertura de Macaé
       * acusou 35 de 38 com "promete video · tem case/texto": o e-mail diria
       * "Seu vídeo de hoje" e o link levaria a `?formato=video` numa semana sem
       * vídeo — no primeiro contato do programa.
       *
       * A régua é a MESMA do health (`formatosEntregaveis`), e o vídeo entra por
       * deck ao vivo: `formatos_disponiveis` nunca o contém.
       */
      const entregaveis = await formatosEntregaveis(tdb.raw, {
        empresaId: empresa.id,
        conteudo: item?.conteudo || item,
        cargo: envio.colaboradores.cargo ?? null,
        disc: envio.colaboradores.perfil_dominante ?? null,
        cacheDeck,
      });
      const formatoAnunciado = escolherFormatoAnunciado(envio.colaboradores, entregaveis) ?? formatoPref;

      const opts = { formato: formatoAnunciado, semana, baseUrl, pilula };
      const agora = new Date().toISOString();
      const stamp: Record<string, string> = {};
      let whatsappEnfileirado = false;

      // CARIMBO POR CANAL: cada canal só se carimba se DEU CERTO, e cada um tem
      // a sua guarda de idempotência. E-mail: síncrono, carimba aqui se ok.
      // WhatsApp: o carimbo NÃO acontece mais no enfileiramento — vai no
      // payload (fase4EnvioId/carimboCampo) e quem grava é o webhook
      // whatsapp-cis APÓS o sendWhatsapp confirmar (F-C4: antes uma queda do
      // provedor entre publish e consumo virava perda silenciosa com o banco
      // afirmando "pílula enviada"; observado em prod 20/07/2026, Ibipeba).
      // Se o webhook nunca confirmar, o canal segue PENDENTE e recuperável —
      // que é exatamente a semântica da guarda por canal.
      if (telefone && !mesmoDiaUTC(envio[wppCol], hojeUTC)) {
        try {
          const viaTemplate = await enviarPilulaPorTemplate({
            telefone, nome, semana, tema: temaPilula(item),
            slug: (empresa as any).slug, baseUrl, formato: formatoAnunciado, pilula,
            empresaId: empresa.id, colaboradorId: envio.colaborador_id,
            dedupeKey: `${wppCol}:${envio.id}`,
          });

          if (viaTemplate.tentou) {
            // Caminho da Cloud API: síncrono, então o carimbo é aqui e agora —
            // não há webhook de fila para confirmar depois.
            if (viaTemplate.ok) { pilulas++; stamp[wppCol] = agora; } else erros++;
          } else {
            const enfileirou = await agendarWhatsapp({
              telefone,
              mensagem: templateWhatsAppPilula(nome, semana, textoPilulaWhatsapp(item, opts)),
              fase4EnvioId: envio.id,
              carimboCampo: wppCol,
            });
            if (enfileirou) { pilulas++; whatsappEnfileirado = true; }
          }
        } catch { erros++; }
      }
      if (email && !mesmoDiaUTC(envio[mailCol], hojeUTC)) {
        const { subject, html } = emailPilula(nome, item, opts);
        const r = await enviarEmailPilula(email, subject, html, {
          kind: 'pilula',
          empresaId: empresa.id,
          colaboradorId: envio.colaborador_id,
          dedupeKey: `${mailCol}:${envio.id}`,
        });
        if (r.ok) { emails++; stamp[mailCol] = agora; } else erros++;
      }

      // ── PUSH (3º canal) ──
      // Roda EM PARALELO ao WhatsApp/e-mail de propósito: a pessoa é notificada
      // duas vezes pela mesma pílula durante a fase de medição, que é o desenho
      // — só assim os canais são comparáveis sobre a MESMA população. É custo
      // reconhecido e temporário; o critério de saída está no docs/APP-MOBILE.md.
      //
      // `comPush` já garante que só entra quem tem inscrição ativa, então isto
      // não custa nada para quem não aderiu.
      if (pushLigado && comPush.has(envio.colaborador_id) && !mesmoDiaUTC(envio[pushCol], hojeUTC)) {
        const texto = pushPilula(semana, temaPilula(item));
        const r = await enviarPush({
          colaboradorId: envio.colaborador_id,
          empresaId: empresa.id,
          kind: 'pilula',
          titulo: texto.titulo,
          corpo: texto.corpo,
          // MESMO destino do WhatsApp e do e-mail: comparar canais exige que a
          // única variável seja o canal, não para onde cada um leva.
          url: deepLinkSemana(baseUrl, semana, formatoAnunciado, pilula),
          dedupeKey: `${pushCol}:${envio.id}`,
        });
        // Carimba só o próprio sucesso — mesma regra dos irmãos. Zero entregues
        // (endpoint morto entre a leitura e o envio) deixa o canal PENDENTE.
        if (r.entregues > 0) { stamp[pushCol] = agora; } else if (r.falhas > 0) erros++;

        // `motivo` = falha SISTÊMICA (VAPID ausente no ambiente, leitura de
        // endpoints caindo). Sem isto, o campo era simplesmente ignorado: o
        // chamador olhava só `entregues`/`falhas`, um ambiente sem VAPID
        // devolvia `entregues: 0, falhas: 0` e a rodada terminava como sucesso.
        // Não aborta a empresa aqui — WhatsApp e e-mail dos demais colaboradores
        // ainda precisam sair; a degradação é quem faz o health reclamar.
        if (r.motivo) {
          erros++;
          await registrarDegradacao({
            fluxo: 'envio',
            tipo: DEGRADACAO.TELEMETRIA_ENTREGA_FALHOU,
            chave: `push-sistemico:${empresa.id}`,
            empresaId: empresa.id,
            severidade: 'critico',
            detalhe: { motivo: r.motivo, kind: 'pilula' },
          });
        }
      }

      // O ciclo só fecha se ALGUM canal saiu. DECISÃO (fan-out): o consolidado
      // `ultima_pilulaN_em` é gravado quando o e-mail saiu (síncrono) OU o
      // WhatsApp foi ENFILEIRADO — o mesmo critério de antes, quando o
      // carimbo do WhatsApp também acontecia no publish. O carimbo POR CANAL
      // do WhatsApp chega depois, via webhook; se nada saiu/enfileirou, sem
      // carimbo: o gate do dia continua aberto e a falha fica visível no banco.
      if (Object.keys(stamp).length || whatsappEnfileirado) {
        await tdb.from('fase4_envios').update({ ...stamp, [stampCol]: agora }).eq('id', envio.id);
      }
    };

    // Há canal PENDENTE hoje? Ver lib/notifications/carimbo-canal.
    const temPush = comPush.has(envio.colaborador_id);
    const pendente = (wppCol: string, mailCol: string, pushCol?: string) =>
      pilulaPendente({
        temTelefone: !!telefone, temEmail: !!email, temPush,
        carimboWhatsapp: envio[wppCol], carimboEmail: envio[mailCol],
        carimboPush: pushCol ? envio[pushCol] : null,
        hojeUTC,
      });

    // ── 1ª PÍLULA ──
    if (hoje === diaP1 && !ehImpl(semana, plan) && conteudosDia[0] && pendente('ultima_pilula1_whatsapp_em', 'ultima_pilula1_email_em', 'ultima_pilula1_push_em')) {
      await enviarPilulaDia(conteudosDia[0], 'ultima_pilula1_em');
    }

    // ── MISSÃO (semana de aplicação 4/8/12): a segunda ANUNCIA a missão ──
    // Antes a semana de aplicação não tinha contato nenhum até a evidência de
    // quinta — a pessoa descobria a missão por conta (medido 03/08, Ibipeba:
    // 36/36 sem envio na segunda da semana 4). Agora a segunda abre a semana
    // com texto padrão + vídeo explicativo + deep-link. Reusa os carimbos da
    // pílula 1 (idempotência); o postflight não mede semana de aplicação.
    if (hoje === diaP1 && plan?.tipo === 'aplicacao' && pendente('ultima_pilula1_whatsapp_em', 'ultima_pilula1_email_em', 'ultima_pilula1_push_em')) {
      // acao_principal precisa do plano NORMALIZADO — no banco a missão pode
      // estar como JSON cru/truncado (estado real de 33/36 trilhas da Ibipeba).
      let acaoPrincipal: string | null = null;
      try {
        const planoNorm = normalizeTemporadaPlano(plano);
        const planNorm = planoNorm.find((s: any) => Number(s.semana) === Number(semana)) || planoNorm[semana - 1];
        acaoPrincipal = planNorm?.missao?.acao_principal || null;
      } catch (e: any) { console.warn('[triggerDiario] missão normalize:', e?.message); }
      const optsMissao = { semana, baseUrl, acaoPrincipal };
      const agora = new Date().toISOString();
      const stamp: Record<string, string> = {};
      let whatsappEnfileirado = false;
      if (telefone && !mesmoDiaUTC(envio.ultima_pilula1_whatsapp_em, hojeUTC)) {
        try {
          // Cloud API primeiro (`missao_semana_v2`, UTILITY desde 16/08/2026).
          // Até aqui a missão só tinha o caminho legado, e ele está morto desde
          // 11/08 — ou seja, por WhatsApp a semana de aplicação não abria.
          const viaTemplate = await enviarPorTemplate('missao', {
            telefone, nome, semana, tema: '',
            slug: (empresa as any).slug, baseUrl,
            // Sem formato: semana de aplicação não entrega conteúdo novo, e
            // anunciar formato prometeria o que não existe.
            formato: null, pilula: null,
            empresaId: empresa.id, colaboradorId: envio.colaborador_id,
            dedupeKey: `missao:${envio.id}`,
          });

          if (viaTemplate.tentou) {
            // Caminho da Cloud API: síncrono, então o carimbo é aqui e agora.
            if (viaTemplate.ok) { pilulas++; stamp.ultima_pilula1_whatsapp_em = agora; } else erros++;
          } else {
            // Mesmo contrato da pílula: carimbo do canal só no webhook, pós-envio.
            const enfileirou = await agendarWhatsapp({
              telefone,
              mensagem: templateWhatsAppMissao(nome, optsMissao),
              fase4EnvioId: envio.id,
              carimboCampo: 'ultima_pilula1_whatsapp_em',
            });
            if (enfileirou) { pilulas++; whatsappEnfileirado = true; }
          }
        } catch { erros++; }
      }
      if (email && !mesmoDiaUTC(envio.ultima_pilula1_email_em, hojeUTC)) {
        const { subject, html } = emailMissao(nome, optsMissao);
        // Kind próprio: a missão da semana de aplicação NÃO é pílula. Reaproveitar
        // o kind faria a contagem de cadência incluir um evento de outra natureza.
        const r = await enviarEmailPilula(email, subject, html, {
          kind: 'missao',
          empresaId: empresa.id,
          colaboradorId: envio.colaborador_id,
          dedupeKey: `missao:${envio.id}`,
        });
        if (r.ok) { emails++; stamp.ultima_pilula1_email_em = agora; } else erros++;
      }
      if (pushLigado && comPush.has(envio.colaborador_id) && !mesmoDiaUTC(envio.ultima_pilula1_push_em, hojeUTC)) {
        const texto = pushMissao(semana);
        const r = await enviarPush({
          colaboradorId: envio.colaborador_id,
          empresaId: empresa.id,
          kind: 'missao',
          titulo: texto.titulo,
          corpo: texto.corpo,
          url: deepLinkSemana(baseUrl, semana),
          dedupeKey: `missao-push:${envio.id}`,
        });
        if (r.entregues > 0) { stamp.ultima_pilula1_push_em = agora; } else if (r.falhas > 0) erros++;
      }
      if (Object.keys(stamp).length || whatsappEnfileirado) {
        await tdb.from('fase4_envios').update({ ...stamp, ultima_pilula1_em: agora }).eq('id', envio.id);
      }
    }

    // ── 2ª PÍLULA (DUO) ──
    if (hoje === diaP2 && !ehImpl(semana, plan) && conteudosDia[1] && pendente('ultima_pilula2_whatsapp_em', 'ultima_pilula2_email_em', 'ultima_pilula2_push_em')) {
      await enviarPilulaDia(conteudosDia[1], 'ultima_pilula2_em');
    }

    // ── EVIDÊNCIA + avanço de semana ──
    // Gate POR CANAL (mig 213): olhar só `ultima_evidencia_em` fecharia a porta
    // para a recuperação do canal que falhou — com o e-mail entregue e o WhatsApp
    // fora, aquele carimbo já existe. É o mesmo raciocínio de `pilulaPendente`.
    if (hoje === diaEv && pendente('ultima_evidencia_whatsapp_em', 'ultima_evidencia_email_em', 'ultima_evidencia_push_em')) {
      // Nudge de inatividade (2+ semanas sem envio) — não avança semana.
      if (ultimoEnvio && (Date.now() - ultimoEnvio) / 86_400_000 >= 14) {
        if (telefone) {
          const nudgeMsg = `Olá, ${nome}! 👋\n\nNotamos que você está há mais de 2 semanas sem interagir com sua trilha.\n\nQue tal retomar hoje?\n\n— Vertho Mentor IA`;
          // colaboradorId/empresaId: sem eles a entrega é gravada sem dono, e a
          // conta de PESSOAS alcançadas pelo canal (a que se compara com push)
          // não fecha. `kindEnvio` mantém nudge separado de pílula na métrica.
          try {
            // `retomada_trilha` (UTILITY) no lugar do `nudge_inatividade`
            // (MARKETING): mesma função, 6× mais barato — a diferença é só a
            // voz do texto, e é ela que a Meta cobra.
            const viaTemplate = await enviarPorTemplate('retomada', {
              telefone, nome, semana,
              tema: '',
              slug: (empresa as any).slug, baseUrl,
              formato: null, pilula: null,
              empresaId: empresa.id, colaboradorId: envio.colaborador_id,
              dedupeKey: `nudge:${envio.id}:${hojeUTC}`,
            });

            if (viaTemplate.tentou) {
              if (viaTemplate.ok) nudges++;
            } else {
              const enfileirou = await agendarWhatsapp({
                telefone, mensagem: nudgeMsg, kindEnvio: 'nudge',
                colaboradorId: envio.colaborador_id, empresaId: empresa.id,
              });
              if (enfileirou) nudges++;
            }
          } catch {}
        }
        await tdb.from('fase4_envios').update({ ultima_evidencia_em: new Date().toISOString() }).eq('id', envio.id);
        continue;
      }
      // Quinta = NUDGE de prática. O desafio JÁ está no conteúdo da semana (cada
      // formato aterrissa nele) E no card "Desafio" do week page — re-mandar o texto
      // inteiro seria o 3º envio redundante. Aqui só cobramos + linkamos a semana
      // (rever o desafio + relatar à Mentora IA). Aplicação/missão (4/8/12) → lembrete
      // de evidência clássico.
      //
      // ── MULTICANAL desde 14/08/2026 (mig 213) ────────────────────────────
      // Era `if (telefone) { ... }` e mais nada: a quinta era o ÚNICO ponto da
      // cadência com um canal só, enquanto a pílula de segunda/terça já saía por
      // três. Em 13/08 a Z-API caiu no meio do disparo e 30 de 36 pessoas da
      // Ibipeba ficaram sem nada — todas com e-mail cadastrado, num canal que
      // não falhou nenhuma vez em 194 envios medidos.
      const ehDesafio = plan && plan.tipo !== 'aplicacao' && !ehImpl(semana, plan) && conteudosDia.length;
      const linkSemana = deepLinkSemana(baseUrl, semana);
      const agoraEv = new Date().toISOString();
      const stampEv: Record<string, string> = {};
      let evidenciaEnfileirada = false;

      if (telefone && !mesmoDiaUTC(envio.ultima_evidencia_whatsapp_em, hojeUTC)) {
        const mensagem = ehDesafio
          ? templateWhatsAppNudgeDesafio(nome, semana, linkSemana)
          : templateWhatsAppEvidencia(nome, semana, linkSemana);
        try {
          // A quinta tem DOIS papéis, e eles não são intercambiáveis: semana de
          // aplicação cobra EVIDÊNCIA, semana de conteúdo cobra o DESAFIO.
          // Trocar um pelo outro entrega a cobrança errada para a pessoa certa,
          // e nada no código acusaria — por isso o papel vem do mesmo `ehDesafio`
          // que escolhe a copy do caminho legado.
          const viaTemplate = await enviarPorTemplate(ehDesafio ? 'desafio' : 'evidencia', {
            telefone, nome, semana,
            tema: '',                       // a quinta não anuncia tema
            slug: (empresa as any).slug, baseUrl,
            formato: null, pilula: null,    // o link é o da SEMANA, sem formato
            empresaId: empresa.id, colaboradorId: envio.colaborador_id,
            dedupeKey: `ultima_evidencia_whatsapp_em:${envio.id}`,
          });

          if (viaTemplate.tentou) {
            // Cloud API é síncrona: o carimbo é aqui, não no webhook da fila.
            if (viaTemplate.ok) { evidencias++; stampEv.ultima_evidencia_whatsapp_em = agoraEv; } else erros++;
          } else {
            // Carimbo do canal vem do webhook, PÓS-envio — mesmo contrato da
            // pílula. Carimbar aqui afirmaria envio que ainda pode não sair.
            const enfileirou = await agendarWhatsapp({
              telefone, mensagem, kindEnvio: 'evidencia',
              colaboradorId: envio.colaborador_id, empresaId: empresa.id,
              fase4EnvioId: envio.id, carimboCampo: 'ultima_evidencia_whatsapp_em',
            });
            if (enfileirou) { evidencias++; evidenciaEnfileirada = true; }
          }
        } catch { erros++; }
      }

      if (email && !ehDemo && !mesmoDiaUTC(envio.ultima_evidencia_email_em, hojeUTC)) {
        const { subject, html } = emailEvidencia(nome, { semana, baseUrl });
        const r = await enviarEmailPilula(email, subject, html, {
          kind: 'evidencia',
          empresaId: empresa.id,
          colaboradorId: envio.colaborador_id,
          dedupeKey: `evidencia:${envio.id}:semana${semana}`,
        });
        if (r.ok) { emails++; stampEv.ultima_evidencia_email_em = agoraEv; } else erros++;
      }

      if (pushLigado && comPush.has(envio.colaborador_id) && !mesmoDiaUTC(envio.ultima_evidencia_push_em, hojeUTC)) {
        const texto = pushEvidencia(semana);
        const r = await enviarPush({
          colaboradorId: envio.colaborador_id,
          empresaId: empresa.id,
          kind: 'evidencia',
          titulo: texto.titulo,
          corpo: texto.corpo,
          url: linkSemana,
          dedupeKey: `evidencia-push:${envio.id}:semana${semana}`,
        });
        if (r.entregues > 0) { stampEv.ultima_evidencia_push_em = agoraEv; } else if (r.falhas > 0) erros++;
      }

      // ── AVANÇO DE SEMANA: uma vez por dia, e só aqui ─────────────────────
      //
      // 🔴 A ARMADILHA QUE ESTE `if` EVITA. O gate de entrada deste bloco passou
      // a ser POR CANAL (recuperável): com o e-mail entregue e o WhatsApp falho,
      // a evidência segue pendente e uma segunda passada no MESMO dia entra aqui
      // de novo para recuperar o WhatsApp — que é o comportamento desejado. Sem
      // este guarda, essa segunda passada avançaria a semana OUTRA VEZ, pulando
      // uma semana inteira de conteúdo da pessoa.
      //
      // `ultima_evidencia_em` continua sendo a alavanca do calendário (decisão de
      // produto: o avanço não depende de canal entregue), agora com um papel só.
      if (!mesmoDiaUTC(envio.ultima_evidencia_em, hojeUTC)) {
        stampEv.ultima_evidencia_em = agoraEv;
        // 🔴 `semanaCalendario + 1`, NUNCA `semana + 1`: quem está travado
        // recebe a pílula de uma semana antiga, e somar 1 sobre ELA jogaria o
        // relógio do programa para trás — a pessoa presa na 1 teria
        // `semana_atual` reescrito para 2 toda quinta, e nunca chegaria ao fim
        // da temporada. O calendário anda sozinho; a entrega é que espera.
        await tdb.from('fase4_envios')
          .update({ ...stampEv, semana_atual: semanaCalendario + 1 })
          .eq('id', envio.id);
      } else if (Object.keys(stampEv).length || evidenciaEnfileirada) {
        // Recuperação de canal no mesmo dia: grava os carimbos SEM tocar na semana.
        await tdb.from('fase4_envios').update(stampEv).eq('id', envio.id);
      }
    }
  }

  // UMA linha por empresa por dia (não uma por mensagem cortada): o que interessa
  // ao pós-voo é "esta empresa não coube no teto hoje, e por quanto". Sem isto o
  // corte seria invisível — e um dia em que metade da coorte não recebeu WhatsApp
  // ficaria indistinguível de um dia em que metade não tinha telefone.
  if (adiadosPorTeto > 0 && canalWhatsappAtivo) {
    await registrarDegradacao({
      fluxo: 'envio',
      tipo: DEGRADACAO.WHATSAPP_TETO_LOTE,
      chave: `diario:${empresa.id}`,
      empresaId: empresa.id,
      severidade: 'aviso',
      detalhe: { adiados: adiadosPorTeto, teto: maxPorDisparo(), agendadas: relogio.agendadas() },
    });
  }

  return { pilulas, emails, evidencias, nudges, erros, adiadosPorTeto };
}

/**
 * Semana de implementação = semana SEM pílula nova (a de missão prática).
 *
 * Pergunta ao PLANO da trilha (`tipo: 'aplicacao'`), não a uma lista de
 * números. A lista `[4, 8, 12]` só vale no formato de 14 semanas: na jornada
 * de 7 (05/08/2026) não há semana de missão, e a semana 4 — que É de conteúdo —
 * ficaria sem pílula, em silêncio, para todo mundo desse modo. O plano é
 * carimbado na geração, então responde certo para qualquer modo, inclusive os
 * que ainda não existem.
 *
 * `plan` ausente (colab legado sem plano) cai na lista antiga — mesmo
 * comportamento de antes para quem já roda.
 */
function ehImpl(semana: number, plan: any | null): boolean {
  if (plan?.tipo) return plan.tipo === 'aplicacao';
  return SEMANAS_IMPL.includes(semana);
}
