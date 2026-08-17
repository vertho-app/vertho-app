/**
 * Corrige a GRADE de um manuscrito autoral (DOCX) sem tocar no texto.
 *
 * O parser exige que, dentro de cada capítulo, as 4 faixas (N1..N4) tenham o
 * MESMO número de microblocos [+1 síntese]. Quando uma faixa tem 2 e outra tem
 * 1, este script FUNDE os excedentes: apaga a linha de cabeçalho do microbloco
 * excedente — o título editorial dele vive no parágrafo SEGUINTE ao cabeçalho,
 * então continua no corpo como subtítulo. Nenhuma palavra sai do arquivo.
 *
 * Depois renumera todos os IDs na convenção canônica (faixa por bloco global),
 * atualiza o apêndice "Mapa dos microblocos" e move para o fim qualquer apêndice
 * que esteja ANTES da Síntese final (senão o último microbloco o engole).
 *
 * Uso: npx tsx scripts/_corrigir-grade-manuscrito.ts <entrada.docx> <saida.docx>
 */
import { readFileSync, writeFileSync } from 'node:fs';
import JSZip from 'jszip';

const ENTRADA = process.argv[2];
const SAIDA = process.argv[3];
const FAIXAS = ['N1', 'N2', 'N3', 'N4'] as const;
type Faixa = (typeof FAIXAS)[number] | 'SINTESE';

const RE_CABECALHO = /^(.+?)\s*[|·]\s*([A-Z]{2,5}\d{2})\s*[|·]\s*(.+?)\s*[|·]\s*ID:\s*([A-Z]{2,5}\d{2}_MB)(\d{2,3})\s*$/;
/** Elementos de topo do <w:body>. Nenhum deles aninha um do mesmo tipo. */
const RE_BLOCO = /<(w:p|w:tbl|w:sectPr|w:bookmarkStart|w:bookmarkEnd|w:sdt)\b[^>]*(?:\/>|>[\s\S]*?<\/\1>)/g;

/** ⚠ `<w:t[^>]*>` casaria `<w:tbl>`/`<w:tc>`/`<w:tr>` — daí o `(?:\s…)?`. */
const RE_T = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g;
const textoDe = (xml: string) => [...xml.matchAll(RE_T)].map((m) => m[1]).join('');
const desescapar = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
const escapar = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

interface Cab {
  bloco: number;      // índice no array de blocos
  prefixoId: string;  // "DIR10_MB"
  num: number;
  descritor: string;
  faixa: Faixa;
  novoNum?: number;
  fundidoEm?: number; // num ORIGINAL do microbloco que o absorve
}

function fatiarBody(xml: string) {
  const ini = xml.indexOf('<w:body>');
  const fim = xml.lastIndexOf('</w:body>');
  if (ini < 0 || fim < 0) throw new Error('<w:body> não encontrado.');
  const corpo = xml.slice(ini + '<w:body>'.length, fim);
  const blocos: string[] = [];
  let cursor = 0;
  for (const m of corpo.matchAll(RE_BLOCO)) {
    const gap = corpo.slice(cursor, m.index!);
    if (gap.trim()) throw new Error(`Conteúdo não reconhecido entre blocos do body: ${gap.slice(0, 120)}`);
    if (gap) blocos.push(gap);
    blocos.push(m[0]);
    cursor = m.index! + m[0].length;
  }
  const resto = corpo.slice(cursor);
  if (resto.trim()) throw new Error(`Cauda não reconhecida no body: ${resto.slice(0, 120)}`);
  if (resto) blocos.push(resto);
  return { cabeca: xml.slice(0, ini + '<w:body>'.length), blocos, cauda: xml.slice(fim) };
}

