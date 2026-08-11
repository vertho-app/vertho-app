// Aplica as correções do revisor cético sobre o insumo do manual.
//   dados/telas-<bloco>.json        (documentação original)
// + dados/verificacao-<bloco>.json  (correções aplicáveis + controles faltando)
// → dados/final-<bloco>.json        (o que o manual publica)
//
// Correção que não casa com nenhuma tela/controle NÃO é ignorada em silêncio:
// sai na tela e entra no relatório. Aplicar 8 de 10 e dizer "pronto" é o modo de
// falha que este script existe para evitar.
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const DADOS = fileURLToPath(new URL('../../deliverables/manual-telas/dados/', import.meta.url));

const norm = (s) => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

const relatorio = { blocos: [], aplicadas: 0, adicionados: 0, orfas: [], semVerificacao: [] };

for (const arq of readdirSync(DADOS).filter((f) => /^telas-.*\.json$/.test(f))) {
  const chave = arq.replace(/^telas-|\.json$/g, '');
  const doc = JSON.parse(readFileSync(path.join(DADOS, arq), 'utf8'));
  const arqVerif = path.join(DADOS, `verificacao-${chave}.json`);

  if (!existsSync(arqVerif)) {
    doc._verificado = false;
    writeFileSync(path.join(DADOS, `final-${chave}.json`), JSON.stringify(doc, null, 2), 'utf8');
    relatorio.semVerificacao.push(chave);
    relatorio.blocos.push({ bloco: chave, verificado: false, aplicadas: 0, adicionados: 0 });
    continue;
  }

  // Um agente pode ter gravado o array cru em vez do objeto. Ler `bruto.correcoes`
  // direto devolveria undefined e o script diria "0 correções" — falha silenciosa,
  // que é exatamente o que não pode acontecer num passo de verificação.
  const bruto = JSON.parse(readFileSync(arqVerif, 'utf8'));
  const objeto = Array.isArray(bruto) ? { correcoes: bruto, controlesFaltando: [], veredito: '' } : bruto;
  const correcoes = objeto.correcoes || [];
  const faltando = objeto.controlesFaltando || [];
  if (!Array.isArray(objeto.correcoes)) {
    console.log(`⚠ ${chave}: verificacao-${chave}.json sem campo "correcoes" — formato inesperado, nada aplicado`);
  }
  let aplicadas = 0;
  let adicionados = 0;

  const acharTela = (rota) =>
    doc.telas.find((t) => norm(t.rota) === norm(rota))
    || doc.telas.find((t) => norm(t.rota).split('?')[0] === norm(rota).split('?')[0]);

  for (const c of correcoes) {
    const tela = acharTela(c.rota);
    if (!tela) { relatorio.orfas.push(`${chave} · ${c.rota} · ${c.campo} (tela não encontrada)`); continue; }
    if (c.alvo === 'tela') {
      tela[c.campo] = c.valorCorreto;
      aplicadas++;
      continue;
    }
    const ctrl = (tela.controles || []).find((x) => norm(x.rotulo) === norm(c.rotuloControle))
      || (tela.controles || []).find((x) => norm(x.rotulo).includes(norm(c.rotuloControle || '~~')));
    if (!ctrl) { relatorio.orfas.push(`${chave} · ${c.rota} · controle "${c.rotuloControle}" · ${c.campo}`); continue; }
    ctrl[c.campo] = c.valorCorreto;
    aplicadas++;
  }

  for (const f of faltando) {
    const tela = acharTela(f.rota);
    if (!tela) { relatorio.orfas.push(`${chave} · ${f.rota} · controle novo "${f.rotulo}" (tela não encontrada)`); continue; }
    tela.controles = tela.controles || [];
    if (tela.controles.some((x) => norm(x.rotulo) === norm(f.rotulo))) continue;
    const { rota, ...resto } = f;
    tela.controles.push(resto);
    adicionados++;
  }

  doc._verificado = true;
  doc._correcoesAplicadas = aplicadas;
  doc._controlesAdicionados = adicionados;
  doc._veredito = objeto.veredito || '';
  writeFileSync(path.join(DADOS, `final-${chave}.json`), JSON.stringify(doc, null, 2), 'utf8');

  relatorio.aplicadas += aplicadas;
  relatorio.adicionados += adicionados;
  relatorio.blocos.push({ bloco: chave, verificado: true, aplicadas, adicionados });
}

for (const b of relatorio.blocos) {
  console.log(`${b.verificado ? '✓' : '·'} ${b.bloco.padEnd(20)} correções: ${String(b.aplicadas).padStart(3)}   controles novos: ${String(b.adicionados).padStart(2)}`);
}
console.log(`\nTOTAL: ${relatorio.aplicadas} correções aplicadas · ${relatorio.adicionados} controles acrescentados`);
if (relatorio.semVerificacao.length) console.log(`⚠ ${relatorio.semVerificacao.length} bloco(s) SEM verificação: ${relatorio.semVerificacao.join(', ')}`);
if (relatorio.orfas.length) {
  console.log(`⚠ ${relatorio.orfas.length} correção(ões) que não casaram com nada:`);
  relatorio.orfas.forEach((o) => console.log(`   - ${o}`));
}
writeFileSync(path.join(DADOS, '_relatorio-correcoes.json'), JSON.stringify(relatorio, null, 2), 'utf8');
