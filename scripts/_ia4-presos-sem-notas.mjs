// Achado 1.4 (FMEA-PIPELINE §6) — medição READ-ONLY de respostas PRESAS na IA4:
// avaliacao_ia preenchido mas ZERO linhas em descriptor_assessments para o mesmo
// (colaborador, competencia). Era o estado sem retry self-service antes da
// correção em actions/fase3.ts (ordem de gravação + fila incluindo presas).
//
// NÃO repara nada — o reparo é o reprocesso self-service pela fila da IA4
// (listarPendentesIA4/rodarIA4 já incluem as presas).
//
// Uso:
//   node scripts/_ia4-presos-sem-notas.mjs
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
config({ path: '.env.local' });

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const PAGE = 1000;

async function* paginate(query) {
  let from = 0;
  for (;;) {
    const { data, error } = await query.range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    if (!data?.length) return;
    yield* data;
    if (data.length < PAGE) return;
    from += PAGE;
  }
}

// Respostas avaliadas (candidatas a presas)
const avaliadas = [];
for await (const r of paginate(
  sb.from('respostas')
    .select('id, empresa_id, colaborador_id, competencia_nome')
    .not('avaliacao_ia', 'is', null)
    .not('r1', 'is', null)
    .order('id')
)) avaliadas.push(r);

// Pares (colaborador, competencia) COM notas — só dos colaboradores envolvidos
const colabIds = [...new Set(avaliadas.map((r) => r.colaborador_id).filter(Boolean))];
const comNotas = new Set();
for (let i = 0; i < colabIds.length; i += 200) {
  const lote = colabIds.slice(i, i + 200);
  for await (const a of paginate(
    sb.from('descriptor_assessments')
      .select('colaborador_id, competencia')
      .in('colaborador_id', lote)
      .order('colaborador_id')
  )) comNotas.add(`${a.colaborador_id}|${a.competencia}`);
}

const presas = avaliadas.filter(
  (r) => r.colaborador_id && r.competencia_nome && !comNotas.has(`${r.colaborador_id}|${r.competencia_nome}`)
);
const semChave = avaliadas.filter((r) => !r.colaborador_id || !r.competencia_nome).length;

const porEmpresa = {};
for (const p of presas) porEmpresa[p.empresa_id] = (porEmpresa[p.empresa_id] || 0) + 1;

console.log(`Respostas avaliadas (avaliacao_ia preenchido): ${avaliadas.length}`);
console.log(`PRESAS (avaliadas, ZERO notas de descritor): ${presas.length}`);
if (semChave) console.log(`(fora da checagem por falta de colaborador_id/competencia_nome: ${semChave})`);
for (const [emp, n] of Object.entries(porEmpresa).sort((a, b) => b[1] - a[1])) {
  console.log(`  empresa ${emp}: ${n}`);
}
if (presas.length) {
  console.log('\nAmostra (até 10):');
  for (const p of presas.slice(0, 10)) {
    console.log(`  resposta ${p.id} · colab ${p.colaborador_id} · "${p.competencia_nome}"`);
  }
  console.log('\nReparo: rodar a IA4 pela tela admin da empresa — as presas já entram na fila (presa_sem_notas).');
}
