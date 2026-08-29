/* eslint-disable */
// INTERNO/descartável: gera 4 PDIs da MESMA pessoa com o MESMO prompt (blueprint
// fixo — só a redação varia) em 4 modelos, SEM persistir nada. Salva raw + JSON +
// MD legível por modelo em ~/Downloads/pdi-4-modelos-<slug>/ + _resumo.md com
// latência/tokens/custo (lidos do ia_usage_log, que também CONFIRMA qual modelo
// serviu — o callAI tem fallback de provedor e sem essa checagem um resultado
// caído no fallback seria comparado com o rótulo errado).
// uso: npx tsx scripts/_pdi-4-modelos.ts
process.loadEnvFile('.env.local');
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createSupabaseAdmin } from '@/lib/supabase';
import { buildRelatorioIndividualPrompt } from '@/lib/relatorio-individual-prompt';
import { callAI } from '@/actions/ai-client';
import { parseJsonIA } from '@/lib/ai-json';

const EMP = '0d99fed1-1710-40e3-b32e-7a95c7d023fe'; // Ibipeba
const COLAB = 'c514045e-01e0-452f-8ce9-91b27f6d1d22'; // Elda Alves de Souza
const TASK_KEY = 'pdi_compare_4modelos';
// argv[2] = rodar SÓ um modelo (rerun pontual); nesse caso o resumo vai p/
// _resumo-<slug>.md pra não sobrescrever a tabela completa.
// argv[3] = reasoning_effort (low|medium|high|max) p/ modelos reasoning
// OpenAI-compatible — vira sufixo no nome dos arquivos (ex.: kimi-k3-low.*).
const SO = process.argv[2];
const EFF = process.argv[3] as any;
const MODELOS = SO ? [SO] : ['claude-sonnet-4-6', 'kimi-k3', 'gpt-5.6-luna', 'gemini-3.1-pro-preview'];

const OUT = path.join(os.homedir(), 'Downloads', 'pdi-4-modelos-elda');
fs.mkdirSync(OUT, { recursive: true });

function mdDoRelatorio(r: any, modelo: string): string {
  const L: string[] = [`# PDI — ${modelo}`, ''];
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
  console.log(`prompt pronto: system=${built.system.length}ch user=${built.user.length}ch — blueprint ${built.blueprint ? 'FIXO ✓' : 'AUSENTE ⚠️'}`);
  fs.writeFileSync(path.join(OUT, '_prompt-user.txt'), built.user);

  const resumo: string[] = ['# Comparação PDI — 4 modelos (Elda, Ibipeba, blueprint fixo)', '',
    '| Modelo pedido | Serviu (ledger) | Latência | Tokens in/out | Custo (catálogo) | JSON ok |',
    '|---|---|---|---|---|---|'];

  for (const modelo of MODELOS) {
    console.log(`\n→ ${modelo} ...`);
    const t0 = Date.now();
    let texto = '';
    try {
      texto = await callAI(built.system, built.user, { model: modelo }, 64000,
        { taskKey: TASK_KEY, empresaId: EMP, colaboradorId: COLAB, timeoutMs: 600_000, ...(EFF ? { reasoningEffort: EFF } : {}) } as any);
    } catch (e: any) {
      // teto de max_tokens menor em alguns provedores → tenta uma vez com 16k
      if (/max_tokens|length|invalid/i.test(String(e?.message))) {
        console.log(`  retry com maxTokens=16384 (${String(e?.message).slice(0, 120)})`);
        try {
          texto = await callAI(built.system, built.user, { model: modelo }, 16384,
            { taskKey: TASK_KEY, empresaId: EMP, colaboradorId: COLAB, timeoutMs: 600_000, ...(EFF ? { reasoningEffort: EFF } : {}) } as any);
        } catch (e2: any) {
          resumo.push(`| ${modelo} | ERRO | — | — | — | ${String(e2?.message).slice(0, 80)} |`);
          continue;
        }
      } else {
        resumo.push(`| ${modelo} | ERRO | — | — | — | ${String(e?.message).slice(0, 80)} |`);
        continue;
      }
    }
    const secs = ((Date.now() - t0) / 1000).toFixed(0);
    const slug = (modelo + (EFF ? '-' + EFF : '')).replace(/[^a-z0-9]+/gi, '-');
    const rotulo = modelo + (EFF ? ` (effort ${EFF})` : '');
    fs.writeFileSync(path.join(OUT, `${slug}.raw.txt`), texto);

    let jsonOk = '—';
    try {
      const rel = parseJsonIA(texto);
      fs.writeFileSync(path.join(OUT, `${slug}.json`), JSON.stringify(rel, null, 2));
      fs.writeFileSync(path.join(OUT, `${slug}.md`), mdDoRelatorio(rel, modelo));
      jsonOk = `✓ (${(rel as any)?.competencias?.length ?? '?'} comps)`;
    } catch { jsonOk = '✗ parse falhou (ver .raw.txt)'; }

    // Confirma no ledger qual modelo REALMENTE serviu (fallback deixaria rótulo errado)
    const { data: led } = await sb.from('ia_usage_log')
      .select('model, provider, input_tokens, output_tokens, cost_usd')
      .eq('feature', TASK_KEY).order('created_at', { ascending: false }).limit(1).maybeSingle();
    const serviu = led ? `${led.model} (${led.provider})` : 'sem linha no ledger';
    const alerta = led && led.model !== modelo ? ' ⚠️ FALLBACK' : '';
    resumo.push(`| ${rotulo ?? modelo} | ${serviu}${alerta} | ${secs}s | ${led?.input_tokens ?? '?'}/${led?.output_tokens ?? '?'} | ${led?.cost_usd != null ? `$${Number(led.cost_usd).toFixed(3)}` : 'fora do catálogo'} | ${jsonOk} |`);
    console.log(`  ${secs}s · serviu ${serviu}${alerta} · ${jsonOk}`);
  }

  fs.writeFileSync(path.join(OUT, SO ? `_resumo-${(SO + (EFF ? '-' + EFF : '')).replace(/[^a-z0-9]+/gi, '-')}.md` : '_resumo.md'), resumo.join('\n'));
  console.log(`\nFeito → ${OUT}`);
}
main().catch((e) => { console.error('FALHOU:', e?.message || e); process.exit(1); });
