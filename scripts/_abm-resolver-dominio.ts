/**
 * ABM — resolvedor de domínio oficial (camada 3 do enriquecimento).
 *
 * RASCUNHO LOCAL: `scripts/_*.ts` não é versionado (ver comentário do
 * service-role-guard). Não usa Supabase de propósito — a entrada é o top 10
 * colado da consulta `deliverables/abm-universo-tier-a.sql`.
 *
 * O que este script prova: a parte CARA de resolver domínio não é achar um
 * candidato, é CONFIRMAR que o candidato é a escola certa. A confirmação é
 * feita buscando o nome da rede + o município no HTML da página — e isso
 * funciona sem nenhuma credencial nova.
 *
 * Provider de candidatos é PLUGÁVEL:
 *   - `heuristica` (default, R$0)  — gera domínios prováveis do nome
 *   - `places`     (US$0,032/conta) — Google Places por lat/long, precisão alta
 * Trocar o provider melhora a etapa 1; a etapa 2 (validação) é a mesma.
 *
 * Uso: npx tsx scripts/_abm-resolver-dominio.ts
 */

import { fetchPublico } from '../lib/net-guard';

type Conta = {
  nucleo: string; uf: string; sede: string;
  unidades: number; matriculas: number; nomeMaior: string;
  /** TODOS os municípios da rede — a evidência que separa homônimo de verdade. */
  municipios: string[];
};

// Top 10 redes (3+ unidades) por matrículas — medido 03/08/2026.
const TOP10: Conta[] = [
  { nucleo: 'PENSI', uf: 'RJ', sede: 'Cabo Frio', unidades: 20, matriculas: 11464, nomeMaior: 'COLEGIO E CURSO PENSI', municipios: ['Cabo Frio','Campos dos Goytacazes','Niterói','Petrópolis','Rio de Janeiro','Teresópolis'] },
  { nucleo: 'TECNOLOGICO ASSESSORITEC', uf: 'SC', sede: 'Araquari', unidades: 10, matriculas: 8852, nomeMaior: 'INSTITUTO TECNOLOGICO ASSESSORITEC', municipios: ['Araquari','Barra Velha','Blumenau','Brusque','Garuva','Itajaí','Jaraguá do Sul','Joinville','Rio Negrinho','São Francisco do Sul'] },
  { nucleo: 'ELITE REDE DE ENSINO', uf: 'SP', sede: 'Jaú', unidades: 8, matriculas: 6192, nomeMaior: 'ELITE REDE DE ENSINO', municipios: ['Jaú','Mauá','Piracicaba','Santo André','São Paulo','Taubaté'] },
  { nucleo: 'PH', uf: 'RJ', sede: 'Niterói', unidades: 11, matriculas: 5682, nomeMaior: 'COLEGIO PH', municipios: ['Niterói','Rio de Janeiro'] },
  { nucleo: 'ALFA REDE DE ENSINO', uf: 'PR', sede: 'Campo Mourão', unidades: 12, matriculas: 4995, nomeMaior: 'ALFA REDE DE ENSINO', municipios: ['Campo Mourão','Cascavel','Francisco Beltrão','Guarapuava','Maringá','Pato Branco','Ponta Grossa','Toledo'] },
  { nucleo: 'SAO JOSE', uf: 'RS', sede: 'Caxias do Sul', unidades: 4, matriculas: 4611, nomeMaior: 'COLEGIO SAO JOSE', municipios: ['Caxias do Sul','Montenegro','Pelotas','Santa Maria'] },
  { nucleo: 'LA SALLE', uf: 'RS', sede: 'Canoas', unidades: 4, matriculas: 4342, nomeMaior: 'COLEGIO LA SALLE', municipios: ['Canoas','Carazinho','Caxias do Sul','Esteio'] },
  { nucleo: 'FORTEC ESCOLA TECNICA', uf: 'SP', sede: 'Cubatão', unidades: 3, matriculas: 4329, nomeMaior: 'FORTEC ESCOLA TECNICA UNID IV', municipios: ['Cubatão','Praia Grande','São Vicente'] },
  { nucleo: 'TABLEAU COLEGIO', uf: 'SP', sede: 'Caraguatatuba', unidades: 7, matriculas: 4103, nomeMaior: 'TABLEAU COLEGIO', municipios: ['Caraguatatuba','Guaratinguetá','Jacareí','Jundiaí','São José dos Campos','Taubaté'] },
  { nucleo: 'SAO JOSE COLEGIO', uf: 'SP', sede: 'Bauru', unidades: 7, matriculas: 4060, nomeMaior: 'SAO JOSE COLEGIO', municipios: ['Bauru','Catanduva','Limeira','Ribeirão Pires','Santo André','Santos','Taubaté'] },
];

