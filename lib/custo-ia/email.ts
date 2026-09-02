/**
 * O e-mail do relatório semanal de custo de IA.
 *
 * Separado da coleta de propósito: montar o HTML não toca a rede, então o
 * formato pode ser testado por asserção sobre a string — inclusive as partes
 * que existem para NÃO deixar o leitor concluir demais (a fatia de plataforma,
 * a nota de cobertura, o aviso de mudança de instrumento).
 *
 * Estilo: superfície CLARA e tokens de marca (navy `#0F2B54` como tinta
 * principal, cyan `#34C5CC` como acento). O app é escuro, mas e-mail não é tela
 * do produto.
 *
 * ⚠️ **Por que classes em `<style>` e não `style=` em cada célula.** A primeira
 * versão era toda inline, do jeito clássico de e-mail. Medido no relatório real
 * de 24–30/08: **91 KB, dos quais 70 KB eram os atributos `style=`** repetidos
 * em 420 células. O Gmail corta a mensagem em ~102 KB e mostra "[Mensagem
 * truncada]" — ou seja, a semana com mais tenants ia perder a metade de baixo
 * da tabela sem erro nenhum, exatamente o modo de falha que este relatório
 * existe para não ter. Com classes, o mesmo conteúdo cabe em ~30 KB.
 * O que varia por linha (a cor da variação, o alerta) continua inline, porque
 * ali a cor é informação. Cliente que descarte a folha ainda recebe tabelas
 * HTML legíveis, com todos os números.
 */

import type { BlocoEmpresa, BlocoPD, RelatorioSemanal } from './relatorio-semanal';
import { avisoInstrumento, rotuloPeriodo } from './relatorio-semanal';

const NAVY = '#0F2B54';
const CYAN = '#34C5CC';
const TINTA_FRACA = '#5b6b80';
const LINHA_COR = '#e3e8ef';
const SUCESSO = '#1F9D6B';
const ATENCAO = '#D9932B';

const CSS = `
.vh{background:#f7f7fb;padding:24px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Roboto,Arial,sans-serif;color:#1a2b42}
.vh-w{max-width:720px;margin:0 auto;padding:0 16px}
.vh-eyebrow{font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#5b6b80;margin:0 0 4px}
.vh-h1{font-size:22px;color:#0F2B54;margin:0 0 4px;font-weight:700}
.vh-sub{font-size:14px;color:#5b6b80;margin:0 0 20px}
.vh-h2{font-size:14px;color:#0F2B54;margin:0 0 10px;letter-spacing:.04em;text-transform:uppercase}
.vh-t{border-collapse:collapse;width:100%}
.vh-card{padding:16px;background:#ffffff;border:1px solid #e3e8ef;border-radius:16px}
.vh-hero{border-left:4px solid #34C5CC}
.vh-c{padding:7px 10px;border-bottom:1px solid #e3e8ef;font-size:13px}
.vh-r{text-align:right}
.vh-n{font-variant-numeric:tabular-nums}
.vh-b{font-weight:600}
.vh-d{color:#5b6b80}
.vh-th{padding:7px 10px;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#5b6b80;border-bottom:2px solid #e3e8ef;font-weight:600;text-align:left}
.vh-th-r{text-align:right}
.vh-nome{font-size:16px;font-weight:700;color:#0F2B54;padding-bottom:2px}
.vh-valor{font-size:18px;font-weight:700;color:#0F2B54;text-align:right;font-variant-numeric:tabular-nums}
.vh-meta{font-size:12px;color:#5b6b80;padding-bottom:12px}
.vh-total{margin:2px 0 0;font-size:32px;font-weight:700;color:#0F2B54;font-variant-numeric:tabular-nums}
.vh-nota{font-size:12px;color:#5b6b80;line-height:1.6;margin:0}
.vh-rodape{font-size:11px;color:#5b6b80;margin:18px 0 0;text-align:center}
.vh-aviso{padding:12px 16px;background:#fff8ec;border:1px solid #f0dcbb;border-radius:12px;font-size:13px;color:#7a5a1e}
.vh-sep{height:22px;line-height:22px;font-size:0}
`.trim();

