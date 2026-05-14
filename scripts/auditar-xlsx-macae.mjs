import { readFileSync, writeFileSync } from 'fs';
import readXlsxFile from 'read-excel-file/node';

const SOURCE = 'C:/Users/rdnav/.claude/projects/C--GAS-Vertho-App/085a7ccd-427e-4c76-ab31-f7b955f9dca8/tool-results/mcp-claude_ai_Google_Drive-download_file_content-1778777782959.txt';
const j = JSON.parse(readFileSync(SOURCE, 'utf8'));
const buf = Buffer.from(j.content, 'base64');
const TMP = '/tmp/macae.xlsx';
writeFileSync(TMP, buf);

// Lê tudo (sem sheet param) — retorna array de { sheet, data }
const all = await readXlsxFile(TMP);
console.log(`Total abas: ${all.length}\n`);
all.forEach((a, i) => {
  const linhas = a.data?.length || 0;
  const totalCellsCheias = a.data?.reduce((acc, row) => acc + (row?.filter(c => c !== null && c !== '').length || 0), 0) || 0;
  console.log(`  ${String(i+1).padStart(2)}. ${a.sheet.padEnd(35)} · ${linhas} linhas · ${totalCellsCheias} cells preenchidas`);
});

// Procura aba Colaboradores
const colabSheet = all.find(a => a.sheet === 'Colaboradores');
console.log(`\n━━━ Aba "Colaboradores" — ${colabSheet?.data?.length || 0} linhas ━━━\n`);
colabSheet?.data?.forEach((row, i) => {
  // Tab 17 col B = Nome Completo (idx 1), col G = Email (idx 6)
  const nome = row?.[1] ?? '';
  const email = row?.[6] ?? '';
  if (nome || email) {
    console.log(`  [${String(i+1).padStart(3)}] ${String(nome).slice(0, 50).padEnd(50)} | ${email}`);
  }
});

console.log('\n━━━ Emails únicos em todas as abas ━━━');
const allEmails = new Set();
all.forEach(a => a.data?.forEach(row => row?.forEach(c => {
  if (typeof c === 'string' && /^[\w.+-]+@[\w.-]+\.[a-z]{2,}$/i.test(c.trim())) {
    allEmails.add(c.trim().toLowerCase());
  }
})));
console.log(`Total emails únicos no Sheets: ${allEmails.size}`);
