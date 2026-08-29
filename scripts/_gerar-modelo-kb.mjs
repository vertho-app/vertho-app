/**
 * Gera o MODELO (.docx) do manuscrito-base de uma competência, com a grade de
 * microblocos já numerada, e o GUIA de escrita que o acompanha.
 *
 *   node scripts/_gerar-modelo-kb.mjs --out "C:/pasta"
 *   node scripts/_gerar-modelo-kb.mjs --out . --cod SED09 --cargo "Gestor Educacional" \
 *        --competencia "Comunicação Institucional" \
 *        --descritores "Escuta ativa;Clareza da mensagem;Postura em conflito;Registro;Devolutiva;Articulação"
 *
 * Por que um modelo, e não uma instrução em prosa: a faixa de maturidade de cada
 * microbloco é lida do NÚMERO dele (lib/manuscrito-parser.ts §"O nível está
 * codificado no NÚMERO"), e a numeração salta entre capítulos (1,2,13,14,25,26,
 * 37,38,49 no primeiro descritor). Quem escreve não deveria ter que calcular
 * isso: errar um número faz o parser reprovar o manuscrito inteiro, ou pior,
 * rotular conteúdo de N3 como N4 sem sintoma na tela. O modelo entrega a grade
 * pronta e quem escreve só preenche o texto.
 *
 * O modelo sai no esquema POR-FAIXA de propósito. O parser aceita também o
 * sequencial (1-9, 10-18, ...), mas nesse esquema ele PULA a conferência cruzada
 * (`if (!sequencial)`): a numeração deixa de ser testemunha independente da
 * posição, e um microbloco fora de ordem passa despercebido. Como aqui a
 * numeração vem pronta, fica-se com a verificação dupla sem custo nenhum para
 * quem escreve.
 *
 * Depois de preencher, conferir SEMPRE com:
 *   npx tsx scripts/_verificar-manuscrito.ts "<arquivo.docx>"
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import JSZip from 'jszip';

// -- Marca (documento de superficie clara) -----------------------------------
const NAVY = '0F2B54';
const CYAN = '34C5CC';
const INK = '1B2A3D';
const INK_DIM = '5B6B7F';
const PAPER = 'F2F4F8';

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

/** Um parágrafo. `o`: { fonte, tam (meio-pontos), negrito, italico, cor, antes, depois, fundo, alinhamento, borda } */
function par(texto, o = {}) {
  const rpr = [
    `<w:rFonts w:ascii="${o.fonte || 'Calibri'}" w:hAnsi="${o.fonte || 'Calibri'}"/>`,
    o.negrito ? '<w:b/>' : '',
    o.italico ? '<w:i/>' : '',
    `<w:color w:val="${o.cor || INK}"/>`,
    `<w:sz w:val="${o.tam || 21}"/>`,
    o.espacamento ? `<w:spacing w:val="${o.espacamento}"/>` : '',
  ].join('');
  const bordas = o.borda
    ? `<w:pBdr><w:bottom w:val="single" w:sz="8" w:space="4" w:color="${o.borda}"/></w:pBdr>`
    : (o.filete ? `<w:pBdr><w:left w:val="single" w:sz="18" w:space="8" w:color="${o.filete}"/></w:pBdr>` : '');
  const ppr = [
    '<w:pPr>',
    bordas,
    o.fundo ? `<w:shd w:val="clear" w:color="auto" w:fill="${o.fundo}"/>` : '',
    o.alinhamento ? `<w:jc w:val="${o.alinhamento}"/>` : '',
    o.recuo ? `<w:ind w:left="${o.recuo}"/>` : '',
    `<w:spacing w:before="${o.antes ?? 0}" w:after="${o.depois ?? 120}"/>`,
    o.quebraAntes ? '<w:pageBreakBefore/>' : '',
    `<w:rPr>${rpr}</w:rPr>`,
    '</w:pPr>',
  ].join('');
  return `<w:p>${ppr}<w:r><w:rPr>${rpr}</w:rPr><w:t xml:space="preserve">${esc(texto)}</w:t></w:r></w:p>`;
}

const vazio = () => par('', { depois: 0 });

function celula(texto, larguraDxa, o = {}) {
  return [
    '<w:tc>',
    `<w:tcPr><w:tcW w:w="${larguraDxa}" w:type="dxa"/>`,
    o.fundo ? `<w:shd w:val="clear" w:color="auto" w:fill="${o.fundo}"/>` : '',
    '<w:tcMar><w:top w:w="80" w:type="dxa"/><w:bottom w:w="80" w:type="dxa"/>'
      + '<w:left w:w="110" w:type="dxa"/><w:right w:w="110" w:type="dxa"/></w:tcMar>',
    '</w:tcPr>',
    par(texto, o),
    '</w:tc>',
  ].join('');
}

