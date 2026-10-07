/**
 * Saudação nominal ("Olá, {nome}. Que bom ter você aqui.") sintetizada NO APP, no Vertex, na voz do elenco.
 *
 * O PROBLEMA (queixa do dono, 07/10/2026: "o tom de saudação está diferente do tom do restante do vídeo")
 * A caixa de render sintetizava a saudação no AI Studio (`worker-hetzner/personalizar.mjs`), e o corpo do vídeo sai no
 * Vertex. O mesmo nome de voz soa como locutoras diferentes nos dois (medido em 07/09), cada síntese avulsa é um sorteio, e
 * o cache da saudação é por PESSOA: um sorteio ruim se repetia em todos os vídeos dela. Na demo de escolas, os três
 * nominais da Marina compartilhavam UMA saudação sorteada.
 *
 * O QUE FAZ AGORA
 * O app sintetiza (aqui), guarda o mp3 num caminho determinístico (`chaveDoAudioDaSaudacao`, sem migration) e a caixa só lê e
 * monta. Quem chama:
 *   · `trigger/gerar-video-modulo.ts`, logo depois de enfileirar o render (a box leva ~20 min para renderizar; o áudio sai
 *     em segundos por pessoa, então já existe quando `personalizeCell` roda);
 *   · `lib/video/reconciliar-personalizados.ts`, antes de devolver a célula à fila (a box personaliza em minutos).
 * Sem o áudio, a caixa NÃO cai em outro sintetizador: a pessoa fica sem nominal (o deck genérico segue no ar), a falta vai
 * para `degradacao_log` e a reconciliação refaz. Cair no AI Studio reabriria o sorteio sem ninguém ver.
 *
 * POR QUE NÃO USA O PORTÃO DE REGISTRO (F0) DA NARRAÇÃO
 * Medido em 07/10/2026 nas candidatas que o dono ouviu: a escolhida (cand6) tem F0 de 190 Hz, 1,5 st abaixo do alvo da
 * Aoede (208 Hz ± 1,25 st), e o portão reprovaria 4 das 6, e até a abertura do corpo do vídeo (193 Hz). Fala de ~3,8 s tem a
 * mediana de F0 puxada pela entonação ("Olá, Marina." desce), e o alvo foi calibrado em narração longa: régua medida em
 * outro tamanho de peça. A chamada pede `alvo: null` (só "tem fala?") e a checagem de verdade é a abaixo.
 *
 * A CHECAGEM (calibrada com 54 takes reais no Vertex, 12 nomes, 07/10/2026)
 * Síntese avulsa curta às vezes repete ou ACRESCENTA frase ("… Que alegria", "… Que bom que você está conosco"): 8 de 54
 * takes (15%), e o portão de deriva não confere conteúdo (F-V7). O que separou limpo: segundos por caractere do texto. Os
 * 8 defeituosos ficaram entre 0,152 e 0,184; os 46 bons, entre 0,101 e 0,131. O teto é 0,14. A transcrição (Whisper) é a
 * segunda opinião, só sobre o FINAL da frase ("que bom ter você aqui"): o nome NÃO é comparado, porque o ASR troca a grafia
 * ("Elizângela" voltou "Elisângela" nos 3 takes) e reprovaria take bom. ASR fora do ar = só a duração decide.
 */
import { createSupabaseAdmin } from '@/lib/supabase';
import { registrarDegradacao, DEGRADACAO } from '@/lib/degradacao';
import { generateNarrationAudio } from '@/lib/gemini-tts';
import { ELENCO } from '@/lib/tts/elenco';
import { MP3_BITRATE_KBPS } from '@/lib/tts/audio-dsp';
import { transcribeWords, type WordTime } from '@/lib/video/whisper-align';
import { COLUNAS_PREFERENCIA_KIT, videoNoTopDois } from '@/lib/season-engine/kit/formatos-por-preferencia';
import { BUCKET_SAUDACAO, chaveDoAudioDaSaudacao, primeiroNome, textoDaSaudacao } from '@/worker-hetzner/saudacao-audio.mjs';