async function main() {
  if (!ENTRADA || !SAIDA) throw new Error('uso: <entrada.docx> <saida.docx>');
  const zip = await JSZip.loadAsync(readFileSync(ENTRADA));
  const arq = zip.file('word/document.xml');
  if (!arq) throw new Error('word/document.xml ausente — não parece um DOCX.');
  const xml = await arq.async('string');
  const { cabeca, blocos, cauda } = fatiarBody(xml);
  if (blocos.join('') !== xml.slice(cabeca.length, xml.length - cauda.length)) {
    throw new Error('reconstrução do body divergiu do original — abortado.');
  }

  // ── 1. Cabeçalhos de microbloco ───────────────────────────────────────────
  const cabs: Cab[] = [];
  blocos.forEach((b, i) => {
    if (!b.startsWith('<w:p')) return;
    const m = desescapar(textoDe(b)).trim().match(RE_CABECALHO);
    if (!m) return;
    cabs.push({ bloco: i, prefixoId: m[4], num: Number(m[5]), descritor: m[3].trim(), faixa: 'N1' });
  });
  if (cabs.length < 8) throw new Error(`só ${cabs.length} cabeçalhos encontrados.`);

  // ── 2. Faixa pela numeração global ────────────────────────────────────────
  // Faixa = 4 blocos iguais; as sínteses vêm todas depois. Escolhe o corte que
  // deixa mais capítulos com contagem uniforme (o mesmo critério do verificador).
  const capitulos = [...new Set(cabs.map((c) => c.descritor))];
  const total = cabs.length;
  const uniformes = (F: number) => {
    const t = F / 4;
    return capitulos.filter((cap) => {
      const c = [0, 0, 0, 0];
      cabs.filter((x) => x.descritor === cap).forEach((x) => { if (x.num <= F) c[Math.floor((x.num - 1) / t)]++; });
      return new Set(c).size === 1 && c[0] >= 1;
    }).length;
  };
  const candidatos: number[] = [];
  for (let F = Math.floor(total / 4) * 4; F > 0; F -= 4) if (total - F <= capitulos.length) candidatos.push(F);
  const F = candidatos.sort((a, b) => uniformes(b) - uniformes(a) || b - a)[0];
  const tamFaixa = F / 4;
  cabs.forEach((c) => { c.faixa = c.num <= F ? FAIXAS[Math.floor((c.num - 1) / tamFaixa)] : 'SINTESE'; });
  console.log(`${total} microblocos · ${capitulos.length} capítulos · faixa global = ${tamFaixa} (MBs 1-${F}), sínteses ${F + 1}-${total}`);

  // ── 3. Quem funde em quem ─────────────────────────────────────────────────
  const kDe = new Map<string, number>();
  for (const cap of capitulos) {
    const porFaixa = FAIXAS.map((f) => cabs.filter((c) => c.descritor === cap && c.faixa === f));
    if (porFaixa.some((l) => l.length === 0)) throw new Error(`capítulo "${cap}" sem microbloco em alguma faixa — não dá para fundir, falta escrever.`);
    const k = Math.min(...porFaixa.map((l) => l.length));
    kDe.set(cap, k);
    for (const lista of porFaixa) {
      const ordenada = [...lista].sort((a, b) => a.num - b.num);
      const absorvente = ordenada[k - 1];
      ordenada.slice(k).forEach((c) => { c.fundidoEm = absorvente.num; });
    }
  }
  const fundidos = cabs.filter((c) => c.fundidoEm !== undefined);

  // A fusão só é válida se o microbloco absorvido vier LOGO DEPOIS do absorvente
  // no documento — senão o texto que se junta é de outro microbloco.
  for (const c of fundidos) {
    const anterior = cabs.filter((x) => x.bloco < c.bloco).sort((a, b) => b.bloco - a.bloco)[0];
    if (!anterior || anterior.num !== c.fundidoEm) {
      throw new Error(`MB${c.num} seria fundido em MB${c.fundidoEm}, mas o cabeçalho anterior no documento é MB${anterior?.num ?? '—'}.`);
    }
  }

  // ── 4. Nova numeração canônica ────────────────────────────────────────────
  const mantidos = cabs.filter((c) => c.fundidoEm === undefined);
  let n = 0;
  for (const f of FAIXAS) {
    for (const cap of capitulos) {
      mantidos.filter((c) => c.descritor === cap && c.faixa === f).sort((a, b) => a.num - b.num).forEach((c) => { c.novoNum = ++n; });
    }
  }
  const nFaixa = n;
  for (const cap of capitulos) {
    mantidos.filter((c) => c.descritor === cap && c.faixa === 'SINTESE').forEach((c) => { c.novoNum = ++n; });
  }
  console.log(`\ncapítulo                                k  antes → depois`);
  for (const cap of capitulos) {
    const antes = cabs.filter((c) => c.descritor === cap).length;
    const depois = mantidos.filter((c) => c.descritor === cap).length;
    console.log(`  ${cap.slice(0, 36).padEnd(36)} ${kDe.get(cap)}  ${String(antes).padStart(2)} → ${depois}`);
  }
  console.log(`\n${fundidos.length} fusões · ${mantidos.length} microblocos (${nFaixa} de faixa + ${n - nFaixa} sínteses)`);
  console.log('de → para:');
  for (const c of mantidos.sort((a, b) => a.novoNum! - b.novoNum!)) {
    const absorvidos = fundidos.filter((f) => f.fundidoEm === c.num).map((f) => `MB${f.num}`);
    console.log(`  MB${String(c.num).padStart(2, '0')} → MB${String(c.novoNum).padStart(2, '0')} ${c.faixa.padEnd(7)} ${c.descritor.slice(0, 30).padEnd(30)}${absorvidos.length ? ` ← funde ${absorvidos.join(', ')}` : ''}`);
  }

  // ── 5. Reescreve os cabeçalhos e apaga os fundidos ────────────────────────
  const novoId = (c: Cab) => `${c.prefixoId}${String(c.novoNum).padStart(2, '0')}`;
  for (const c of mantidos) {
    const re = new RegExp(`${c.prefixoId}0*${c.num}(?![0-9])`);
    if (!re.test(blocos[c.bloco])) throw new Error(`ID de MB${c.num} não encontrado no bloco ${c.bloco}.`);
    blocos[c.bloco] = blocos[c.bloco].replace(re, novoId(c));
  }
  const apagar = new Set(fundidos.map((c) => c.bloco));

  // ── 6. Apêndice do mapa de microblocos ────────────────────────────────────
  // Título do apêndice: a ÚLTIMA ocorrência (a primeira é a linha do sumário).
  const idxTituloMapa = blocos.reduce((achado, b, i) =>
    b.startsWith('<w:p') && /Mapa dos microblocos/i.test(desescapar(textoDe(b))) ? i : achado, -1);
  const idxTabelaMapa = idxTituloMapa < 0 ? -1 : blocos.findIndex((b, i) => i > idxTituloMapa && b.startsWith('<w:tbl'));
  if (idxTabelaMapa < 0) console.log('\n⚠ apêndice "Mapa dos microblocos" não encontrado — nada a atualizar.');
  else {
    const tbl = blocos[idxTabelaMapa];
    const linhas = [...tbl.matchAll(/<w:tr[ >][\s\S]*?<\/w:tr>/g)].map((m) => m[0]);
    const numDaLinha = (tr: string) => {
      const m = desescapar(textoDe(tr)).match(/^MB(\d{2,3})/);
      return m ? Number(m[1]) : null;
    };
    /** 1ª célula = ID, 2ª = título. Só esses dois `<w:t>` mudam. */
    const trocarPrimeirosDoisT = (tr: string, id: string, titulo: string) => {
      let i = 0;
      return tr.replace(/(<w:t(?:\s[^>]*)?>)([\s\S]*?)(<\/w:t>)/g, (m, a, _txt, c) => {
        i++;
        if (i === 1) return `${a}${escapar(id)}${c}`;
        if (i === 2) return `${a}${escapar(titulo)}${c}`;
        return m;
      });
    };
    const tituloBruto = (tr: string) => desescapar([...tr.matchAll(RE_T)].map((m) => m[1])[1] || '');
    const novasLinhas: string[] = [];
    let atualizadas = 0, removidas = 0;
    for (const tr of linhas) {
      const num = numDaLinha(tr);
      if (num === null) { novasLinhas.push(tr); continue; }           // cabeçalho da tabela
      const cab = cabs.find((c) => c.num === num);
      if (!cab) { novasLinhas.push(tr); continue; }
      if (cab.fundidoEm !== undefined) { removidas++; continue; }      // linha do microbloco absorvido
      const absorvidos = fundidos.filter((f) => f.fundidoEm === cab.num).map((f) => linhas.find((l) => numDaLinha(l) === f.num)).filter(Boolean) as string[];
      const titulo = [tituloBruto(tr), ...absorvidos.map(tituloBruto)].filter(Boolean).join(' · ');
      novasLinhas.push(trocarPrimeirosDoisT(tr, `MB${String(cab.novoNum).padStart(2, '0')}`, titulo));
      atualizadas++;
    }
    // Reordena as linhas de dados pela nova numeração, mantendo o cabeçalho.
    const cabecalhoTbl = novasLinhas.filter((tr) => numDaLinha(tr) === null);
    const dados = novasLinhas.filter((tr) => numDaLinha(tr) !== null)
      .sort((a, b) => (numDaLinha(a) || 0) - (numDaLinha(b) || 0));
    let k = 0;
    blocos[idxTabelaMapa] = tbl.replace(/<w:tr[ >][\s\S]*?<\/w:tr>/g, () => [...cabecalhoTbl, ...dados][k++] || '');
    console.log(`\nmapa dos microblocos: ${atualizadas} linhas atualizadas, ${removidas} removidas.`);
  }

  // ── 7. Apêndice antes da Síntese final → para o fim ───────────────────────
  const ehTitulo = (i: number, re: RegExp) => blocos[i].startsWith('<w:p') && re.test(desescapar(textoDe(blocos[i])).trim());
  const ultimoCab = Math.max(...cabs.map((c) => c.bloco));
  const iSintese = blocos.findIndex((_, i) => i > ultimoCab && ehTitulo(i, /^S[íi]ntese\b/));
  const iApendice = blocos.findIndex((_, i) => i > ultimoCab && i < (iSintese < 0 ? blocos.length : iSintese) && ehTitulo(i, /^(Ap[êe]ndice|Refer[êe]ncias|Bibliografia)\b/));
  let movidos: string[] = [];
  if (iApendice >= 0 && iSintese > iApendice) {
    movidos = blocos.slice(iApendice, iSintese);
    console.log(`\nmovendo "${desescapar(textoDe(blocos[iApendice])).trim().slice(0, 60)}" (${movidos.length} blocos) para depois das Referências.`);
  }

  // ── 8. Monta o body novo ──────────────────────────────────────────────────
  const restantes = blocos
    .map((b, i) => ({ b, i }))
    .filter(({ i }) => !apagar.has(i) && !(iApendice >= 0 && i >= iApendice && i < iSintese))
    .map(({ b }) => b);

  let saidaBlocos = restantes;
  if (movidos.length) {
    // ⚠ O destino tem de ser procurado DEPOIS do último microbloco: o SUMÁRIO no
    // início do documento também tem linhas "Referências" e "Apêndice — …", e
    // ancorar nelas joga o apêndice inteiro para o começo do livro.
    const ultimoCabSaida = restantes.reduce((a, b, i) => (RE_CABECALHO.test(desescapar(textoDe(b)).trim()) ? i : a), -1);
    if (ultimoCabSaida < 0) throw new Error('nenhum cabeçalho no documento de saída — abortado.');
    let destino = restantes.findIndex((b, i) => i > ultimoCabSaida && b.startsWith('<w:p') &&
      /^Ap[êe]ndice\b/.test(desescapar(textoDe(b)).trim()));
    if (destino < 0) destino = restantes.findIndex((b, i) => i > ultimoCabSaida && b.startsWith('<w:sectPr'));
    if (destino < 0) destino = restantes.length;
    console.log(`  destino: bloco ${destino} — antes de "${desescapar(textoDe(restantes[destino] || '')).trim().slice(0, 50)}"`);
    saidaBlocos = [...restantes.slice(0, destino), ...movidos, ...restantes.slice(destino)];
  }

  // ── 8b. Prova de que nenhum texto se perdeu ───────────────────────────────
  // Todo parágrafo que não é cabeçalho de MB nem parte da tabela do mapa tem de
  // sobreviver intacto — só a ORDEM pode mudar.
  const paragrafosDe = (arr: string[]) => arr
    .filter((b) => b.startsWith('<w:p') && !RE_CABECALHO.test(desescapar(textoDe(b)).trim()))
    .map((b) => desescapar(textoDe(b)))
    .filter((t) => t.trim());
  const antesP = paragrafosDe(blocos).sort();
  const depoisP = paragrafosDe(saidaBlocos).sort();
  if (antesP.length !== depoisP.length || antesP.some((t, i) => t !== depoisP[i])) {
    throw new Error(`texto alterado: ${antesP.length} parágrafos antes, ${depoisP.length} depois — abortado.`);
  }
  console.log(`\nintegridade: ${antesP.length} parágrafos de texto preservados byte a byte · ${fundidos.length} linhas de cabeçalho removidas`);

  const novoXml = cabeca + saidaBlocos.join('') + cauda;
  zip.file('word/document.xml', novoXml);
  const buf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  writeFileSync(SAIDA, buf);
  console.log(`\n✅ ${SAIDA} (${(buf.length / 1024).toFixed(0)} KB)`);
}

main().catch((e) => { console.error('ERRO:', e?.message || e); process.exit(1); });
