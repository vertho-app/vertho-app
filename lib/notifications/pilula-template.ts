/**
 * A pílula pela Cloud API, com template aprovado — o caminho novo.
 *
 * POR QUE ATRÁS DE UMA CHAVE, e não ligado direto
 * ───────────────────────────────────────────────
 * Template não aprovado é recusado pela Meta com 132001, e do ponto de vista da
 * pessoa a pílula simplesmente não chega. Em 15/08/2026, dos 16 templates da
 * conta, **12 estavam PENDING** — incluindo este. Ligar antes da aprovação
 * trocaria um canal que às vezes funciona por um que não funciona nunca.
 *
 * `WHATSAPP_TEMPLATE_PILULA` guarda o NOME do template aprovado. Ausente ⇒ o
 * caminho legado (texto livre pela fila) segue valendo, sem nenhuma mudança de
 * comportamento. É uma chave com CONSUMIDOR — este arquivo — e o teste prova os
 * dois ramos: config declarada que ninguém lê já custou caro nesta base.
 *
 * ⚠️ QUANDO LIGAR, ACOMPANHE O PRIMEIRO ENVIO. Este ramo só é exercitado de
 * verdade contra a Meta; até lá, o que existe é teste com o cliente stubado.
 */
import { enviarTemplateCloud, cloudApiConfigurada } from '@/lib/whatsapp/cloud-api';
import { deepLinkSemana, labelFormato } from '@/lib/notifications/pilula-envio';

export interface PilulaTemplateArgs {
  telefone: string;
  nome: string;
  semana: number;
  tema: string;
  /** Slug do tenant — vira o primeiro segmento do link curto. */
  slug: string;
  /** URL do tenant (`https://ibipeba.vertho.ai`) — para o template que leva link no corpo. */
  baseUrl: string;
  formato?: string | null;
  pilula?: number | null;
  empresaId?: string | null;
  colaboradorId?: string | null;
  dedupeKey?: string | null;
  /** `<slug>~<token_hash>` do magic link — só para o papel `acesso`. */
  acessoParam?: string | null;
  /**
   * Nome da INSTITUIÇÃO que inscreveu a pessoa — só para `boas_vindas`.
   *
   * Não é enfeite: o primeiro contato abre pela prefeitura/escola, não pela
   * Vertho, porque é a instituição que a pessoa conhece. Um número desconhecido
   * que se apresenta sozinho é o que faz alguém bloquear.
   */
  instituicao?: string | null;
  /**
   * URL completa e pronta — só para o papel `recorte` (lead do CONARH).
   *
   * Campo próprio, e não reaproveitar `baseUrl` ou `tema`: o destino aqui não é
   * do tenant nem é derivável de `semana`/`formato` como nos outros papéis — é o
   * Mapa da Evolução de um LEAD, em `app.vertho.ai/conarh/mapa/<id>`. Enfiar uma
   * URL num campo que significa outra coisa é como uma métrica passa a medir o
   * que não diz.
   */
  linkDireto?: string | null;
  /**
   * Nome da COMPETÊNCIA que a pessoa vai avaliar — só para
   * `avaliacao_competencias`.
   *
   * Não é `tema` (que descreve o conteúdo da semana) nem derivável de
   * `semana`/`formato`: a régua é `cargos_empresa.top5_workshop`, a mesma que a
   * tela do assessment usa para escolher o próximo cenário. Reaproveitar `tema`
   * faria a mensagem prometer uma competência e a tela abrir outra.
   */
  competencia?: string | null;
  /**
   * Semana que precisa ser CONCLUÍDA para destravar — só para `pendencia`.
   *
   * 🔴 Campo próprio, e jamais derivado de `semana - 1`: quem está travado pode
   * estar várias semanas atrás (medido 23/08: 18 pessoas de Ibipeba na semana 6
   * do calendário sem NENHUMA semana concluída, ou seja, pendentes na 1). A
   * régua é `avaliarAcessoSemana(...).semanaPendente`, a mesma que a tela usa
   * para decidir o bloqueio — derivar aqui produziria uma segunda régua, que é
   * exatamente como esta base já colecionou três portas com critérios
   * diferentes para a mesma decisão (F-I21).
   */
  semanaPendente?: number | null;
}

export interface ResultadoPilulaTemplate {
  /** `false` = o caminho nem foi tentado; o chamador deve usar o legado. */
  tentou: boolean;
  ok?: boolean;
  reason?: string;
}

