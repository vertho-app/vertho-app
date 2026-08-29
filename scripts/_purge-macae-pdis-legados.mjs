// Backup + exclusão dos 51 PDIs legados (origem gas-legado) de Macaé/Secretaria.
// PDFs no storage NÃO são removidos.
import { createClient } from '@supabase/supabase-js';
import { writeFileSync } from 'fs';
import { config } from 'dotenv';
config({ path: '.env.local' });

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const EMP = '44b632ae-b7b9-440d-bc74-92cead889d52';

const { data: rows, error } = await sb.from('relatorios')
  .select('*')
  .eq('empresa_id', EMP)
  .eq('tipo', 'individual');
if (error) { console.error(error); process.exit(1); }
console.log('relatorios individuais encontrados:', rows.length);

// trava de segurança: só apaga se TODOS forem legado GAS
const naoLegado = rows.filter(r => {
  const c = typeof r.conteudo === 'string' ? JSON.parse(r.conteudo) : r.conteudo;
  return !String(c?.origem || '').startsWith('gas-legado');
});
if (naoLegado.length) {
  console.error('ABORTANDO: há registros não-legados:', naoLegado.map(r => r.id));
  process.exit(1);
}

const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19) + 'Z';
const file = `backups/macae-pdis-legados-${ts}.json`;
writeFileSync(file, JSON.stringify(rows, null, 2));
console.log('backup salvo em', file);

const { error: delErr, count } = await sb.from('relatorios')
  .delete({ count: 'exact' })
  .in('id', rows.map(r => r.id));
if (delErr) { console.error(delErr); process.exit(1); }
console.log('deletados:', count);

const { count: resto } = await sb.from('relatorios')
  .select('id', { count: 'exact', head: true })
  .eq('empresa_id', EMP);
console.log('relatorios restantes na empresa:', resto);
