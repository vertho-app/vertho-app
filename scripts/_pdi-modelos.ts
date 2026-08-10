/* eslint-disable */
// INTERNO/descartável: gera N PDIs da MESMA pessoa com o MESMO prompt (blueprint
// fixo — só a REDAÇÃO varia) em vários modelos/esforços, SEM persistir nada.
//
// Sucessor de `_pdi-4-modelos.ts`, com três diferenças que importam:
//  1. RUNS é uma lista de {model, effort?, thinking?} — modelo e knob de esforço
//     são coisas SEPARADAS no callAI. `gpt-5.6-luna-high` não é um id de modelo;
//     é `gpt-5.6-luna` + reasoning_effort. E `reasoningEffort` é IGNORADO no ramo
//     Claude (lá o knob é `thinking`/`thinkingBudget`) — rodar "opus-5-high"
//     esperando esforço alto daria o modelo em esforço PADRÃO, com rótulo errado.
//  2. Alvo parametrizável por argv/env (antes era Elda/Ibipeba hardcoded).
//  3. A tabela mede TOKENS DE SAÍDA por run. É o que pega inflação de output
//     (o piloto de Módulo-Base viu Sonnet 5 crescer 40-68% e truncar JSON):
//     preço por token não é preço por PDI.
//
// O ledger CONFIRMA qual modelo realmente serviu — o callAI tem fallback de
// provedor (AI_FALLBACK_MODEL) e, sem essa checagem, um resultado caído no
// fallback seria comparado com o rótulo errado.
//
// uso: npx tsx scripts/_pdi-modelos.ts [empresaId] [colaboradorId]
process.loadEnvFile('.env.local');
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createSupabaseAdmin } from '@/lib/supabase';
import { buildRelatorioIndividualPrompt } from '@/lib/relatorio-individual-prompt';
import { callAI } from '@/actions/ai-client';
import { parseJsonIA } from '@/lib/ai-json';

const EMP = process.argv[2] || process.env.PDI_EMP || '0d99fed1-1710-40e3-b32e-7a95c7d023fe';   // Ibipeba
const COLAB = process.argv[3] || process.env.PDI_COLAB || 'c514045e-01e0-452f-8ce9-91b27f6d1d22'; // Elda
const TASK_KEY = 'pdi_compare_0708';