/**
 * Sufixo do botão: `<slug>/<semana>[/<formato>[/<pilula>]]`.
 *
 * É só o VALOR de `{{1}}` — a URL fixa (`https://app.vertho.ai/ir/`) mora no
 * template, na Meta. Mandar a URL inteira aqui produziria `/ir/https://…`, que
 * não dá erro na API e chega quebrado para a pessoa.
 */
export function caminhoDoBotao(a: Pick<PilulaTemplateArgs, 'slug' | 'semana' | 'formato' | 'pilula'>): string {
  const partes = [a.slug, String(a.semana)];
  if (a.formato) {
    partes.push(a.formato);
    // A pílula (1 ou 2) só faz sentido depois do formato: o caminho é posicional.
    if (a.pilula) partes.push(String(a.pilula));
  }
  return partes.join('/');
}

/**
 * Papéis da cadência que podem sair por template.
 *
 * Cada um tem a SUA chave: a quinta-feira e a pílula aprovam em momentos
 * diferentes, e uma chave só obrigaria a ligar tudo junto — ou nada.
 */
export type PapelCadencia =
  | 'pilula' | 'evidencia' | 'desafio' | 'retomada' | 'perfil' | 'acesso' | 'missao' | 'plano'
  | 'boas_vindas' | 'recorte' | 'pendencia' | 'conteudo_pendente';

const ENV_DO_PAPEL: Record<PapelCadencia, string> = {
  pilula: 'WHATSAPP_TEMPLATE_PILULA',
  evidencia: 'WHATSAPP_TEMPLATE_EVIDENCIA',
  desafio: 'WHATSAPP_TEMPLATE_DESAFIO',
  retomada: 'WHATSAPP_TEMPLATE_RETOMADA',
  perfil: 'WHATSAPP_TEMPLATE_PERFIL',
  acesso: 'WHATSAPP_TEMPLATE_ACESSO',
  missao: 'WHATSAPP_TEMPLATE_MISSAO',
  plano: 'WHATSAPP_TEMPLATE_PLANO',
  /**
   * Semana do calendário trancada pela anterior não concluída.
   *
   * Papel PRÓPRIO, e não um reuso de `retomada`: aquele afirma inatividade de 2+
   * semanas e dispara por tempo sem envio; este afirma uma PENDÊNCIA e alcança
   * gente ativa que abriu o conteúdo e não fechou a conversa. Chave separada
   * também porque cada template aprova em momento diferente — uma chave só
   * obrigaria a ligar os dois juntos, ou nenhum.
   */
  pendencia: 'WHATSAPP_TEMPLATE_PENDENCIA',
  /**
   * SEGUNDA de quem está travado: o conteúdo da semana E a pendência dela.
   *
   * Chave PRÓPRIA, e não um reuso de `pendencia`: aquele anuncia só a pendência
   * e é o que sai na terça; este anuncia conteúdo COM tema e leva ao formato
   * escolhido. Mandar um no lugar do outro entrega a mensagem certa no dia
   * errado, sem erro nenhum na API.
   *
   * 🔑 É esta chave que inverte a semana inteira de quem está travado: ligada,
   * a segunda passa a dizer o que destrava e a terça volta a entregar a 2ª
   * pílula (que hoje essas pessoas NUNCA recebem, porque a pendência ocupa o
   * slot). Ausente, tudo volta ao comportamento de 25/08 por inteiro — é o
   * mesmo desenho de interruptor único do `pendencia`.
   */
  conteudo_pendente: 'WHATSAPP_TEMPLATE_CONTEUDO_PENDENTE',
  /**
   * CONARH: o recorte da demonstração para o lead que pediu no estande.
   *
   * Único papel cujo destinatário NÃO é colaborador de tenant — é um lead
   * comercial, sem `empresaId` e sem `colaboradorId`. Por isso o link vem pronto
   * em `linkDireto` (o Mapa da Evolução vive em `app.vertho.ai`, não no
   * subdomínio de ninguém).
   */
  recorte: 'WHATSAPP_TEMPLATE_RECORTE',
  /**
   * ⚠️ O ÚNICO PAPEL SEM GATILHO AUTOMÁTICO, e é de propósito.
   *
   * Boas-vindas é a mensagem de ABERTURA de uma turma — quem decide que a turma
   * abriu é uma pessoa, não o calendário. Ligar isto na cadência faria a primeira
   * mensagem sair para quem entrar no cadastro por qualquer motivo (import,
   * correção, teste), e o primeiro contato é justamente o de maior risco de
   * bloqueio. O disparo é deliberado, com teto e espaçamento.
   */
  boas_vindas: 'WHATSAPP_TEMPLATE_BOAS_VINDAS',
};

