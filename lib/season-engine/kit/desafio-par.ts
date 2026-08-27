/**
 * A TAREFA da semana quando ela entrega DOIS descritores da mesma competência —
 * uma só, escrita olhando os dois.
 *
 * 🔴 O PROBLEMA QUE ELA RESOLVE (27/08/2026)
 * ──────────────────────────────────────────
 * A semana entrega 2 pílulas e, desde a rodada anterior, UMA tarefa. Mas essa
 * tarefa era a do PRIMEIRO descritor — o kit é por descritor, e a unificação
 * apenas escolhia um. O segundo assunto era entregue como conteúdo e nunca
 * cobrado como prática.
 *
 * ⚠️ LEITURA E GERAÇÃO SÃO SEPARADAS DE PROPÓSITO.
 * `resolverDesafioDaSemana` só LÊ. Quem gera é `gerarDesafioDaSemana`, chamado
 * pelo fluxo de kit / pelo lote. A régua da casa: na ENTREGA, degrade
 * registrando; na CONSTRUÇÃO, falhe alto. Gerar na leitura colocaria uma
 * chamada de IA no caminho de quem abriu a tela — latência imprevisível na cara
 * da pessoa, e custo que ninguém planejou (a matriz de pares é ~2,5× a de
 * descritores; ver a migration 232).
 *
 * Sem a peça do par, o consumidor cai no desafio do descritor principal — o
 * comportamento que já estava no ar — e registra a degradação.
 */
import { callAI } from '@/actions/ai-client';
import { normDescritor } from '@/lib/blueprint/to-descriptors';
import { normalizarComp } from '@/lib/workshop-competencias';

export interface DesafioDoPar {
  desafio_texto: string;
  acao_observavel?: string;
  criterio_de_execucao?: string;
  por_que_cabe_na_semana?: string;
}

/**
 * Chave de reuso do par: descritores normalizados e ORDENADOS.
 *
 * Ordenar é deliberado — [A,B] e [B,A] são a mesma semana e devem reusar a
 * mesma tarefa. Sem isso a matriz dobraria por acidente de ordenação do
 * blueprint, e duas pessoas com os mesmos dois assuntos pagariam duas gerações.
 */
export function chaveDoPar(descritores: (string | null | undefined)[]): string[] {
  return [...new Set(
    (descritores || []).map((d) => normDescritor(String(d || ''))).filter(Boolean),
  )].sort();
}

/**
 * `text[]` no formato que o PostgREST manda para o Postgres.
 *
 * 🔴 `.eq('descritores_norm', ['a','b'])` serializa como `a,b` e o Postgres
 * responde `malformed array literal` — a comparação precisa do literal `{"a","b"}`.
 * Não há typecheck que pegue isso: o supabase-js aceita o array e o erro só
 * aparece na PRIMEIRA execução real (aconteceu aqui, em 27/08, na primeira
 * geração). Escapar aspas e barras é obrigatório: há descritor com `/` no nome
 * ("Uso de CNV/mediação").
 */
export function arrayLiteralPg(itens: string[]): string {
  const esc = (s: string) => String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return `{${itens.map((s) => `"${esc(s)}"`).join(',')}}`;
}

/** Só LÊ. Devolve `null` quando a célula ainda não foi gerada. */
export async function resolverDesafioDaSemana(
  sb: any,
  args: { empresaId: string | null; competencia: string | null; descritores: string[]; disc: string | null; cargo?: string | null },
): Promise<DesafioDoPar | null> {
  const disc = String(args.disc || '').trim().charAt(0).toUpperCase();
  if (!args.empresaId || !args.competencia || !['D', 'I', 'S', 'C'].includes(disc)) return null;
  const chave = chaveDoPar(args.descritores);
  if (chave.length < 2) return null;

  const { data, error } = await sb.from('kit_desafios_semana')
    .select('desafio, cargo')
    .eq('empresa_id', args.empresaId)
    .eq('competencia', args.competencia)
    .eq('descritores_norm', arrayLiteralPg(chave))
    .eq('disc', disc)
    .eq('status', 'published');
  // Falha de leitura NÃO é "não existe": devolver null aqui faria o consumidor
  // cair no desafio do descritor principal em silêncio, exatamente o F-C4.
  if (error) throw new Error(`kit_desafios_semana: ${error.message}`);
  if (!data?.length) return null;

  // Cargo é FILTRO, não ordenação — mesma regra de `cargoServe`: tarefa escrita
  // para outro cargo é pior que a genérica, porque afirma um contexto que não é
  // o da pessoa. 'todos' é o curinga legítimo.
  const cargoColab = String(args.cargo || '').trim().toLowerCase();
  const doCargo = data.find((r: any) => String(r.cargo || '').toLowerCase() === cargoColab && cargoColab);
  const generico = data.find((r: any) => String(r.cargo || '').toLowerCase() === 'todos');
  const escolhido = doCargo || generico;
  return escolhido?.desafio?.desafio_texto ? escolhido.desafio : null;
}