function tabela(larguras, linhas, o = {}) {
  const borda = (lado) => `<w:${lado} w:val="single" w:sz="4" w:space="0" w:color="D8DEE8"/>`;
  const trs = linhas.map((cels, i) => {
    const cab = i === 0;
    return '<w:tr>' + cels.map((c, j) => celula(c, larguras[j], {
      negrito: cab, cor: cab ? 'FFFFFF' : INK, tam: cab ? 18 : 18,
      fundo: cab ? NAVY : (i % 2 === 0 ? PAPER : undefined), depois: 0,
      fonte: o.fonte,
    })).join('') + '</w:tr>';
  });
  return [
    '<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/><w:tblBorders>',
    borda('top'), borda('left'), borda('bottom'), borda('right'),
    borda('insideH'), borda('insideV'),
    '</w:tblBorders></w:tblPr>',
    trs.join(''),
    '</w:tbl>',
    par('', { depois: 0 }),
  ].join('');
}

function montarDocx(corpo) {
  const zip = new JSZip();
  zip.file('[Content_Types].xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
    + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
    + '<Default Extension="xml" ContentType="application/xml"/>'
    + '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
    + '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>'
    + '</Types>');
  zip.folder('_rels').file('.rels',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>'
    + '</Relationships>');
  zip.folder('word').folder('_rels').file('document.xml.rels',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
    + '</Relationships>');
  zip.folder('word').file('styles.xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
    + '<w:docDefaults><w:rPrDefault><w:rPr>'
    + '<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/>'
    + `<w:color w:val="${INK}"/><w:sz w:val="21"/>`
    + '</w:rPr></w:rPrDefault></w:docDefaults>'
    + '</w:styles>');
  zip.folder('word').file('document.xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>'
    + corpo
    + '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/>'
    + '<w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="708" w:footer="708"/>'
    + '</w:sectPr></w:body></w:document>');
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

// -- Grade de microblocos -----------------------------------------------------
const FAIXAS = ['N1', 'N2', 'N3', 'N4'];

/**
 * Verbo canônico da faixa (lib/manuscrito-parser.ts e docs/EXTRACAO-MANUSCRITO.md §1),
 * com a preposição que faz a frase fechar quando o assunto é concatenado. Nada no
 * código depende do verbo exato: a ação é guardada como texto e serve a quem lê e
 * à geração do módulo, então quem escreve pode reescrevê-la.
 */
const ACOES = {
  N1: ['Reconhecer o gap em', 'Identificar evidências mínimas de'],
  N2: ['Estruturar rotina de', 'Aplicar critério em'],
  N3: ['Conduzir com consistência a prática de', 'Aprimorar a prática de'],
  N4: ['Transformar em referência a prática de', 'Transferir método de'],
  SINTESE: ['Consolidar em ciclo real a prática de'],
};

const RESUMO_FAIXA = {
  N1: 'Nível 1, a lacuna. Quem está aqui ainda não reconhece o problema, ou reconhece e não sabe por onde começar. Escreva o retrato honesto dessa situação, sem julgamento, e o primeiro sinal que a pessoa consegue observar sozinha.',
  N2: 'Nível 2, em desenvolvimento. A pessoa já age, ainda apoiada em orientação, roteiro ou pedido de terceiros. Escreva a rotina mínima que sustenta a prática e o critério que ela usa para decidir.',
  N3: 'Nível 3, a meta. A prática é autônoma e consistente, e a pessoa ajusta o próprio método diante de situações novas. Escreva o que muda quando a decisão deixa de depender de alguém dizer o que fazer.',
  N4: 'Nível 4, referência. A pessoa desenvolve outras, cria método e influencia a instituição além do próprio posto. Escreva o que ela faz que sobrevive à saída dela.',
  SINTESE: 'Síntese do descritor. Um ciclo completo e real, do começo ao fim, atravessando os quatro níveis. É o que ancora o exemplo integrado nos três módulos gerados a partir deste capítulo.',
};

/**
 * Numeração POR-FAIXA, a mesma fórmula que o parser confere:
 *   MB = (faixa-1) x tamanhoFaixa + (descritor-1) x mbsPorFaixa + k
 *   MB da síntese = 4 x tamanhoFaixa + descritor
 */
function gradeDeMicroblocos(nDesc, mbsPorFaixa, comSintese) {
  const tamanhoFaixa = nDesc * mbsPorFaixa;
  const porDescritor = [];
  for (let d = 1; d <= nDesc; d++) {
    const itens = [];
    FAIXAS.forEach((faixa, fi) => {
      for (let k = 1; k <= mbsPorFaixa; k++) {
        itens.push({
          num: fi * tamanhoFaixa + (d - 1) * mbsPorFaixa + k,
          faixa,
          acao: ACOES[faixa][(k - 1) % ACOES[faixa].length],
        });
      }
    });
    if (comSintese) {
      itens.push({ num: 4 * tamanhoFaixa + d, faixa: 'SINTESE', acao: ACOES.SINTESE[0] });
    }
    porDescritor.push(itens);
  }
  return porDescritor;
}

const mb = (n) => `MB${String(n).padStart(2, '0')}`;

// -- O MODELO -----------------------------------------------------------------
function corpoModelo(cfg) {
  const { cod, cargo, competencia, subtitulo, descritores, mbsPorFaixa, comSintese } = cfg;
  const grade = gradeDeMicroblocos(descritores.length, mbsPorFaixa, comSintese);
  const out = [];

  // As DUAS primeiras linhas do documento viram titulo e subtitulo no parser.
  // Nada pode vir antes delas.
  out.push(par(competencia, { fonte: 'Georgia', tam: 40, negrito: true, cor: NAVY, depois: 60 }));
  out.push(par(subtitulo, { tam: 24, cor: INK_DIM, depois: 200 }));
  out.push(par(`Manuscrito-base · ${cargo} · ${cod}`, { tam: 20, negrito: true, cor: CYAN, depois: 320 }));

  out.push(par('Antes de escrever', { fonte: 'Georgia', tam: 26, negrito: true, cor: NAVY, borda: CYAN, antes: 120, depois: 140 }));
  out.push(par('Substitua o título, o subtítulo e a linha acima pelos dados reais desta competência. O código precisa ter de duas a cinco letras maiúsculas seguidas de dois dígitos, como SED08.', { depois: 100 }));
  out.push(par('Não altere, não reordene e não renumere as linhas de identificação dos microblocos: elas já vêm na convenção que o sistema lê, e o número é o que define o nível de maturidade daquele trecho.', { depois: 100 }));
  out.push(par('Escreva o texto de cada microbloco no lugar do parágrafo em cinza, e troque a linha em negrito acima dele pelo título editorial que você quiser dar à seção.', { depois: 100 }));
  out.push(par('Cada microbloco costuma ficar entre 8.000 e 12.000 caracteres. Um capítulo inteiro com menos de 2.000 caracteres por par de níveis entra com aviso de conteúdo insuficiente.', { depois: 100 }));
  out.push(par('O guia que acompanha este modelo explica o que escrever em cada nível.', { italico: true, cor: INK_DIM, depois: 0 }));

  descritores.forEach((nomeDesc, di) => {
    out.push(par(`Capítulo ${di + 1} — ${nomeDesc}`, {
      fonte: 'Georgia', tam: 30, negrito: true, cor: NAVY, borda: CYAN,
      quebraAntes: true, antes: 0, depois: 160,
    }));
    out.push(par(`Descritor ${di + 1} de ${descritores.length}. Substitua o nome acima e, se mudar, repita o mesmo texto em todas as linhas de identificação deste capítulo: é por ele que o sistema agrupa os microblocos.`, {
      tam: 18, italico: true, cor: INK_DIM, depois: 200,
    }));

    let faixaAtual = null;
    grade[di].forEach((item) => {
      if (item.faixa !== faixaAtual) {
        faixaAtual = item.faixa;
        out.push(par(item.faixa === 'SINTESE' ? 'Consolidação' : `Faixa ${item.faixa}`, {
          tam: 18, negrito: true, cor: CYAN, espacamento: 18, antes: 240, depois: 60,
        }));
        out.push(par(RESUMO_FAIXA[item.faixa], {
          tam: 18, cor: INK_DIM, italico: true, fundo: PAPER, filete: CYAN, recuo: 160, depois: 140,
        }));
      }

      // Titulo editorial: o parser le a ultima linha nao-vazia ANTES da
      // identificacao, entao esta linha precisa ficar colada nela.
      out.push(par(`[Título editorial do ${mb(item.num)}]`, {
        fonte: 'Georgia', tam: 24, negrito: true, cor: NAVY, antes: 160, depois: 40,
      }));
      out.push(par(`${cargo} | ${cod} | ${nomeDesc} | ID: ${cod}_${mb(item.num)} | ${item.acao} ${nomeDesc.toLowerCase()}`, {
        tam: 17, cor: INK_DIM, fundo: PAPER, depois: 100,
      }));
      out.push(par('[Escreva aqui o texto deste microbloco. Apague este parágrafo.]', {
        cor: '9AA6B5', italico: true, depois: 160,
      }));
    });
  });

  // Cauda. O parser corta o conteudo na primeira linha iniciada por "Síntese"
  // que aparece DEPOIS do último microbloco: nada abaixo daqui vira módulo.
  out.push(par('Síntese final', {
    fonte: 'Georgia', tam: 30, negrito: true, cor: NAVY, borda: CYAN,
    quebraAntes: true, antes: 0, depois: 160,
  }));
  out.push(par('Fechamento do manuscrito, na sua voz: o que muda na instituição quando esta competência amadurece. Este texto é guardado e não vira módulo.', {
    cor: INK_DIM, italico: true, depois: 100,
  }));
  out.push(par('[Escreva aqui a síntese final.]', { cor: '9AA6B5', italico: true, depois: 0 }));

  out.push(par('Apêndice — Recomendações de recursos', {
    fonte: 'Georgia', tam: 26, negrito: true, cor: NAVY, borda: CYAN,
    quebraAntes: true, antes: 0, depois: 140,
  }));
  out.push(par('Materiais externos que apoiam esta competência. Viram sugestões de conteúdo na plataforma. A tabela é opcional: se ficar vazia, o restante do manuscrito importa normalmente. Não mude a ordem das colunas.', {
    tam: 18, cor: INK_DIM, depois: 140,
  }));
  // Linhas TOTALMENTE vazias, sem placeholder: `parsearRecursos` filtra por
  // `c.some(Boolean)`, então um "Vídeo" ou um "https://" de exemplo esquecido
  // aqui entraria como sugestão de conteúdo vazia na plataforma.
  out.push(tabela([1200, 2600, 1800, 2400, 2400, 1800], [
    ['Tipo', 'Título', 'Fonte', 'Link', 'Conexão formativa', 'Observações'],
    ['', '', '', '', '', ''],
    ['', '', '', '', '', ''],
    ['', '', '', '', '', ''],
  ]));
  out.push(par('Tipos reconhecidos: vídeo, webinar e documentário entram como vídeo; podcast e áudio como áudio; PDF, guia e manual como PDF; estudo de caso como case. Qualquer outro vira texto.', {
    tam: 17, italico: true, cor: INK_DIM, depois: 0,
  }));

  out.push(par('Apêndice — Mapa dos microblocos', {
    fonte: 'Georgia', tam: 26, negrito: true, cor: NAVY, borda: CYAN,
    quebraAntes: true, antes: 0, depois: 140,
  }));
  out.push(par('A grade já numerada deste manuscrito. Serve de conferência: se algum número aqui não bater com a linha de identificação no corpo do texto, o import é recusado.', {
    tam: 18, cor: INK_DIM, depois: 140,
  }));
  const linhasMapa = [['ID', 'Capítulo', 'Descritor', 'Nível']];
  descritores.forEach((nomeDesc, di) => {
    grade[di].forEach((item) => {
      linhasMapa.push([
        `${cod}_${mb(item.num)}`, String(di + 1), nomeDesc,
        item.faixa === 'SINTESE' ? 'síntese' : item.faixa,
      ]);
    });
  });
  out.push(tabela([1800, 1100, 4200, 1200], linhasMapa));

  return out.join('');
}

// -- O GUIA -------------------------------------------------------------------
function corpoGuia(cfg) {
  const { mbsPorFaixa, comSintese } = cfg;
  const nDesc = 6;
  const porDesc = mbsPorFaixa * 4 + (comSintese ? 1 : 0);
  const out = [];

  out.push(par('Como escrever o manuscrito-base de uma competência', {
    fonte: 'Georgia', tam: 36, negrito: true, cor: NAVY, depois: 60,
  }));
  out.push(par('Guia de escrita para autoras e autores', { tam: 24, cor: INK_DIM, depois: 260 }));

  const secao = (t) => out.push(par(t, {
    fonte: 'Georgia', tam: 28, negrito: true, cor: NAVY, borda: CYAN, antes: 320, depois: 140,
  }));
  const texto = (t, o = {}) => out.push(par(t, { depois: 110, ...o }));
  const nota = (t) => out.push(par(t, {
    tam: 19, fundo: PAPER, filete: CYAN, recuo: 160, depois: 140,
  }));

  texto('Um manuscrito cobre uma competência e é dividido em capítulos, um por descritor. Dentro de cada capítulo, o texto é escrito em blocos curtos e independentes, chamados microblocos. Cada microbloco descreve um comportamento observável num nível de maturidade.');
  texto('O que a plataforma faz com ele: para cada descritor, ela junta dois níveis vizinhos mais a consolidação e gera um módulo de conteúdo sobre essa passagem. São três módulos por capítulo, um para cada degrau da régua.');
  nota('O modelo que acompanha este guia já vem com a grade inteira numerada. Escreva dentro dele. A numeração é o que diz à plataforma a que nível cada trecho pertence, e recalculá-la à mão é a origem da maioria das recusas de importação.');

  secao('A régua de maturidade');
  texto('Todo descritor é percorrido em quatro níveis. O manuscrito precisa dos quatro, porque o produto ensina a passagem de um para o outro, e não o nível isolado.');
  out.push(tabela([1000, 2600, 6200], [
    ['Nível', 'Em uma linha', 'O que escrever'],
    ['N1', 'A lacuna', RESUMO_FAIXA.N1.replace(/^Nível 1, a lacuna\. /, '')],
    ['N2', 'Em desenvolvimento', RESUMO_FAIXA.N2.replace(/^Nível 2, em desenvolvimento\. /, '')],
    ['N3', 'A meta', RESUMO_FAIXA.N3.replace(/^Nível 3, a meta\. /, '')],
    ['N4', 'Referência', RESUMO_FAIXA.N4.replace(/^Nível 4, referência\. /, '')],
    ['Síntese', 'O ciclo completo', RESUMO_FAIXA.SINTESE.replace(/^Síntese do descritor\. /, '')],
  ]));

  secao('O tamanho da grade');
  texto(`O modelo padrão traz ${nDesc} capítulos com ${mbsPorFaixa} microblocos por nível${comSintese ? ' mais uma consolidação' : ''}, ou seja, ${porDesc} microblocos por capítulo e ${nDesc * porDesc} no manuscrito inteiro. Isso rende ${nDesc * 3} módulos de conteúdo.`);
  texto('A quantidade por nível pode variar de capítulo para capítulo, desde que cada capítulo feche certo: o mesmo número de microblocos em cada um dos quatro níveis, mais no máximo uma consolidação. Um capítulo com quatro microblocos é válido (um por nível). Um com sete não é.');
  nota('Acrescentar ou remover um microbloco obriga a renumerar o documento inteiro, porque o número carrega o nível. Peça o modelo com o tamanho certo antes de começar, em vez de abrir um MB extra no fim.');

  secao('A linha de identificação');
  texto('Antes do texto de cada microbloco existe uma linha com cinco campos separados por barra vertical. É por ela que a plataforma reconhece o trecho. Ela já vem preenchida no modelo.');
  out.push(tabela([2200, 7600], [
    ['Campo', 'O que é'],
    ['Cargo', 'O cargo a que o manuscrito se dirige. Igual em todas as linhas.'],
    ['Código', 'O código da competência, de duas a cinco letras maiúsculas e dois dígitos. Igual em todas as linhas.'],
    ['Descritor', 'O nome do descritor daquele capítulo. Igual em todas as linhas do mesmo capítulo, e é por ele que os microblocos são agrupados.'],
    ['ID', 'O identificador do microbloco. É daqui que sai o nível. Nunca altere.'],
    ['Ação', 'O verbo do nível, seguido do assunto. Ajuda quem lê e orienta a geração do módulo.'],
  ]));
  nota('Se você renomear um descritor, troque o nome em todas as linhas de identificação daquele capítulo. Um nome divergente cria um capítulo fantasma com poucos microblocos, e o manuscrito é recusado.');

  secao('O título editorial');
  texto('A linha em negrito imediatamente acima da identificação é o título da seção, e é ele que aparece como nome do trecho. Escreva um título que descreva a cena, não o conceito. "O técnico que só aparece na crise" funciona melhor que "Presença junto às unidades".');
  nota('Esse título precisa ficar colado na linha de identificação, sem parágrafo em branco entre os dois. O sistema lê como título a última linha preenchida antes da identificação.');

  secao('O que não fazer');
  const naoFazer = [
    'Não mude a ordem dos capítulos nem dos microblocos dentro do capítulo.',
    'Não apague nem edite os identificadores. Renumerar à mão é a causa mais comum de recusa.',
    'Não escreva o texto em PDF nem cole imagem de página escaneada: o arquivo precisa ser o .docx com o texto de verdade.',
    'Não junte duas competências no mesmo arquivo. Um manuscrito, uma competência.',
    'Não deixe um microbloco vazio. Se um nível não tiver conteúdo, o capítulo inteiro fica sem o módulo daquela passagem.',
    'Não coloque bibliografia, apêndice ou anexo antes da Síntese final: tudo que vier antes dela é lido como conteúdo do último microbloco.',
  ];
  naoFazer.forEach((t) => out.push(par(`•   ${t}`, { recuo: 200, depois: 90 })));

  secao('Antes de entregar');
  const checklist = [
    'O título, o subtítulo e a linha "Manuscrito-base" no alto trazem os dados reais.',
    'Todos os microblocos têm texto, e nenhum parágrafo de instrução em cinza sobrou.',
    'Cada capítulo tem o nome do descritor repetido em todas as linhas de identificação.',
    'A Síntese final está preenchida.',
    'O arquivo é .docx.',
  ];
  checklist.forEach((t) => out.push(par(`☐   ${t}`, { recuo: 200, depois: 90 })));
  texto('A Vertho passa o arquivo pela conferência automática antes de importar. Ela aponta o microbloco e o motivo quando algo não fecha, então um erro de numeração não custa mais do que uma correção pontual.', { antes: 140, italico: true, cor: INK_DIM });

  return out.join('');
}

// -- CLI ----------------------------------------------------------------------
function args() {
  const a = process.argv.slice(2);
  const get = (nome, def) => {
    const i = a.indexOf(`--${nome}`);
    return i >= 0 && a[i + 1] ? a[i + 1] : def;
  };
  const descritores = get('descritores', '').trim();
  return {
    out: get('out', '.'),
    cod: get('cod', 'COD01'),
    codInformado: a.includes('--cod'),
    cargo: get('cargo', 'Cargo do manuscrito'),
    competencia: get('competencia', 'Nome da competência'),
    subtitulo: get('subtitulo', 'Subtítulo da competência'),
    descritores: descritores
      ? descritores.split(';').map((s) => s.trim()).filter(Boolean)
      : Array.from({ length: 6 }, (_, i) => `Nome do descritor ${i + 1}`),
    mbsPorFaixa: Number(get('mbs-por-faixa', 2)),
    comSintese: get('sem-sintese', null) === null,
  };
}

async function main() {
  const cfg = args();
  if (!/^[A-Z]{2,5}\d{2}$/.test(cfg.cod)) {
    console.error(`Código inválido: "${cfg.cod}". Use de 2 a 5 letras maiúsculas + 2 dígitos (ex.: SED08).`);
    process.exit(2);
  }
  if (cfg.descritores.length < 4) {
    console.error(`${cfg.descritores.length} descritores. O parser exige pelo menos 4.`);
    process.exit(2);
  }
  mkdirSync(cfg.out, { recursive: true });

  // Sem --cod, o modelo é o genérico da pasta de modelos; com --cod, o arquivo
  // já nasce identificado pela competência a que pertence.
  const modelo = join(cfg.out, cfg.codInformado
    ? `Vertho_KB_${cfg.cod}_MODELO.docx`
    : 'Vertho_KB_MODELO_em_branco.docx');
  const guia = join(cfg.out, 'Vertho_KB_GUIA_de_escrita.docx');
  writeFileSync(modelo, await montarDocx(corpoModelo(cfg)));
  writeFileSync(guia, await montarDocx(corpoGuia(cfg)));

  const total = cfg.descritores.length * (cfg.mbsPorFaixa * 4 + (cfg.comSintese ? 1 : 0));
  console.log(`modelo: ${modelo}`);
  console.log(`guia:   ${guia}`);
  console.log(`grade:  ${cfg.descritores.length} capítulos x ${cfg.mbsPorFaixa} MB/faixa`
    + `${cfg.comSintese ? ' + síntese' : ''} = ${total} microblocos, ${cfg.descritores.length * 3} módulos`);
  console.log(`\nConfira o preenchido com:\n  npx tsx scripts/_verificar-manuscrito.ts "<arquivo.docx>"`);
}

main().catch((e) => { console.error(e); process.exit(1); });
