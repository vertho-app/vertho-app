import { readFileSync } from 'fs';
const SOURCE = 'C:/Users/rdnav/.claude/projects/C--GAS-Vertho-App/085a7ccd-427e-4c76-ab31-f7b955f9dca8/tool-results/mcp-claude_ai_Google_Drive-read_file_content-1778775713096.txt';
const j = JSON.parse(readFileSync(SOURCE, 'utf8'));
const lines = j.fileContent.split('\n');
const seps = [];
lines.forEach((l, i) => { if (/^\|\s*:-/.test(l.trim())) seps.push(i); });

// Tab 17
const sepIdx = seps[16]; // tab17 = idx 16
const dataEnd = seps[17] - 2;
const allRows = lines.slice(sepIdx + 1, dataEnd).filter(l => l.trim() && l.trim().startsWith('|'));
console.log(`Total linhas de dados em Tab 17: ${allRows.length}`);

allRows.forEach((row, i) => {
  const cells = row.split('|').map(s => s.trim()).slice(1, -1);
  const nome = cells[1] || '(vazio)';
  const email = cells[6] || '(vazio)';
  const cargo = cells[3] || '(vazio)';
  console.log(`  [${String(i+1).padStart(2)}] ${nome.padEnd(55)} | email=${email.padEnd(50)} | cargo=${cargo}`);
});

// Filtros que apliquei
console.log('\n━━━ Análise dos filtros ━━━');
const total = allRows.length;
const semNome = allRows.filter(r => !r.split('|').slice(1, -1)[1]?.trim()).length;
const semEmail = allRows.filter(r => !r.split('|').slice(1, -1)[6]?.trim()).length;
const semNomeOuEmail = allRows.filter(r => {
  const c = r.split('|').slice(1, -1).map(s => s.trim());
  return !c[1] || !c[6];
}).length;

console.log(`Total: ${total}`);
console.log(`Sem nome: ${semNome}`);
console.log(`Sem email: ${semEmail}`);
console.log(`Sem nome OU email (filtrados): ${semNomeOuEmail}`);
console.log(`Passariam pro Vertho: ${total - semNomeOuEmail}`);
console.log(`Mas pulei 2 primeiras (headers extra): ${total - semNomeOuEmail - 2}`);
