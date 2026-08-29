/**
 * Confere o kit de kick-off preenchido pelo cliente ANTES de importar no app.
 *
 *   node scripts/_conferir-kit-kickoff.mjs "C:/caminho/da/pasta"
 *   node scripts/_conferir-kit-kickoff.mjs cargos.xlsx colaboradores.xlsx matriz.xlsx
 *
 * Por que existe: o importador do app é fail-loud por LINHA (recusa a linha e
 * segue), mas há três erros que ele NÃO tem como acusar e que só aparecem
 * semanas depois, com a jornada já rodando:
 *
 *   1. `cargo` escrito diferente entre as planilhas: a query que monta a
 *      avaliação é `.eq('cargo', cargo)`, casamento exato. A pessoa entra com
 *      ZERO competências e o assessment abre vazio, sem erro em lugar nenhum.
 *   2. `gestor_email` vazio ou apontando para quem não está na planilha: é a
 *      régua do gate de líder para liderado (lib/authz.ts::canViewColabJourney, F4 da
 *      auditoria de 10/08). O gestor vê a lista da equipe e não abre ninguém.
 *   3. cabeçalho fora do padrão: lib/parse-spreadsheet.ts monta a chave da
 *      coluna com trim().toLowerCase() e MAIS NADA (não tira acento, asterisco
 *      nem parênteses). "Cargo *" vira a chave "cargo *", que ninguém lê, e a
 *      importação inteira sai vazia.
 *
 * O script não escreve nada e não fala com o banco: lê os arquivos e reproduz
 * as mesmas réguas do app.
 */
import { readFile } from 'node:fs/promises';
import { readdirSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';
import { createRequire } from 'node:module';
import { readSheet } from 'read-excel-file/node';
import { parsePhoneNumberFromString as parseComMetadata } from 'libphonenumber-js/core';

const require = createRequire(import.meta.url);
// ⚠️ metadata explícita + desembrulho do `.default`: o subpath `/max` chega
// como `{ default: … }` sob o interop do runner e faz TODO número virar
// inválido em silêncio. Mesma armadilha documentada em lib/phone.ts.
const metadataRaw = require('libphonenumber-js/metadata.max.json');
const metadata = metadataRaw?.default ?? metadataRaw;

// -- Réguas copiadas do app (lib/phone.ts) ------------------------------------
const MOBILE_TYPES = new Set(['MOBILE', 'FIXED_LINE_OR_MOBILE']);

function tryParse(input, country) {
  try { return parseComMetadata(input, country, metadata) || null; } catch { return null; }
}

function parseAny(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const hadPlus = raw.startsWith('+');
  const digits = raw.replace(/\D/g, '');
  if (!digits) return null;
  if (hadPlus) return tryParse(`+${digits}`);
  if (digits.startsWith('00')) return tryParse(`+${digits.slice(2)}`);
  if (digits.startsWith('0') && (digits.length === 11 || digits.length === 12)) return tryParse(digits.slice(1), 'BR');
  if (digits.length === 10 || digits.length === 11) return tryParse(digits, 'BR');
  return tryParse(`+${digits}`);
}

function validarWhatsApp(value) {
  if (String(value ?? '').replace(/\D/g, '').length === 0) return { valid: false, error: 'vazio' };
  const p = parseAny(value);
  if (!p || !p.isValid()) return { valid: false, error: 'não existe no plano de numeração do país' };
  const type = p.getType();
  if (type && !MOBILE_TYPES.has(type)) return { valid: false, error: 'não é celular (WhatsApp exige móvel)' };
  return { valid: true, e164: p.number.replace('+', '') };
}

// Equivalente ao lib/email.ts: a mesma régua simples que o import aplica.
const isValidEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e ?? '').trim());