const STOP = new Set(['REDE', 'DE', 'ENSINO', 'COLEGIO', 'ESCOLA', 'INSTITUTO', 'TECNICA', 'TECNOLOGICO', 'UNID', 'IV']);

function slugTokens(nucleo: string): string[] {
  return nucleo.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);
}

/** Provider 1 (R$0): domínios prováveis a partir do nome. */
function candidatosHeuristica(c: Conta): string[] {
  const toks = slugTokens(c.nucleo);
  const uteis = toks.filter((t) => !STOP.has(t.toUpperCase()));
  const nucleoSlug = uteis.join('') || toks.join('');
  const completo = toks.join('');
  const cands = new Set<string>();
  for (const raiz of [nucleoSlug, completo]) {
    if (!raiz || raiz.length < 2) continue;
    cands.add(`${raiz}.com.br`);
    cands.add(`colegio${raiz}.com.br`);
    cands.add(`${raiz}.edu.br`);
    cands.add(`rede${raiz}.com.br`);
    cands.add(`${raiz}.g12.br`);
  }
  return [...cands];
}

/** Provider 2 (US$0,032): Google Places por lat/long. Requer GOOGLE_PLACES_API_KEY. */
async function candidatosPlaces(c: Conta, lat: number, lon: number): Promise<string[]> {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) throw new Error('GOOGLE_PLACES_API_KEY ausente');
  const r = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': key,
      'X-Goog-FieldMask': 'places.websiteUri,places.displayName',
    },
    body: JSON.stringify({
      textQuery: `${c.nomeMaior} ${c.sede} ${c.uf}`,
      locationBias: { circle: { center: { latitude: lat, longitude: lon }, radius: 5000 } },
      maxResultCount: 3,
    }),
  });
  const j: any = await r.json();
  return (j.places || []).map((p: any) => p.websiteUri).filter(Boolean)
    .map((u: string) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return null; } })
    .filter(Boolean);
}

type Veredito = {
  dominio: string; status: number; confianca: 'alta' | 'media' | 'baixa';
  sinais: string[]; titulo: string | null; municipiosBatem: number;
};

