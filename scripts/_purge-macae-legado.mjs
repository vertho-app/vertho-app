// Backup + exclusão das respostas legadas da migração GAS (14/05/2026)
// Critério: empresa Macaé/Secretaria, C003/C010, cenario_id NULL (legado).
import { createClient } from '@supabase/supabase-js';
import { writeFileSync } from 'fs';
import { config } from 'dotenv';
config({ path: '.env.local' });

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const EMP = '44b632ae-b7b9-440d-bc74-92cead889d52';
const COMP_IDS = ['0ccd841e-9565-4f61-8aa1-5a210a5f7139', '570f782f-2b14-41c2-a6f2-71f9cfa82f31']; // C003, C010

const { data: rows, error } = await sb.from('respostas')
  .select('*')
  .eq('empresa_id', EMP)
  .in('competencia_id', COMP_IDS)
  .is('cenario_id', null);
if (error) { console.error(error); process.exit(1); }
console.log('linhas legadas encontradas:', rows.length);

// trava de segurança: só apaga se todas forem do lote de 14/05
const foraDoLote = rows.filter(r => !r.created_at.startsWith('2026-05-14'));
if (foraDoLote.length) {
  console.error('ABORTANDO: há linhas fora do lote de 14/05:', foraDoLote.map(r => r.id));
  process.exit(1);
}

const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19) + 'Z';
const file = `backups/macae-respostas-legadas-c003-c010-${ts}.json`;
writeFileSync(file, JSON.stringify(rows, null, 2));
console.log('backup salvo em', file);

const ids = rows.map(r => r.id);
const { error: delErr, count } = await sb.from('respostas').delete({ count: 'exact' }).in('id', ids);
if (delErr) { console.error(delErr); process.exit(1); }
console.log('deletadas:', count);

// confere o que sobrou
const { data: resto } = await sb.from('respostas').select('id, competencia_id, cenario_id').eq('empresa_id', EMP);
console.log('respostas restantes na empresa:', resto.length, '| sem cenario:', resto.filter(r => !r.cenario_id).length);
