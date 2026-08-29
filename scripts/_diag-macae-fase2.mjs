// Diag 2: colaboradores das respostas órfãs + r1 + quem aparece na tela
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
config({ path: '.env.local' });

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const EMP = '44b632ae-b7b9-440d-bc74-92cead889d52';
const COMP_IDS = ['0ccd841e-9565-4f61-8aa1-5a210a5f7139', '570f782f-2b14-41c2-a6f2-71f9cfa82f31'];

const { data: resp } = await sb.from('respostas')
  .select('id, colaborador_id, competencia_id, r1, created_at')
  .eq('empresa_id', EMP).in('competencia_id', COMP_IDS);

const colabIds = [...new Set(resp.map(r => r.colaborador_id).filter(Boolean))];
console.log('colab ids distintos (non-null):', colabIds.length, '| respostas sem colab:', resp.filter(r => !r.colaborador_id).length);

// existem na tabela colaboradores?
const { data: existem, error: errColab } = await sb.from('colaboradores').select('id, nome_completo, empresa_id').in('id', colabIds);
if (errColab) console.error('ERRO colab:', errColab);
console.log('desses, existem em colaboradores:', existem?.length);
const emap = Object.fromEntries((existem || []).map(c => [c.id, c]));

// agrupa por colaborador
const porColab = {};
for (const r of resp) {
  porColab[r.colaborador_id] = porColab[r.colaborador_id] || { comps: new Set(), n: 0, r1_preview: String(r.r1).slice(0, 120) };
  porColab[r.colaborador_id].comps.add(r.competencia_id === COMP_IDS[0] ? 'C003' : 'C010');
  porColab[r.colaborador_id].n++;
}
for (const [id, info] of Object.entries(porColab)) {
  console.log({
    colab_id: id,
    nome: emap[id]?.nome_completo || '** NÃO EXISTE MAIS **',
    empresa_do_colab: emap[id]?.empresa_id,
    comps: [...info.comps].join(','),
    respostas: info.n,
    r1: info.r1_preview,
  });
}

// nomes da screenshot: existem como colaboradores atuais?
for (const nome of ['Rejane Alves Lima Barros', 'JOANA MUZI', 'Ariany da Silva Borges', 'Aline Cordeiro Campos Neves']) {
  const { data: c } = await sb.from('colaboradores').select('id, nome_completo, empresa_id, created_at').ilike('nome_completo', `%${nome.split(' ')[0]}%${nome.split(' ').slice(-1)[0]}%`);
  console.log('busca', nome, '→', c);
}
