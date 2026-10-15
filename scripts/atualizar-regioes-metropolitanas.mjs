// Regenera lib/mercado-potencial/regioes-metropolitanas.ts a partir da API de
// Localidades do IBGE (Regiões Metropolitanas e RIDEs, com os municípios de cada
// uma). Só leitura de rede, sem banco e sem credencial.
//
//   node scripts/atualizar-regioes-metropolitanas.mjs
//
// Rode de tempos em tempos: as assembleias estaduais criam e mudam regiões
// metropolitanas (em 15/10/2026 eram 84 RMs e 3 RIDEs). Aglomerações urbanas não
// entram, de propósito: o pedido foi "regiões metropolitanas". Sub-regiões
// (algumas RMs paulistas têm) também não: a região é escolhida inteira.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const BASE = 'https://servicodados.ibge.gov.br/api/v1/localidades';
const SAIDA = fileURLToPath(new URL('../lib/mercado-potencial/regioes-metropolitanas.ts', import.meta.url));

async function buscar(caminho) {
  const r = await fetch(`${BASE}/${caminho}`, { signal: AbortSignal.timeout(60_000) });
  if (!r.ok) throw new Error(`IBGE ${caminho}: HTTP ${r.status}`);
  const dados = await r.json();
  if (!Array.isArray(dados) || dados.length === 0) throw new Error(`IBGE ${caminho}: resposta vazia`);
  return dados;
}

const sem = (nome, re) => nome.replace(re, '').trim();
const ids = (lista) => [...new Set(lista.map((m) => String(m.id)))].sort();

const rms = (await buscar('regioes-metropolitanas')).map((r) => ({
  id: String(r.id),
  tipo: 'RM',
  nome: `${sem(r.nome, /^Região Metropolitana(?: (?:de|do|da|dos|das))? /i)} (${r.UF.sigla})`,
  municipios: ids(r.municipios),
}));

const rides = (await buscar('regioes-integradas-de-desenvolvimento')).map((r) => {
  const ufs = [...new Set(r.municipios.map((m) => m.UF.sigla))].sort().join('/');
  return {
    id: String(r.id),
    tipo: 'RIDE',
    nome: `RIDE ${sem(r.nome, /^Região (?:Administrativa )?Integrada de Desenvolvimento(?: (?:de|do|da|dos|das))? /i)} (${ufs})`,
    municipios: ids(r.municipios),
  };
});

const grupos = [...rms, ...rides].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

// A tela e o filtro dependem disto: id e nome únicos, municípios com 7 dígitos.
for (const [campo, valores] of [['id', grupos.map((g) => g.id)], ['nome', grupos.map((g) => g.nome)]]) {
  const repetidos = valores.filter((v, i) => valores.indexOf(v) !== i);
  if (repetidos.length) throw new Error(`${campo} repetido: ${repetidos.join(', ')}`);
}
for (const g of grupos) {
  if (g.municipios.length === 0) throw new Error(`${g.nome} sem municípios`);
  const ruim = g.municipios.filter((m) => !/^\d{7}$/.test(m));
  if (ruim.length) throw new Error(`${g.nome} com código fora do padrão: ${ruim.join(', ')}`);
}

const linhas = grupos.map((g) => `  ${JSON.stringify(g)},`).join('\n');
const total = new Set(grupos.flatMap((g) => g.municipios)).size;
const hoje = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });

writeFileSync(
  SAIDA,
  `// GERADO por scripts/atualizar-regioes-metropolitanas.mjs em ${hoje}. NÃO edite à mão.
// Fonte: IBGE, API de Localidades (regioes-metropolitanas e regioes-integradas-de-desenvolvimento).
// ${grupos.length} grupos (${rms.length} RMs e ${rides.length} RIDEs), ${total} municípios distintos.

export interface RegiaoMetropolitana {
  /** Código IBGE da unidade territorial (RM e RIDE usam a mesma numeração). */
  id: string;
  /** Nome para a tela, com a(s) UF(s): "Campinas (SP)". */
  nome: string;
  tipo: 'RM' | 'RIDE';
  /** Códigos IBGE de 7 dígitos, o mesmo \`municipio_ibge\` das visões do Mercado Potencial. */
  municipios: readonly string[];
}

export const REGIOES_METROPOLITANAS: readonly RegiaoMetropolitana[] = [
${linhas}
];
`,
);
console.log(`${SAIDA}\n${grupos.length} grupos, ${total} municípios distintos`);