/**
 * ÚNICO ponto deste módulo que cria o cliente service-role (a allowlist de `config/service-role-allowlist.json` conta 1 chamada
 * aqui). Os dois chamadores abaixo o criam sob demanda e DENTRO do `try`, para a promessa de "nunca lança" cobrir env ausente.
 * O acesso é de verdade service-role: ler `colaboradores`/`kits` de qualquer empresa e gravar no bucket `video-assets` é o que
 * o render faz hoje, e quem chama já escolheu a célula (o tenant vem dela). A tabela `degradacao_log` vai por `registrarDegradacao`.
 */
const clienteAdmin = () => createSupabaseAdmin();

/**
 * Direção de estilo: a MESMA que o dono ouviu na comparação cega de 07/10/2026 (e que a caixa usava no AI Studio). Mudá-la
 * muda o take e invalida a calibração de duração abaixo.
 */
export const ESTILO_DA_SAUDACAO = 'Fale como uma mentora calorosa e próxima, em português do Brasil, cumprimentando alguém ao abrir uma conversa. Tom acolhedor e com energia que prende a atenção, ritmo natural com respiros leves — sem pressa e sem arrastar, e sem soar festivo';

/** Tentativas por pessoa. Com 15% de take defeituoso, três seguidas falham em ~0,3% das pessoas. */
export const TENTATIVAS_DA_SAUDACAO = 3;

/** Segundos de áudio por caractere do texto. Bons: 0,101 a 0,131. Defeituosos: 0,152 a 0,184. */
export const SEG_POR_CARACTERE = { min: 0.07, max: 0.14 } as const;

/** Menos que isto não é áudio de saudação (e a caixa recusa `< 2000` bytes). */
const BYTES_MINIMOS = 2000;

const CAUDA = ['que', 'bom', 'ter', 'voce', 'aqui'];

const normalizar = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** Duração do mp3 que o TTS devolve (CBR, com um quadro Xing na frente: erro de ~1 quadro, 26 ms). */
export function duracaoDoMp3(buf: Buffer): number {
  return Math.max(0, (buf.length * 8) / (MP3_BITRATE_KBPS * 1000) - 0.026);
}

export function avaliarDuracao(texto: string, durS: number): { ok: boolean; motivo?: string } {
  const taxa = durS / Math.max(1, texto.length);
  if (taxa > SEG_POR_CARACTERE.max) {
    return { ok: false, motivo: `longa demais: ${durS.toFixed(1)} s para ${texto.length} caracteres (${taxa.toFixed(3)} s/caractere; acima de ${SEG_POR_CARACTERE.max} é frase repetida ou acrescentada)` };
  }
  if (taxa < SEG_POR_CARACTERE.min) {
    return { ok: false, motivo: `curta demais: ${durS.toFixed(1)} s para ${texto.length} caracteres (${taxa.toFixed(3)} s/caractere; abaixo de ${SEG_POR_CARACTERE.min} o áudio foi cortado)` };
  }
  return { ok: true };
}

/**
 * Segunda opinião: a transcrição abre com "Olá", termina em "que bom ter você aqui" e tem 1 a 3 palavras no meio (o nome).
 * O nome não é comparado: o ASR varia a grafia. `null` (ASR indisponível) não é reprovação: quem decide é a duração.
 */
export function caudaConfere(palavras: WordTime[] | null | undefined): { ok: boolean; motivo?: string } {
  if (!palavras?.length) return { ok: true };
  const tokens = normalizar(palavras.map((w) => w.word).join(' ')).split(' ').filter(Boolean);
  if (tokens[0] !== 'ola') return { ok: false, motivo: `transcrição não abre com "Olá": "${tokens.join(' ')}"` };
  if (tokens.slice(-CAUDA.length).join(' ') !== CAUDA.join(' ')) return { ok: false, motivo: `transcrição não termina em "que bom ter você aqui": "${tokens.join(' ')}"` };
  const meio = tokens.length - 1 - CAUDA.length;
  if (meio < 1 || meio > 3) return { ok: false, motivo: `transcrição tem ${meio} palavra(s) entre o "Olá" e o fecho (esperava 1 a 3): "${tokens.join(' ')}"` };
  return { ok: true };
}

export class SaudacaoReprovadaError extends Error {
  constructor(public motivos: string[]) {
    super(`saudação reprovada em ${motivos.length} tentativa(s): ${motivos.join(' | ')}`);
    this.name = 'SaudacaoReprovadaError';
  }
}