/** Etapa 2 — a que importa: o site é MESMO desta rede? */
async function validar(dominio: string, c: Conta): Promise<Veredito | null> {
  // TUDO dentro do try: o AbortSignal também dispara durante o .text(),
  // e um throw ali derrubava o teste inteiro no meio da lista.
  try {
    const res = await fetchPublico(`https://${dominio}`, {
      redirect: 'follow',
      headers: { 'user-agent': 'VerthoABM/1.0 (+contato@vertho.ai)' },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return null;
    return await analisar(await res.text(), res.status, dominio, c);
  } catch {
    return null;
  }
}

async function analisar(htmlBruto: string, status: number, dominio: string, c: Conta): Promise<Veredito | null> {
  const html = htmlBruto.slice(0, 200_000);
  const texto = html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<[^>]+>/g, ' ')
    .normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const titulo = (html.match(/<title[^>]*>([^<]+)</i)?.[1] || '').trim() || null;

  const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const sinais: string[] = [];

  const toksNucleo = slugTokens(c.nucleo).filter((t) => !STOP.has(t.toUpperCase()) && t.length > 2);
  const achouNome = toksNucleo.length > 0 && toksNucleo.every((t) => texto.includes(t));
  if (achouNome) sinais.push('nome-da-rede');

  // GEOGRAFIA — o discriminante. Homônimo casa o nome, não casa as cidades.
  const batem = c.municipios.filter((m) => texto.includes(norm(m)));
  if (batem.length) sinais.push(`municipios:${batem.length}/${c.municipios.length} (${batem.slice(0, 3).join(',')})`);

  if (/\b(escola|colegio|ensino|educacao|aluno|matricul)/.test(texto)) sinais.push('vocabulario-educacional');
  if (/\b(unidade|unidades|nossas escolas|campus)\b/.test(texto)) sinais.push('menciona-unidades');
  if (/\b(trabalhe conosco|vagas|banco de talentos|carreira)\b/.test(texto)) sinais.push('pagina-vagas');

  // Regra: nome sozinho NÃO basta. Sem cidade batendo, é candidato — não achado.
  const educacional = sinais.includes('vocabulario-educacional');
  const confianca: Veredito['confianca'] =
    achouNome && educacional && batem.length >= 2 ? 'alta'
    : achouNome && educacional && batem.length === 1 ? 'media'
    : 'baixa';

  return { dominio, status, confianca, sinais, titulo, municipiosBatem: batem.length };
}

async function main() {
  const usarPlaces = process.argv.includes('--places');
  console.log(`\nResolvedor de domínio — provider: ${usarPlaces ? 'places' : 'heuristica (R$0)'}\n`);
  console.log('='.repeat(100));

  let alta = 0, media = 0, nenhum = 0;
  const inicio = Date.now();

  for (const c of TOP10) {
    const cands = usarPlaces ? [] : candidatosHeuristica(c);
    const achados: Veredito[] = [];
    for (const d of cands) {
      const v = await validar(d, c);
      if (v) achados.push(v);
      if (achados.some((a) => a.confianca === 'alta')) break; // para no primeiro forte
    }
    const ordem = { alta: 0, media: 1, baixa: 2 } as const;
    achados.sort((a, b) => ordem[a.confianca] - ordem[b.confianca] || b.municipiosBatem - a.municipiosBatem);
    const melhor = achados[0];

    const rotulo = `${c.nucleo} (${c.uf}, ${c.unidades}un)`.padEnd(42);
    if (!melhor) {
      nenhum++;
      console.log(`⚫ ${rotulo} — nenhum site respondeu  [testados: ${cands.length}]`);
    } else if (melhor.confianca === 'baixa') {
      nenhum++;
      console.log(`❌ ${rotulo} ${melhor.dominio} — REPROVADO (site existe, não é esta rede)`);
      console.log(`   sinais: ${melhor.sinais.join(' · ') || 'nenhum'}`);
      if (melhor.titulo) console.log(`   "${melhor.titulo.slice(0, 90)}"`);
    } else {
      melhor.confianca === 'alta' ? alta++ : media++;
      const icone = melhor.confianca === 'alta' ? '✅' : '🟡';
      console.log(`${icone} ${rotulo} ${melhor.dominio}`);
      console.log(`   ${melhor.confianca.toUpperCase()} · ${melhor.sinais.join(' · ')}`);
      if (melhor.titulo) console.log(`   "${melhor.titulo.slice(0, 90)}"`);
    }
  }

  const seg = ((Date.now() - inicio) / 1000).toFixed(1);
  console.log('='.repeat(100));
  console.log(`\nalta: ${alta}/10 · média: ${media}/10 · sem resolução: ${nenhum}/10 — em ${seg}s\n`);
}

main().catch((e) => { console.error(e); process.exit(1); });