// -- Leitura no MESMO formato do app (lib/parse-spreadsheet.ts) ---------------
const normalizeKey = (raw) => String(raw ?? '').trim().toLowerCase().replace(/^["']|["']$/g, '');
const normalizeValue = (raw) => {
  if (raw == null) return '';
  if (raw instanceof Date) return raw.toISOString().slice(0, 10);
  return String(raw).trim();
};

async function lerAba1(file) {
  const rows = await readSheet(file); // aba 1: a única que o app lê
  if (!rows?.length) return { header: [], linhas: [] };
  const header = rows[0].map(normalizeKey);
  const linhas = rows.slice(1).map((cols, i) => {
    const o = { __linha: i + 2 };
    header.forEach((h, j) => { o[h] = normalizeValue(cols[j]); });
    return o;
  }).filter((o) => Object.entries(o).some(([k, v]) => k !== '__linha' && v));
  return { header, linhas };
}

// -- Relatório ----------------------------------------------------------------
const problemas = [];
const avisos = [];
const P = (arquivo, linha, campo, texto) => problemas.push({ arquivo, linha, campo, texto });
const A = (arquivo, linha, campo, texto) => avisos.push({ arquivo, linha, campo, texto });

const COLS_CARGOS = ['nome', 'area_depto', 'descricao', 'principais_entregas', 'stakeholders',
  'decisoes_recorrentes', 'tensoes_comuns', 'contexto_cultural', 'eh_lideranca'];
const COLS_COLABS = ['nome_completo', 'email', 'telefone', 'cargo', 'area_depto', 'role',
  'gestor_nome', 'gestor_email', 'gestor_whatsapp'];
const COLS_MATRIZ = ['cod_comp', 'nome', 'pilar', 'cargo', 'descricao', 'cod_desc', 'nome_curto',
  'descritor_completo', 'n1_gap', 'n2_desenvolvimento', 'n3_meta', 'n4_referencia',
  'evidencias_esperadas', 'perguntas_alvo'];

/** O app aceita sinônimos; se veio por um sinônimo, ainda importa, então é só aviso. */
const SINONIMOS_COLAB = {
  nome_completo: ['nome'], telefone: ['whatsapp', 'celular', 'fone'],
  area_depto: ['area', 'departamento', 'setor', 'depto'], role: ['papel'],
  gestor_nome: ['gestor'],
};
const SINONIMOS_CARGO = {
  nome: ['cargo'], area_depto: ['area', 'departamento'],
  principais_entregas: ['entregas'], decisoes_recorrentes: ['decisoes'],
  tensoes_comuns: ['tensoes'], contexto_cultural: ['contexto'], eh_lideranca: ['lideranca'],
};

function conferirCabecalho(arquivo, header, esperadas, sinonimos = {}) {
  const faltando = [];
  for (const c of esperadas) {
    if (header.includes(c)) continue;
    const alt = (sinonimos[c] || []).find((s) => header.includes(s));
    if (alt) { A(arquivo, 1, c, `veio como "${alt}": o app aceita, mas o padrão é "${c}"`); continue; }
    faltando.push(c);
  }
  const desconhecidas = header.filter((h) => h && !esperadas.includes(h)
    && !Object.values(sinonimos).flat().includes(h));
  for (const d of desconhecidas) {
    const parecida = esperadas.find((e) => normalizarTexto(e) === normalizarTexto(d));
    if (parecida) {
      P(arquivo, 1, d, `cabeçalho fora do padrão: "${d}". O app procura exatamente "${parecida}", então a coluna inteira é ignorada`);
    } else {
      A(arquivo, 1, d, `coluna "${d}" não é lida pelo app (será ignorada)`);
    }
  }
  return faltando;
}

const normalizarTexto = (s) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[^a-z0-9]/g, '');

/** Mesma chave que o app usa para casar cargo: nenhuma. É igualdade literal. */
const chaveCargo = (s) => String(s ?? '').trim();

async function main() {
  const args = process.argv.slice(2);
  if (!args.length) {
    console.error('uso: node scripts/_conferir-kit-kickoff.mjs <pasta | arquivo.xlsx ...>');
    process.exit(2);
  }

  let arquivos = [];
  for (const a of args) {
    if (statSync(a).isDirectory()) {
      arquivos.push(...readdirSync(a).filter((f) => /\.xlsx$/i.test(f) && !f.startsWith('~$')).map((f) => join(a, f)));
    } else arquivos.push(a);
  }

  // Identifica cada arquivo pelo cabeçalho da aba 1 (não pelo nome do arquivo).
  let cargos = null, colabs = null, matriz = null;
  const naoIdentificados = [];
  for (const f of arquivos) {
    const { header, linhas } = await lerAba1(f);
    const nome = basename(f);
    const tem = (c) => header.includes(c);
    if (tem('n1_gap') || tem('n2_desenvolvimento')) matriz = { nome, header, linhas };
    else if (tem('nome_completo') || tem('email') || tem('gestor_email')) colabs = { nome, header, linhas };
    else if (tem('nome') || tem('cargo')) cargos = { nome, header, linhas };
    else naoIdentificados.push({ nome, header });
  }

  for (const { nome, header } of naoIdentificados) {
    P(nome, 1, '(arquivo)', `a ABA 1 não parece uma planilha de dados: cabeçalho lido: ${JSON.stringify(header)}. O app lê SEMPRE a aba 1: mova a aba de dados para a primeira posição`);
  }

  // -- CARGOS ----------------------------------------------------------------
  const cargosValidos = new Set();
  if (cargos) {
    // Modelo devolvido em branco: sem isso o relatório sairia verde e o kit
    // vazio pareceria aprovado.
    if (!cargos.linhas.length) P(cargos.nome, 1, '(planilha)', 'nenhuma linha preenchida: só o cabeçalho');
    const faltando = conferirCabecalho(cargos.nome, cargos.header, COLS_CARGOS, SINONIMOS_CARGO);
    if (faltando.includes('nome')) P(cargos.nome, 1, 'nome', 'coluna obrigatória ausente: nenhum cargo será importado');
    for (const l of cargos.linhas) {
      const nome = l.nome || l.cargo;
      if (!nome) { P(cargos.nome, l.__linha, 'nome', 'sem nome de cargo: a linha é descartada'); continue; }
      if (cargosValidos.has(chaveCargo(nome))) A(cargos.nome, l.__linha, 'nome', `cargo repetido ("${nome}"): a importação ignora a duplicata`);
      cargosValidos.add(chaveCargo(nome));
      if (!(l.descricao || '').trim()) A(cargos.nome, l.__linha, 'descricao', `"${nome}" sem descrição: é o campo que mais muda a qualidade das competências e dos cenários`);
      const lid = (l.eh_lideranca ?? l.lideranca ?? '').trim();
      if (!lid) A(cargos.nome, l.__linha, 'eh_lideranca', `"${nome}" em branco: entra como NÃO-liderança`);
      else if (lid !== 'sim' && lid !== 'nao') P(cargos.nome, l.__linha, 'eh_lideranca', `"${lid}" não é lido: o app só reconhece a palavra sim (minúscula). Qualquer outra coisa vira não-liderança`);
    }
  } else {
    P('(kit)', 0, 'cargos', 'planilha de CARGOS não encontrada');
  }

  // -- COLABORADORES ---------------------------------------------------------
  const emailsPorPessoa = new Map();
  if (colabs) {
    if (!colabs.linhas.length) P(colabs.nome, 1, '(planilha)', 'nenhuma linha preenchida: só o cabeçalho');
    const faltando = conferirCabecalho(colabs.nome, colabs.header, COLS_COLABS, SINONIMOS_COLAB);
    for (const c of faltando) {
      if (['nome_completo', 'email', 'telefone', 'cargo', 'role'].includes(c)) P(colabs.nome, 1, c, 'coluna obrigatória ausente');
      else A(colabs.nome, 1, c, 'coluna ausente (opcional)');
    }

    const vistos = new Set();
    for (const l of colabs.linhas) {
      const ln = l.__linha;
      const nome = l.nome_completo || l.nome;
      const email = (l.email || '').trim().toLowerCase();
      const tel = l.telefone || l.whatsapp || l.celular || l.fone;
      const cargo = l.cargo;
      const role = (l.role || l.papel || '').trim().toLowerCase();

      if (!nome) A(colabs.nome, ln, 'nome_completo', 'sem nome: a pessoa é importada, mas aparece sem nome na plataforma e no WhatsApp');

      const emailOk = isValidEmail(email);
      const wa = validarWhatsApp(tel);
      if (!emailOk && !wa.valid) {
        P(colabs.nome, ln, 'email/telefone', `${nome || '(sem nome)'}: sem e-mail válido E sem celular válido (${wa.error}): a LINHA NÃO É IMPORTADA`);
      } else if (!emailOk && wa.valid) {
        A(colabs.nome, ln, 'email', `${nome}: sem e-mail: entra por login via WhatsApp (${wa.e164})`);
      } else if (emailOk && String(tel ?? '').trim() && !wa.valid) {
        P(colabs.nome, ln, 'telefone', `${nome}: "${tel}" ${wa.error}: o campo é DESCARTADO e a pessoa fica sem canal de WhatsApp`);
      } else if (emailOk && !String(tel ?? '').trim()) {
        A(colabs.nome, ln, 'telefone', `${nome}: sem celular: não recebe o diagnóstico nem a jornada pelo WhatsApp`);
      }

      const chave = emailOk ? email : (wa.valid ? `wa:${wa.e164}` : null);
      if (chave) {
        if (vistos.has(chave)) A(colabs.nome, ln, 'email', `${nome}: repetido na planilha: a importação mantém só a primeira ocorrência`);
        vistos.add(chave);
      }
      // Primeira ocorrência vence: é o que o import faz ao deduplicar. Sem isso,
      // uma linha repetida no fim do arquivo sequestra o e-mail do líder e todo
      // gestor_email que aponta pra ele passa a ser reportado errado.
      if (emailOk && !emailsPorPessoa.has(email)) emailsPorPessoa.set(email, { nome, linha: ln, role });

      if (!String(cargo ?? '').trim()) {
        P(colabs.nome, ln, 'cargo', `${nome}: sem cargo: fica sem competências, sem avaliação e sem PDI`);
      } else if (cargos && cargosValidos.size && !cargosValidos.has(chaveCargo(cargo))) {
        const quase = [...cargosValidos].find((c) => normalizarTexto(c) === normalizarTexto(cargo));
        P(colabs.nome, ln, 'cargo', quase
          ? `${nome}: "${cargo}" não é idêntico a "${quase}" da planilha de cargos. O casamento é literal: a pessoa entra SEM competências`
          : `${nome}: cargo "${cargo}" não existe na planilha de cargos: a pessoa entra SEM competências`);
      }

      if (role && !['colaborador', 'gestor', 'rh'].includes(role)) {
        P(colabs.nome, ln, 'role', `"${role}" não é reconhecido: a pessoa entra como colaborador`);
      }
      if (role === 'rh') A(colabs.nome, ln, 'role', `${nome} terá acesso ADMINISTRATIVO à instituição inteira, inclusive aos dados de todos. Confirme que é intencional`);
    }

    // gestor_email: a régua do gate de líder para liderado
    let comGestor = 0;
    for (const l of colabs.linhas) {
      const ge = (l.gestor_email || '').trim().toLowerCase();
      const nome = l.nome_completo || l.nome;
      if (!ge) continue;
      comGestor += 1;
      if (!isValidEmail(ge)) { P(colabs.nome, l.__linha, 'gestor_email', `${nome}: "${l.gestor_email}" não é um e-mail válido: o campo é descartado e o líder não enxerga essa pessoa`); continue; }
      const alvo = emailsPorPessoa.get(ge);
      if (!alvo) P(colabs.nome, l.__linha, 'gestor_email', `${nome}: "${ge}" não é o e-mail de ninguém nesta planilha: o líder não vai conseguir abrir a jornada dessa pessoa`);
      else if (alvo.role !== 'gestor' && alvo.role !== 'rh') A(colabs.nome, l.__linha, 'gestor_email', `${nome} aponta para ${alvo.nome} (linha ${alvo.linha}), que está como "${alvo.role || 'colaborador'}": para abrir o painel da equipe, essa pessoa precisa ser gestor`);
    }
    const gestores = colabs.linhas.filter((l) => (l.role || l.papel || '').trim().toLowerCase() === 'gestor');
    if (gestores.length && comGestor === 0) {
      P(colabs.nome, 1, 'gestor_email', `há ${gestores.length} pessoa(s) marcada(s) como gestor e NENHUMA linha com gestor_email preenchido. O gestor vai abrir o painel da equipe e não vai ver ninguém: e o relatório de equipe não é gerado`);
    }
    if (!gestores.length) A(colabs.nome, 1, 'role', 'ninguém marcado como gestor: a degustação não mostra a visão do líder');

    const unidades = new Set(colabs.linhas.map((l) => (l.area_depto || '').trim()).filter(Boolean));
    if (unidades.size) {
      console.log(`\nUnidades encontradas em area_depto (viram "escola" e casam com o PPP): ${[...unidades].map((u) => `"${u}"`).join(', ')}`);
      console.log('Confira se cada uma corresponde ao nome de uma unidade real. Termos como "Pedagógico",');
      console.log('"Secretaria" ou "Administrativo" são tratados como time central e ficam sem escola (rede).');
    }
  } else {
    P('(kit)', 0, 'colaboradores', 'planilha de COLABORADORES não encontrada');
  }

  // -- MATRIZ (opcional) -----------------------------------------------------
  if (matriz) {
    conferirCabecalho(matriz.nome, matriz.header, COLS_MATRIZ);
    const OBRIG = ['nome', 'descricao', 'n1_gap', 'n2_desenvolvimento', 'n4_referencia'];
    let anterior = {};
    for (const l of matriz.linhas) {
      // forward-fill igual ao do app
      const preenchida = { ...l };
      for (const k of ['nome', 'cod_comp', 'pilar', 'cargo', 'descricao', 'evidencias_esperadas', 'perguntas_alvo']) {
        if (!preenchida[k]?.trim() && anterior[k]?.trim()) preenchida[k] = anterior[k];
      }
      if (!preenchida.nome?.trim()) { A(matriz.nome, l.__linha, 'nome', 'linha sem competência: descartada'); continue; }
      anterior = preenchida;

      const vazios = OBRIG.filter((k) => !preenchida[k]?.trim());
      if (vazios.length) P(matriz.nome, l.__linha, vazios.join('/'), `"${preenchida.nome}": campo(s) obrigatório(s) em branco: a linha é recusada`);
      if (!preenchida.n3_meta?.trim()) A(matriz.nome, l.__linha, 'n3_meta', `"${preenchida.nome}": nível 3 em branco: a régua fica com um degrau faltando`);

      const cargo = (preenchida.cargo || '').trim();
      if (!cargo) P(matriz.nome, l.__linha, 'cargo', `"${preenchida.nome}": sem cargo: a competência não chega a ninguém`);
      else if (cargosValidos.size && !cargosValidos.has(chaveCargo(cargo))) {
        const quase = [...cargosValidos].find((c) => normalizarTexto(c) === normalizarTexto(cargo));
        P(matriz.nome, l.__linha, 'cargo', quase
          ? `"${cargo}" não é idêntico a "${quase}" da planilha de cargos: a competência não chega a ninguém`
          : `"${cargo}" não existe na planilha de cargos: a competência não chega a ninguém`);
      }
    }
    // Cargos com pessoas mas sem nenhuma competência na matriz
    if (colabs) {
      const cargosNaMatriz = new Set(matriz.linhas.map((l) => chaveCargo(l.cargo)).filter(Boolean));
      const cargosComGente = new Set(colabs.linhas.map((l) => chaveCargo(l.cargo)).filter(Boolean));
      for (const c of cargosComGente) {
        if (!cargosNaMatriz.has(c)) A(matriz.nome, 0, 'cargo', `nenhuma competência para "${c}", que tem gente na planilha: a Vertho monta a matriz desse cargo`);
      }
    }
  }

  // -- Saída -----------------------------------------------------------------
  const fmt = (x) => `  ${x.arquivo}${x.linha ? ` linha ${x.linha}` : ''} · ${x.campo}\n      ${x.texto}`;
  console.log('\n' + '='.repeat(78));
  console.log('CONFERÊNCIA DO KIT DE KICK-OFF');
  console.log('='.repeat(78));
  console.log(`arquivos lidos: ${arquivos.map((f) => basename(f)).join(', ') || '(nenhum)'}`);
  if (cargos) console.log(`cargos: ${cargos.linhas.length} linha(s)`);
  if (colabs) console.log(`colaboradores: ${colabs.linhas.length} linha(s)`);
  if (matriz) console.log(`matriz: ${matriz.linhas.length} linha(s)`);

  if (problemas.length) {
    console.log(`\nBLOQUEIOS (${problemas.length}): corrija antes de importar:`);
    problemas.forEach((p) => console.log(fmt(p)));
  }
  if (avisos.length) {
    console.log(`\nAVISOS (${avisos.length}): importa mesmo assim, confira se é o esperado:`);
    avisos.forEach((a) => console.log(fmt(a)));
  }
  if (!problemas.length && !avisos.length) console.log('\nNada a corrigir. O kit está pronto para importar.');
  else if (!problemas.length) console.log('\nNenhum bloqueio. O kit pode ser importado.');

  console.log('');
  process.exit(problemas.length ? 1 : 0);
}

main().catch((e) => { console.error('falha ao conferir:', e); process.exit(2); });