/** Dependências trocáveis em teste (nada de rede nos testes unitários). */
export interface DepsDaSaudacao {
  gerar: (texto: string, ledger: { empresaId: string | null; colaboradorId: string }) => Promise<{ mp3: Buffer; durS: number; f0Hz: number | null }>;
  transcrever: (mp3: Buffer) => Promise<WordTime[] | null>;
}

const depsReais: DepsDaSaudacao = {
  gerar: async (texto, l) => {
    // Vertex é o ponto da mudança: o corpo do vídeo é Vertex, e o AI Studio serve outra locutora com o mesmo nome de voz.
    // Sem este guard, `TTS_BACKEND` ausente cairia no default `aistudio` e reabriria a queixa sem erro nenhum.
    if ((process.env.TTS_BACKEND || 'aistudio').toLowerCase() !== 'vertex') {
      throw new Error('TTS_BACKEND não é vertex: a saudação tem de sair do mesmo backend do corpo do vídeo');
    }
    const r = await generateNarrationAudio(texto, {
      voice: ELENCO.mentora.voz,
      style: ESTILO_DA_SAUDACAO,
      segmentar: false,
      // Uma síntese por tentativa NOSSA (o laço abaixo decide se refaz); `alvo: null` = sem veto de registro (ver cabeçalho).
      // `permitirReprovado` só vale para "sem fala", que o portão já recusa sempre.
      tentativas: 1,
      alvo: null,
      permitirReprovado: true,
      ledger: { feature: 'tts_saudacao', empresaId: l.empresaId, colaboradorId: l.colaboradorId, artifactKey: `saudacao:${l.colaboradorId}:${ELENCO.mentora.versao}` },
    });
    return { mp3: r.buffer, durS: r.qa?.metricas.durS ?? duracaoDoMp3(r.buffer), f0Hz: r.qa?.metricas.f0MedHz ?? null };
  },
  // O ASR é segunda opinião: 20 s bastam para 4 s de áudio, e travar a geração esperando por ele seria pior que não conferir.
  transcrever: (mp3) => Promise.race([
    transcribeWords(mp3),
    new Promise<null>((r) => setTimeout(() => r(null), 20_000)),
  ]),
};

export interface SaudacaoSintetizada { mp3: Buffer; durS: number; f0Hz: number | null; tentativas: number; asr: 'conferido' | 'indisponivel' }

/** Sintetiza a saudação de UMA pessoa, com as checagens. Lança `SaudacaoReprovadaError` se nenhuma tentativa passar. */
export async function sintetizarSaudacao(
  a: { nome: string; empresaId: string | null; colaboradorId: string; tentativas?: number },
  deps: DepsDaSaudacao = depsReais,
): Promise<SaudacaoSintetizada> {
  const nome = primeiroNome(a.nome);
  if (!nome) throw new SaudacaoReprovadaError(['pessoa sem nome']);
  const texto = textoDaSaudacao(nome);
  const total = Math.max(1, a.tentativas ?? TENTATIVAS_DA_SAUDACAO);
  const motivos: string[] = [];
  for (let t = 1; t <= total; t++) {
    let r: Awaited<ReturnType<DepsDaSaudacao['gerar']>>;
    try {
      r = await deps.gerar(texto, { empresaId: a.empresaId, colaboradorId: a.colaboradorId });
    } catch (e: any) {
      motivos.push(`#${t} síntese falhou: ${String(e?.message || e).slice(0, 140)}`);
      continue;
    }
    if (r.mp3.length < BYTES_MINIMOS) { motivos.push(`#${t} áudio com ${r.mp3.length} bytes`); continue; }
    const dur = avaliarDuracao(texto, r.durS);
    if (!dur.ok) { motivos.push(`#${t} ${dur.motivo}`); continue; }
    const palavras = await deps.transcrever(r.mp3).catch(() => null);
    const cauda = caudaConfere(palavras);
    if (!cauda.ok) { motivos.push(`#${t} ${cauda.motivo}`); continue; }
    return { mp3: r.mp3, durS: r.durS, f0Hz: r.f0Hz, tentativas: t, asr: palavras?.length ? 'conferido' : 'indisponivel' };
  }
  throw new SaudacaoReprovadaError(motivos);
}

export interface PessoaDaSaudacao { colaboradorId: string; /** Nome completo ou só o primeiro: o falado é o primeiro. */ nome: string }

