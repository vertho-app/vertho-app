export {};
const ExcelJS = (await import('exceljs')).default;
const ALVO = (process.argv[2] || 'cristina').toLowerCase();
const norm = s => (s||'').toString().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
const num = (v) => { const n = Number(v?.result ?? v); return Number.isFinite(n) ? n : null; };

const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile('C:/Users/rdnav/Downloads/PERFIL COMPORTAMENTAL - CISv2.xlsx');
const ws = wb.worksheets[0];
const head = [];
ws.getRow(1).eachCell((c, i) => { head[i] = (c.value ?? '').toString().trim(); });

ws.eachRow((row, n) => {
  if (n === 1) return;
  const nome = (row.getCell(1).value ?? '').toString().trim();
  if (!norm(nome).includes(ALVO)) return;
  console.log(`\n=== linha ${n}: ${nome} ===`);
  for (let c = 1; c <= 40; c++) {
    const raw = row.getCell(c).value;
    const v = (raw && typeof raw === 'object') ? (raw.result ?? raw.text ?? JSON.stringify(raw)) : raw;
    console.log(`  col${String(c).padStart(2,'0')} ${String(head[c] ?? '').padEnd(24)} = ${v}`);
  }
});
