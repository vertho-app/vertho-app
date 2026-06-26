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

function linhaColab(p: PessoaAdequacao): string {
  const disc = p.disc.map((d) => `${d.fator}=${d.score}${d.dentro ? '(dentro)' : '(fora)'}`).join(' ');
  return `- ${p.nome}: Beta ${p.beta.pct}% | DISC ${disc} → ${p.discScore.pct}% | Mapeamento ${p.mapeamento.pct}% | Competência ${p.competencia.pct}% | Liderança ${p.lideranca.pct}%`;
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
  const system = `Você é consultor de RH especializado em adequação pessoa-cargo. A partir dos scores de match de cada colaborador com o PERFIL IDEAL do cargo, escreva uma análise CURTA, objetiva e profissional (2 a 3 frases) por pessoa: aponte a principal FORÇA (onde adere) e o principal GAP (onde diverge), em linguagem de feedback de desenvolvimento — sem rótulos pejorativos, sem inventar dados além dos fornecidos. Não repita os números percentuais no texto; interprete-os. Não dê nota nem recomende demissão. Português do Brasil.`;

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