export interface ResultadoSaudacoes {
  geradas: string[];
  jaExistiam: string[];
  falhas: { colaboradorId: string; motivo: string }[];
  /** Não começaram: o prazo acabou antes da vez delas. */
  adiadas: string[];
  semNome: string[];
}

async function mapPool<T>(itens: T[], n: number, fn: (x: T) => Promise<void>): Promise<void> {
  let i = 0;
  await Promise.all(Array.from({ length: Math.max(1, Math.min(n, itens.length)) }, async () => {
    for (;;) { const k = i++; if (k >= itens.length) return; await fn(itens[k]); }
  }));
}

/**
 * Garante o áudio da saudação de cada pessoa: o que já existe (mesmo nome, mesma versão do elenco) fica; o resto é
 * sintetizado. Idempotente. NUNCA lança: o chamador é o caminho de render, e a falta daqui já tem rastro próprio.
 *
 * `concorrencia` 3 por padrão: o gargalo do Vertex é TPM, e o lote de vídeo/podcast divide o mesmo fornecedor (F-V4).
 * `prazoAteMs`: depois dele não começa pessoa nova (vão para `adiadas`, e a reconciliação cobre).
 */
export async function garantirSaudacoes(a: {
  empresaId: string | null;
  pessoas: PessoaDaSaudacao[];
  concorrencia?: number;
  prazoAteMs?: number;
  sb?: any;
  deps?: DepsDaSaudacao;
}): Promise<ResultadoSaudacoes> {
  const r: ResultadoSaudacoes = { geradas: [], jaExistiam: [], falhas: [], adiadas: [], semNome: [] };
  // Cliente criado sob demanda e DENTRO do try de cada pessoa: a promessa de "nunca lança" inclui env ausente.
  let criado: any;
  const sb = () => a.sb || (criado ??= clienteAdmin());
  const unicas = [...new Map(a.pessoas.map((p) => [p.colaboradorId, p])).values()];
  await mapPool(unicas, a.concorrencia ?? 3, async (p) => {
    const nome = primeiroNome(p.nome);
    if (!nome) { r.semNome.push(p.colaboradorId); return; }
    if (a.prazoAteMs && Date.now() > a.prazoAteMs) { r.adiadas.push(p.colaboradorId); return; }
    try {
      const chave = chaveDoAudioDaSaudacao({ colaboradorId: p.colaboradorId, nome, versao: ELENCO.mentora.versao });
      const { data: existente } = await sb().storage.from(BUCKET_SAUDACAO).download(chave);
      if (existente && existente.size >= BYTES_MINIMOS) { r.jaExistiam.push(p.colaboradorId); return; }
      const s = await sintetizarSaudacao({ nome, empresaId: a.empresaId, colaboradorId: p.colaboradorId }, a.deps);
      const { error } = await sb().storage.from(BUCKET_SAUDACAO).upload(chave, s.mp3, { contentType: 'audio/mpeg', upsert: true });
      if (error) throw new Error(`upload ${chave}: ${error.message}`);
      r.geradas.push(p.colaboradorId);
    } catch (e: any) {
      const motivo = String(e?.message || e).slice(0, 400);
      r.falhas.push({ colaboradorId: p.colaboradorId, motivo });
      await registrarDegradacao({
        fluxo: 'video', tipo: DEGRADACAO.SAUDACAO_VERTEX_FALHOU, chave: p.colaboradorId,
        empresaId: a.empresaId, colaboradorId: p.colaboradorId, severidade: 'aviso',
        detalhe: { motivo, tentativas: TENTATIVAS_DA_SAUDACAO },
      }, a.sb || criado);
    }
  });
  return r;
}

/** Página do PostgREST (teto de `db-max-rows`, não escolha). Chegar nele sem página curta LANÇA: lista parcial vira "ninguém". */
const PAGINA = 1000;
const MAX_PAGINAS = 50;

async function lerColaboradores(sb: any, empresaId: string, cargo: string): Promise<any[]> {
  const out: any[] = [];
  for (let p = 0; p < MAX_PAGINAS; p++) {
    const de = p * PAGINA;
    const { data, error } = await sb.from('colaboradores')
      .select(`id, nome_completo, perfil_dominante, ${COLUNAS_PREFERENCIA_KIT}`)
      .eq('empresa_id', empresaId).eq('cargo', cargo).order('id').range(de, de + PAGINA - 1);
    if (error) throw new Error(`saudações: leitura de colaboradores falhou (${error.message})`);
    out.push(...(data || []));
    if ((data || []).length < PAGINA) return out;
  }
  throw new Error('saudações: colaboradores passaram do teto de páginas: recusando lista parcial');
}