/** Nome do template aprovado para o papel, ou `null` quando está desligado. */
export function templateAtivo(papel: PapelCadencia): string | null {
  const nome = (process.env[ENV_DO_PAPEL[papel]] || '').trim();
  return nome || null;
}

/** @deprecated use `templateAtivo('pilula')`. Mantido para não quebrar chamador. */
export function templatePilulaAtivo(): string | null {
  return templateAtivo('pilula');
}

/**
 * 🔴 CADA TEMPLATE APROVADO TEM O SEU CONTRATO — e ele não se deduz do nome.
 *
 * Descoberto ao ligar, em 15/08/2026: `pilula_semanal` foi aprovado com
 * `{{1}}`=formato, `{{2}}`=tema, `{{3}}`=**link no corpo**, e SEM botão. O
 * código mandava `[nome, semana, tema]` + parâmetro de botão. Ligar sem
 * conferir teria entregado *"Seu Maria de hoje: **5**. Acesse: Escuta ativa…"*
 * a 36 pessoas — ou uma recusa por componente que não existe.
 *
 * Por isso o mapeamento é EXPLÍCITO por nome de template. Nome fora daqui não
 * liga (fail-closed): mandar parâmetros no formato errado não dá erro de
 * compilação, dá mensagem sem sentido na mão de gente real.
 */
type MontarParams = (a: PilulaTemplateArgs) => { params: string[]; botaoParam?: string | null };