interface Run { model: string; effort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max'; thinking?: boolean; nota?: string }

const RUNS: Run[] = [
  { model: 'claude-sonnet-4-6', nota: 'BASELINE (default de produção)' },
  { model: 'claude-sonnet-5', nota: 'candidato — vigiar inflação de output' },
  { model: 'claude-sonnet-5', effort: 'high', nota: 'par do anterior: effort compensa?' },
  { model: 'gpt-5.6-luna', effort: 'low' },
  { model: 'gpt-5.6-luna', effort: 'high', nota: 'par: esforço vale a pena?' },
  { model: 'gpt-5.6-terra', effort: 'high' },
  { model: 'gemini-3.6-flash' },
  { model: 'kimi-k3', effort: 'low' },
  { model: 'claude-opus-5', thinking: true, effort: 'high', nota: 'TETO de referência, não candidato' },
];

const OUT = path.join(os.homedir(), 'Downloads', `pdi-modelos-${new Date().toISOString().slice(0, 10)}`);
fs.mkdirSync(OUT, { recursive: true });

const rotulo = (r: Run) => r.model + (r.effort ? ` (${r.effort})` : '') + (r.thinking ? ' (thinking)' : '');
const slugDe = (r: Run) => (r.model + (r.effort ? '-' + r.effort : '') + (r.thinking ? '-thinking' : ''))
  .replace(/[^a-z0-9]+/gi, '-');

function mdDoRelatorio(r: any, label: string): string {
  const L: string[] = [`# PDI — ${label}`, ''];
  const txt = (v: any) => (typeof v === 'string' ? v : v == null ? '' : JSON.stringify(v));
  if (r.acolhimento) L.push('## Acolhimento', txt(r.acolhimento), '');
  if (r.resumo_geral) L.push('## Resumo geral', txt(r.resumo_geral), '');
  if (r.perfil_comportamental) L.push('## Perfil comportamental', txt(r.perfil_comportamental), '');
  for (const c of (r.competencias || [])) {
    L.push(`## ${c.nome || c.competencia} ${c.nivel ? `(N${c.nivel})` : ''}`);
    if (c.feedback) L.push(txt(c.feedback));
    if (c.fez_bem?.length) L.push('', '**Fez bem:**', ...c.fez_bem.map((x: any) => `- ${txt(x)}`));
    if (c.melhorar?.length) L.push('', '**Melhorar:**', ...c.melhorar.map((x: any) => `- ${txt(x)}`));
    const s = c.sprint;
    if (s) {
      L.push('', '**Sprint 30 dias:**');
      for (const k of ['foco_30_dias', 'acao_principal', 'acao_apoio', 'ritual', 'evidencia_esperada']) {
        if (s[k]) L.push(`- ${k}: ${txt(s[k])}`);
      }
      if (s.checklist?.length) L.push(`- checklist: ${s.checklist.map(txt).join(' · ')}`);
    }
    if (c.dicas_desenvolvimento?.length) L.push('', '**Dicas:**', ...c.dicas_desenvolvimento.map((x: any) => `- ${txt(x)}`));
    if (c.estudo_recomendado?.length) L.push('', '**Estudo:**', ...c.estudo_recomendado.map((e: any) => `- ${txt(e.titulo)} (${txt(e.formato)}) — ${txt(e.por_que_ajuda)}`));
    L.push('');
  }
  if (r.mensagem_final) L.push('## Mensagem final', txt(r.mensagem_final));
  return L.join('\n');
}

async function main() {
  const sb = createSupabaseAdmin();
  const built = await buildRelatorioIndividualPrompt(sb, { empresaId: EMP, colaboradorId: COLAB });
  if ('error' in built) throw new Error(built.error);
  console.log(`alvo: ${built.colab?.nome_completo} @ ${built.empresa?.nome}`);
  console.log(`prompt: system=${built.system.length}ch user=${built.user.length}ch — blueprint ${built.blueprint ? 'FIXO ✓' : 'AUSENTE ⚠️'}`);
  console.log(`competências: ${built.dadosComps.length}\n`);
  fs.writeFileSync(path.join(OUT, '_prompt-user.txt'), built.user);
  fs.writeFileSync(path.join(OUT, '_prompt-system.txt'), built.system);

  const resumo: string[] = [
    `# Comparação PDI — ${built.colab?.nome_completo} (${built.empresa?.nome}), blueprint fixo`,
    '',
    `Prompt idêntico em todos: system ${built.system.length}ch · user ${built.user.length}ch · ${built.dadosComps.length} competências.`,
    'O blueprint fixa as AÇÕES e o overlay() sobrescreve nível/nota — o que varia entre modelos é a REDAÇÃO.',
    '',
    '| Run | Serviu (ledger) | Latência | in | **out** | Custo | JSON | Comps | Notas |',
    '|---|---|---|---|---|---|---|---|---|',
  ];

  for (const run of RUNS) {
    const label = rotulo(run);
    console.log(`→ ${label} ...`);
    const t0 = Date.now();
    const opts: any = {
      taskKey: TASK_KEY, empresaId: EMP, colaboradorId: COLAB, timeoutMs: 900_000,
      ...(run.effort ? { reasoningEffort: run.effort } : {}),
      ...(run.thinking ? { thinking: true } : {}),
    };
    let texto = '';
    try {
      texto = await callAI(built.system, built.user, { model: run.model }, 64000, opts);
    } catch (e: any) {
      const msg = String(e?.message || e);
      if (/max_tokens|length|invalid/i.test(msg)) {
        console.log(`  retry com maxTokens=16384 (${msg.slice(0, 100)})`);
        try { texto = await callAI(built.system, built.user, { model: run.model }, 16384, opts); }
        catch (e2: any) { resumo.push(`| ${label} | ERRO | — | — | — | — | — | — | ${String(e2?.message).slice(0, 70)} |`); continue; }
      } else {
        resumo.push(`| ${label} | ERRO | — | — | — | — | — | — | ${msg.slice(0, 70)} |`);
        console.log(`  ERRO: ${msg.slice(0, 120)}`);
        continue;
      }
    }

    const secs = ((Date.now() - t0) / 1000).toFixed(0);
    const slug = slugDe(run);
    fs.writeFileSync(path.join(OUT, `${slug}.raw.txt`), texto);

    let jsonOk = '✗', comps = '—';
    try {
      const rel = parseJsonIA(texto) as any;
      fs.writeFileSync(path.join(OUT, `${slug}.json`), JSON.stringify(rel, null, 2));
      fs.writeFileSync(path.join(OUT, `${slug}.md`), mdDoRelatorio(rel, label));
      jsonOk = '✓';
      comps = String(rel?.competencias?.length ?? '?');
    } catch { jsonOk = '✗ parse'; }

    // Confirma no ledger QUEM serviu (fallback de provedor deixaria rótulo errado)
    const { data: led } = await sb.from('ia_usage_log')
      .select('model, provider, input_tokens, output_tokens, cost_usd')
      .eq('feature', TASK_KEY).order('created_at', { ascending: false }).limit(1).maybeSingle();
    const serviu = led ? `${led.model}` : 'sem linha';
    const alerta = led && led.model !== run.model ? ' ⚠️FALLBACK' : '';
    const custo = led?.cost_usd != null ? `$${Number(led.cost_usd).toFixed(3)}` : 'fora do catálogo';

    resumo.push(`| ${label} | ${serviu}${alerta} | ${secs}s | ${led?.input_tokens ?? '?'} | **${led?.output_tokens ?? '?'}** | ${custo} | ${jsonOk} | ${comps} | ${run.nota || ''} |`);
    console.log(`  ${secs}s · ${serviu}${alerta} · out=${led?.output_tokens ?? '?'} tok · JSON ${jsonOk} (${comps} comps) · ${custo}`);
  }

  resumo.push('', `Esperado: ${built.dadosComps.length} competências, na MESMA ordem do prompt.`);
  fs.writeFileSync(path.join(OUT, '_resumo.md'), resumo.join('\n'));
  console.log(`\nFeito → ${OUT}`);
}
main().catch((e) => { console.error('FALHOU:', e?.message || e); process.exit(1); });
