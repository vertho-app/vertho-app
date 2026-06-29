/**
 * Narrativa IA do Relatório de Adequação ao Cargo: 1 análise objetiva (2-3 frases)
 * por colaborador, sobre forças e gaps frente ao perfil ideal. Gera em CHUNKS
 * (1 chamada cobre vários colaboradores → barato). Best-effort: falha → sem texto.
 */
import { callAI } from '@/actions/ai-client';
import type { AdequacaoCargo, PessoaAdequacao } from './aggregate';

function chunk<T>(a: T[], n: number): T[][] { const o: T[][] = []; for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o; }

function resumoIdeal(data: AdequacaoCargo): string {
  const disc = data.perfilIdeal.disc.map((d) => `${d.nome} ${d.min}-${d.max}`).join(', ');
  const comps = data.perfilIdeal.competencias.slice(0, 8).map((c) => `${c.nome} ${c.min}-${c.max}`).join('; ');
  const lid = data.perfilIdeal.estiloPredominante;
  return `DISC ideal: ${disc}. Competências-chave: ${comps}. Estilo de liderança predominante: ${lid}.`;
}

// Severidade derivada da ADERÊNCIA (fit), não livre (B2): <40 crítico · 40-64 moderado · 65+ leve.
const severidade = (fitPct: number): string => (fitPct < 40 ? 'crítico' : fitPct < 65 ? 'moderado' : 'leve');

function linhaColab(p: PessoaAdequacao): string {
  // DISC marcado (dentro)/(FORA) — valor DENTRO da faixa NÃO é gap (B1).
  const disc = p.disc.map((d) => `${d.fator}=${d.score}${d.dentro ? '(dentro)' : '(FORA)'}`).join(' ');
  // DRIVERS = exatamente o que determina o status. bloqueado → traços do knockout;
  // demais → gaps (traço fit% + severidade proporcional). SÓ isto pode virar "atenção".
  const drivers = p.knockoutFailed
    ? 'DRIVERS(bloqueio): ' + p.knockoutEvidencias.map((e) => e.ehBloco ? `${e.traco}=${e.medidoPct}% (mín ${e.minPct}%)` : `${e.traco}=${e.valorBruto} (piso ${e.piso})`).join(', ')
    : (p.gaps.length ? 'DRIVERS(gaps): ' + p.gaps.map((g) => `${g.traco} ${g.fitPct}% [${severidade(g.fitPct)}]`).join(', ') : 'DRIVERS: sem gaps relevantes (manter)');
  const flags = p.borderline ? ' [limítrofe]' : '';
  return `- ${p.nome}: ${p.statusLabel} | Beta ${p.beta.pct}% | DISC ${disc} | ${drivers}${flags}`;
}

function extrairJson(raw: string): Record<string, string> | null {
  let s = (raw || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  try { return JSON.parse(s); } catch { /* tenta recortar */ }
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a >= 0 && b > a) { try { return JSON.parse(s.slice(a, b + 1)); } catch { /* desiste */ } }
  return null;
}

export async function gerarNarrativasAdequacao(data: AdequacaoCargo, model?: string): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  if (!data.pessoas.length) return out;
  const ideal = resumoIdeal(data);
  const system = `Você é consultor de RH especializado em adequação pessoa-cargo. Escreva uma análise CURTA, objetiva e profissional (2 a 3 frases) por pessoa.

REGRA DURA DE EVIDÊNCIA (inegociável): só é permitido apontar um déficit usando os DRIVERS fornecidos para aquela pessoa. Todo construto interpretativo ("resiliência", "disciplina de CRM", "comunicação") deve aparecer SOMENTE como CONSEQUÊNCIA de um traço NOMEADO e QUANTIFICADO dos drivers — nunca como o achado em si. Não cite fatores que não estão nos drivers (ex.: não derive para Dominância/DISC se o driver é Persistência/Organização). Não invente números nem traços.

Estrutura: cite a principal FORÇA (coerente com Beta) e o(s) driver(s) que determinam o status. O tom deve ser COERENTE com o status (Recomendado / Recomendado com ressalvas / Abaixo do corte → desenvolvível / Bloqueado → requisito eliminatório não atendido).

REGRA POR STATUS:
- Bloqueado: descreva APENAS o motivo do gate (traço + piso + consequência). NÃO ofereça plano de desenvolvimento, passos de evolução, nem "como chegar lá" — o gate existe para dizer que este não é o caminho agora. Não diga "o plano deve priorizar X".
- Abaixo do corte / com ressalvas: enquadre como DESENVOLVIMENTO (não rejeição); pode apontar os gaps, sem prometer resultado.

REGRA DE EVIDÊNCIA (inegociável):
- SÓ os itens em DRIVERS são pontos de atenção/desenvolvimento. NUNCA nomeie como atenção um traço que NÃO está em DRIVERS — em especial, um fator DISC marcado "(dentro)" está na faixa aceitável e NÃO é gap. NUNCA cite um valor bruto (ex.: "Conformidade 71%") como problema; valor dentro da faixa não é preocupação.
- SEVERIDADE proporcional ao rótulo do driver: [crítico] = linguagem forte; [moderado] = desenvolvimento; [leve] = ajuste fino. NÃO dramatize um gap [moderado]/[leve] (ex.: não diga que um traço "compromete" se ele é [moderado]). O mesmo traço deve contar a MESMA história na narrativa e no plano.

Não dê nota nem recomende demissão. Português do Brasil.`;

  for (const grupo of chunk(data.pessoas, 12)) {
    const user = `CARGO: ${data.cargo}
PERFIL IDEAL: ${ideal}

COLABORADORES (Beta = aderência geral; "dentro/fora" = DISC na faixa ideal):
${grupo.map(linhaColab).join('\n')}

Para CADA colaborador acima, escreva a análise (2-3 frases). Responda APENAS um objeto JSON { "Nome Exato": "análise", ... } com o nome EXATO de cada um. Sem markdown, sem texto fora do JSON.`;
    try {
      const raw = await callAI(system, user, { model }, 2500);
      const parsed = extrairJson(raw);
      if (parsed) for (const p of grupo) { if (typeof parsed[p.nome] === 'string') out[p.nome] = parsed[p.nome].trim(); }
    } catch (e: any) { console.warn('[narrativasAdequacao] chunk falhou:', e?.message); }
  }
  return out;
}
