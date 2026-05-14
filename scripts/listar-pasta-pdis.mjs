import { readFileSync } from 'fs';
const FILE = 'C:/Users/rdnav/.claude/projects/C--GAS-Vertho-App/085a7ccd-427e-4c76-ab31-f7b955f9dca8/tool-results/mcp-claude_ai_Google_Drive-search_files-1778782616727.txt';
const j = JSON.parse(readFileSync(FILE, 'utf8'));
console.log(`Total PDFs na pasta: ${j.files?.length || 0}`);
(j.files || []).forEach((f, i) => {
  console.log(`  [${String(i+1).padStart(2)}] ${f.title.padEnd(60)} | ${f.id} | ${f.fileSize} bytes`);
});
