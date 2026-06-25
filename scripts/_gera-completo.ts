/**
 * Gera um vídeo COMPLETO de teste com TUDO aplicado: roteiro fresco (Opus 4.6 +
 * thinking, COM ícones semânticos) p/ uma célula real → dispara gerar-video-modulo
 * (narração Vindemiatrix → avatar HeyGen → render 720p com fundo chapado + sem blur
 * + ícones → master -14 LUFS + SFX → saudação nominal). Roteiro gerado chamando a
 * Anthropic direto (o ai-client do app é server-only).
 *
 * Rodar: npx tsx scripts/_gera-completo.ts
 */
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { tasks } from '@trigger.dev/sdk';
import { buildRoteiroPrompt, parseRoteiro, normalizarRoteiro } from '../lib/video/roteiro-prompt';

// env (.env.local — manual, p/ tsx)
for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const i = line.indexOf('='); if (i < 0) continue;
  const k = line.slice(0, i).trim(); if (!process.env[k]) process.env[k] = line.slice(i + 1).trim().replace(/^"|"$/g, '');
}
const ANTHROPIC = process.env.ANTHROPIC_API_KEY!;
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const log = (...a: any[]) => console.log(new Date().toISOString().slice(11, 19), ...a);

const CELL = { modulo: 'bbcd7218-faef-4da9-9622-2464f4ab6741', empresa: '0d99fed1-1710-40e3-b32e-7a95c7d023fe', cargo: 'Gestão Escolar', disc: 'I' as const };
const THINK = 8000, MAXTOK = THINK + 8000;

async function main() {
const { data: m } = await sb.from('modulos_base_conteudo')
  .select('id,locale,nivel_entrada,nivel_destino,titulo,descritor,conteudo_central,conteudo_aplicavel,adaptacao_por_formato,competencias_base(nome)')
  .eq('id', CELL.modulo).maybeSingle();
if (!m) throw new Error('módulo não encontrado');

const { data: cargoRow } = await sb.from('cargos_empresa')
  .select('nome,area_depto,descricao,principais_entregas,decisoes_recorrentes,tensoes_comuns')
  .eq('empresa_id', CELL.empresa).ilike('nome', CELL.cargo).limit(1).maybeSingle();
const cargoBloco = cargoRow
  ? `CARGO: ${cargoRow.nome}. Área: ${cargoRow.area_depto || ''}. ${cargoRow.descricao || ''} Entregas: ${cargoRow.principais_entregas || ''}. Decisões: ${cargoRow.decisoes_recorrentes || ''}. Tensões: ${cargoRow.tensoes_comuns || ''}`.replace(/\s+/g, ' ').slice(0, 1600)
  : null;
const { data: ppp } = await sb.from('ppp_escolas').select('extracao')
  .eq('empresa_id', CELL.empresa).eq('status', 'extraido').order('extracted_at', { ascending: false }).limit(1).maybeSingle();
const pppBrief = ppp?.extracao ? (typeof ppp.extracao === 'string' ? ppp.extracao : JSON.stringify(ppp.extracao)).slice(0, 2500) : null;

const modulo: any = {
  titulo: m.titulo, descritor: m.descritor, competenciaNome: (m as any).competencias_base?.nome ?? null,
  nivel_entrada: m.nivel_entrada, nivel_destino: m.nivel_destino,
  conteudo_central: m.conteudo_central, conteudo_aplicavel: m.conteudo_aplicavel,
  adaptacao_por_formato: m.adaptacao_por_formato, locale: m.locale,
  cargoBloco, pppBrief, discDominante: CELL.disc,
};
log('módulo:', m.titulo, '· cargoBloco:', !!cargoBloco, '· pppBrief:', !!pppBrief);

const { system, user } = buildRoteiroPrompt(modulo);
log('gerando roteiro (Opus 4.6 + thinking)…');
const res = await fetch('https://api.anthropic.com/v1/messages', {
  method: 'POST',
  headers: { 'x-api-key': ANTHROPIC, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
  body: JSON.stringify({ model: 'claude-opus-4-6', max_tokens: MAXTOK, thinking: { type: 'enabled', budget_tokens: THINK }, system, messages: [{ role: 'user', content: user }] }),
});
const j: any = await res.json();
if (!res.ok) throw new Error('anthropic ' + res.status + ': ' + JSON.stringify(j).slice(0, 300));
const text = (j.content || []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('');
const roteiro: any = normalizarRoteiro(parseRoteiro(text));
const comIcons = roteiro.scenes.filter((s: any) => Array.isArray(s.icons) && s.icons.length);
log('roteiro OK ·', roteiro.scenes.length, 'cenas ·', comIcons.length, 'cena(s) com ícones');
for (const s of comIcons) log('   ', s.type, '→ icons:', JSON.stringify(s.icons), '·', JSON.stringify(s.bullets || s.items));

const { data: novo, error } = await sb.from('videos_gerados').insert({
  modulo_base_id: CELL.modulo, empresa_id: CELL.empresa, cargo: CELL.cargo, disc_dominante: CELL.disc,
  status: 'processing', etapa: 'roteiro', roteiro, created_by: 'teste:completo',
}).select('id').maybeSingle();
if (error || !novo) throw new Error('insert: ' + (error?.message || ''));
log('videoId:', novo.id);
const handle = await tasks.trigger('gerar-video-modulo', { videoId: novo.id, roteiro });
log('disparado · run:', handle.id, '· monitore videoId=', novo.id);
}

main().catch((e) => { console.error('ERRO:', e?.message || e); process.exit(1); });
