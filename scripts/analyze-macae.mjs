import { readFileSync, writeFileSync } from 'fs';
const FILE = 'C:/Users/rdnav/.claude/projects/C--GAS-Vertho-App/085a7ccd-427e-4c76-ab31-f7b955f9dca8/tool-results/mcp-claude_ai_Google_Drive-read_file_content-1778775713096.txt';
const j = JSON.parse(readFileSync(FILE, 'utf8'));
const lines = j.fileContent.split('\n');

// Extrai cada tabela: separa por linha separadora ":-:". Header está acima dela.
const seps = [];
lines.forEach((l, i) => { if (/^\|\s*:-/.test(l.trim())) seps.push(i); });

function tabelaPorIdx(idx) {
  const sepIdx = seps[idx];
  const nextSep = seps[idx + 1] ?? lines.length;
  const header = lines[sepIdx - 1] || '';
  const dataStart = sepIdx + 1;
  // até a linha anterior ao próximo header (que é a linha-1 do próximo sep)
  const dataEnd = (idx + 1 < seps.length) ? seps[idx + 1] - 2 : lines.length;
  const data = lines.slice(dataStart, dataEnd).filter(l => l.trim() && l.trim().startsWith('|'));
  return { header, data };
}

// Imprime tab N com headers e até K linhas
function dumpTab(numero1based, headerOnly = false, maxRows = 5) {
  const idx = numero1based - 1;
  const t = tabelaPorIdx(idx);
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`▶ TAB ${numero1based}`);
  const cols = t.header.split('|').map(s => s.trim()).filter(Boolean);
  cols.forEach((c, i) => console.log(`  col${i+1}: ${c.slice(0, 100).replace(/&#10;/g, '\\n')}`));
  console.log(`  → ${t.data.length} linhas de dados`);
  if (!headerOnly) {
    console.log('  → Amostra:');
    t.data.slice(0, maxRows).forEach((row, i) => {
      const cells = row.split('|').map(s => s.trim()).filter((_, idx) => idx > 0);
      console.log(`    [${i+1}]`);
      cells.slice(0, 15).forEach((c, ci) => {
        if (c) console.log(`        col${ci+1} = ${c.slice(0, 80).replace(/&#10;/g, ' ').replace(/\\/g, '')}`);
      });
    });
  }
}

// Foca nas tabs importantes
const ABAS_DE_INTERESSE = [17, 21, 24, 18, 22, 16, 25];
ABAS_DE_INTERESSE.forEach(n => dumpTab(n, false, 3));