const CONTRATOS: Record<string, MontarParams> = {
  /**
   * ✅ O PREFERIDO desde 15/08/2026: copy factual, aprovada como **UTILITY**.
   *
   * Custa ~R$ 0,08 contra ~R$ 0,45 do `pilula_semanal` (MARKETING) — 6× menos
   * pela mesma entrega. Corpo conferido na Meta antes de mapear:
   * `{{1}}`=nome, `{{2}}`=semana, `{{3}}`=tema, `{{4}}`=link. Sem botão.
   */
  conteudo_semana: (a) => ({
    params: [a.nome, String(a.semana), a.tema, deepLinkSemana(a.baseUrl, a.semana, a.formato, a.pilula)],
    botaoParam: null,
  }),

  /**
   * Quinta-feira, semana de APLICAÇÃO: cobra o registro de evidência.
   * APPROVED/UTILITY. `{{1}}`=nome, `{{2}}`=semana, `{{3}}`=link. Sem botão.
   */
  /**
   * Segunda-feira da semana de APLICAÇÃO (4/8/12): anuncia a missão.
   * APPROVED/UTILITY em 16/08/2026. `{{1}}`=nome, `{{2}}`=semana, `{{3}}`=link.
   * Sem botão.
   *
   * ⚠️ O link vai SEM `formato`: semana de aplicação não entrega conteúdo novo,
   * então anunciar um formato prometeria o que não existe — a classe da R1 do
   * health.
   *
   * Substitui `missao_semana` e `missao_aplicacao`, que a Meta aprovou como
   * MARKETING (6× o custo) e que descreviam o MESMO momento com dois templates.
   */
  missao_semana_v2: (a) => ({
    params: [a.nome, String(a.semana), deepLinkSemana(a.baseUrl, a.semana)],
    botaoParam: null,
  }),

  /**
   * O PLANO (relatório individual) ficou pronto. APPROVED/UTILITY em 16/08/2026.
   * `{{1}}`=nome, `{{2}}`=link. Sem botão.
   *
   * 🔑 O link vai para `/dashboard/pdi`, que lê `relatorios` — NÃO a tabela
   * `pdis`, que é código morto sem escritor vivo. O que a pessoa encontra lá é o
   * blueprint com objetivos, ação principal, checklist e evidência esperada.
   */
  plano_desenvolvimento: (a) => ({
    params: [a.nome, `${a.baseUrl}/dashboard/pdi`],
    botaoParam: null,
  }),

  /**
   * CONARH T+0: entrega o recorte ao lead. `{{1}}`=nome, `{{2}}`=link do Mapa.
   * Submetido 17/08/2026 como UTILITY pelo enquadramento "Continue a
   * Conversation on WhatsApp" — a pessoa pediu no estande.
   *
   * ⚠️ O link é `linkDireto`, NÃO `baseUrl`: o Mapa vive em `app.vertho.ai`, e
   * um lead não tem tenant. Sem link, não envia — mandar "o recorte está em:"
   * seguido de nada é pior que não mandar.
   */
  recorte_demonstracao: (a) => ({
    params: [a.nome, a.linkDireto || ''],
    botaoParam: null,
  }),

  /**
   * Semana pendente. `{{1}}`=nome, `{{2}}`=semana do calendário, `{{3}}`=semana
   * pendente. Link em BOTÃO (`<slug>/<semana PENDENTE>`), não no corpo.
   *
   * 🔴 O BOTÃO APONTA PARA A PENDENTE, NUNCA PARA A ATUAL. Mandar para a semana
   * do calendário é o próprio defeito que esta mensagem existe para corrigir: a
   * pessoa cairia de novo na tela trancada, agora vinda de uma mensagem que
   * acabou de dizer que ela está trancada.
   *
   * Sem `semanaPendente` NÃO ENVIA (o `enviarPorTemplate` barra antes): um
   * template que anuncia "a semana continua pendente" e leva a lugar nenhum é
   * pior que silêncio — e `semana - 1` como defesa seria a régua duplicada.
   */
  semana_pendente_v2: (a) => ({
    params: [a.nome, String(a.semana), String(a.semanaPendente ?? '')],
    botaoParam: caminhoDoBotao({
      slug: a.slug,
      semana: Number(a.semanaPendente),
      formato: null,
      pilula: null,
    }),
  }),

  /**
   * Conteúdo da semana + pendência dela, na SEGUNDA de quem está travado.
   * `{{1}}`=nome, `{{2}}`=semana (a acessível, que é a pendente), `{{3}}`=tema.
   * Botão com `<slug>/<semana>/<formato>/<pilula>`, igual ao `conteudo_semana_v2`.
   *
   * ⚠️ A semana é UMA só aqui, e é a acessível — o oposto do
   * `semana_pendente_v2`, onde `{{2}}` é o calendário e `{{3}}` a pendente.
   * Quem está travado tem conteúdo e pendência na MESMA semana: é justamente
   * isso que permite dizer as duas coisas sem repetir variável.
   */
  conteudo_semana_pendente: (a) => ({
    params: [a.nome, String(a.semana), a.tema],
    botaoParam: caminhoDoBotao(a),
  }),

  /**
   * Mesmo contrato do v1 — os dois corpos usam as MESMAS três variáveis, na
   * mesma ordem, e trocar de um para o outro é trocar o valor da env.
   *
   * Não é economia de digitação: enquanto o veredito da Meta não sai, os dois
   * nomes estão vivos, e um contrato por nome abriria a chance de o vencedor
   * receber os parâmetros na ordem do perdedor — o defeito que a tabela
   * `CONTRATOS` inteira existe para impedir.
   */
  conteudo_semana_pendente_v2: (a) => ({
    params: [a.nome, String(a.semana), a.tema],
    botaoParam: caminhoDoBotao(a),
  }),

  /**
   * v3: link NO CORPO (`{{4}}`), sem botão — contrato idêntico ao do
   * `conteudo_semana`, que é o UTILITY aprovado e em uso.
   *
   * ⚠️ Uma variável a mais que os irmãos, e é isso que está sendo testado: os
   * v1/v2 carregavam o destino no `botaoParam` e os dois voltaram MARKETING.
   * Aqui o destino é o 4º parâmetro do corpo. Mandar os params do v1 para este
   * nome entregaria a mensagem SEM link e com um buraco em `{{4}}`.
   */
  conteudo_semana_pendente_v3: (a) => ({
    params: [a.nome, String(a.semana), a.tema, deepLinkSemana(a.baseUrl, a.semana, a.formato, a.pilula)],
    botaoParam: null,
  }),

  registro_evidencia: (a) => ({
    params: [a.nome, String(a.semana), deepLinkSemana(a.baseUrl, a.semana, a.formato, a.pilula)],
    botaoParam: null,
  }),

  /**
   * Quinta-feira, semana de CONTEÚDO: cobra a prática do desafio.
   * APPROVED/UTILITY, mesma forma do `registro_evidencia` — mas texto diferente,
   * e trocar um pelo outro entrega a cobrança errada para a pessoa certa.
   */
  registro_desafio: (a) => ({
    params: [a.nome, String(a.semana), deepLinkSemana(a.baseUrl, a.semana, a.formato, a.pilula)],
    botaoParam: null,
  }),

  /**
   * Inatividade de 2+ semanas. APPROVED/**UTILITY** — substitui o
   * `nudge_inatividade`, que a Meta classificou como MARKETING (6× o custo) por
   * causa da voz antiga ("Notamos que…", "Que tal retomar hoje?", emoji).
   * `{{1}}`=nome, `{{2}}`=link. Sem botão.
   */
  retomada_trilha: (a) => ({
    params: [a.nome, deepLinkSemana(a.baseUrl, a.semana, a.formato, a.pilula)],
    botaoParam: null,
  }),

  /**
   * Perfil comportamental pronto. APPROVED/UTILITY, 2 variáveis (nome, link).
   *
   * 🔴 O template estava aprovado e a copy pronta em `lib/notifications.ts`
   * desde sempre — e **sem nenhum consumidor**: ninguém chamava
   * `templateWhatsAppCIS`. Resultado medido em 15/08/2026: ~120 pessoas
   * responderam a avaliação e nunca souberam que o resultado saiu. É a mesma
   * classe do `listarNaoResolvidas` sem tela — a peça existe e não é acionada.
   *
   * ⚠️ O DISPARO NÃO ACONTECE NA GERAÇÃO DO RELATÓRIO, de propósito: aquele
   * caminho roda em LOTE (dezenas de relatórios seguidos), e mandar uma
   * mensagem por relatório gerado é uma rajada — exatamente o padrão que
   * derrubou o número em 11/08. Quem dispara é
   * `scripts/_avisar-perfil-pronto.ts`, com teto e espaçamento.
   */
  resultado_perfil: (a) => ({
    params: [a.nome, `${a.baseUrl}/dashboard/perfil-comportamental`],
    botaoParam: null,
  }),

  /**
   * Magic link por WhatsApp. APPROVED/UTILITY (15/08).
   *
   * 🔴 CORPO SEM VARIÁVEL — texto fixo, e só o BOTÃO varia. `params` vazio é
   * intencional: com um array vazio, `enviarTemplateCloud` OMITE o componente
   * body, porque mandar `parameters: []` faz a Meta recusar por parâmetro que o
   * template não espera.
   *
   * O `{{1}}` do botão é `<slug>~<token_hash>` (`montarParametroAcesso`), e quem
   * o desempacota é `/entrar` — a base do botão é fixa e o multi-tenant vive em
   * subdomínio, então o salto existe para a sessão nascer no host certo.
   *
   * ⚠️ O parâmetro aqui NÃO é o link completo: mandar a URL inteira produziria
   * `/entrar?t=https://…`, que não dá erro na API e leva a pessoa a lugar nenhum.
   */
  acesso_vertho: (a) => ({
    params: [],
    botaoParam: a.acessoParam ?? null,
  }),

  /**
   * Assessment de competências NUNCA iniciado. APPROVED/UTILITY — corpo
   * conferido na Meta em 19/08/2026 (não deduzido do nome):
   * `{{1}}`=nome, `{{2}}`=instituição, `{{3}}`=link. Sem botão.
   *
   * 🔴 `{{2}}` É A INSTITUIÇÃO, não a Vertho — mesma regra do `boas_vindas_v2`,
   * e aqui o corpo a coloca em "no programa da {{2}}": trocar pela fornecedora
   * descreveria um programa que a pessoa não reconhece.
   *
   * O link é `/dashboard/assessment`, a tela onde a avaliação começa — não a
   * porta do tenant. Quem chega sem sessão viva cai no login e pede o magic link
   * (`acesso_vertho`); mandar todo mundo para `/entrar` custaria um passo a quem
   * está logado, que é a maioria do alvo (o convite é para quem JÁ fez o
   * mapeamento comportamental dentro do app).
   */
  avaliacao_pendente: (a) => ({
    params: [a.nome, a.instituicao || '', `${a.baseUrl}/dashboard/assessment`],
    botaoParam: null,
  }),

  /**
   * Assessment parado DEPOIS do mapeamento comportamental. Submetido em
   * 20/08/2026 como UTILITY — ⚠️ enquanto não estiver APPROVED, a categoria é
   * provisória e o envio é recusado pela Meta.
   * `{{1}}`=nome, `{{2}}`=COMPETÊNCIA, `{{3}}`=link. Sem botão.
   *
   * Existe porque o `avaliacao_pendente` fala em "avaliação de perfil", e para
   * quem já concluiu o mapeamento essa frase descreve o passo ERRADO — medido:
   * 19 entregues, 11 lidas, 2 respostas. Ver `lib/whatsapp/templates.ts`.
   *
   * `{{2}}` vem de `cargos_empresa.top5_workshop` (a régua da tela), nunca de
   * `tema`: prometer uma competência e abrir outra é pior que não mandar.
   */
  avaliacao_competencias: (a) => ({
    params: [a.nome, a.competencia || '', `${a.baseUrl}/dashboard/assessment`],
    botaoParam: null,
  }),

  /**
   * PRIMEIRO CONTATO da turma. APPROVED/UTILITY — corpo conferido na Meta em
   * 17/08/2026: `{{1}}`=nome, `{{2}}`=instituição, `{{3}}`=link. Sem botão.
   *
   * 🔴 `{{2}}` É A INSTITUIÇÃO, NÃO A VERTHO. A pessoa conhece a prefeitura ou a
   * escola; a Vertho ela nunca ouviu falar. Trocar os dois transforma a mensagem
   * naquilo que se ensina a não clicar — e o custo de um bloqueio não é a
   * mensagem, é o `quality_rating` do número, que serve TODOS os tenants.
   *
   * `{{3}}` é a porta do tenant (`/entrar`), sem token: o link com credencial é
   * outro template (`acesso_vertho`, por botão), e misturar os dois colocaria um
   * segredo num corpo que a caixa de entrada mostra.
   */
  boas_vindas_v2: (a) => ({
    params: [a.nome, a.instituicao || '', `${a.baseUrl}/entrar`],
    botaoParam: null,
  }),

  /** Copy ANTIGA, aprovada como MARKETING (6× o custo). Link no CORPO, sem botão. */
  pilula_semanal: (a) => ({
    params: [labelFormato(a.formato), a.tema, deepLinkSemana(a.baseUrl, a.semana, a.formato, a.pilula)],
    botaoParam: null,
  }),
  /** Copy factual com o link no BOTÃO — o desenho novo (ver templates.ts). */
  conteudo_semana_v2: (a) => ({
    params: [a.nome, String(a.semana), a.tema],
    botaoParam: caminhoDoBotao(a),
  }),
};

