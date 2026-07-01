/**
 * CLI da Fase 0 — extrai a descrição de um cargo de um documento e (opcional) grava o
 * PATCH nas colunas de cargos_empresa. Executa a fase ponta a ponta sem a UI.
 *
 *   npx tsx scripts/cargo-extrair.ts <arquivo.pdf|.txt>
 *   npx tsx scripts/cargo-extrair.ts <arquivo> --auto media          # afrouxa auto-aceite
 *   npx tsx scripts/cargo-extrair.ts <arquivo> --gravar <empresaId> "<Nome do Cargo>"
 *
 * Sem --gravar: só mostra a extração + o patch que SERIA gravado (dry-run).
 */
import { readFileSync } from 'node:fs';
import { extname } from 'node:path';

const env: Record<string, string> = {};
for (const l of readFileSync('.env.local', 'utf8').split('\n')) { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m) { env[m[1]] = m[2].trim(); process.env[m[1]] = m[2].trim(); } }

const C = { dim: (s: string) => `\x1b[2m${s}\x1b[0m`, b: (s: string) => `\x1b[1m${s}\x1b[0m`, g: (s: string) => `\x1b[32m${s}\x1b[0m`, y: (s: string) => `\x1b[33m${s}\x1b[0m`, r: (s: string) => `\x1b[31m${s}\x1b[0m` };
const corConf = (c: string) => c === 'alta' ? C.g(c) : c === 'media' ? C.y(c) : C.r(c);

async function main() {
  const argv = process.argv.slice(2);
  const arquivo = argv[0];
  if (!arquivo) { console.error('uso: npx tsx scripts/cargo-extrair.ts <arquivo.pdf|.txt> [--auto alta|media|nunca] [--gravar <empresaId> "<cargo>"]'); process.exit(1); }
  const ai = argv.indexOf('--auto');
  const auto = (ai >= 0 ? argv[ai + 1] : 'alta') as 'alta' | 'media' | 'nunca';
  const gi = argv.indexOf('--gravar');
  const gravar = gi >= 0 ? { empresaId: argv[gi + 1], cargo: argv[gi + 2] } : null;

  const { extrairCargo } = await import('../lib/cargo-extracao/extrator');
  const { achatarExtracao, prepararRevisao } = await import('../lib/cargo-extracao/adapter');

  const ehPdf = extname(arquivo).toLowerCase() === '.pdf';
  const input = ehPdf ? { pdfBase64: readFileSync(arquivo).toString('base64'), nomeArquivo: arquivo } : { texto: readFileSync(arquivo, 'utf8'), nomeArquivo: arquivo };
  console.log(C.dim(`documento: ${arquivo} (${ehPdf ? 'PDF nativo' : 'texto'}) · modelo ${process.env.GEMINI_CARGO_MODEL || 'gemini-3.5-flash'}\n`));

  const ext = prepararRevisao(await extrairCargo(input));
  if (!ext.documento_valido) { console.log(C.r('documento_valido=false — não é uma descrição de cargo.')); console.log('trechos:', ext.trechos_ambiguos); process.exit(0); }

  const linhaItem = (i: any) => `    ${i.aprovado === true ? C.g('✓') : i.aprovado === false ? C.r('✗') : C.y('?')} [${corConf(i.confianca)}] ${i.texto}\n      ${C.dim('fonte: ' + (i.fonte || '—'))}`;
  const escalar = (k: string, i: any) => { if (i?.texto) { console.log(`  ${C.b(k)}: ${i.aprovado === true ? C.g('✓') : C.y('?')} [${corConf(i.confianca)}] ${i.texto}`); console.log(`      ${C.dim('fonte: ' + (i.fonte || '—'))}`); } };
  const bloco = (k: string, a: any[]) => { console.log(`  ${C.b(k)} (${a?.length || 0}):`); (a || []).forEach((i) => console.log(linhaItem(i))); };

  console.log(C.b('── EXTRAÇÃO (✓ auto-aceito · ? pendente · ✗ rejeitado) ──'));
  escalar('cargo_titulo', ext.cargo_titulo); escalar('area_depto', ext.area_depto);
  escalar('descricao', ext.descricao); escalar('contexto_cultural', ext.contexto_cultural);
  bloco('principais_entregas', ext.principais_entregas!); bloco('stakeholders', ext.stakeholders!);
  bloco('decisoes_recorrentes', ext.decisoes_recorrentes!); bloco('tensoes_comuns', ext.tensoes_comuns!);

  if (ext.elicitar_na_revisao?.length) { console.log(`\n  ${C.y('ELICITAR na revisão:')}`); ext.elicitar_na_revisao.forEach((q) => console.log(`    • ${q}`)); }
  if (ext.campos_faltantes?.length) console.log(`  ${C.dim('faltantes: ' + ext.campos_faltantes.join(', '))}`);

  const { patch, diagnostico } = achatarExtracao(ext, { autoAceitaAte: auto });
  console.log(`\n${C.b(`── PATCH (auto-aceite até ${auto}) ──`)}`);
  console.log(JSON.stringify(patch, null, 2));
  console.log(C.dim(`vazios: ${diagnostico.vazios.join(', ') || '—'} · rejeitados/pendentes: ${diagnostico.rejeitados.length}`));

  if (!gravar) { console.log(C.dim('\n(dry-run — use --gravar <empresaId> "<cargo>" para persistir)')); return; }
  if (!Object.keys(patch).length) { console.log(C.y('\nnada a gravar (nenhum campo auto-aceito).')); return; }
  const { createClient } = await import('@supabase/supabase-js');
  const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  const { error } = await sb.from('cargos_empresa').update(patch).eq('empresa_id', gravar.empresaId).eq('nome', gravar.cargo);
  console.log(error ? C.r(`\nERRO ao gravar: ${error.message}`) : C.g(`\n✓ gravado em ${gravar.cargo}: ${Object.keys(patch).join(', ')}`));
}
main().catch((e) => { console.error(C.r('ERRO'), e?.stack || e); process.exit(1); });
