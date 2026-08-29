/* eslint-disable */
/**
 * Regera os 18 micro_conteudos CORE de Autocuidado × Gestão Escolar (Ibipeba) que
 * ancoraram no módulo-base ERRADO, e reaponta as referências nos planos.
 *
 * Contexto: os MBs desse par gravavam o título editorial no campo `descritor`, o match
 * caía no embedding do título e embaralhava — 14 dos 18 conteúdos falam do assunto
 * vizinho. Os MBs foram corrigidos em `_corrigir-mb-gestao-escolar.ts`; aqui o conteúdo
 * é refeito com a âncora certa.
 *
 * ⚠️ Por que deletar ANTES de gerar: a UNIQUE parcial `uq_micro_conteudos_core` (mig 190)
 * proíbe (empresa, competência, descritor, formato, cargo) duplicado com `kit_id IS NULL`
 * — antigo e novo não podem coexistir. A janela de órfão é aceitável AQUI e só aqui: os
 * slots afetados são das semanas 5-11, que ainda não abriram (piloto na semana 3).
 *
 * ⚠️ Não há FK apontando para `micro_conteudos` (verificado) — deletar não cascateia
 * telemetria. Mas `temporada_plano` referencia por JSONB (`core_id` e
 * `formatos_disponiveis[].id`), sem FK que avise: por isso o reaponte é obrigatório e
 * acontece no MESMO run (117 slots + 119 formatos em 15 trilhas, medido 28/07).
 *
 * Uso: npx tsx --env-file=.env.local scripts/_regerar-core-gestao-escolar.ts [--apply]
 */
import { createSupabaseAdmin } from '@/lib/supabase';
import { gerarConteudoIA } from '@/actions/conteudos';
import { resolverModuloBaseParaConteudo } from '@/lib/season-engine/modulo-base-integration';
import { writeFileSync } from 'fs';

const EMP = '0d99fed1-1710-40e3-b32e-7a95c7d023fe';
const COMP = 'Autocuidado e resiliência emocional';
const CARGO = 'Gestão Escolar';
const APPLY = process.argv.includes('--apply');