/** Nome de empresa e de feature vêm do banco: escapar antes de concatenar. */
function esc(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function fmtUsd(v: number): string {
  if (v > 0 && v < 0.01) return 'menos de US$ 0,01';
  return `US$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtNum(v: number): string {
  return v.toLocaleString('pt-BR', { maximumFractionDigits: 0 });
}

/** 6.885.613 → "6,9 mi". Token em unidade cheia não diz nada a ninguém. */
function fmtTokens(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi`;
  if (v >= 1_000) return `${(v / 1_000).toLocaleString('pt-BR', { maximumFractionDigits: 0 })} mil`;
  return fmtNum(v);
}

function pct(parte: number, total: number): string {
  if (total <= 0) return '—';
  return `${((parte / total) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
}

/**
 * A variação contra a semana anterior, já com a leitura embutida.
 *
 * Um bloco que não existia na semana anterior é "novo", não "+∞%": dividir por
 * zero produziria um número que parece medição e não é.
 */
export function variacao(atual: number, anterior: number | null): { texto: string; cor: string } {
  if (anterior === null) return { texto: 'novo', cor: CYAN };
  if (anterior === 0) return { texto: atual > 0 ? 'novo' : '—', cor: CYAN };
  const delta = (atual - anterior) / anterior;
  const sinal = delta >= 0 ? '+' : '';
  return {
    texto: `${sinal}${(delta * 100).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}%`,
    cor: delta > 0.05 ? ATENCAO : delta < -0.05 ? SUCESSO : TINTA_FRACA,
  };
}

/** Acima disso, o detalhe da empresa vira lista longa sem virar informação. */
const TETO_DETALHE = 12;

/**
 * Corta a cauda, mas nunca em silêncio: o resto volta como uma linha própria,
 * somada e contada. Uma tabela cortada sem essa linha não fecha com o total do
 * topo, e quem confere acha que perdeu dinheiro.
 */
function comResto(itens: { nome: string; custoUsd: number; chamadas: number }[], rotulo: string) {
  if (itens.length <= TETO_DETALHE) return itens;
  const cabeca = itens.slice(0, TETO_DETALHE);
  const cauda = itens.slice(TETO_DETALHE);
  return [
    ...cabeca,
    {
      nome: `outras ${cauda.length} ${rotulo}`,
      custoUsd: cauda.reduce((s, i) => s + i.custoUsd, 0),
      chamadas: cauda.reduce((s, i) => s + i.chamadas, 0),
    },
  ];
}

function td(conteudo: string, classes = ''): string {
  return `<td class="vh-c${classes ? ' ' + classes : ''}">${conteudo}</td>`;
}

function cabecalhoTabela(colunas: { texto: string; alinha?: boolean }[]): string {
  const th = colunas
    .map((c) => `<th class="vh-th${c.alinha ? ' vh-th-r' : ''}">${c.texto}</th>`)
    .join('');
  return `<tr>${th}</tr>`;
}

/** O detalhe de UM bloco: no que aquele tenant gastou, e com que modelo. */
function detalheDoBloco(b: BlocoEmpresa, totalGeral: number): string {
  const features = comResto(b.features, 'atividades')
    .map(
      (f) =>
        `<tr>${td(esc(f.nome))}${td(fmtNum(f.chamadas), 'vh-r vh-d')}`
        + `${td(fmtUsd(f.custoUsd), 'vh-r vh-n')}${td(pct(f.custoUsd, b.custoUsd), 'vh-r vh-d')}</tr>`,
    )
    .join('');

  const modelos = comResto(b.modelos, 'modelos')
    .map(
      (m) =>
        `<tr>${td(esc(m.nome))}${td(fmtNum(m.chamadas), 'vh-r vh-d')}`
        + `${td(fmtUsd(m.custoUsd), 'vh-r vh-n')}</tr>`,
    )
    .join('');

  const v = variacao(b.custoUsd, b.custoAnteriorUsd);
  const alertas: string[] = [];
  if (b.linhasSemCusto > 0) {
    alertas.push(`${fmtNum(b.linhasSemCusto)} chamada(s) sem custo gravado — entram como zero nesta soma.`);
  }
  if (b.chamadasNaoOk > 0) {
    alertas.push(`${fmtNum(b.chamadasNaoOk)} chamada(s) terminaram fora do estado "ok".`);
  }

  return `<table role="presentation" cellpadding="0" cellspacing="0" class="vh-t" style="margin-bottom:22px">
<tr><td class="vh-card">
<table role="presentation" cellpadding="0" cellspacing="0" class="vh-t">
<tr><td class="vh-nome">${esc(b.nome)}${b.slug ? `<span class="vh-d" style="font-weight:400;font-size:12px"> · ${esc(b.slug)}</span>` : ''}</td>
<td class="vh-valor">${fmtUsd(b.custoUsd)}</td></tr>
<tr><td class="vh-meta">${fmtNum(b.chamadas)} chamadas · entrada ${fmtTokens(b.inputTokens)} · saída ${fmtTokens(b.outputTokens)}${b.cacheReadTokens > 0 ? ` · cache lido ${fmtTokens(b.cacheReadTokens)}` : ''}</td>
<td class="vh-meta vh-r">${pct(b.custoUsd, totalGeral)} do total · <span style="color:${v.cor};font-weight:600">${v.texto}</span> vs. semana anterior</td></tr>
</table>
<table role="presentation" cellpadding="0" cellspacing="0" class="vh-t">
${cabecalhoTabela([{ texto: 'Atividade' }, { texto: 'Chamadas', alinha: true }, { texto: 'Custo', alinha: true }, { texto: 'Peso', alinha: true }])}
${features}
</table>
<table role="presentation" cellpadding="0" cellspacing="0" class="vh-t" style="margin-top:14px">
${cabecalhoTabela([{ texto: 'Modelo' }, { texto: 'Chamadas', alinha: true }, { texto: 'Custo', alinha: true }])}
${modelos}
</table>
${alertas.length ? `<p style="font-size:12px;color:${ATENCAO};margin:12px 0 0">${alertas.map(esc).join('<br>')}</p>` : ''}
</td></tr></table>`;
}

/** O detalhe de UMA frente de P&D. Igual ao do tenant, mais de quem eram os dados. */
function detalheDaFrente(b: BlocoPD, totalPD: number): string {
  const features = comResto(b.features, 'atividades')
    .map(
      (f) =>
        `<tr>${td(esc(f.nome))}${td(fmtNum(f.chamadas), 'vh-r vh-d')}`
        + `${td(fmtUsd(f.custoUsd), 'vh-r vh-n')}${td(pct(f.custoUsd, b.custoUsd), 'vh-r vh-d')}</tr>`,
    )
    .join('');
  const modelos = comResto(b.modelos, 'modelos')
    .map(
      (m) =>
        `<tr>${td(esc(m.nome))}${td(fmtNum(m.chamadas), 'vh-r vh-d')}`
        + `${td(fmtUsd(m.custoUsd), 'vh-r vh-n')}</tr>`,
    )
    .join('');
  const v = variacao(b.custoUsd, b.custoAnteriorUsd);

  return `<table role="presentation" cellpadding="0" cellspacing="0" class="vh-t" style="margin-bottom:22px">
<tr><td class="vh-card">
<table role="presentation" cellpadding="0" cellspacing="0" class="vh-t">
<tr><td class="vh-nome">${esc(b.frente)}</td>
<td class="vh-valor">${fmtUsd(b.custoUsd)}</td></tr>
<tr><td class="vh-meta">${fmtNum(b.chamadas)} chamadas${
    b.tenants.length ? ` · dados de ${esc(b.tenants.join(', '))}` : ' · rodada sintética'
  }</td>
<td class="vh-meta vh-r">${pct(b.custoUsd, totalPD)} do P&amp;D · <span style="color:${v.cor};font-weight:600">${v.texto}</span> vs. semana anterior</td></tr>
</table>
<table role="presentation" cellpadding="0" cellspacing="0" class="vh-t">
${cabecalhoTabela([{ texto: 'Atividade' }, { texto: 'Chamadas', alinha: true }, { texto: 'Custo', alinha: true }, { texto: 'Peso', alinha: true }])}
${features}
</table>
<table role="presentation" cellpadding="0" cellspacing="0" class="vh-t" style="margin-top:14px">
${cabecalhoTabela([{ texto: 'Modelo' }, { texto: 'Chamadas', alinha: true }, { texto: 'Custo', alinha: true }])}
${modelos}
</table>
</td></tr></table>`;
}

/**
 * Piso para GANHAR um cartão de detalhe. Medido na semana 24–30/08: 12 frentes,
 * das quais 5 respondem por 97% do P&D e as outras 7 somam menos de US$ 1,60 —
 * doze cartões para isso enterram as duas que importam. Todas continuam na
 * tabela acima, com custo e variação; o que o piso corta é o detalhe, e o corte
 * é anunciado.
 */
const PISO_DETALHE_PD = 0.01;

function detalhesDoPD(r: RelatorioSemanal): string {
  if (!r.pd.length) return '';
  const relevantes = r.pd.filter((b) => b.custoUsd >= r.pdUsd * PISO_DETALHE_PD);
  const cortadas = r.pd.length - relevantes.length;
  return `<h2 class="vh-h2">Detalhe do P&amp;D</h2>
${relevantes.map((b) => detalheDaFrente(b, r.pdUsd)).join('')}
${
    cortadas > 0
      ? `<p class="vh-nota" style="margin:-8px 0 22px">Outras ${cortadas} frente(s) somaram `
        + `${fmtUsd(r.pd.slice(relevantes.length).reduce((s, b) => s + b.custoUsd, 0))} e estão na tabela acima, sem detalhe.</p>`
      : ''
  }`;
}

/**
 * Monta assunto e corpo. Puro — nada aqui toca rede nem relógio.
 *
 * O ASSUNTO carrega o total e o período: é a única linha que se lê antes de
 * decidir abrir, e um assunto genérico transforma um relatório semanal em algo
 * que se acumula fechado na caixa.
 */
export function montarEmailCustoIA(r: RelatorioSemanal): { assunto: string; html: string } {
  const periodo = rotuloPeriodo(r);

  if (r.semDados) {
    return {
      assunto: `[Vertho] Custo de IA · ${periodo} · nenhuma chamada registrada`,
      html: `<style>${CSS}</style><div class="vh"><div class="vh-w">
<p>Nenhuma chamada de IA foi registrada em <strong>${periodo}</strong>.</p>
<p class="vh-nota">Uma semana inteira sem uma linha no ledger é incomum e merece um olhar: pode ser
operação parada, ou a gravação do ledger falhando em silêncio. Os avisos ficam no log como
<code>[ia-ledger] NÃO gravou</code>.</p>
</div></div>`,
    };
  }

  const v = variacao(r.totalUsd, r.totalAnteriorUsd || null);
  const vOp = variacao(r.operacaoUsd, r.operacaoAnteriorUsd || null);
  const vPd = variacao(r.pdUsd, r.pdAnteriorUsd || null);
  const blocos = [...r.empresas, ...(r.plataforma ? [r.plataforma] : [])];

  const linhasTabela = blocos
    .map((b) => {
      const vb = variacao(b.custoUsd, b.custoAnteriorUsd);
      const nome = b.atribuida ? esc(b.nome) : `<span class="vh-d">${esc(b.nome)}</span>`;
      return `<tr>${td(nome)}${td(fmtUsd(b.custoUsd), 'vh-r vh-n vh-b')}`
        + `${td(pct(b.custoUsd, r.operacaoUsd), 'vh-r vh-d')}`
        + `${td(`<span style="color:${vb.cor};font-weight:600">${vb.texto}</span>`, 'vh-r')}`
        + `${td(fmtNum(b.chamadas), 'vh-r vh-d')}</tr>`;
    })
    .join('');

  const linhasPD = r.pd
    .map((b) => {
      const vb = variacao(b.custoUsd, b.custoAnteriorUsd);
      return `<tr>${td(esc(b.frente))}${td(fmtUsd(b.custoUsd), 'vh-r vh-n vh-b')}`
        + `${td(pct(b.custoUsd, r.pdUsd), 'vh-r vh-d')}`
        + `${td(`<span style="color:${vb.cor};font-weight:600">${vb.texto}</span>`, 'vh-r')}`
        + `${td(b.tenants.length ? esc(b.tenants.join(', ')) : 'sintética', 'vh-r vh-d')}</tr>`;
    })
    .join('');

  const aviso = avisoInstrumento(r);
  const totalTokens = r.inputTokens + r.outputTokens;

  const html = `<style>${CSS}</style>
<div class="vh"><div class="vh-w">

<p class="vh-eyebrow">Vertho · relatório semanal</p>
<h1 class="vh-h1">Custo de IA por empresa</h1>
<p class="vh-sub">${periodo} · fechado na segunda às 04:00 (horário de Brasília)</p>

<table role="presentation" cellpadding="0" cellspacing="0" class="vh-t" style="margin-bottom:22px">
<tr><td class="vh-card vh-hero">
<p class="vh-eyebrow" style="margin:0">Total da semana</p>
<p class="vh-total">${fmtUsd(r.totalUsd)}</p>
<p class="vh-nota" style="margin-top:6px;font-size:13px"><span style="color:${v.cor};font-weight:600">${v.texto}</span>
vs. ${fmtUsd(r.totalAnteriorUsd)} da semana anterior · ${fmtNum(r.totalChamadas)} chamadas · ${fmtTokens(totalTokens)} tokens</p>
<table role="presentation" cellpadding="0" cellspacing="0" class="vh-t" style="margin-top:12px;border-top:1px solid ${LINHA_COR};padding-top:8px">
<tr>
<td style="padding-top:10px;width:50%">
  <p class="vh-eyebrow" style="margin:0">Operação</p>
  <p style="margin:2px 0 0;font-size:20px;font-weight:700;color:${NAVY};font-variant-numeric:tabular-nums">${fmtUsd(r.operacaoUsd)}</p>
  <p class="vh-nota" style="margin:2px 0 0">${pct(r.operacaoUsd, r.totalUsd)} do total · <span style="color:${vOp.cor};font-weight:600">${vOp.texto}</span></p>
</td>
<td style="padding-top:10px;width:50%">
  <p class="vh-eyebrow" style="margin:0">Pesquisa e desenvolvimento</p>
  <p style="margin:2px 0 0;font-size:20px;font-weight:700;color:${NAVY};font-variant-numeric:tabular-nums">${fmtUsd(r.pdUsd)}</p>
  <p class="vh-nota" style="margin:2px 0 0">${pct(r.pdUsd, r.totalUsd)} do total · <span style="color:${vPd.cor};font-weight:600">${vPd.texto}</span></p>
</td>
</tr></table>
</td></tr></table>

<h2 class="vh-h2">Operação, por empresa</h2>
<p class="vh-nota" style="margin:-4px 0 10px">O que custou <strong>entregar</strong> a cada cliente na semana. É este número que sustenta preço.</p>
${
    blocos.length
      ? `<table role="presentation" cellpadding="0" cellspacing="0" class="vh-t" style="background:#ffffff;border:1px solid ${LINHA_COR};border-radius:16px;margin-bottom:28px">
${cabecalhoTabela([
          { texto: 'Empresa' },
          { texto: 'Custo', alinha: true },
          { texto: 'Peso', alinha: true },
          { texto: 'vs. anterior', alinha: true },
          { texto: 'Chamadas', alinha: true },
        ])}
${linhasTabela}
</table>`
      : `<p class="vh-nota" style="margin-bottom:24px">Nenhuma chamada de operação nesta semana.</p>`
  }

${
    r.pd.length
      ? `<h2 class="vh-h2">Pesquisa e desenvolvimento, por frente</h2>
<p class="vh-nota" style="margin:-4px 0 10px">Medir, comparar e experimentar. Sai do bloco do cliente mesmo quando usa os dados dele, e a coluna da direita diz de quem eram.</p>
<table role="presentation" cellpadding="0" cellspacing="0" class="vh-t" style="background:#ffffff;border:1px solid ${LINHA_COR};border-radius:16px;margin-bottom:28px">
${cabecalhoTabela([
          { texto: 'Frente' },
          { texto: 'Custo', alinha: true },
          { texto: 'Peso', alinha: true },
          { texto: 'vs. anterior', alinha: true },
          { texto: 'Dados de', alinha: true },
        ])}
${linhasPD}
</table>`
      : ''
  }

${blocos.length ? '<h2 class="vh-h2">Detalhe da operação</h2>' : ''}
${blocos.map((b) => detalheDoBloco(b, r.operacaoUsd)).join('')}

${detalhesDoPD(r)}

${aviso ? `<table role="presentation" cellpadding="0" cellspacing="0" class="vh-t" style="margin-bottom:16px"><tr><td class="vh-aviso">${esc(aviso)}</td></tr></table>` : ''}

<table role="presentation" cellpadding="0" cellspacing="0" class="vh-t">
<tr><td class="vh-card">
<p class="vh-eyebrow" style="color:${NAVY};font-weight:700;margin-bottom:6px">O que estes números cobrem</p>
<p class="vh-nota">A fonte é o ledger de IA, que registra as chamadas de modelo de linguagem e de áudio (TTS)
feitas pelo aplicativo. Ficam de fora os custos que não passam por ele: render de vídeo, avatar,
hospedagem de mídia e infraestrutura.${
    r.totalSemCusto > 0
      ? ` Nesta semana, ${fmtNum(r.totalSemCusto)} chamada(s) foram registradas sem valor de custo e entram como zero.`
      : ''
  } A fatia de plataforma reúne a operação que não tem empresa atribuída — autoria de conteúdo e
ferramentas próprias — e é custo real da Vertho, não de um cliente.</p>
<p class="vh-nota" style="margin-top:8px">Uma chamada entra como <strong>P&amp;D</strong> por duas
vias: quando quem a disparou declarou que era medição (simulação, eval, experimento, calibração), ou
quando ela pertence a um motor que ainda não tem nenhuma tela, rota ou tarefa chamando, como o Modo
Cena. A segunda via é conferida contra o código a cada build, então uma frente que entrar em produção
deixa de ser contada aqui em vez de ficar escondida.</p>
</td></tr></table>

<p class="vh-rodape">Gerado automaticamente pela vertho.ai · valores em dólar, como cobrados pelos provedores</p>
</div></div>`;

  return {
    assunto: `[Vertho] Custo de IA · ${periodo} · ${fmtUsd(r.totalUsd)}`,
    html,
  };
}
