/**
 * Investiga as anomalias do dry-run:
 *   - 2 colabs "perdidos" (47 esperados, só 45 parsed)
 *   - 13 respostas IA4 sem colab correspondente
 */
import { readFileSync } from 'fs';
const dump = JSON.parse(readFileSync('outputs/migrar-macae-dump.json', 'utf8'));

const emailsColab = new Set(dump.colaboradores.map(c => c.email));

console.log(`\n━━━ Colaboradores parsed: ${dump.colaboradores.length}\n`);
console.log('Lista (nome — email):');
dump.colaboradores.forEach((c, i) => {
  console.log(`  ${String(i+1).padStart(3)}. ${c.nome_completo} — ${c.email}`);
});

console.log(`\n━━━ Respostas IA4 sem colab correspondente:\n`);
const orfas = dump.respostas.filter(r => !emailsColab.has(r.email));
console.log(`Total: ${orfas.length}\n`);
orfas.forEach((r, i) => {
  console.log(`  ${i+1}. ${r.nome_colab} — ${r.email} (${r.cod_comp})`);
});

// Lista emails únicos das respostas
console.log(`\n━━━ Emails únicos nas respostas IA4:`);
const emailsResp = [...new Set(dump.respostas.map(r => r.email))];
console.log(`Total: ${emailsResp.length}`);

// Quais estão em colabs vs órfãos
const naoEmColab = emailsResp.filter(e => !emailsColab.has(e));
console.log(`Em colabs: ${emailsResp.length - naoEmColab.length}`);
console.log(`NÃO em colabs (órfãos): ${naoEmColab.length}`);
naoEmColab.forEach(e => console.log(`  - ${e}`));
