/* eslint-disable */
// Re-audita uma AMOSTRA de avaliações com OUTRO modelo de check e compara o
// veredito com o atual — para responder "o auditor está severo ou a avaliação
// está ruim?" sem rechecar o lote inteiro.
//
// O veredito novo FICA gravado (é o modelo pinned que manda); o antigo é
// preservado no JSON de saída, fora do repo.
//
// Uso: npx tsx scripts/_comparar-check-modelo.ts <slug> <modelo> <n> <saida.json>
process.loadEnvFile('.env.local');
import { writeFileSync } from 'node:fs';
import { createSupabaseAdmin } from '@/lib/supabase';
import { checarUmaRespostaCore } from '@/lib/check-ia4-core';

const SLUG = process.argv[2] || 'macae';
const MODELO = process.argv[3] || 'gpt-5.6-terra';
const N = Number(process.argv[4] || 10);
const SAIDA = process.argv[5] || 'comparacao-check.json';

// Estratos: casos que o auditor tratou de formas diferentes. A amostra tem que
// conter os DOIS extremos, senão ela só confirma o que já se acredita.
function estrato(r: any): string {
  const p = r.payload_ia4 || {};
  if (p.tipo_de_erro_predominante === 'matematica') return 'matematica';
  if (r.status_ia4 === 'aprovado_com_ajustes') return 'aprovado_com_ajustes';
  if (p.erro_grave) return 'erro_grave';
  return 'revisar_sem_erro_grave';
}

async function main() {
  const sb = createSupabaseAdmin();
  const { data: emp } = await sb.from('empresas').select('id,slug').eq('slug', SLUG).single();
  if (!emp) throw new Error('empresa não encontrada: ' + SLUG);

  const { data: todas, error } = await sb.from('respostas')
    .select('id, colaborador_id, competencia_nome, status_ia4, payload_ia4, nivel_ia4, nota_ia4')
    .eq('empresa_id', (emp as any).id)
    .not('payload_ia4', 'is', null);
  if (error) throw new Error(error.message);

  // Round-robin entre os estratos: N/4 de cada, sem depender da ordem do banco.
  const porEstrato: Record<string, any[]> = {};
  for (const r of todas || []) (porEstrato[estrato(r)] ||= []).push(r);
  const chaves = Object.keys(porEstrato).sort();
  const amostra: any[] = [];
  for (let i = 0; amostra.length < N; i++) {
    const antes = amostra.length;
    for (const k of chaves) if (porEstrato[k][i] && amostra.length < N) amostra.push(porEstrato[k][i]);
    if (amostra.length === antes) break; // esgotou todos os estratos
  }

  console.log(`amostra: ${amostra.length} de ${todas?.length} · modelo novo: ${MODELO}`);
  console.log(chaves.map(k => `${k}=${porEstrato[k].length}`).join(' · '));

  const linhas: any[] = [];
  for (const r of amostra) {
    const antes = { status: r.status_ia4, nota: r.payload_ia4?.nota, tipo: r.payload_ia4?.tipo_de_erro_predominante, erro_grave: r.payload_ia4?.erro_grave, payload: r.payload_ia4 };
    const res: any = await checarUmaRespostaCore(sb, r.id, { model: MODELO });
    const { data: novo } = await sb.from('respostas').select('status_ia4, payload_ia4')
      .eq('empresa_id', (emp as any).id).eq('id', r.id).maybeSingle();
    const depois = { status: novo?.status_ia4, nota: (novo?.payload_ia4 as any)?.nota, tipo: (novo?.payload_ia4 as any)?.tipo_de_erro_predominante, erro_grave: (novo?.payload_ia4 as any)?.erro_grave, payload: novo?.payload_ia4 };
    linhas.push({ id: r.id, competencia: r.competencia_nome, estrato: estrato(r), antes, depois, ok: res?.success !== false, erro: res?.error });
    const delta = (depois.nota ?? 0) - (antes.nota ?? 0);
    console.log(`  ${String(r.id).slice(0, 8)} [${estrato(r)}] ${antes.nota}→${depois.nota} (${delta >= 0 ? '+' : ''}${delta}) · ${antes.status} → ${depois.status}${res?.error ? ` · ERRO ${res.error}` : ''}`);
  }

  writeFileSync(SAIDA, JSON.stringify({ slug: SLUG, modelo_novo: MODELO, linhas }, null, 2), 'utf8');
  const validas = linhas.filter(l => typeof l.antes.nota === 'number' && typeof l.depois.nota === 'number');
  const media = (xs: number[]) => xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : 0;
  console.log(`\nmédia antes ${media(validas.map(l => l.antes.nota))} → depois ${media(validas.map(l => l.depois.nota))}`);
  console.log(`erro_grave: ${validas.filter(l => l.antes.erro_grave).length} → ${validas.filter(l => l.depois.erro_grave).length}`);
  console.log(`mudou de veredito: ${validas.filter(l => l.antes.status !== l.depois.status).length} de ${validas.length} · JSON: ${SAIDA}`);
}

main().catch((e) => { console.error('ERRO FATAL:', e?.message || e); process.exit(1); });
