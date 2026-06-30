/**
 * Rotina de Calibração — Fase 1: diagnóstico ENGINE-FREE a partir do snapshot.
 *
 * PRINCÍPIO (igual ao re-render): este módulo NÃO importa o motor (scoring/engine,
 * buildRoleSpec). Ele DESCREVE o resultado ENTREGUE — lê bruto+fit+beta do snapshot
 * enriquecido (PessoaAdequacao.tracos + beta), não recomputa. Assim não pode (a) divergir
 * do que foi entregue, (b) virar uma 3ª fonte de Beta, (c) medir sob régua evoluída.
 *
 * A única peça que toca o motor é a MATERIALIDADE (what-if de recuperação), e ela é
 * SIMULAÇÃO explicitamente rotulada — computada FORA deste módulo (lib/calibracao/
 * materialidade), porque um e-se não é o número entregue.
 *
 * Saída: Cartão de Calibração — DESCREVE e CLASSIFICA, nunca PRESCREVE.
 */
import type { AdequacaoCargo } from '@/lib/adequacao-cargo/aggregate';

// ── Camada 0 — Higiene de pool (bloqueia a Camada 1) ─────────────────────────
export interface ColabHigiene { id: string; nome: string; email: string | null; dNatural: number | null }
export interface IssueHigiene { tipo: 'email_quase_igual' | 'sem_disc' | 'duplicado' | 'disc_conflitante'; detalhe: string }

function editDist(a: string, b: string): number {
  const m = a.length, n = b.length; const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++)
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[m][n];
}
const norm = (s: any) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** Detecta (não corrige) problemas de dado que contaminariam o diagnóstico. */
export function camada0Higiene(colabs: ColabHigiene[]): IssueHigiene[] {
  const out: IssueHigiene[] = [];
  // (b) sem DISC
  for (const c of colabs) if (c.dNatural == null) out.push({ tipo: 'sem_disc', detalhe: `${c.nome} (${c.email || c.id}) — d_natural nulo` });
  // (a) e-mails quase-idênticos (edit distance ≤ 2; pega gmail/gnail)
  const comEmail = colabs.filter((c) => c.email && !/@nao-email\./.test(c.email));
  for (let i = 0; i < comEmail.length; i++) for (let j = i + 1; j < comEmail.length; j++) {
    const ei = comEmail[i].email!, ej = comEmail[j].email!;
    const dist = editDist(ei.toLowerCase(), ej.toLowerCase());
    if (dist > 0 && dist <= 2) {
      out.push({ tipo: 'email_quase_igual', detalhe: `${ei} ~ ${ej} (dist ${dist}) — ${comEmail[i].nome} / ${comEmail[j].nome}` });
      // (d) DISC conflitante p/ a mesma pessoa (e-mail quase-igual + DISC diferente)
      if (comEmail[i].dNatural != null && comEmail[j].dNatural != null && comEmail[i].dNatural !== comEmail[j].dNatural)
        out.push({ tipo: 'disc_conflitante', detalhe: `${comEmail[i].nome}: d_natural ${comEmail[i].dNatural} vs ${comEmail[j].dNatural} — qual mede a pessoa? (decisão humana)` });
    }
  }
  // (c) duplicados por nome — só conta linhas SUBSTANTIVAS. Um proxy de WhatsApp vazio
  // (nao-email + sem DISC) é a identidade-telefone do MESMO usuário (login dual, por
  // design), NÃO uma duplicata a resolver. Sem isto, a Camada 0 flagaria todo dual-login.
  const proxyVazio = (c: ColabHigiene) => c.dNatural == null && !!c.email && /@nao-email\./.test(c.email);
  const porNome = new Map<string, ColabHigiene[]>();
  for (const c of colabs) { if (proxyVazio(c)) continue; const k = norm(c.nome); if (!porNome.has(k)) porNome.set(k, []); porNome.get(k)!.push(c); }
  for (const [, g] of porNome) if (g.length > 1) out.push({ tipo: 'duplicado', detalhe: `"${g[0].nome}" aparece ${g.length}× substantivas (ids: ${g.map((c) => c.id.slice(0, 8)).join(', ')})` });
  return out;
}

// ── Estatística (engine-free) ────────────────────────────────────────────────
function pearson(a: number[], b: number[]): number {
  const n = a.length; if (n < 2) return 0;
  const ma = a.reduce((x, y) => x + y, 0) / n, mb = b.reduce((x, y) => x + y, 0) / n;
  let c = 0, va = 0, vb = 0;
  for (let i = 0; i < n; i++) { c += (a[i] - ma) * (b[i] - mb); va += (a[i] - ma) ** 2; vb += (b[i] - mb) ** 2; }
  return va && vb ? c / Math.sqrt(va * vb) : 0;
}
function rank(arr: number[]): number[] { const idx = arr.map((v, i) => [v, i] as [number, number]).sort((x, y) => x[0] - y[0]); const r = new Array(arr.length); idx.forEach(([, i], k) => (r[i] = k)); return r; }
function spearman(a: number[], b: number[]): number { return pearson(rank(a), rank(b)); }
/** |ρ|crítico p/ p<0,05 (aprox. via t≈2): ρcrit = 2/√(n+2). N=40 → ~0,31. */
function rhoCrit(n: number): number { return 2 / Math.sqrt(n + 2); }