/**
 * As pessoas que o worker vai saudar nesta célula: a MESMA regra de `personalizeCell` (cargo exato, 1ª letra do DISC, nome
 * preenchido e, em kit nascido da regra das preferências, só quem tem o vídeo no top 2). `null` = célula incompleta, que a
 * caixa também pula.
 */
export async function destinatariosDaCelula(sb: any, celulaId: string): Promise<{ empresaId: string; pessoas: PessoaDaSaudacao[] } | null> {
  const { data: cel, error } = await sb.from('videos_gerados').select('id, empresa_id, cargo, disc_dominante, kit_id').eq('id', celulaId).maybeSingle();
  if (error) throw new Error(`saudações: leitura da célula falhou (${error.message})`);
  const disc = String(cel?.disc_dominante || '').trim().charAt(0).toUpperCase();
  if (!cel?.empresa_id || !cel.cargo || !['D', 'I', 'S', 'C'].includes(disc)) return null;
  let porPreferencia = false;
  if (cel.kit_id) {
    const { data: kit, error: errKit } = await sb.from('kits').select('desafio').eq('id', cel.kit_id).maybeSingle();
    // Falha de leitura LANÇA: tratar como "kit antigo" sintetizaria para quem a caixa não vai saudar (e pagaria por isso).
    if (errKit) throw new Error(`saudações: leitura do kit falhou (${errKit.message})`);
    porPreferencia = kit?.desafio?.por_preferencia === true;
  }
  const colabs = (await lerColaboradores(sb, cel.empresa_id, cel.cargo)).filter((c) =>
    String(c.perfil_dominante || '').trim().charAt(0).toUpperCase() === disc
    && String(c.nome_completo || '').trim()
    && (!porPreferencia || videoNoTopDois(c)));
  return { empresaId: cel.empresa_id, pessoas: colabs.map((c) => ({ colaboradorId: c.id, nome: c.nome_completo })) };
}

/**
 * Garante as saudações da célula inteira. É o que o `gerar-video-modulo` chama depois de enfileirar o render. NUNCA lança.
 * Célula de ambiente de demonstração também entra: o nominal da demo é refeito à mão, mas o `personalizeCell` da box roda
 * nela igual, e sem o áudio ele registraria `saudacao-vertex-ausente` para cada persona.
 */
export async function garantirSaudacoesDaCelula(celulaId: string, opts: { prazoAteMs?: number; concorrencia?: number; sb?: any; deps?: DepsDaSaudacao } = {}): Promise<
  (ResultadoSaudacoes & { destinatarios: number }) | { erro: string } | { pulada: string }
> {
  let sb: any = opts.sb;
  try {
    sb ??= clienteAdmin();
    const d = await destinatariosDaCelula(sb, celulaId);
    if (!d) return { pulada: 'célula incompleta (sem empresa, cargo ou DISC válido)' };
    if (!d.pessoas.length) return { pulada: 'célula sem pessoas para saudar' };
    const r = await garantirSaudacoes({ empresaId: d.empresaId, pessoas: d.pessoas, sb, prazoAteMs: opts.prazoAteMs, concorrencia: opts.concorrencia, deps: opts.deps });
    return { ...r, destinatarios: d.pessoas.length };
  } catch (e: any) {
    const erro = String(e?.message || e).slice(0, 300);
    await registrarDegradacao({ fluxo: 'video', tipo: DEGRADACAO.SAUDACAO_VERTEX_FALHOU, chave: `celula:${celulaId}`, severidade: 'aviso', detalhe: { erro } }, sb);
    return { erro };
  }
}

/** Contagens para log e retorno da task (sem os ids de pessoas). */
export function resumirSaudacoes(r: Awaited<ReturnType<typeof garantirSaudacoesDaCelula>>): Record<string, unknown> {
  if ('erro' in r) return { erro: r.erro };
  if ('pulada' in r) return { pulada: r.pulada };
  return { destinatarios: r.destinatarios, geradas: r.geradas.length, jaExistiam: r.jaExistiam.length, falhas: r.falhas.length, adiadas: r.adiadas.length };
}
