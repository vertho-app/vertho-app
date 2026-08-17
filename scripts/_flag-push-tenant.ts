/* eslint-disable */
// Liga/desliga a flag de push (`empresas.sys_config.notificacoes_push`) por slug.
//
// Dry-run por padrão: imprime o sys_config ANTES e o que ficaria DEPOIS.
//
//   npx tsx scripts/_flag-push-tenant.ts <slug>=on|off [<slug>=on|off ...] [--aplicar]
//
// ⚠️ `update` de JSONB SUBSTITUI a coluna inteira — por isso o script lê o
// `sys_config` atual e faz MERGE. Gravar `{notificacoes_push:true}` cru apagaria
// `perfil_externo_fonte`, `default_locale` e tudo o mais que vive ali.
process.loadEnvFile('.env.local');
import { createSupabaseAdmin } from '@/lib/supabase';

const APLICAR = process.argv.includes('--aplicar');
const ALVOS = process.argv.slice(2)
  .filter((a) => a.includes('='))
  .map((a) => {
    const [slug, v] = a.split('=');
    const valor = String(v).toLowerCase();
    if (!['on', 'off'].includes(valor)) throw new Error(`valor inválido para ${slug}: use on|off`);
    return { slug, ligar: valor === 'on' };
  });

async function main() {
  if (!ALVOS.length) throw new Error('uso: <slug>=on|off [...] [--aplicar]');
  const sb = createSupabaseAdmin();

  for (const { slug, ligar } of ALVOS) {
    const { data: emp, error } = await sb.from('empresas')
      .select('id, slug, nome, sys_config').eq('slug', slug).maybeSingle();
    if (error) throw new Error(`${slug}: ${error.message}`);
    if (!emp) throw new Error(`empresa não encontrada: ${slug}`);

    const atual = ((emp as any).sys_config || {}) as Record<string, any>;
    const antes = atual.notificacoes_push;
    const chaves = Object.keys(atual);
    console.log(`\n${slug} (${(emp as any).nome})`);
    console.log(`  sys_config tem ${chaves.length} chave(s): ${chaves.join(', ') || '—'}`);
    console.log(`  notificacoes_push: ${antes === undefined ? '(ausente)' : antes} → ${ligar}`);

    // Endpoints já registrados: desligar a flag CORTA o push de quem instalou.
    const { count } = await sb.from('notification_endpoints')
      .select('id', { count: 'exact', head: true })
      .eq('empresa_id', (emp as any).id).eq('enabled', true);
    if (count) console.log(`  ⚠️ ${count} endpoint(s) habilitado(s) neste tenant`);

    if (!APLICAR) continue;

    const novo = { ...atual, notificacoes_push: ligar };
    const { error: errUp } = await sb.from('empresas')
      .update({ sys_config: novo }).eq('id', (emp as any).id);
    if (errUp) throw new Error(`${slug}: falha ao gravar — ${errUp.message}`);

    // Confere lendo de volta: o update não devolve o estado, e chave perdida no
    // merge só apareceria semanas depois, num consumidor sem relação com push.
    const { data: pos } = await sb.from('empresas')
      .select('sys_config').eq('id', (emp as any).id).maybeSingle();
    const depois = ((pos as any)?.sys_config || {}) as Record<string, any>;
    const perdidas = chaves.filter((k) => !(k in depois));
    console.log(`  ✅ gravado: notificacoes_push=${depois.notificacoes_push} · ${Object.keys(depois).length} chave(s)${perdidas.length ? ` · 🔴 PERDIDAS: ${perdidas.join(', ')}` : ''}`);
    if (perdidas.length) throw new Error('merge perdeu chave do sys_config — investigar antes de seguir');
  }

  if (!APLICAR) console.log('\n(dry-run — rode com --aplicar)');
  else console.log('\n⚠️ o convite no dashboard tem cache de 60s por processo (resetPushFlagCache no server).');
}

main().catch((e) => { console.error('ERRO:', e?.message || e); process.exit(1); });
