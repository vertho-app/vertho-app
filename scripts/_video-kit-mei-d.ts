/* eslint-disable */
// Gera o VÍDEO da célula do kit MEI × D "Gestão Financeira Básica › Formação
// básica de preço" (projetomacae), p/ o painel do Samuel (vídeos instrucionais).
//
// ⚠️ Âncora = módulo do CONTEÚDO do kit (35b27c40, o que resolverVideoDaSemana
// resolve via core_id), NÃO o modulo_base_id do brief (86ec8894 — brief antigo,
// pré-7258c0a3, cego a cargo/descritor). Os 4 vídeos de 25/06 estão na célula
// (86ec8894 × cargo 'todos') e por isso NUNCA aparecem pra cargo MEI.
// Roteiro sai inline (forceSync); TTS/HeyGen/render seguem no task do Trigger.
process.loadEnvFile('.env.local');
if (!process.env.HCLOUD_TOKEN && process.env['Hetzner Cloud api token']) process.env.HCLOUD_TOKEN = process.env['Hetzner Cloud api token'];
import { createSupabaseAdmin } from '@/lib/supabase';
import { dispararVideoDoKit } from '@/actions/gerar-video';
import { resolverContextoEmpresa } from '@/lib/season-engine/kit/contexto-empresa';

const EMP = '5e94075d-32e6-421c-802c-62c152415dc4'; // projetomacae
const MODULO_DO_CORE = '35b27c40-6272-475a-9a21-d990f1c5cc13'; // "Formar o preço com consciência"
const KIT_D = '2c487b03-78e7-4a6e-8a00-af3582ca259b';

async function main() {
  const sb = createSupabaseAdmin();
  const { data: kit, error } = await sb.from('kits').select('desafio, disc').eq('id', KIT_D).single();
  if (error || kit?.disc !== 'D') throw new Error(`kit D não encontrado: ${error?.message || JSON.stringify(kit)}`);
  const pppBrief = await resolverContextoEmpresa(sb, EMP).catch(() => null);
  const r = await dispararVideoDoKit(sb, {
    moduloBaseId: MODULO_DO_CORE, empresaId: EMP, cargo: 'MEI', disc: 'D',
    desafioTexto: kit.desafio?.desafio_texto, kitId: KIT_D, pppBrief,
    createdBy: 'kit:videos-instrucionais',
  });
  console.log(r.error ? `FALHOU: ${r.error}` : `✅ video ${r.id} status=${r.status ?? 'processing'} reused=${!!r.reused}`);
  if (r.error) process.exit(1);
}
main().catch((e) => { console.error('FALHOU:', e?.message || e); process.exit(1); });