/** O template configurado tem contrato conhecido? Sem isso, não se envia. */
export function contratoDoTemplate(nome: string | null): MontarParams | null {
  return nome ? CONTRATOS[nome] ?? null : null;
}

export async function enviarPorTemplate(
  papel: PapelCadencia,
  a: PilulaTemplateArgs,
): Promise<ResultadoPilulaTemplate> {
  const template = templateAtivo(papel);
  const montar = contratoDoTemplate(template);

  if (!template || !cloudApiConfigurada()) return { tentou: false };
  if (!montar) {
    // Chave apontando para template desconhecido: não envia e DIZ. Silêncio aqui
    // viraria "a pílula não sai e ninguém sabe por quê".
    console.error(`[cadencia-template] ${ENV_DO_PAPEL[papel]}="${template}" não tem contrato em CONTRATOS — envio NÃO feito.`);
    return { tentou: false };
  }

  // FAIL-CLOSED do papel `pendencia`: sem a semana que destrava, o corpo sairia
  // com "a semana  continua pendente" e o botão apontaria para `<slug>/NaN`.
  // Nenhum dos dois dá erro na API — chegam assim na mão da pessoa, que é o modo
  // de falha caro desta base (a mensagem sem sentido que "funcionou").
  if (papel === 'pendencia' && !Number.isInteger(Number(a.semanaPendente))) {
    console.error('[cadencia-template] pendencia sem semanaPendente válida — envio NÃO feito.');
    return { tentou: false };
  }

  const { params, botaoParam } = montar(a);

  const r = await enviarTemplateCloud(
    { phone: a.telefone, template, params, botaoParam },
    {
      // `motivo` vira o `kind` da telemetria: é o que separa pílula de cobrança
      // de quinta nas métricas de entrega.
      motivo: papel,
      empresaId: a.empresaId ?? null,
      colaboradorId: a.colaboradorId ?? null,
      dedupeKey: a.dedupeKey ?? null,
    },
  );

  return { tentou: true, ok: r.ok, reason: r.reason };
}

/** Atalho do papel mais usado — mantém o call-site da pílula legível. */
export function enviarPilulaPorTemplate(a: PilulaTemplateArgs): Promise<ResultadoPilulaTemplate> {
  return enviarPorTemplate('pilula', a);
}