const LENTE_DISC: Record<string, { perfil: string; engaja: string }> = {
  D: { perfil: 'Dominância', engaja: 'resultado visível, decisão e controle do próprio tempo' },
  I: { perfil: 'Influência', engaja: 'interação com pessoas, reconhecimento e troca' },
  S: { perfil: 'Estabilidade', engaja: 'passo previsível, apoio combinado e ritmo sem sobressalto' },
  C: { perfil: 'Conformidade', engaja: 'critério explícito, registro e verificação' },
};

/**
 * Escreve a tarefa do par por IA e persiste. Idempotente por SELECT-então-INSERT
 * — o mesmo padrão de `resolverOuCriarBrief`, e não `upsert`: o ON CONFLICT via
 * PostgREST já quebrou nesta base com índice que ele não consegue expressar
 * (42P10), e o erro só aparece no primeiro uso real.
 */
export async function gerarDesafioDaSemana(
  sb: any,
  args: {
    empresaId: string;
    competencia: string;
    /** Descritores como vêm do plano (com código, se houver). */
    descritores: string[];
    disc: string;
    cargo?: string | null;
    /** Núcleos dos briefs dos dois descritores — a tarefa ancora neles. */
    nucleos: { descritor: string; ideia_central: string; pontos_chave: string[]; exemplo_ancora: string }[];
    pppBrief?: string | null;
    aiConfig?: any;
    /** Caller de IA injetado (Batch). Default: síncrono. */
    aiRun?: typeof callAI;
  },
): Promise<{ desafio: DesafioDoPar; reused: boolean }> {
  const disc = String(args.disc).trim().charAt(0).toUpperCase();
  if (!['D', 'I', 'S', 'C'].includes(disc)) throw new Error(`disc inválido: ${args.disc}`);
  const chave = chaveDoPar(args.descritores);
  if (chave.length < 2) throw new Error('desafio de par exige 2 descritores distintos');
  const cargo = String(args.cargo || 'todos').trim() || 'todos';

  const { data: existente, error: errLeitura } = await sb.from('kit_desafios_semana')
    .select('id, desafio')
    .eq('empresa_id', args.empresaId).eq('competencia', args.competencia)
    .eq('descritores_norm', arrayLiteralPg(chave)).eq('cargo', cargo).eq('disc', disc)
    .maybeSingle();
  if (errLeitura) throw new Error(`kit_desafios_semana leitura: ${errLeitura.message}`);
  if (existente?.desafio?.desafio_texto) return { desafio: existente.desafio, reused: true };

  const lente = LENTE_DISC[disc];
  const system = `Você é designer instrucional da Vertho especializado em micro-ações práticas.

A semana da pessoa entregou DOIS conteúdos, de assuntos diferentes da MESMA competência. Crie UMA micro-ação prática — não duas — que a pessoa experimenta no trabalho real ao longo da semana e que produza evidência dos DOIS assuntos.

O QUE "INTEGRAR" SIGNIFICA AQUI:
- UMA situação real, não duas tarefas emendadas por "e também".
- Os dois assuntos devem estar presentes como FACETAS da mesma ação — se der para cumprir a tarefa exercitando só um deles, ela ainda não está integrada.
- Se os dois assuntos não couberem numa ação honesta, escolha a ação do assunto principal e faça o segundo aparecer como CRITÉRIO de como executá-la. Nunca invente uma ligação que não existe.

PRINCÍPIOS INEGOCIÁVEIS:
- UMA ação principal, observável, que cabe na rotina da semana, coerente com cargo/contexto.
- Curto (2–4 frases), concreto, viável (sem grande projeto/autorização).
- Sem "Esta semana...", sem jargão, sem tom professoral, sem slogan.
- NÃO cite os nomes técnicos dos descritores nem códigos de matriz no texto.

LENTE DE PERFIL (${disc} · ${lente.perfil}): a AÇÃO deve ENGAJAR este perfil por: ${lente.engaja}. NUNCA cite DISC, siglas (D/I/S/C) nem o nome do perfil no texto.

RETORNE APENAS JSON VÁLIDO:
{"desafio_texto":"2-4 frases","acao_observavel":"a ação principal observável","criterio_de_execucao":"como saber que foi feito — e que os DOIS assuntos apareceram","por_que_cabe_na_semana":"viabilidade curta"}`;

  const user = `OS DOIS ASSUNTOS DA SEMANA (a ação deve aterrar os dois):

${args.nucleos.map((n, i) => `ASSUNTO ${i + 1} — ${n.descritor}
- Ideia central: ${n.ideia_central}
- Pontos-chave: ${(n.pontos_chave || []).join(' · ')}
- Exemplo-âncora: ${n.exemplo_ancora}`).join('\n\n')}

CONTEXTO:
- Competência: ${args.competencia}
- Cargo: ${cargo}${args.pppBrief ? `\n\nCONTEXTO DA INSTITUIÇÃO (ancore a ação na realidade dela, sem citar o nome):\n${args.pppBrief}` : ''}`;

  const sysJson = `${system}\n\nIMPORTANTE: responda SOMENTE com o objeto JSON, sem texto antes ou depois, sem markdown.`;
  let desafio: DesafioDoPar | null = null;
  for (let i = 0; i < 3 && !desafio; i++) {
    const ai = i === 0 && args.aiRun ? args.aiRun : callAI;
    const raw = (await ai(i === 0 ? system : sysJson, user, args.aiConfig || {}, 800, {
      taskKey: 'kit_desafio_semana', empresaId: args.empresaId,
    })).trim();
    desafio = parseDesafio(raw);
    if (!desafio) console.warn(`[desafio-par] inválido DISC ${disc} (tentativa ${i + 1}/3): ${raw.slice(0, 120)}`);
  }
  if (!desafio) throw new Error(`desafio do par inválido retornado pela IA (DISC ${disc})`);

  const { error } = await sb.from('kit_desafios_semana').insert({
    empresa_id: args.empresaId,
    competencia: args.competencia,
    descritores: args.descritores,
    descritores_norm: chave,
    cargo,
    disc,
    desafio,
    status: 'published',
  });
  // Corrida com outra geração da mesma célula: o UNIQUE segurou, e a peça que
  // já está lá serve igual. Qualquer outro erro é falha de escrita e sobe — na
  // CONSTRUÇÃO se falha alto.
  if (error) {
    if (String(error.code) === '23505') {
      const { data: agora, error: errRe } = await sb.from('kit_desafios_semana')
        .select('desafio').eq('empresa_id', args.empresaId).eq('competencia', args.competencia)
        .eq('descritores_norm', arrayLiteralPg(chave)).eq('cargo', cargo).eq('disc', disc).maybeSingle();
      // Se nem a releitura funciona, não dá para afirmar que a peça está lá —
      // devolver `reused: true` aqui seria dizer "já existia" sem ter visto.
      if (errRe) throw new Error(`kit_desafios_semana releitura pós-conflito: ${errRe.message}`);
      if (agora?.desafio?.desafio_texto) return { desafio: agora.desafio, reused: true };
    }
    throw new Error(`kit_desafios_semana insert: ${error.message}`);
  }
  return { desafio, reused: false };
}