// ── Camada 1 — Cartão de Calibração (descreve+classifica, NÃO prescreve) ─────
export type Quadrante = 'design-by-choice' | 'sinal-recuperavel' | 'tensao-de-autoria' | 'curvilineo-correto';
export interface LinhaCartao {
  key: string; traco: string; direcao: string; ladoSaturacao: 'teto' | 'piso'; pctSat: number;
  rho: number; n: number; significativo: boolean;
  // confiança = |ρ|/crít: 'robusta' (≥1,5× o limiar) vs 'borderline' (mal cruza). Um SIG a
  // N=15 é evidência muito mais fraca que a N=40 — sem isto, a máquina classifica ruído de
  // N pequeno como sinal. A mesa desconta o borderline.
  confianca: 'robusta' | 'borderline' | 'ns';
  quadrante: Quadrante; decisaoPendente: string | null;
}

export function camada1Cartao(data: AdequacaoCargo): { n: number; cartao: LinhaCartao[]; semTracos: boolean } {
  // ρ/saturação SÓ nos NÃO-BLOQUEADOS. O gate cria um cluster espúrio (traço baixo →
  // knockout → beta baixo = low-low) que INFLA a correlação — o que faria Gestão Escolar
  // parecer "sinal-recuperável" quando é "design-by-choice". Medir onde o SCORE opera, não
  // onde o gate já decidiu. (Mesma lição de "materialidade em betaBand, não status".)
  const pessoas = (data.pessoas || []).filter((p) => !p.knockoutFailed);
  const temTracos = pessoas.length > 0 && Array.isArray((pessoas[0] as any).tracos) && (pessoas[0] as any).tracos.length > 0;
  if (!temTracos) return { n: pessoas.length, cartao: [], semTracos: true };

  // keys de traço presentes (band)
  const keys = Array.from(new Set(pessoas.flatMap((p: any) => p.tracos.map((t: any) => t.key))));
  const cartao: LinhaCartao[] = [];

  for (const key of keys) {
    // pares (bruto, beta) alinhados, só de quem tem o bruto
    const pares: { bruto: number; beta: number; fit: number }[] = [];
    let direcao = '', label = key;
    for (const p of pessoas as any[]) {
      const t = p.tracos.find((x: any) => x.key === key); if (!t) continue;
      direcao = t.direcao || direcao; label = t.label || label;
      if (typeof t.bruto === 'number') pares.push({ bruto: t.bruto, beta: p.beta?.pct ?? 0, fit: t.fitPct });
    }
    if (pares.length < 2) continue;
    const fits = pares.map((x) => x.fit);
    const pctTeto = Math.round((fits.filter((f) => f >= 95).length / fits.length) * 100);
    const pctPiso = Math.round((fits.filter((f) => f <= 5).length / fits.length) * 100);
    const saturadoTeto = pctTeto > 50, saturadoPiso = pctPiso > 50;
    const rho = Math.round(spearman(pares.map((x) => x.bruto), pares.map((x) => x.beta)) * 100) / 100;
    const n = pares.length; const crit = rhoCrit(n); const sig = Math.abs(rho) > crit;
    const confianca: 'robusta' | 'borderline' | 'ns' = !sig ? 'ns' : Math.abs(rho) / crit >= 1.5 ? 'robusta' : 'borderline';

    // só entra no cartão: saturado (qualquer lado) OU tensão-de-autoria (floor + ρ− forte)
    const ehTensao = direcao === 'floor' && rho < 0 && sig;
    if (!saturadoTeto && !saturadoPiso && !ehTensao) continue;

    const lado: 'teto' | 'piso' = saturadoPiso && !saturadoTeto ? 'piso' : 'teto';
    const pctSat = lado === 'piso' ? pctPiso : pctTeto;

    let quadrante: Quadrante; let pend: string | null;
    if (ehTensao) {
      quadrante = 'tensao-de-autoria';
      pend = `${label} é "floor" (mais-é-melhor) mas o alto correlaciona NEGATIVO com o veredito (ρ ${rho}). Possível constructo curvilíneo não-declarado OU régua torta — psicólogo decide se vira família-comando (cap) ou se a direção está errada.`;
    } else if (saturadoTeto && direcao === 'floor' && rho > 0 && sig) {
      quadrante = 'sinal-recuperavel';
      pend = `${label} satura no topo (${pctTeto}%) mas o bruto concorda com o veredito (ρ ${rho}, monotônico). Sinal real descartado pelo piso baixo — decidir se recuperar (composição, gate-decoupled) vale o custo; depende de cruzar fronteira de decisão E de generalizar p/ outro pool.`;
    } else if (!sig || Math.abs(rho) < rhoCrit(n)) {
      quadrante = 'design-by-choice';
      pend = null; // ortogonal → não toca; nada pendente
    } else if (direcao === 'target' && rho < 0) {
      quadrante = 'curvilineo-correto'; // cap-high operando (família comando bem-posta)
      pend = null;
    } else {
      quadrante = 'design-by-choice';
      pend = null;
    }
    cartao.push({ key, traco: label, direcao, ladoSaturacao: lado, pctSat, rho, n, significativo: sig, confianca, quadrante, decisaoPendente: pend });
  }
  // ordena: pendências primeiro (tensão, recuperável), design-by-choice ao fim
  const ordem: Record<Quadrante, number> = { 'tensao-de-autoria': 0, 'sinal-recuperavel': 1, 'curvilineo-correto': 2, 'design-by-choice': 3 };
  cartao.sort((a, b) => ordem[a.quadrante] - ordem[b.quadrante] || b.pctSat - a.pctSat);
  return { n: (pessoas as any[]).filter((p) => p.tracos?.some((t: any) => typeof t.bruto === 'number')).length, cartao, semTracos: false };
}