async function main() {
  const sb = createSupabaseAdmin();

  const { data: antigos } = await sb.from('micro_conteudos')
    .select('id, formato, descritor, nivel_min, nivel_max, contexto, ativo, modulo_base_id, titulo')
    .eq('empresa_id', EMP).eq('cargo', CARGO).is('kit_id', null)
    .ilike('competencia', `%${COMP}%`);
  if (!antigos?.length) { console.log('nada a fazer'); return; }

  // O JUIZ é o próprio resolver: com os MBs já corrigidos, pergunta qual módulo ele
  // escolheria agora e compara com o que o conteúdo tem gravado. Igual = o conteúdo já
  // está ancorado certo e NÃO se mexe nele (regerar o que está bom é gastar e trocar
  // texto revisado por outro equivalente). Medido 28/07: 4 dos 18 já estavam corretos.
  const alvo: any[] = [];
  const preservados: any[] = [];
  for (const a of antigos) {
    const esperado: any = await resolverModuloBaseParaConteudo(sb, {
      competenciaNome: COMP, descritor: a.descritor, cargo: CARGO, empresaId: EMP,
      nivelMin: Number(a.nivel_min ?? 1),
    });
    const mbEsperado = esperado?.modulo?.id || esperado?.id || null;
    (mbEsperado && a.modulo_base_id === mbEsperado ? preservados : alvo).push({ ...a, mbEsperado });
  }

  console.log(`${APPLY ? '🔥 APPLY' : '🔍 DRY RUN'} · ${antigos.length} core no par · ${alvo.length} mal ancorado(s) · ${preservados.length} já corretos (intactos)\n`);
  for (const a of preservados) console.log(`  (mantém) ${a.formato.padEnd(6)} ${String(a.descritor).padEnd(26)} [${String(a.id).slice(0, 8)}]`);
  for (const a of alvo) console.log(`  REGERAR  ${a.formato.padEnd(6)} ${String(a.descritor).padEnd(26)} [${String(a.id).slice(0, 8)}] ativo=${a.ativo}`);
  if (!alvo.length) { console.log('\nnada mal ancorado — nada a fazer'); return; }
  if (!APPLY) { console.log(`\n≈ $${(alvo.length * 0.11).toFixed(2)} · → rode com --apply`); return; }
  // Daqui pra baixo, `antigos` = só os que serão refeitos.
  antigos.length = 0; antigos.push(...alvo);

  const backupPath = `${process.env.TEMP || '.'}/core-gestao-escolar-backup-${Date.now()}.json`;
  writeFileSync(backupPath, JSON.stringify(antigos, null, 2));
  console.log(`\nbackup: ${backupPath}`);

  // ── 1) Deletar os antigos (a UNIQUE não deixa coexistir) ────────────────────
  const idsAntigos = antigos.map((a: any) => a.id);
  const { error: errDel } = await sb.from('micro_conteudos').delete().in('id', idsAntigos).eq('empresa_id', EMP);
  if (errDel) throw new Error(`delete: ${errDel.message}`);
  console.log(`✓ ${idsAntigos.length} antigos removidos\n`);

  // ── 2) Regerar com a âncora certa ───────────────────────────────────────────
  const mapa = new Map<string, string>();   // id antigo → id novo
  let ok = 0, erros = 0;
  for (const a of antigos) {
    process.stdout.write(`  ${a.formato.padEnd(6)} ${String(a.descritor).padEnd(26)} ... `);
    try {
      const r: any = await gerarConteudoIA({
        formato: a.formato as any, competencia: COMP, descritor: a.descritor,
        cargo: CARGO, empresaId: EMP,
        nivelMin: Number(a.nivel_min ?? 1), nivelMax: Number(a.nivel_max ?? 2),
        contexto: a.contexto || 'generico',
        podcastFormato: 'solo', sb, forcar: false,
      });
      const novoId = r?.id || r?.conteudoId || r?.conteudo?.id;
      if (r?.error || !novoId) { erros++; console.log(`ERRO: ${r?.error || 'sem id'}`); continue; }
      mapa.set(a.id, String(novoId));
      // Preserva o estado de ativação do que existia (nasce inativo).
      if (a.ativo) await sb.from('micro_conteudos').update({ ativo: true }).eq('id', novoId).eq('empresa_id', EMP);
      ok++;
      console.log(`OK ${String(novoId).slice(0, 8)}${a.ativo ? ' +ativo' : ''}`);
    } catch (e: any) { erros++; console.log(`EXCEÇÃO: ${e?.message}`); }
  }
  console.log(`\ngerados: ${ok} · erros: ${erros}`);
  if (erros) console.log('⚠️ com erro no meio: os slots dos que falharam ficam órfãos — rode de novo antes de a semana abrir.');

  // ── 3) Reapontar `temporada_plano` (core_id + formatos_disponiveis[].id) ────
  const { data: trilhas } = await sb.from('trilhas')
    .select('id, temporada_plano').eq('empresa_id', EMP).eq('status', 'ativa');
  let slots = 0, fmts = 0, tocadas = 0;
  for (const t of (trilhas || [])) {
    const plano = JSON.parse(JSON.stringify((t as any).temporada_plano || []));
    let mudou = false;
    for (const s of plano) {
      if (s?.tipo !== 'conteudo') continue;
      for (const e of (s.conteudos_dia || [])) {
        const c = e?.conteudo; if (!c) continue;
        const novoCore = c.core_id && mapa.get(c.core_id);
        if (novoCore) { c.core_id = novoCore; slots++; mudou = true; }
        for (const [f, v] of Object.entries<any>(c.formatos_disponiveis || {})) {
          const novo = v?.id && mapa.get(v.id);
          if (novo) { v.id = novo; fmts++; mudou = true; }
        }
      }
    }
    if (mudou) {
      tocadas++;
      const { error } = await sb.from('trilhas').update({ temporada_plano: plano }).eq('id', (t as any).id).eq('empresa_id', EMP);
      if (error) throw new Error(`trilha ${(t as any).id}: ${error.message}`);
    }
  }
  console.log(`✓ reapontados: ${slots} core_id + ${fmts} formato(s) em ${tocadas} trilha(s)`);
  console.log('\n→ conferir âncora: _diag-ancora-autocuidado.ts · MP3: _pregerar-audio-base-autocuidado.ts');
}
main().then(() => process.exit(0)).catch((e) => { console.error('FALHOU:', e?.message || e); process.exit(1); });