/** Parser tolerante (a IA às vezes embrulha o JSON em prosa/markdown). */
function parseDesafio(raw: string): DesafioDoPar | null {
  let s = String(raw || '').trim();
  if (s.startsWith('```')) s = s.replace(/^```(?:json)?\s*/, '').replace(/```\s*$/, '');
  const i = s.indexOf('{');
  const j = s.lastIndexOf('}');
  if (i < 0 || j <= i) return null;
  try {
    const p = JSON.parse(s.slice(i, j + 1));
    const t = typeof p?.desafio_texto === 'string' ? p.desafio_texto.trim() : '';
    if (t.length < 20) return null;
    return {
      desafio_texto: t,
      acao_observavel: typeof p.acao_observavel === 'string' ? p.acao_observavel.trim() : undefined,
      criterio_de_execucao: typeof p.criterio_de_execucao === 'string' ? p.criterio_de_execucao.trim() : undefined,
      por_que_cabe_na_semana: typeof p.por_que_cabe_na_semana === 'string' ? p.por_que_cabe_na_semana.trim() : undefined,
    };
  } catch {
    return null;
  }
}

/** Chave de comparação de competência — a mesma régua de igualdade da casa. */
export const mesmaCompetencia = (a: unknown, b: unknown) => normalizarComp(a) === normalizarComp(b);