// ── Direção do desvio — consistency-check engine-free (última checagem à mão) ─
// Confirma que o LADO gravado em cada gap (que alimenta a narrativa) bate com o bruto
// vs faixa. Guard de regressão do `983363c`: se a aggregate algum dia computar o lado
// errado, a narrativa inverteria o sinal de um faixa-alvo. Zero é o esperado.
export interface InconsistenciaDirecao { traco: string; nome: string; bruto: number; faixa: string; ladoGravado: string; ladoEsperado: string }
export function camada1Direcao(data: AdequacaoCargo): { gapsChecados: number; inconsistencias: InconsistenciaDirecao[] } {
  const inc: InconsistenciaDirecao[] = []; let n = 0;
  for (const p of (data.pessoas || []) as any[]) {
    for (const g of (p.gaps || [])) {
      if (g.valorBruto == null || g.lo == null || g.hi == null || !g.lado) continue;
      n++;
      const esperado = g.valorBruto < g.lo ? 'abaixo' : g.valorBruto > g.hi ? 'acima' : 'dentro';
      if (esperado !== g.lado) inc.push({ traco: g.traco, nome: p.nome, bruto: g.valorBruto, faixa: `${g.lo}-${g.hi}`, ladoGravado: g.lado, ladoEsperado: esperado });
    }
  }
  return { gapsChecados: n, inconsistencias: inc };
}

// ── Saúde da régua (0-100) — TRIAGEM, não grade ──────────────────────────────
// Mede "a régua está CERTA?", não "a população varia". Penaliza SÓ tensão-de-autoria
// (régua de fato invertida); saturação/sinal-recuperável/design-by-choice são neutros
// (muitas vezes by-design / entregável). Higiene suja → SEM nota (não se pontua dado
// contaminado). N pequeno → confiança baixa (a classificação é frágil). A nota INDEXA o
// cartão (diz onde olhar), NUNCA licencia ação — a decisão de régua continua clínica.
export interface SaudeCalibracao { nota: number | null; status: 'saudavel' | 'atencao' | 'problema' | 'indeterminado'; confianca: 'alta' | 'baixa'; motivos: string[]; vigiar: string[] }
export function saudeCalibracao(cartao: LinhaCartao[], temBlockerHigiene: boolean, n: number): SaudeCalibracao {
  if (temBlockerHigiene) return { nota: null, status: 'indeterminado', confianca: 'baixa', motivos: ['Dados duplicados/conflitantes não resolvidos — não dá pra pontuar dado contaminado.'], vigiar: [] };
  let nota = 100; const motivos: string[] = []; const vigiar: string[] = [];
  for (const l of cartao) {
    if (l.quadrante !== 'tensao-de-autoria') continue;
    // SÓ tensão ROBUSTA (evidência confirmada) derruba a nota. Borderline é incerto —
    // penalizá-lo cria um "X que você não melhora sem trapacear" (aplicar um teto numa
    // régua talvez certa, baseado em ρ fraco). Vira VIGILÂNCIA, não penalidade. Mesma
    // disciplina de "força antes de agir num sinal".
    if (l.confianca === 'robusta') { nota -= 20; motivos.push(`${l.traco}: régua invertida CONFIRMADA (ρ ${l.rho}) −20`); }
    else vigiar.push(`${l.traco}: sinal fraco de régua invertida (ρ ${l.rho}, evidência fraca) — reavaliar com mais dados, não agir.`);
  }
  nota = Math.max(0, Math.min(100, nota));
  const confianca: 'alta' | 'baixa' = n >= 20 ? 'alta' : 'baixa';
  if (confianca === 'baixa') motivos.push(`Confiança baixa: poucos avaliados (N=${n}) — classificação frágil, trate a nota como indicativa.`);
  const status: SaudeCalibracao['status'] = nota >= 90 ? 'saudavel' : nota >= 70 ? 'atencao' : 'problema';
  if (status === 'saudavel' && motivos.length === 0) motivos.push(vigiar.length ? 'Nenhum problema de régua CONFIRMADO (há sinais fracos a vigiar).' : 'Régua correta — nenhum traço com problema de calibração.');
  return { nota, status, confianca, motivos, vigiar };
}
