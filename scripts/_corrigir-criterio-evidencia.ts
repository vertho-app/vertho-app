/**
 * Reescreve o `criterio_de_execucao` das tarefas cujo critério pede INSPEÇÃO de
 * um artefato — verificação que não existe neste produto.
 *
 * POR QUE (27/08/2026)
 * ────────────────────
 * A evidência é sempre o RELATO da pessoa, falado ou digitado: a tela da semana
 * não tem input de arquivo. Mas os prompts de geração não sabiam disso, e
 * escreviam critérios como *"o documento existe fisicamente (papel ou arquivo)"*.
 * Medido: **14 de 308** tarefas (2 em `kit_desafios_semana`, 12 em `kits`).
 *
 * ⚠️ REESCREVE SÓ O CRITÉRIO — nunca `desafio_texto` nem `acao_observavel`.
 * Duas razões, e as duas doeriam:
 *   · a tarefa pode já ter sido lida por alguém nesta semana, e trocar o texto
 *     no meio da semana é mudar o combinado com a pessoa;
 *   · em `kits`, o `desafio` SEMEIA os 4 formatos de conteúdo e o roteiro do
 *     vídeo (`actions/kits.ts:108,127`). Regerar o texto sem regerar o conteúdo
 *     faria os dois divergirem em silêncio — e regerar o conteúdo é ordens de
 *     grandeza mais caro.
 *
 * USO
 *   npx tsx scripts/_corrigir-criterio-evidencia.ts [--executar]
 *
 * Sem `--executar`, lista o que mudaria e não grava nada.
 */
process.loadEnvFile('.env.local');

import { createClient } from '@supabase/supabase-js';
import { callAI } from '../actions/ai-client';
import { BLOCO_EVIDENCIA_E_RELATO } from '../lib/season-engine/kit/regra-evidencia';

const executar = process.argv.includes('--executar');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

/**
 * O que caracteriza um critério inverificável: ele manda CONFERIR o artefato.
 * "Compartilhe com a equipe" NÃO entra — é ação no trabalho real, e é legítima.
 */
const PEDE_INSPECAO = /(existe fisicamente|em papel|arquivo salvo|anexad|print|captura de tela|documento existe|planilha preenchida est)/i;

const SYSTEM = `Você é designer instrucional da Vertho.

Reescreva APENAS o critério de execução de uma tarefa que já existe. NÃO reescreva a tarefa: ela continua exatamente como está.

${BLOCO_EVIDENCIA_E_RELATO}

O critério novo deve:
- caber em 1 a 3 frases;
- descrever o que a pessoa vai conseguir CONTAR, e que quem não fez não conseguiria;
- manter a mesma exigência de rigor da tarefa (não afrouxe: se a tarefa pedia duas coisas, o critério continua cobrando as duas);
- NÃO mencionar arquivo, documento como prova, anexo, print ou envio.

RETORNE APENAS JSON VÁLIDO: {"criterio_de_execucao":"..."}`;

async function reescrever(tarefa: string, criterioAtual: string): Promise<string | null> {
  const user = `TAREFA (não mude):
${tarefa}

CRITÉRIO ATUAL (a corrigir — ele depende de inspecionar um artefato):
${criterioAtual}`;
  for (let i = 0; i < 3; i++) {
    const raw = (await callAI(SYSTEM, user, {}, 500, { taskKey: 'kit_desafio_semana' })).trim();
    const a = raw.indexOf('{'); const b = raw.lastIndexOf('}');
    if (a < 0 || b <= a) continue;
    try {
      const p = JSON.parse(raw.slice(a, b + 1));
      const c = typeof p?.criterio_de_execucao === 'string' ? p.criterio_de_execucao.trim() : '';
      if (c.length >= 20 && !PEDE_INSPECAO.test(c)) return c;
      console.warn(`  (tentativa ${i + 1}: critério ainda pede inspeção ou veio curto)`);
    } catch { /* tenta de novo */ }
  }
  return null;
}

async function main() {
  const alvos: { tabela: 'kit_desafios_semana' | 'kits'; id: string; desafio: any }[] = [];

  for (const tabela of ['kit_desafios_semana', 'kits'] as const) {
    const { data, error } = await sb.from(tabela).select('id, desafio');
    if (error) throw new Error(`${tabela}: ${error.message}`);
    for (const r of data || []) {
      const crit = r.desafio?.criterio_de_execucao;
      if (typeof crit === 'string' && PEDE_INSPECAO.test(crit)) alvos.push({ tabela, id: r.id, desafio: r.desafio });
    }
  }

  console.log(`critérios que pedem inspeção: ${alvos.length}`);
  for (const a of alvos) {
    console.log(`\n· ${a.tabela} ${a.id}`);
    console.log(`  ATUAL: ${String(a.desafio.criterio_de_execucao).slice(0, 160)}`);
  }
  if (!executar) { console.log('\nSem --executar, nada foi gravado.'); return; }

  let ok = 0, falhou = 0;
  for (const [i, a] of alvos.entries()) {
    const novo = await reescrever(a.desafio.desafio_texto || '', a.desafio.criterio_de_execucao);
    if (!novo) { falhou++; console.error(`  ${i + 1}/${alvos.length} FALHOU ${a.tabela} ${a.id}`); continue; }
    // Só o critério muda — `desafio_texto` e `acao_observavel` ficam intactos.
    const { error } = await sb.from(a.tabela)
      .update({ desafio: { ...a.desafio, criterio_de_execucao: novo } })
      .eq('id', a.id);
    if (error) { falhou++; console.error(`  ${i + 1}/${alvos.length} ERRO gravando ${a.tabela} ${a.id}: ${error.message}`); continue; }
    ok++;
    console.log(`  ${i + 1}/${alvos.length} ok ${a.tabela} ${a.id}\n     NOVO: ${novo.slice(0, 160)}`);
  }
  console.log(`\ncorrigidos: ${ok} · falhas: ${falhou}`);
  if (falhou) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exit(1); });
