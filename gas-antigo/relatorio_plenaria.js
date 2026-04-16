// ═══════════════════════════════════════════════════════════════════════════════
// relatorio_plenaria.js — Relatório Consolidado de Plenária (Visão Coletiva)
// Vertho Mentor IA v2.2 — Passo 4
// Relatório anônimo para apresentação pública em plenária escolar.
// ═══════════════════════════════════════════════════════════════════════════════

var PLENARIA_ID_PASTA = '107Sq2qVxlrmQGkKvTKT3JQ6XUQQ1r5HX';
var PLENARIA_LOGO_ID  = '1hBzuxzTNN4OEcii4BD6nHx8NgC6CQp9J';

// ── PONTO DE ENTRADA ────────────────────────────────────────────────────────

function gerarRelatorioPlenaria() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  _carregarCFG();
  SpreadsheetApp.getActive().toast('Coletando dados agregados...', '📊 Plenária', 10);

  var dados = _plenariaColetarDados(ss);
  if (!dados || dados.totalColaboradores === 0) {
    SpreadsheetApp.getUi().alert('Nenhum colaborador avaliado encontrado.');
    return;
  }

  SpreadsheetApp.getActive().toast('[' + Config.modelLabel((_CFG && _CFG.modelo) || Config.MODEL_RELATORIO) + ']\n' + dados.totalColaboradores + ' profissionais | ' + dados.competencias.length + ' competências', '📊 Gerando relatório...', 30);

  var systemPrompt = _plenariaBuildSystemPrompt();
  var userPrompt   = _plenariaBuildUserPrompt(dados);
  var analise      = _plenariaChamarIA(systemPrompt, userPrompt);

  SpreadsheetApp.getActive().toast('Gerando PDF...', '📊 Plenária', 10);
  var url = _plenariaSalvarDoc(analise, dados);

  SpreadsheetApp.getActive().toast('Relatório gerado! ' + url, '✅ Plenária', 15);
}


// ── PONTO DE ENTRADA FORESEA ──────────────────────────────────────────────

function gerarRelatorioPlenariaForesea() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  _carregarCFG();
  SpreadsheetApp.getActive().toast('Coletando dados agregados...', '📊 Plenária Foresea', 10);

  var dados = _plenariaColetarDados(ss);
  if (!dados || dados.totalColaboradores === 0) {
    SpreadsheetApp.getUi().alert('Nenhum colaborador avaliado encontrado.');
    return;
  }

  SpreadsheetApp.getActive().toast('[' + Config.modelLabel((_CFG && _CFG.modelo) || Config.MODEL_RELATORIO) + ']\n' + dados.totalColaboradores + ' profissionais | ' + dados.competencias.length + ' competências', '📊 Gerando relatório Foresea...', 30);

  var systemPrompt = _plenariaBuildSystemPrompt();
  var userPrompt   = _plenariaBuildUserPrompt(dados);
  var analise      = _plenariaChamarIA(systemPrompt, userPrompt);

  SpreadsheetApp.getActive().toast('Gerando PDF Foresea...', '📊 Plenária', 10);
  var url = _plenariaSalvarDoc(analise, dados, 'foresea');

  SpreadsheetApp.getActive().toast('Relatório Foresea gerado! ' + url, '✅ Plenária', 15);
}


// ═══════════════════════════════════════════════════════════════════════════════
// 1. COLETA DE DADOS AGREGADOS (com descritores)
// ═══════════════════════════════════════════════════════════════════════════════

function _plenariaColetarDados(ss) {
  var wsRespostas = ss.getSheetByName('Respostas');
  if (!wsRespostas) throw new Error('Aba "Respostas" não encontrada.');

  var headers = wsRespostas.getRange(1, 1, 1, wsRespostas.getLastColumn()).getValues()[0];
  var dados   = wsRespostas.getDataRange().getValues();

  var _h = function(l) {
    return headers.findIndex(function(h) { return _norm(h||'').toLowerCase().includes(l.toLowerCase()); });
  };

  var iEmail   = _h('e-mail'); if (iEmail < 0) iEmail = _h('id colaborador');
  var iNome    = _h('nome colaborador');
  var iEmpresa = _h('empresa');
  var iComp    = _h('nome competência'); if (iComp < 0) iComp = _h('nome compet');
  var iNivel   = _h('nível ia4');        if (iNivel < 0) iNivel = _h('nivel ia4');
  var iNota    = _h('nota ia4');
  var iStatus  = _h('status ia 4');      if (iStatus < 0) iStatus = _h('status ia4');
  var iPayload = _h('payload ia4');
  var iValPayload = _h('valores payload');

  // V2: Ler descritores de Competencias_v2
  var descritoresPorComp = {};
  var mapaV2 = _lerBaseCompetenciasV2(ss);
  Object.keys(mapaV2).forEach(function(cod) {
    var c = mapaV2[cod];
    var nomeKey = c.nome.toLowerCase();
    descritoresPorComp[nomeKey] = c.descritores.map(function(d) { return d.nome_curto; });
  });
  Logger.log('Plenária descritoresPorComp (V2): ' + JSON.stringify(Object.keys(descritoresPorComp).map(function(k) { return k + '=' + descritoresPorComp[k].length; })));

  // Agregar por competência + valores
  var porComp = {};
  var emailsVistos = {};
  var nomeEscola = '';
  var escolasSet = {};
  var valoresAgregados = {};  // { "Etica e integridade": { alinhado: 0, tensao: 0, violacao: 0, sem_evidencia: 0 } }

  dados.slice(1).forEach(function(row) {
    var status = _norm(String(row[iStatus]||'')).toLowerCase();
    if (status !== 'avaliado' && !status.includes('pdf') && !status.includes('conclu')) return;
    var email = _norm(String(row[iEmail]||''));
    if (!email) return;

    emailsVistos[email] = true;
    if (iEmpresa >= 0) {
      var esc = _norm(String(row[iEmpresa]||'')).trim();
      if (esc) escolasSet[esc] = true;
    }

    var compNome = _norm(String(row[iComp]||''));
    if (!compNome) return;

    var nota  = parseFloat(String(row[iNota]||'0').replace(',','.')) || 0;
    var nivelRaw = iNivel >= 0 ? parseInt(row[iNivel]) : 0;
    // Se nível não vier da coluna, derivar da nota: <1.5→1, <2.5→2, <3.5→3, >=3.5→4
    var nivel = (nivelRaw >= 1 && nivelRaw <= 4)
      ? nivelRaw
      : nota >= 3.5 ? 4 : nota >= 2.5 ? 3 : nota >= 1.5 ? 2 : 1;

    // Extrair descritores do payload
    var payload = null;
    if (iPayload >= 0 && row[iPayload]) {
      try { payload = JSON.parse(String(row[iPayload])); } catch(_) {}
    }

    // Se nivel/nota das colunas estão zerados, derivar da média dos descritores no payload
    if (nivel === 1 && nota <= 1 && payload) {
      var _npdDerive = (payload.consolidacao && payload.consolidacao.notas_por_descritor) || null;
      if (_npdDerive) {
        var _listaD = Array.isArray(_npdDerive) ? _npdDerive : Object.values(_npdDerive);
        if (_listaD.length > 0) {
          var _somaD = _listaD.reduce(function(s, d) { return s + (parseInt(d.nivel)||1); }, 0);
          var _mediaD = _somaD / _listaD.length;
          nivel = _mediaD >= 3.5 ? 4 : _mediaD >= 2.5 ? 3 : _mediaD >= 1.5 ? 2 : 1;
          if (!nota) nota = parseFloat(_mediaD.toFixed(2));
        }
      }
    }

    if (!nota) nota = nivel;

    if (!porComp[compNome]) {
      porComp[compNome] = { nome: compNome, notas: [], niveis: [], descritoresAgregados: {} };
    }
    porComp[compNome].notas.push(nota);
    porComp[compNome].niveis.push(nivel);
    if (payload) {
      // V2: descritores[] com cod e nivel (novo formato)
      // Legado: consolidacao.notas_por_descritor
      var npd = (payload.descritores && Array.isArray(payload.descritores))
        ? payload.descritores.map(function(d) { return { nome: d.cod || d.nome_curto || d.nome || ('D' + d.numero), nivel: d.nivel }; })
        : (payload.consolidacao && payload.consolidacao.notas_por_descritor) || null;
      if (npd) {
        var lista = Array.isArray(npd) ? npd : Object.values(npd);
        // Lista de descritores válidos para esta competência (da aba Competencias)
        var descritoresValidos = descritoresPorComp[compNome.toLowerCase()] || [];
        var _descValido = function(nomeD) {
          if (!descritoresValidos.length) return true; // sem lista = aceita tudo
          var nd = nomeD.trim().toLowerCase();
          return descritoresValidos.some(function(dv) {
            return dv.trim().toLowerCase() === nd || dv.trim().toLowerCase().includes(nd) || nd.includes(dv.trim().toLowerCase());
          });
        };
        lista.forEach(function(d) {
          var nomeD = d.nome || d.descritor || ('D' + d.numero);
          if (!nomeD) return;
          // Filtrar descritores que não pertencem a esta competência
          if (!_descValido(nomeD)) {
            Logger.log('Plenária: descritor ignorado "' + nomeD + '" para comp "' + compNome + '"');
            return;
          }
          if (!porComp[compNome].descritoresAgregados[nomeD]) {
            porComp[compNome].descritoresAgregados[nomeD] = { n1: 0, n2: 0, n3: 0, n4: 0, total: 0 };
          }
          var nv = Math.min(Math.max(parseInt(d.nivel)||1, 1), 4);
          porComp[compNome].descritoresAgregados[nomeD]['n' + nv]++;
          porComp[compNome].descritoresAgregados[nomeD].total++;
        });
      }
      // fallback: avaliacao_por_resposta
      if (!npd && payload.avaliacao_por_resposta) {
        var descValFallback = descritoresPorComp[compNome.toLowerCase()] || [];
        var _descValidoFb = function(nomeD) {
          if (!descValFallback.length) return true;
          var nd = nomeD.trim().toLowerCase();
          return descValFallback.some(function(dv) {
            return dv.trim().toLowerCase() === nd || dv.trim().toLowerCase().includes(nd) || nd.includes(dv.trim().toLowerCase());
          });
        };
        // Deduplicar: cada descritor contado uma única vez por colaborador (maior nível entre respostas)
        var maxNivelPorDesc = {};
        ['R1','R2','R3','R4'].forEach(function(rk) {
          var ri = payload.avaliacao_por_resposta[rk];
          if (!ri || !ri.descritores_avaliados) return;
          (ri.descritores_avaliados||[]).forEach(function(d) {
            var nomeD = d.nome || d.descritor || ('D' + d.numero);
            if (!nomeD || !_descValidoFb(nomeD)) return;
            var nv = Math.min(Math.max(parseInt(d.nivel)||1, 1), 4);
            maxNivelPorDesc[nomeD] = Math.max(maxNivelPorDesc[nomeD] || 0, nv);
          });
        });
        Object.keys(maxNivelPorDesc).forEach(function(nomeD) {
          if (!porComp[compNome].descritoresAgregados[nomeD]) {
            porComp[compNome].descritoresAgregados[nomeD] = { n1: 0, n2: 0, n3: 0, n4: 0, total: 0 };
          }
          var nv = maxNivelPorDesc[nomeD];
          porComp[compNome].descritoresAgregados[nomeD]['n' + nv]++;
          porComp[compNome].descritoresAgregados[nomeD].total++;
        });
      }
    }

    // Coletar avaliação de valores
    if (iValPayload >= 0 && row[iValPayload]) {
      try {
        var vArr = JSON.parse(String(row[iValPayload]));
        if (Array.isArray(vArr)) {
          vArr.forEach(function(v) {
            if (!v || !v.valor || !v.status) return;
            var vNome = v.valor;
            if (!valoresAgregados[vNome]) {
              valoresAgregados[vNome] = { alinhado: 0, tensao: 0, violacao: 0, sem_evidencia: 0, total: 0 };
            }
            var st = v.status.toLowerCase().replace('ã', 'a').replace('ê', 'e');
            if (valoresAgregados[vNome][st] !== undefined) {
              valoresAgregados[vNome][st]++;
            }
            valoresAgregados[vNome].total++;
          });
        }
      } catch(_) {}
    }
  });

  var totalColab = Object.keys(emailsVistos).length;
  if (totalColab === 0) return { totalColaboradores: 0 };

  // Calcular estatísticas
  var competencias = Object.values(porComp).map(function(c) {
    var soma = c.notas.reduce(function(s,v) { return s+v; }, 0);
    var media = parseFloat((soma / c.notas.length).toFixed(2));

    // Distribuição por nível
    var dist = { n1: 0, n2: 0, n3: 0, n4: 0 };
    c.niveis.forEach(function(n) { dist['n' + Math.min(Math.max(n,1),4)]++; });
    var total = c.niveis.length;

    // Descritores: começar com lista completa da aba Competencias, sobrepor payload
    var descBase = descritoresPorComp[c.nome.toLowerCase()] || [];
    var agregados = c.descritoresAgregados;
    var totalColab = c.niveis.length || 1;

    // Normalizar nomes para matching
    var _normalizar = function(s) { return (s||'').toLowerCase().replace(/\s+/g,' ').trim(); };
    var agregadoNorm = {};
    Object.keys(agregados).forEach(function(k) { agregadoNorm[_normalizar(k)] = agregados[k]; });

    var descritores = [];
    // 1. Incluir todos da aba Competencias (garante os 8)
    descBase.forEach(function(nomeDesc) {
      var norm = _normalizar(nomeDesc);
      var d = agregadoNorm[norm] || null;
      if (d) {
        var t = d.total || 1;
        descritores.push({
          nome: nomeDesc,
          pct_n1: Math.round(d.n1 / t * 100),
          pct_n2: Math.round(d.n2 / t * 100),
          pct_n3: Math.round(d.n3 / t * 100),
          pct_n4: Math.round(d.n4 / t * 100),
        });
        delete agregadoNorm[norm]; // marcar como já incluído
      } else {
        // Descritor da aba mas sem dados no payload — sem avaliação
        descritores.push({ nome: nomeDesc, pct_n1: 0, pct_n2: 0, pct_n3: 0, pct_n4: 0 });
      }
    });
    // 2. Incluir descritores do payload que não estavam na aba Competencias
    Object.keys(agregadoNorm).forEach(function(norm) {
      var d = agregadoNorm[norm];
      var t = d.total || 1;
      // Buscar nome original do agregados
      var nomeOrig = Object.keys(agregados).filter(function(k) { return _normalizar(k) === norm; })[0] || norm;
      descritores.push({
        nome: nomeOrig,
        pct_n1: Math.round(d.n1 / t * 100),
        pct_n2: Math.round(d.n2 / t * 100),
        pct_n3: Math.round(d.n3 / t * 100),
        pct_n4: Math.round(d.n4 / t * 100),
      });
    });

    // Ordenar descritores por nota média crescente
    descritores.sort(function(a, b) {
      var mediaA = (a.pct_n1 * 1 + a.pct_n2 * 2 + a.pct_n3 * 3 + a.pct_n4 * 4) / 100;
      var mediaB = (b.pct_n1 * 1 + b.pct_n2 * 2 + b.pct_n3 * 3 + b.pct_n4 * 4) / 100;
      return mediaA - mediaB;
    });

    return {
      competencia: c.nome,
      media: media,
      total_avaliacoes: total,
      pct_n1: Math.round(dist.n1 / total * 100),
      pct_n2: Math.round(dist.n2 / total * 100),
      pct_n3: Math.round(dist.n3 / total * 100),
      pct_n4: Math.round(dist.n4 / total * 100),
      descritores: descritores,
    };
  }).sort(function(a,b) { return a.media - b.media; });

  // Distribuição geral — % de COLABORADORES em cada nível (todas as avaliações)
  var distGeralColab = { n1: 0, n2: 0, n3: 0, n4: 0 };
  var totalAvalColab = 0;
  competencias.forEach(function(c) {
    var cObj = porComp[c.competencia];
    cObj.niveis.forEach(function(n) {
      distGeralColab['n' + Math.min(Math.max(n, 1), 4)]++;
      totalAvalColab++;
    });
  });
  var totalAval = totalAvalColab || 1;

  // Perfil comportamental do grupo (DISC agregado)
  var perfilGrupo = _plenariaColetarPerfilGrupo(ss, Object.keys(emailsVistos));

  // Montar nome da escola: se há várias, listar todas
  var escolasArr = Object.keys(escolasSet);
  if (escolasArr.length > 1) {
    nomeEscola = escolasArr.join(' | ');
  } else if (escolasArr.length === 1) {
    nomeEscola = escolasArr[0];
  }

  return {
    escola: nomeEscola,
    escolas: escolasArr,
    totalColaboradores: totalColab,
    competencias: competencias,
    distribuicao_geral: {
      n1_pct: Math.round(distGeralColab.n1 / totalAval * 100),
      n2_pct: Math.round(distGeralColab.n2 / totalAval * 100),
      n3_pct: Math.round(distGeralColab.n3 / totalAval * 100),
      n4_pct: Math.round(distGeralColab.n4 / totalAval * 100),
    },
    perfilGrupo: perfilGrupo,
    valoresAgregados: Object.keys(valoresAgregados).map(function(nome) {
      var v = valoresAgregados[nome];
      var t = v.total || 1;
      return {
        valor: nome,
        alinhado_pct: Math.round(v.alinhado / t * 100),
        tensao_pct: Math.round(v.tensao / t * 100),
        violacao_pct: Math.round(v.violacao / t * 100),
        sem_evidencia_pct: Math.round(v.sem_evidencia / t * 100),
        total: v.total,
      };
    }),
    data: Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy'),
  };
}

/**
 * Coleta perfis DISC agregados do grupo para visão plenária.
 */
function _plenariaColetarPerfilGrupo(ss, emailsList) {
  var wsColab = ss.getSheetByName('Colaboradores');
  if (!wsColab || wsColab.getLastRow() < 5) return null;

  var dados   = wsColab.getDataRange().getValues();
  var headers = dados[3]; // linha 4 = headers
  var _h = function(l) { return headers.findIndex(function(h) { return _norm(String(h||'')).toLowerCase().includes(l.toLowerCase()); }); };

  var iEmail  = _h('e-mail');  if (iEmail < 0) iEmail = _h('email');
  var iPerfil = _h('perfil comportament');
  var iD = _h('d natural'), iI = _h('i natural'), iS = _h('s natural'), iC = _h('c natural');

  if (iEmail < 0) return null;

  var emailsSet = {};
  emailsList.forEach(function(e) { emailsSet[e.toLowerCase().trim()] = true; });

  var perfis = {};   // contagem: {"Alto S": 3, "Alto D": 2, ...}
  var somaD = 0, somaI = 0, somaS = 0, somaC = 0;
  var count = 0;

  for (var r = 4; r < dados.length; r++) {
    var email = String(dados[r][iEmail]||'').toLowerCase().trim();
    if (!emailsSet[email]) continue;

    if (iPerfil >= 0) {
      var p = String(dados[r][iPerfil]||'').trim();
      if (p) perfis[p] = (perfis[p]||0) + 1;
    }
    if (iD >= 0 && iI >= 0 && iS >= 0 && iC >= 0) {
      var d = Number(dados[r][iD])||0, i = Number(dados[r][iI])||0;
      var s = Number(dados[r][iS])||0, c = Number(dados[r][iC])||0;
      if (d+i+s+c > 0) { somaD+=d; somaI+=i; somaS+=s; somaC+=c; count++; }
    }
  }

  if (count === 0 && Object.keys(perfis).length === 0) return null;

  // Ordenar perfis por frequência
  var perfilRanking = Object.keys(perfis).map(function(k) { return { perfil: k, qtd: perfis[k] }; })
    .sort(function(a,b) { return b.qtd - a.qtd; });

  return {
    totalComPerfil: count || Object.values(perfis).reduce(function(s,v){return s+v;},0),
    disc_medio: count > 0 ? {
      D: Math.round(somaD/count),
      I: Math.round(somaI/count),
      S: Math.round(somaS/count),
      C: Math.round(somaC/count)
    } : null,
    perfis_predominantes: perfilRanking.slice(0, 5)
  };
}


// ═══════════════════════════════════════════════════════════════════════════════
// 2. PROMPTS
// ═══════════════════════════════════════════════════════════════════════════════

function _plenariaBuildSystemPrompt() {
  return [
    'Voce e o Gerador de Relatorios Coletivos da Vertho Mentor IA.',
    '',
    'Sua tarefa: criar um relatorio anonimo para apresentacao em plenaria escolar, baseado nos resultados consolidados de TODOS os profissionais avaliados. O relatorio sera apresentado por um consultor Vertho para toda a equipe.',
    '',
    'FILOSOFIA:',
    '1. ANONIMATO ABSOLUTO. Nenhum profissional pode ser identificado. Dados sempre agregados (%, medias). Grupo < 5 pessoas: NAO desagregar.',
    '2. SEGURANCA PSICOLOGICA. Tom de diagnostico coletivo — "a escola como organismo".',
    '3. CELEBRAR ANTES DE DIAGNOSTICAR. Forcas coletivas primeiro. Gaps como "oportunidade de crescimento".',
    '4. MOBILIZACAO COLETIVA. Cada gap acompanhado de proposta de acao coletiva.',
    '5. DESCRITORES COMO PROTAGONISTAS. Foco nos descritores, nao nos profissionais.',
    '6. LINGUAGEM DE ESCOLA. HTPC, conselho de classe — nunca jargao de RH.',
    '',
    'REGRAS DE ANONIMATO — INVIOLAVEIS:',
    '- NUNCA citar nomes, cargos que identifiquem 1 pessoa, ou situacoes individuais.',
    '- Distribuicoes percentuais, nao absolutas.',
    '- NUNCA ranquear profissionais ou criar "melhores/piores".',
    '- Se houver apenas 1 profissional N4: usar plural ("profissionais referencia").',
    '- Citacoes de respostas: NUNCA.',
    '',
    'REGRAS DE TOM:',
    '- Sempre "NOS", nunca "VOCES".',
    '- Diagnostico, nao julgamento.',
    '- Cada gap tem uma acao proposta.',
    '- Impacto nos alunos como ancora.',
    '- Formacoes gratuitas e executaveis na rotina escolar.',
    '',
    'REGRAS DE FORCAS:',
    '- SOMENTE descritores com predominancia em N3 ou N4 podem ser listados como forca.',
    '- N2 NAO e forca. N2 e "em desenvolvimento" — nao celebrar.',
    '- Se nenhum descritor tem predominancia N3/N4, celebrar o engajamento e participacao, nao competencias.',
    '- "Participacao" e "Engajamento" sao a MESMA coisa. NUNCA listar ambos como forcas separadas. Usar um card unico.',
    '',
    'REGRAS DE NOMENCLATURA:',
    '- NUNCA usar abreviacoes N1, N2, N3, N4. SEMPRE escrever por extenso: "Nivel 1", "Nivel 2", "Nivel 3", "Nivel 4".',
    '',
    'REGRAS DE ESPECIFICIDADE:',
    '- ANCORAR cada afirmacao nos DESCRITORES REAIS e nos percentuais fornecidos nos dados.',
    '- Prioridades e acoes devem citar descritores criticos (os com maior %N1) pelo nome.',
    '- NUNCA ser generico. Ex: NAO "melhorar lideranca". SIM "fortalecer Influencia positiva (100% N1) atraves de...".',
    '- Cada acao deve descrever o que acontece CONCRETAMENTE na primeira reuniao/encontro.',
    '- EVIDENCIA INSUFICIENTE: descritor com 0% em TODOS os niveis = sem dados. NAO usar como forca nem oportunidade. Ignorar na analise.',
    '',
    'FORMATO DE SAIDA — APENAS JSON valido, sem texto antes ou depois, sem markdown, sem backticks.',
    '',
    '{',
    '  "contexto": "Paragrafo 4-5 linhas explicando o que, quem e como foi avaliado",',
    '  "forcas": [',
    '    {"competencia_ou_descritor": "nome exato do descritor", "dado": "dado percentual dos dados (ex: 40% N3)", "significado": "por que isso e importante para a escola", "celebracao": "reconhecimento concreto"}',
    '    // Identificar os descritores com maior %N3 ou %N4.',
    '    // REGRA: somente descritores com predominancia em N3 ou N4 podem ser forca. N2 NAO e forca.',
    '    // REGRA ANTI-DUPLICACAO: cada forca deve ser um DESCRITOR DIFERENTE. NAO reformular a mesma ideia.',
    '    // Se so houver 1 descritor forte, liste apenas 1 forca. NAO INVENTE forcas extras.',
    '    // "Participacao" e "Engajamento" sao a MESMA coisa — o card de participacao ja e gerado automaticamente.',
    '  ],',
    '  "retrato_geral": {',
    '    "distribuicao_niveis": {"n1_pct": 0, "n2_pct": 0, "n3_pct": 0, "n4_pct": 0},',
    '    "media_por_competencia": [{"competencia": "...", "media": 2.8, "status": "Proximo da meta"}]',
    '  },',
    '  "mergulho_descritores": [',
    '    // OBRIGATORIO: UMA entrada para CADA competencia listada nos dados!',
    '    {',
    '      "competencia": "EXATAMENTE como aparece nos dados",',
    '      "forca_descritor": {"nome": "nome exato do descritor mais forte", "dado": "dado percentual real"},',
    '      "oportunidade_descritor": {"nome": "nome exato do descritor mais fraco (maior %N1)", "dado": "dado percentual real"},',
    '      "interpretacao": "Paragrafo 3-4 linhas conectando os descritores ao cotidiano escolar e ao impacto nos alunos"',
    '    }',
    '  ],',
    '  "padroes": [',
    '    // MINIMO 2 padroes. Cada um deve citar descritores especificos e cruzar competencias.',
    '    {"titulo": "titulo especifico", "descricao": "Paragrafo narrativo citando descritores e percentuais"}',
    '  ],',
    '  "prioridades_formacao": [',
    '    // MINIMO 3 prioridades. Cada uma DEVE citar o descritor critico pelo nome e seu percentual.',
    '    {"prioridade": 1, "foco": "Descritor X (competencia Y)", "por_que": "citar %N1 especifico do descritor", "impacto_alunos": "consequencia concreta na sala de aula", "formato_sugerido": "formato especifico (ex: estudo de caso em HTPC, roda de conversa, observacao de pares)", "quando_comecar": "prazo concreto"}',
    '  ],',
    '  "acoes_imediatas": [',
    '    // MINIMO 3 acoes. Cada uma DEVE dizer o que acontece CONCRETAMENTE na primeira reuniao.',
    '    {"o_que": "acao especifica com verbo de acao", "quando": "data ou evento concreto (ex: proximo HTPC)", "quem": "grupo responsavel", "resultado_30_dias": "entregavel mensuravel e concreto"}',
    '  ],',
    '  "profissionais_referencia": "Paragrafo generico sobre N4 — NUNCA quantificar.",',
    '  "alinhamento_valores_coletivo": {',
    '    "distribuicao": [{"valor":"Etica","alinhado_pct":62,"tensao_pct":31,"violacao_pct":4,"sem_evidencia_pct":3}],',
    '    "alertas": ["texto se valor tem >25% tensao — interpretacao sistemica, nao individual"],',
    '    "interpretacao": "diagnostico que conecta padroes a pressoes do sistema, nao a falhas individuais"',
    '  },',
    '  "mensagem_final": "3-5 linhas de encerramento conectando diagnostico a esperanca"',
    '}',
    '',
    'VALIDACAO OBRIGATORIA antes de retornar:',
    '- forcas: MINIMO 2, com dado percentual REAL dos dados?',
    '- mergulho_descritores: UMA entrada para CADA competencia?',
    '- cada mergulho: forca_descritor, oportunidade_descritor E interpretacao preenchidos?',
    '- padroes: MINIMO 2, citando descritores especificos?',
    '- prioridades_formacao: MINIMO 3, cada uma com descritor critico pelo nome e %N1?',
    '- acoes_imediatas: MINIMO 3, cada uma com acao concreta da primeira reuniao?',
    '- Nenhum campo vazio ou null? Tom "nos"? Formacoes gratuitas? JSON valido?',
  ].join('\n');
}

function _plenariaBuildUserPrompt(dados) {
  var compsFormatadas = dados.competencias.map(function(c) {
    var descStr = c.descritores.map(function(d) {
      if (d.pct_n1 !== undefined) {
        return '  - ' + d.nome + ': N1=' + d.pct_n1 + '% N2=' + d.pct_n2 + '% N3=' + d.pct_n3 + '% N4=' + d.pct_n4 + '%';
      }
      return '  - ' + d.nome;
    }).join('\n');

    return [
      c.competencia + ' | Media: ' + c.media + ' | N1:' + c.pct_n1 + '% N2:' + c.pct_n2 + '% N3:' + c.pct_n3 + '% N4:' + c.pct_n4 + '%',
      descStr || '  (sem descritores detalhados)',
    ].join('\n');
  }).join('\n\n');

  return [
    'Gere o relatorio coletivo para plenaria da escola abaixo.',
    '',
    'ESCOLA: ' + (dados.escola || 'Escola'),
    'DATA: ' + dados.data,
    'TOTAL DE PROFISSIONAIS AVALIADOS: ' + dados.totalColaboradores,
    '',
    'DISTRIBUICAO GERAL:',
    'N1 (GAP): ' + dados.distribuicao_geral.n1_pct + '%',
    'N2 (Em Desenvolvimento): ' + dados.distribuicao_geral.n2_pct + '%',
    'N3 (META): ' + dados.distribuicao_geral.n3_pct + '%',
    'N4 (Referencia): ' + dados.distribuicao_geral.n4_pct + '%',
    '',
    'RESULTADOS POR COMPETENCIA E DESCRITORES:',
    compsFormatadas,
    '',
    dados.perfilGrupo ? _plenariaFormatarPerfil(dados.perfilGrupo) : '',
    '',
    (dados.valoresAgregados && dados.valoresAgregados.length > 0 ? [
      'ALINHAMENTO A VALORES — VISAO COLETIVA:',
      '',
      dados.valoresAgregados.map(function(v) {
        return v.valor + ': Alinhado=' + v.alinhado_pct + '% Tensao=' + v.tensao_pct + '% Violacao=' + v.violacao_pct + '% Sem evidencia=' + v.sem_evidencia_pct + '%';
      }).join('\n'),
      '',
      'INSTRUCOES: Inclua secao "alinhamento_valores_coletivo" no JSON de output.',
      'Se algum valor tem >25% tensao, gere alerta com interpretacao sistemica.',
      'Tom: diagnostico institucional, nao julgamento individual. "O sistema cria pressoes que..."'
    ].join('\n') : '')
  ].join('\n');
}

function _plenariaFormatarPerfil(perfil) {
  var linhas = ['PERFIL COMPORTAMENTAL DO GRUPO (DISC — usar para contextualizar feedbacks e sugestoes):'];
  if (perfil.disc_medio) {
    var dm = perfil.disc_medio;
    linhas.push('DISC medio: D=' + dm.D + '% I=' + dm.I + '% S=' + dm.S + '% C=' + dm.C + '%');
    // Interpretar
    var maior = Object.keys(dm).reduce(function(a,b) { return dm[a] > dm[b] ? a : b; });
    var labels = { D: 'Dominancia (assertividade, resultados)', I: 'Influencia (comunicacao, entusiasmo)',
                   S: 'Estabilidade (cooperacao, paciencia)', C: 'Conformidade (analise, precisao)' };
    linhas.push('Dimensao predominante no grupo: ' + labels[maior]);
  }
  if (perfil.perfis_predominantes && perfil.perfis_predominantes.length > 0) {
    linhas.push('Perfis mais frequentes: ' + perfil.perfis_predominantes.map(function(p) {
      return p.perfil + ' (' + p.qtd + ')';
    }).join(', '));
  }
  linhas.push('INSTRUCAO: Use o perfil DISC para adaptar o TOM das sugestoes e acoes. Ex: grupo Alto S = valorizar estabilidade; grupo Alto D = foco em resultados rapidos.');
  return linhas.join('\n');
}


// ═══════════════════════════════════════════════════════════════════════════════
// 3. CHAMADA IA
// ═══════════════════════════════════════════════════════════════════════════════

function _plenariaChamarIA(systemPrompt, userPrompt) {
  // Prioridade: modelo do Painel (_CFG) → Config.MODEL_RELATORIO → fallback
  var modeloConfig = (_CFG && _CFG.modelo) || Config.MODEL_RELATORIO;
  Logger.log('Plenária: modelo selecionado = ' + modeloConfig + ' (_CFG.modelo=' + (_CFG && _CFG.modelo || 'null') + ', Config.MODEL_RELATORIO=' + Config.MODEL_RELATORIO + ')');
  var modelos = [modeloConfig];
  // Fallback: se Claude, tenta Gemini; se Gemini, tenta Claude
  if (modeloConfig.indexOf('claude') >= 0) {
    modelos.push(Config.MODEL_VALIDACAO || 'gemini-2.0-flash');
  } else {
    modelos.push('claude-haiku-4-5-20251001');
  }

  for (var m = 0; m < modelos.length; m++) {
    var modelo = modelos[m];
    try {
      Logger.log('Plenária modelo: ' + modelo + ' (Config.MODEL_RELATORIO=' + modeloConfig + ')');
      var resposta;
      if (modelo.indexOf('claude') >= 0) {
        var key = PropertiesService.getScriptProperties().getProperty('CLAUDE_API_KEY');
        var resp = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
          method: 'post',
          headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
          payload: JSON.stringify({
            model: modelo, max_tokens: 8192,
            system: systemPrompt,
            messages: [{ role: 'user', content: userPrompt }],
          }),
          muteHttpExceptions: true,
        });
        var data = JSON.parse(resp.getContentText());
        if (data.error) throw new Error(data.error.message);
        resposta = data.content[0].text;
      } else {
        var key2 = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
        var resp2 = UrlFetchApp.fetch(
          'https://generativelanguage.googleapis.com/v1beta/models/' + modelo + ':generateContent?key=' + key2,
          { method: 'post', contentType: 'application/json',
            payload: JSON.stringify({
              contents: [{ parts: [{ text: systemPrompt + '\n\n' + userPrompt }] }],
              generationConfig: { temperature: Config.geminiTemp(modelo, 'relatorio') },
            }),
            muteHttpExceptions: true }
        );
        var data2 = JSON.parse(resp2.getContentText());
        if (data2.error) throw new Error(data2.error.message);
        resposta = data2.candidates[0].content.parts[0].text;
      }

      Logger.log('Plenária resposta OK (' + modelo + '): ' + resposta.length + ' chars');
      var limpo = resposta.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
      return JSON.parse(limpo);
    } catch(e) {
      Logger.log('Plenária ERRO ' + modelo + ': ' + e.message);
      if (m === modelos.length - 1) throw e;
    }
  }
}


// ═══════════════════════════════════════════════════════════════════════════════
// 4. GERAÇÃO DO DOCUMENTO
// ═══════════════════════════════════════════════════════════════════════════════

function _plenariaSalvarDoc(json, dados, brand) {
  var nomeArq = 'Retrato de Competências - ' + (dados.escola || 'Escola');
  var folder  = DriveApp.getFolderById(PLENARIA_ID_PASTA);

  // Excluir versão anterior
  var existentes = folder.getFilesByName(nomeArq + '.pdf');
  while (existentes.hasNext()) existentes.next().setTrashed(true);

  var doc = DocumentApp.create(nomeArq);
  if (brand === 'foresea') {
    _plenariaGerarDocForesea(doc, json, dados);
  } else {
    _plenariaGerarDoc(doc, json, dados);
  }
  doc.saveAndClose();

  var docFile = DriveApp.getFileById(doc.getId());
  var pdfFile = folder.createFile(docFile.getAs(MimeType.PDF)).setName(nomeArq + '.pdf');
  docFile.setTrashed(true);

  Logger.log('Plenária PDF salvo: ' + pdfFile.getUrl());
  return pdfFile.getUrl();
}


function _plenariaGerarDoc(doc, json, dados) {
  var body = doc.getBody();

  // ── PALETA VERTHO ─────────────────────────────────────────────────────────
  var NAVY    = '#0F2B54';
  var TEAL    = '#0D6E6E';
  var GOLD    = '#C5961E';
  var N1_BG   = '#FADBD8';
  var N2_BG   = '#FCF3CF';
  var N3_BG   = '#D5F5E3';
  var N4_BG   = '#D4E6F1';
  var N1_BOLD = '#C0392B';
  var N2_BOLD = '#B7950B';
  var N3_BOLD = '#1E8449';
  var N4_BOLD = '#2471A3';
  var CINZA   = '#F8F9FA';

  function _heatN1(pct) {
    if (pct >= 80) return '#E74C3C';
    if (pct >= 50) return '#F1948A';
    if (pct >= 25) return '#FADBD8';
    return '#D5F5E3';
  }
  function _heatN3N4(pct) {
    if (pct >= 50) return '#82E0AA';
    if (pct >= 25) return '#D5F5E3';
    return '#FFFFFF';
  }
  // Cor do texto para % (vermelho forte se N1 alto, verde se N3/N4 alto)
  function _corPctN1(pct) { return pct >= 50 ? '#FFFFFF' : pct >= 25 ? N1_BOLD : '#333333'; }

  body.setMarginTop(40).setMarginBottom(40).setMarginLeft(50).setMarginRight(50);

  // ══════════════════════════════════════════════════════════════════════════
  // CAPA — fundo navy com logo claro
  // ══════════════════════════════════════════════════════════════════════════
  var tHdr = body.appendTable();
  tHdr.setBorderWidth(0);
  var rHdr = tHdr.appendTableRow();
  var cTxt = rHdr.appendTableCell();
  _ia4LimparCelula(cTxt);
  cTxt.setBackgroundColor(NAVY);
  cTxt.appendParagraph('RETRATO DE COMPETÊNCIAS').editAsText()
    .setForegroundColor('#FFFFFF').setBold(true).setFontSize(24).setFontFamily('Arial');
  cTxt.appendParagraph(_ia4Safe(dados.escola || 'Escola')).editAsText()
    .setForegroundColor(GOLD).setBold(true).setFontSize(16).setFontFamily('Arial');
  cTxt.appendParagraph(dados.data + '  •  ' + dados.totalColaboradores + ' profissionais avaliados').editAsText()
    .setForegroundColor('#B0C4DE').setFontSize(10).setBold(false);
  cTxt.setPaddingTop(16).setPaddingBottom(16).setPaddingLeft(16).setPaddingRight(16);

  var cLogo = rHdr.appendTableCell();
  _ia4LimparCelula(cLogo);
  cLogo.setBackgroundColor(NAVY);
  try {
    var logoBlob = DriveApp.getFileById(PLENARIA_LOGO_ID).getBlob();
    var img = cLogo.appendParagraph('').appendInlineImage(logoBlob);
    img.setWidth(90).setHeight(90);
    cLogo.getChild(cLogo.getNumChildren() - 1).asParagraph().setAlignment(DocumentApp.HorizontalAlignment.RIGHT);
  } catch(e) { Logger.log('Logo erro: ' + e); }
  cLogo.setWidth(110).setPaddingTop(14).setPaddingBottom(14).setPaddingRight(14);

  body.appendParagraph('Diagnóstico coletivo e anônimo para desenvolvimento da equipe. Nenhum profissional é identificado.').editAsText()
    .setItalic(true).setForegroundColor('#888888').setFontSize(8).setBold(false);
  body.appendParagraph(' ');

  var idx = body.getNumChildren();

  // ══════════════════════════════════════════════════════════════════════════
  // CONTEXTO
  // ══════════════════════════════════════════════════════════════════════════
  if (json.contexto) {
    body.insertParagraph(idx++, _ia4Safe(json.contexto)).editAsText()
      .setBold(false).setFontSize(10).setForegroundColor('#444444');
    body.insertParagraph(idx++, ' ');
  }

  // Perfil comportamental: NÃO exibir bloco visual, mas os dados são enviados à IA
  // para influenciar feedbacks e sugestões (via perfilGrupo nos dados do prompt).

  // ══════════════════════════════════════════════════════════════════════════
  // FORÇAS — cards visuais com dado grande (24pt)
  // ══════════════════════════════════════════════════════════════════════════
  var forcas = json.forcas || [];
  // Sempre adicionar card de participação como primeira força
  var cardParticipacao = {
    competencia_ou_descritor: 'Participação da Equipe',
    dado: dados.totalColaboradores + ' de ' + dados.totalColaboradores + ' — 100%',
    significado: 'Toda a equipe participou do diagnóstico. A disposição de olhar para a própria prática é a primeira e mais importante força de qualquer grupo.',
    celebracao: 'Isso demonstra maturidade profissional e compromisso com o crescimento coletivo.'
  };

  var pForcas = body.insertParagraph(idx++, '💪  NOSSAS FORÇAS');
  pForcas.setHeading(DocumentApp.ParagraphHeading.HEADING1);
  pForcas.editAsText().setForegroundColor(TEAL).setBold(true).setFontSize(20);
  body.insertParagraph(idx++, ' ');

  // Card de participação primeiro
  var allForcas = [cardParticipacao].concat(forcas);
  allForcas.forEach(function(f) {
    var tF = body.insertTable(idx++);
    tF.setBorderWidth(0);
    var rF = tF.appendTableRow();

    // Barra lateral teal
    var cBar = rF.appendTableCell();
    _ia4LimparCelula(cBar);
    cBar.setBackgroundColor(TEAL);
    cBar.appendParagraph(' ').editAsText().setFontSize(1);
    cBar.setWidth(6).setPaddingTop(0).setPaddingBottom(0).setPaddingLeft(0).setPaddingRight(0);

    // Conteúdo
    var cContent = rF.appendTableCell();
    _ia4LimparCelula(cContent);
    cContent.setBackgroundColor('#E8F8F5');
    cContent.appendParagraph(_ia4Safe(f.competencia_ou_descritor || '')).editAsText()
      .setBold(true).setForegroundColor(TEAL).setFontSize(13);
    // Dado em destaque grande
    cContent.appendParagraph(_ia4Safe(f.dado || '')).editAsText()
      .setBold(true).setForegroundColor(NAVY).setFontSize(24);
    cContent.appendParagraph(_ia4Safe(f.significado || '')).editAsText()
      .setBold(false).setForegroundColor('#333333').setFontSize(10);
    if (f.celebracao) cContent.appendParagraph(_ia4Safe(f.celebracao)).editAsText()
      .setBold(false).setItalic(true).setForegroundColor(TEAL).setFontSize(9);
    cContent.setPaddingTop(12).setPaddingBottom(12).setPaddingLeft(14).setPaddingRight(14);

    body.insertParagraph(idx++, ' ');
  });

  // ══════════════════════════════════════════════════════════════════════════
  // RETRATO GERAL — cores por nível com % grande
  // ══════════════════════════════════════════════════════════════════════════
  var retrato = json.retrato_geral || {};
  body.insertParagraph(idx++, '📊  RETRATO GERAL').setHeading(DocumentApp.ParagraphHeading.HEADING1)
    .editAsText().setForegroundColor(NAVY).setBold(true).setFontSize(20);
  body.insertParagraph(idx++, ' ');

  // Sempre usar dados REAIS dos descritores (não os da IA que podem estar inconsistentes)
  var dist = dados.distribuicao_geral || {};
  var nivelData = [
    { label: 'Nível 1 — GAP',                pct: dist.n1_pct||0, sig: 'Precisa de desenvolvimento estruturado', bg: N1_BG, cor: N1_BOLD },
    { label: 'Nível 2 — Em Desenvolvimento', pct: dist.n2_pct||0, sig: 'Boa intenção, execução a melhorar',      bg: N2_BG, cor: N2_BOLD },
    { label: 'Nível 3 — META ✓',            pct: dist.n3_pct||0, sig: 'Prática consistente',                    bg: N3_BG, cor: N3_BOLD },
    { label: 'Nível 4 — Referência',         pct: dist.n4_pct||0, sig: 'Excelência que inspira',                 bg: N4_BG, cor: N4_BOLD },
  ];
  var tDist = body.insertTable(idx++);
  tDist.setBorderWidth(1).setBorderColor('#DEE2E6');
  var rDH = tDist.appendTableRow();
  ['Nível', '% Equipe', 'Significado'].forEach(function(h) {
    var hc = rDH.appendTableCell(h);
    hc.editAsText().setBold(true).setForegroundColor('#FFFFFF').setFontSize(10);
    hc.setBackgroundColor(NAVY);
    hc.getChild(0).asParagraph().setAlignment(DocumentApp.HorizontalAlignment.CENTER);
  });
  nivelData.forEach(function(n) {
    var r = tDist.appendTableRow();
    var c0 = r.appendTableCell(n.label);
    c0.editAsText().setBold(true).setFontSize(11).setForegroundColor(n.cor);
    c0.setBackgroundColor(n.bg);
    // % grande e bold
    var c1 = r.appendTableCell(n.pct + '%');
    c1.editAsText().setBold(true).setFontSize(22).setForegroundColor(n.cor);
    c1.setBackgroundColor(n.bg);
    c1.getChild(0).asParagraph().setAlignment(DocumentApp.HorizontalAlignment.CENTER);
    var c2 = r.appendTableCell(n.sig);
    c2.editAsText().setBold(false).setFontSize(9).setForegroundColor('#555555');
    c2.setBackgroundColor(n.bg);
  });
  body.insertParagraph(idx++, ' ');

  // ── Retrato de Descritores por Competência ─────────────────────────────
  // ══════════════════════════════════════════════════════════════════════════
  // DESCRITORES POR COMPETÊNCIA — heatmap intenso + separadores visuais
  // ══════════════════════════════════════════════════════════════════════════
  body.insertParagraph(idx++, '🔎  DESCRITORES POR COMPETÊNCIA').setHeading(DocumentApp.ParagraphHeading.HEADING1)
    .editAsText().setForegroundColor(NAVY).setBold(true).setFontSize(20);
  body.insertParagraph(idx++, ' ');

  var mergulho = json.mergulho_descritores || [];
  var iaByComp = {};
  mergulho.forEach(function(m) {
    iaByComp[_ia4Safe(m.competencia || '').toLowerCase()] = m;
  });

  var compColors = [TEAL, GOLD, N1_BOLD, N4_BOLD, '#8E44AD', '#D35400'];

  dados.competencias.forEach(function(comp, compIdx) {
    var media = comp.media || 0;
    var accent = media < 2 ? N1_BOLD : media < 3 ? GOLD : TEAL;

    // ── Separador visual entre competências — barra teal larga ──
    if (compIdx > 0) {
      body.insertParagraph(idx++, ' ');
      var tSep = body.insertTable(idx++);
      tSep.setBorderWidth(0);
      var cSep = tSep.appendTableRow().appendTableCell();
      _ia4LimparCelula(cSep);
      cSep.setBackgroundColor(TEAL);
      cSep.appendParagraph(' ').editAsText().setFontSize(4);
      cSep.setPaddingTop(2).setPaddingBottom(2);
      body.insertParagraph(idx++, ' ');
    }

    // ── Header competência com barra lateral colorida ──
    var tCompH = body.insertTable(idx++);
    tCompH.setBorderWidth(0);
    var rCompH = tCompH.appendTableRow();

    // Barra lateral colorida (6px)
    var cBarL = rCompH.appendTableCell();
    _ia4LimparCelula(cBarL);
    cBarL.setBackgroundColor(accent);
    cBarL.appendParagraph(' ').editAsText().setFontSize(1);
    cBarL.setWidth(6).setPaddingTop(0).setPaddingBottom(0).setPaddingLeft(0).setPaddingRight(0);

    // Conteúdo header
    var cCompT = rCompH.appendTableCell();
    _ia4LimparCelula(cCompT);
    cCompT.setBackgroundColor(media < 2 ? '#FDEDEC' : media < 3 ? '#FEF9E7' : '#EAFAF1');
    var flagTxt = media < 2 ? '  ⚠️ PRIORIDADE' : '';
    var compTitulo = _ia4Safe(comp.competencia) + '  (' + (comp.total_avaliacoes || 0) + ' avaliações)';
    cCompT.appendParagraph(compTitulo).editAsText()
      .setBold(true).setForegroundColor(NAVY).setFontSize(14);

    // Média grande inline
    var pMedia = cCompT.appendParagraph('Média: ' + media + flagTxt);
    pMedia.editAsText().setFontSize(10).setForegroundColor('#666666').setBold(false);
    // Colorir apenas o número da média
    var mediaTxt = String(media);
    var startM = 7; // "Média: " = 7 chars
    pMedia.editAsText().setFontSize(startM, startM + mediaTxt.length - 1, 24);
    pMedia.editAsText().setBold(startM, startM + mediaTxt.length - 1, true);
    pMedia.editAsText().setForegroundColor(startM, startM + mediaTxt.length - 1, accent);

    cCompT.setPaddingTop(10).setPaddingBottom(10).setPaddingLeft(14).setPaddingRight(14);

    // Barra de distribuição por nível — mini tabela inline com cores fortes
    var tNiv = body.insertTable(idx++);
    tNiv.setBorderWidth(1).setBorderColor('#DEE2E6');
    var rNH = tNiv.appendTableRow();
    ['Nível 1 (Gap)', 'Nível 2 (Desenv.)', 'Nível 3 (Meta)', 'Nível 4 (Ref.)'].forEach(function(h) {
      var hc = rNH.appendTableCell(h);
      hc.editAsText().setBold(true).setFontSize(7).setForegroundColor('#FFFFFF');
      hc.setBackgroundColor(NAVY);
      hc.getChild(0).asParagraph().setAlignment(DocumentApp.HorizontalAlignment.CENTER);
    });
    var rNV = tNiv.appendTableRow();
    var nivPcts = [
      { v: comp.pct_n1||0, bg: N1_BG, cor: N1_BOLD },
      { v: comp.pct_n2||0, bg: N2_BG, cor: N2_BOLD },
      { v: comp.pct_n3||0, bg: N3_BG, cor: N3_BOLD },
      { v: comp.pct_n4||0, bg: N4_BG, cor: N4_BOLD },
    ];
    nivPcts.forEach(function(n) {
      var cN = rNV.appendTableCell(n.v + '%');
      cN.editAsText().setBold(true).setFontSize(18).setForegroundColor(n.cor);
      cN.setBackgroundColor(n.bg);
      cN.getChild(0).asParagraph().setAlignment(DocumentApp.HorizontalAlignment.CENTER);
    });

    // ── Tabela de descritores com heatmap intenso ──
    var descs = comp.descritores || [];
    if (descs.length > 0) {
      var tD = body.insertTable(idx++);
      tD.setBorderWidth(1).setBorderColor('#DEE2E6');
      var rDHd = tD.appendTableRow();
      ['Descritor', 'Nível 1 (Gap)', 'Nível 2 (Desenv.)', 'Nível 3 (Meta)', 'Nível 4 (Ref.)'].forEach(function(h, hi) {
        var hCell = rDHd.appendTableCell(h);
        hCell.editAsText().setBold(true).setFontSize(8).setForegroundColor('#FFFFFF');
        hCell.setBackgroundColor(NAVY);
        if (hi === 0) {
          hCell.setWidth(200);
        } else {
          hCell.getChild(0).asParagraph().setAlignment(DocumentApp.HorizontalAlignment.CENTER);
        }
      });

      descs.forEach(function(d) {
        var n1 = d.pct_n1||0, n2 = d.pct_n2||0, n3 = d.pct_n3||0, n4 = d.pct_n4||0;
        var semDados = (n1 === 0 && n2 === 0 && n3 === 0 && n4 === 0);
        var rD = tD.appendTableRow();

        // Coluna descritor (larga)
        var nomeCell = rD.appendTableCell('');
        _ia4LimparCelula(nomeCell);
        nomeCell.setWidth(200);
        var pNome = nomeCell.appendParagraph(_ia4Safe(d.nome || ''));
        pNome.editAsText().setFontSize(9).setBold(false).setForegroundColor(semDados ? '#AAAAAA' : NAVY);
        if (semDados) pNome.editAsText().setItalic(true);

        if (semDados) {
          // 4 colunas com fundo igual — texto centralizado na 2ª para efeito de merge visual
          rD.appendTableCell('').setBackgroundColor('#F5F5F5');
          var seCell = rD.appendTableCell('');
          _ia4LimparCelula(seCell);
          seCell.setBackgroundColor('#F5F5F5');
          var pSe = seCell.appendParagraph('Sem evidência suficiente');
          pSe.editAsText().setFontSize(9).setItalic(true).setForegroundColor('#AAAAAA').setBold(false);
          pSe.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
          rD.appendTableCell('').setBackgroundColor('#F5F5F5');
          rD.appendTableCell('').setBackgroundColor('#F5F5F5');
        } else {
          // Helper: cria célula com % colorida via parágrafo
          var pctData = [
            { v: n1, bg: _heatN1(n1),
              cor: n1 >= 80 ? '#FFFFFF' : n1 >= 50 ? '#FFFFFF' : n1 > 0 ? N1_BOLD : '#999999',
              bold: n1 >= 50 },
            { v: n2, bg: n2 >= 40 ? N2_BG : n2 >= 20 ? '#FEF9E7' : '#FFFFFF',
              cor: n2 > 0 ? N2_BOLD : '#999999',
              bold: n2 >= 40 },
            { v: n3, bg: n3 > 0 ? '#D5F5E3' : '#FFFFFF',
              cor: n3 > 0 ? N3_BOLD : '#999999',
              bold: n3 >= 50 },
            { v: n4, bg: _heatN3N4(n4),
              cor: n4 > 0 ? N4_BOLD : '#999999',
              bold: n4 >= 50 },
          ];
          pctData.forEach(function(item) {
            var cell = rD.appendTableCell('');
            _ia4LimparCelula(cell);
            cell.setBackgroundColor(item.bg);
            var pVal = cell.appendParagraph(item.v + '%');
            pVal.editAsText().setFontSize(11).setBold(item.bold).setForegroundColor(item.cor);
            pVal.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
          });
        }
      });
    }

    // Interpretação da IA
    var iaComp = iaByComp[comp.competencia.toLowerCase()] || {};
    if (iaComp.forca_descritor || iaComp.oportunidade_descritor || iaComp.interpretacao) {
      var tInt = body.insertTable(idx++);
      tInt.setBorderWidth(0);
      var cInt = tInt.appendTableRow().appendTableCell();
      _ia4LimparCelula(cInt);
      cInt.setBackgroundColor(CINZA);
      if (iaComp.forca_descritor) {
        cInt.appendParagraph('✅ Força: ' + _ia4Safe(iaComp.forca_descritor.nome || '') + ' — ' + _ia4Safe(iaComp.forca_descritor.dado || ''))
          .editAsText().setBold(false).setForegroundColor(N3_BOLD).setFontSize(9);
      }
      if (iaComp.oportunidade_descritor) {
        cInt.appendParagraph('🔸 Oportunidade: ' + _ia4Safe(iaComp.oportunidade_descritor.nome || '') + ' — ' + _ia4Safe(iaComp.oportunidade_descritor.dado || ''))
          .editAsText().setBold(false).setForegroundColor('#E65100').setFontSize(9);
      }
      if (iaComp.interpretacao) {
        cInt.appendParagraph(_ia4Safe(iaComp.interpretacao)).editAsText()
          .setBold(false).setItalic(true).setForegroundColor('#555555').setFontSize(9);
      }
      cInt.setPaddingTop(6).setPaddingBottom(6).setPaddingLeft(10).setPaddingRight(10);
    }
    body.insertParagraph(idx++, ' ');
  });

  // ══════════════════════════════════════════════════════════════════════════
  // PADRÕES IDENTIFICADOS
  // ══════════════════════════════════════════════════════════════════════════
  var padroes = json.padroes || [];
  if (padroes.length > 0) {
    body.insertParagraph(idx++, '🧩  PADRÕES IDENTIFICADOS').setHeading(DocumentApp.ParagraphHeading.HEADING1)
      .editAsText().setForegroundColor(NAVY).setBold(true).setFontSize(18);
    body.insertParagraph(idx++, ' ');
    padroes.forEach(function(p, pi) {
      var tP = body.insertTable(idx++);
      tP.setBorderWidth(0);
      var rP = tP.appendTableRow();
      // Barra lateral
      var cPBar = rP.appendTableCell();
      _ia4LimparCelula(cPBar);
      cPBar.setBackgroundColor(NAVY);
      cPBar.appendParagraph(String(pi + 1)).editAsText()
        .setBold(true).setFontSize(16).setForegroundColor(GOLD);
      cPBar.getChild(cPBar.getNumChildren()-1).asParagraph().setAlignment(DocumentApp.HorizontalAlignment.CENTER);
      cPBar.setWidth(35).setPaddingTop(8).setPaddingBottom(8);
      // Conteúdo
      var cPC = rP.appendTableCell();
      _ia4LimparCelula(cPC);
      cPC.setBackgroundColor('#EBF5FB');
      cPC.appendParagraph(_ia4Safe(p.titulo || '')).editAsText().setBold(true).setForegroundColor(NAVY).setFontSize(11);
      cPC.appendParagraph(_ia4Safe(p.descricao || '')).editAsText().setBold(false).setForegroundColor('#333333').setFontSize(10);
      cPC.setPaddingTop(8).setPaddingBottom(8).setPaddingLeft(12).setPaddingRight(12);
      body.insertParagraph(idx++, ' ');
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PRIORIDADES DE FORMAÇÃO — 3 colunas lado a lado (se 3)
  // ══════════════════════════════════════════════════════════════════════════
  var prioridades = json.prioridades_formacao || [];
  if (prioridades.length > 0) {
    // Título com fundo dourado
    var tPrioH = body.insertTable(idx++);
    tPrioH.setBorderWidth(0);
    var cPrioH = tPrioH.appendTableRow().appendTableCell();
    _ia4LimparCelula(cPrioH);
    cPrioH.setBackgroundColor(GOLD);
    cPrioH.appendParagraph('🎯  PRIORIDADES DE FORMAÇÃO').editAsText()
      .setBold(true).setForegroundColor('#FFFFFF').setFontSize(18);
    cPrioH.setPaddingTop(12).setPaddingBottom(12).setPaddingLeft(16).setPaddingRight(16);
    body.insertParagraph(idx++, ' ');

    // Tabela com 3 colunas (uma por prioridade)
    if (prioridades.length <= 4) {
      var tPrio = body.insertTable(idx++);
      tPrio.setBorderWidth(0);
      var rPrio = tPrio.appendTableRow();

      prioridades.forEach(function(pr, pi) {
        var cPr = rPrio.appendTableCell();
        _ia4LimparCelula(cPr);
        cPr.setBackgroundColor('#EBF5FB');

        // Número
        cPr.appendParagraph(String(pr.prioridade || pi + 1)).editAsText()
          .setBold(true).setFontSize(32).setForegroundColor(GOLD);
        cPr.getChild(cPr.getNumChildren()-1).asParagraph().setAlignment(DocumentApp.HorizontalAlignment.CENTER);

        // Foco
        cPr.appendParagraph(_ia4Safe(pr.foco || '')).editAsText()
          .setBold(true).setForegroundColor(NAVY).setFontSize(10);

        // Detalhes
        if (pr.por_que) cPr.appendParagraph(_ia4Safe(pr.por_que)).editAsText()
          .setBold(false).setForegroundColor('#333333').setFontSize(8);
        if (pr.impacto_alunos) cPr.appendParagraph('🎓 ' + _ia4Safe(pr.impacto_alunos)).editAsText()
          .setBold(false).setForegroundColor(TEAL).setFontSize(8);
        if (pr.formato_sugerido) cPr.appendParagraph('📋 ' + _ia4Safe(pr.formato_sugerido)).editAsText()
          .setBold(false).setForegroundColor('#555555').setFontSize(8);
        if (pr.quando_comecar) cPr.appendParagraph('⏰ ' + _ia4Safe(pr.quando_comecar)).editAsText()
          .setBold(true).setForegroundColor(GOLD).setFontSize(8);

        cPr.setPaddingTop(10).setPaddingBottom(10).setPaddingLeft(8).setPaddingRight(8);
      });
      body.insertParagraph(idx++, ' ');
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // AÇÕES IMEDIATAS — cards de compromisso com borda lateral
  // ══════════════════════════════════════════════════════════════════════════
  var acoes = json.acoes_imediatas || [];
  if (acoes.length > 0) {
    // Banner header
    var tAcaoH = body.insertTable(idx++);
    tAcaoH.setBorderWidth(0);
    var cAcaoH = tAcaoH.appendTableRow().appendTableCell();
    _ia4LimparCelula(cAcaoH);
    cAcaoH.setBackgroundColor(TEAL);
    cAcaoH.appendParagraph('🚀  O QUE JÁ PODEMOS FAZER JUNTOS').editAsText()
      .setBold(true).setForegroundColor('#FFFFFF').setFontSize(18);
    cAcaoH.setPaddingTop(14).setPaddingBottom(14).setPaddingLeft(16).setPaddingRight(16);
    body.insertParagraph(idx++, ' ');

    var acaoCores = [TEAL, NAVY, GOLD, N4_BOLD];
    acoes.forEach(function(a, i) {
      var tA = body.insertTable(idx++);
      tA.setBorderWidth(0);
      var rA = tA.appendTableRow();

      // Borda lateral colorida
      var cBord = rA.appendTableCell();
      _ia4LimparCelula(cBord);
      cBord.setBackgroundColor(acaoCores[i % acaoCores.length]);
      cBord.appendParagraph(String(i + 1)).editAsText()
        .setBold(true).setFontSize(20).setForegroundColor('#FFFFFF');
      cBord.getChild(cBord.getNumChildren()-1).asParagraph().setAlignment(DocumentApp.HorizontalAlignment.CENTER);
      cBord.setWidth(40).setPaddingTop(10).setPaddingBottom(10);

      // Conteúdo da ação — card de compromisso
      var cAC = rA.appendTableCell();
      _ia4LimparCelula(cAC);
      cAC.setBackgroundColor('#E8F8F5');
      cAC.appendParagraph(_ia4Safe(a.o_que || '')).editAsText()
        .setBold(true).setForegroundColor(NAVY).setFontSize(11);
      var detalhes = [];
      if (a.quando) detalhes.push('📅 ' + _ia4Safe(a.quando));
      if (a.quem) detalhes.push('👥 ' + _ia4Safe(a.quem));
      if (detalhes.length) cAC.appendParagraph(detalhes.join('  •  ')).editAsText()
        .setBold(false).setForegroundColor('#555555').setFontSize(9);
      if (a.resultado_30_dias) {
        cAC.appendParagraph('✅ Em 30 dias: ' + _ia4Safe(a.resultado_30_dias)).editAsText()
          .setBold(true).setForegroundColor(TEAL).setFontSize(10);
      }
      cAC.setPaddingTop(10).setPaddingBottom(10).setPaddingLeft(14).setPaddingRight(14);

      body.insertParagraph(idx++, ' ');
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PROFISSIONAIS REFERÊNCIA
  // ══════════════════════════════════════════════════════════════════════════
  if (json.profissionais_referencia) {
    body.insertParagraph(idx++, '🌟  NOSSOS PROFISSIONAIS REFERÊNCIA').setHeading(DocumentApp.ParagraphHeading.HEADING1)
      .editAsText().setForegroundColor(GOLD).setBold(true).setFontSize(14);
    var tRef = body.insertTable(idx++);
    tRef.setBorderWidth(0);
    var cRef = tRef.appendTableRow().appendTableCell();
    cRef.setBackgroundColor('#FEF9E7');
    _ia4LimparCelula(cRef);
    cRef.appendParagraph(_ia4Safe(json.profissionais_referencia)).editAsText()
      .setBold(false).setForegroundColor(NAVY).setFontSize(10);
    cRef.setPaddingTop(12).setPaddingBottom(12).setPaddingLeft(16).setPaddingRight(16);
    body.insertParagraph(idx++, ' ');
  }

  // ══════════════════════════════════════════════════════════════════════════
  // MENSAGEM FINAL — fundo navy com destaque visual
  // ══════════════════════════════════════════════════════════════════════════
  if (json.mensagem_final) {
    body.insertParagraph(idx++, ' ');
    // Caixa navy com bordas para destaque máximo
    var tFinal = body.insertTable(idx++);
    tFinal.setBorderWidth(2).setBorderColor(GOLD);
    var cFinal = tFinal.appendTableRow().appendTableCell();
    _ia4LimparCelula(cFinal);
    cFinal.setBackgroundColor(NAVY);

    var pStar1 = cFinal.appendParagraph('✦  ✦  ✦');
    pStar1.editAsText().setForegroundColor(GOLD).setFontSize(14).setBold(true);
    pStar1.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
    pStar1.setSpacingAfter(6);

    var pMsg = cFinal.appendParagraph(_ia4Safe(json.mensagem_final));
    pMsg.editAsText().setBold(false).setItalic(true).setForegroundColor('#FFFFFF').setFontSize(13);
    pMsg.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
    pMsg.setSpacingBefore(4).setSpacingAfter(6);

    var pStar2 = cFinal.appendParagraph('✦  ✦  ✦');
    pStar2.editAsText().setForegroundColor(GOLD).setFontSize(14).setBold(true);
    pStar2.setAlignment(DocumentApp.HorizontalAlignment.CENTER);

    cFinal.setPaddingTop(24).setPaddingBottom(24).setPaddingLeft(30).setPaddingRight(30);
  }
}


// ═══════════════════════════════════════════════════════════════════════════════
// VERSÃO FORESEA — branding Foresea (cores, logo, fonte Syne)
// ═══════════════════════════════════════════════════════════════════════════════

function _plenariaGerarDocForesea(doc, json, dados) {
  var body = doc.getBody();

  // ── PALETA FORESEA ─────────────────────────────────────────────────────────
  var NAVY    = '#1A1D56';   // Azul Profundo Foresea
  var TEAL    = '#1DD693';   // Verde Mar Foresea
  var GOLD    = '#10C1FF';   // Azul Energia Foresea
  var N1_BG   = '#FADBD8';
  var N2_BG   = '#FCF3CF';
  var N3_BG   = '#D5F5E3';
  var N4_BG   = '#D4E6F1';
  var N1_BOLD = '#C0392B';
  var N2_BOLD = '#B7950B';
  var N3_BOLD = '#1E8449';
  var N4_BOLD = '#2471A3';
  var CINZA   = '#F8F9FA';
  var FORESEA_FONT = 'Syne';

  // Logo Foresea — tenta dois IDs (principal + fallback)
  var FORESEA_LOGO_IDS = ['1APS6fAOTE7xlYSdQ2GUUCVEMjzVIY7Im', '1b6WbZP6K0Zq5lr-7hLfLzPGxWYdJWDdR'];

  function _heatN1(pct) {
    if (pct >= 80) return '#E74C3C';
    if (pct >= 50) return '#F1948A';
    if (pct >= 25) return '#FADBD8';
    return '#D5F5E3';
  }
  function _heatN3N4(pct) {
    if (pct >= 50) return '#82E0AA';
    if (pct >= 25) return '#D5F5E3';
    return '#FFFFFF';
  }
  function _corPctN1(pct) { return pct >= 50 ? '#FFFFFF' : pct >= 25 ? N1_BOLD : '#333333'; }

  body.setMarginTop(40).setMarginBottom(40).setMarginLeft(50).setMarginRight(50);

  // ══════════════════════════════════════════════════════════════════════════
  // CAPA — fundo navy Foresea com logo largo
  // ══════════════════════════════════════════════════════════════════════════
  var tHdr = body.appendTable();
  tHdr.setBorderWidth(0);
  var rHdr = tHdr.appendTableRow();
  var cTxt = rHdr.appendTableCell();
  _ia4LimparCelula(cTxt);
  cTxt.setBackgroundColor(NAVY);
  cTxt.appendParagraph('RETRATO DE COMPETÊNCIAS').editAsText()
    .setForegroundColor('#FFFFFF').setBold(true).setFontSize(24).setFontFamily(FORESEA_FONT);
  cTxt.appendParagraph(_ia4Safe(dados.escola || 'Escola')).editAsText()
    .setForegroundColor(GOLD).setBold(true).setFontSize(16).setFontFamily(FORESEA_FONT);
  cTxt.appendParagraph(dados.data + '  •  ' + dados.totalColaboradores + ' profissionais avaliados').editAsText()
    .setForegroundColor('#B0C4DE').setFontSize(10).setBold(false);
  cTxt.setPaddingTop(16).setPaddingBottom(16).setPaddingLeft(16).setPaddingRight(16);

  var cLogo = rHdr.appendTableCell();
  _ia4LimparCelula(cLogo);
  cLogo.setBackgroundColor(NAVY);
  var logoOk = false;
  for (var li = 0; li < FORESEA_LOGO_IDS.length && !logoOk; li++) {
    try {
      var logoBlob = DriveApp.getFileById(FORESEA_LOGO_IDS[li]).getBlob();
      var img = cLogo.appendParagraph('').appendInlineImage(logoBlob);
      img.setWidth(240).setHeight(51);
      cLogo.getChild(cLogo.getNumChildren() - 1).asParagraph().setAlignment(DocumentApp.HorizontalAlignment.RIGHT);
      logoOk = true;
    } catch(e) { Logger.log('Logo Foresea erro (id=' + FORESEA_LOGO_IDS[li] + '): ' + e); }
  }
  cLogo.setWidth(260).setPaddingTop(14).setPaddingBottom(14).setPaddingRight(14);

  body.appendParagraph('Diagnóstico coletivo e anônimo para desenvolvimento da equipe. Nenhum profissional é identificado.').editAsText()
    .setItalic(true).setForegroundColor('#888888').setFontSize(8).setBold(false);
  body.appendParagraph(' ');

  var idx = body.getNumChildren();

  // ══════════════════════════════════════════════════════════════════════════
  // CONTEXTO
  // ══════════════════════════════════════════════════════════════════════════
  if (json.contexto) {
    body.insertParagraph(idx++, _ia4Safe(json.contexto)).editAsText()
      .setBold(false).setFontSize(10).setForegroundColor('#444444');
    body.insertParagraph(idx++, ' ');
  }

  // ══════════════════════════════════════════════════════════════════════════
  // FORÇAS — cards visuais com dado grande (24pt)
  // ══════════════════════════════════════════════════════════════════════════
  var forcas = json.forcas || [];
  var cardParticipacao = {
    competencia_ou_descritor: 'Participação da Equipe',
    dado: dados.totalColaboradores + ' de ' + dados.totalColaboradores + ' — 100%',
    significado: 'Toda a equipe participou do diagnóstico. A disposição de olhar para a própria prática é a primeira e mais importante força de qualquer grupo.',
    celebracao: 'Isso demonstra maturidade profissional e compromisso com o crescimento coletivo.'
  };

  var pForcas = body.insertParagraph(idx++, '💪  NOSSAS FORÇAS');
  pForcas.setHeading(DocumentApp.ParagraphHeading.HEADING1);
  pForcas.editAsText().setForegroundColor(TEAL).setBold(true).setFontSize(20);
  body.insertParagraph(idx++, ' ');

  var allForcas = [cardParticipacao].concat(forcas);
  allForcas.forEach(function(f) {
    var tF = body.insertTable(idx++);
    tF.setBorderWidth(0);
    var rF = tF.appendTableRow();

    // Barra lateral teal
    var cBar = rF.appendTableCell();
    _ia4LimparCelula(cBar);
    cBar.setBackgroundColor(TEAL);
    cBar.appendParagraph(' ').editAsText().setFontSize(1);
    cBar.setWidth(6).setPaddingTop(0).setPaddingBottom(0).setPaddingLeft(0).setPaddingRight(0);

    // Conteúdo
    var cContent = rF.appendTableCell();
    _ia4LimparCelula(cContent);
    cContent.setBackgroundColor('#E8F8F5');
    cContent.appendParagraph(_ia4Safe(f.competencia_ou_descritor || '')).editAsText()
      .setBold(true).setForegroundColor(TEAL).setFontSize(13);
    cContent.appendParagraph(_ia4Safe(f.dado || '')).editAsText()
      .setBold(true).setForegroundColor(NAVY).setFontSize(24);
    cContent.appendParagraph(_ia4Safe(f.significado || '')).editAsText()
      .setBold(false).setForegroundColor('#333333').setFontSize(10);
    if (f.celebracao) cContent.appendParagraph(_ia4Safe(f.celebracao)).editAsText()
      .setBold(false).setItalic(true).setForegroundColor(TEAL).setFontSize(9);
    cContent.setPaddingTop(12).setPaddingBottom(12).setPaddingLeft(14).setPaddingRight(14);

    body.insertParagraph(idx++, ' ');
  });

  // ══════════════════════════════════════════════════════════════════════════
  // RETRATO GERAL — cores por nível com % grande
  // ══════════════════════════════════════════════════════════════════════════
  var retrato = json.retrato_geral || {};
  body.insertParagraph(idx++, '📊  RETRATO GERAL').setHeading(DocumentApp.ParagraphHeading.HEADING1)
    .editAsText().setForegroundColor(NAVY).setBold(true).setFontSize(20);
  body.insertParagraph(idx++, ' ');

  var dist = dados.distribuicao_geral || {};
  var nivelData = [
    { label: 'Nível 1 — GAP',                pct: dist.n1_pct||0, sig: 'Precisa de desenvolvimento estruturado', bg: N1_BG, cor: N1_BOLD },
    { label: 'Nível 2 — Em Desenvolvimento', pct: dist.n2_pct||0, sig: 'Boa intenção, execução a melhorar',      bg: N2_BG, cor: N2_BOLD },
    { label: 'Nível 3 — META ✓',            pct: dist.n3_pct||0, sig: 'Prática consistente',                    bg: N3_BG, cor: N3_BOLD },
    { label: 'Nível 4 — Referência',         pct: dist.n4_pct||0, sig: 'Excelência que inspira',                 bg: N4_BG, cor: N4_BOLD },
  ];
  var tDist = body.insertTable(idx++);
  tDist.setBorderWidth(1).setBorderColor('#DEE2E6');
  var rDH = tDist.appendTableRow();
  ['Nível', '% Equipe', 'Significado'].forEach(function(h) {
    var hc = rDH.appendTableCell(h);
    hc.editAsText().setBold(true).setForegroundColor('#FFFFFF').setFontSize(10);
    hc.setBackgroundColor(NAVY);
    hc.getChild(0).asParagraph().setAlignment(DocumentApp.HorizontalAlignment.CENTER);
  });
  nivelData.forEach(function(n) {
    var r = tDist.appendTableRow();
    var c0 = r.appendTableCell(n.label);
    c0.editAsText().setBold(true).setFontSize(11).setForegroundColor(n.cor);
    c0.setBackgroundColor(n.bg);
    var c1 = r.appendTableCell(n.pct + '%');
    c1.editAsText().setBold(true).setFontSize(22).setForegroundColor(n.cor);
    c1.setBackgroundColor(n.bg);
    c1.getChild(0).asParagraph().setAlignment(DocumentApp.HorizontalAlignment.CENTER);
    var c2 = r.appendTableCell(n.sig);
    c2.editAsText().setBold(false).setFontSize(9).setForegroundColor('#555555');
    c2.setBackgroundColor(n.bg);
  });
  body.insertParagraph(idx++, ' ');

  // ══════════════════════════════════════════════════════════════════════════
  // DESCRITORES POR COMPETÊNCIA — heatmap intenso + separadores visuais
  // ══════════════════════════════════════════════════════════════════════════
  body.insertParagraph(idx++, '🔎  DESCRITORES POR COMPETÊNCIA').setHeading(DocumentApp.ParagraphHeading.HEADING1)
    .editAsText().setForegroundColor(NAVY).setBold(true).setFontSize(20);
  body.insertParagraph(idx++, ' ');

  var mergulho = json.mergulho_descritores || [];
  var iaByComp = {};
  mergulho.forEach(function(m) {
    iaByComp[_ia4Safe(m.competencia || '').toLowerCase()] = m;
  });

  var compColors = [TEAL, GOLD, N1_BOLD, N4_BOLD, '#8E44AD', '#D35400'];

  dados.competencias.forEach(function(comp, compIdx) {
    var media = comp.media || 0;
    var accent = media < 2 ? N1_BOLD : media < 3 ? GOLD : TEAL;

    // ── Separador visual entre competências — barra teal larga ──
    if (compIdx > 0) {
      body.insertParagraph(idx++, ' ');
      var tSep = body.insertTable(idx++);
      tSep.setBorderWidth(0);
      var cSep = tSep.appendTableRow().appendTableCell();
      _ia4LimparCelula(cSep);
      cSep.setBackgroundColor(TEAL);
      cSep.appendParagraph(' ').editAsText().setFontSize(4);
      cSep.setPaddingTop(2).setPaddingBottom(2);
      body.insertParagraph(idx++, ' ');
    }

    // ── Header competência com barra lateral colorida ──
    var tCompH = body.insertTable(idx++);
    tCompH.setBorderWidth(0);
    var rCompH = tCompH.appendTableRow();

    // Barra lateral colorida (6px)
    var cBarL = rCompH.appendTableCell();
    _ia4LimparCelula(cBarL);
    cBarL.setBackgroundColor(accent);
    cBarL.appendParagraph(' ').editAsText().setFontSize(1);
    cBarL.setWidth(6).setPaddingTop(0).setPaddingBottom(0).setPaddingLeft(0).setPaddingRight(0);

    // Conteúdo header
    var cCompT = rCompH.appendTableCell();
    _ia4LimparCelula(cCompT);
    cCompT.setBackgroundColor(media < 2 ? '#FDEDEC' : media < 3 ? '#FEF9E7' : '#EAFAF1');
    var flagTxt = media < 2 ? '  ⚠️ PRIORIDADE' : '';
    var compTitulo = _ia4Safe(comp.competencia) + '  (' + (comp.total_avaliacoes || 0) + ' avaliações)';
    cCompT.appendParagraph(compTitulo).editAsText()
      .setBold(true).setForegroundColor(NAVY).setFontSize(14);

    // Média grande inline
    var pMedia = cCompT.appendParagraph('Média: ' + media + flagTxt);
    pMedia.editAsText().setFontSize(10).setForegroundColor('#666666').setBold(false);
    var mediaTxt = String(media);
    var startM = 7;
    pMedia.editAsText().setFontSize(startM, startM + mediaTxt.length - 1, 24);
    pMedia.editAsText().setBold(startM, startM + mediaTxt.length - 1, true);
    pMedia.editAsText().setForegroundColor(startM, startM + mediaTxt.length - 1, accent);

    cCompT.setPaddingTop(10).setPaddingBottom(10).setPaddingLeft(14).setPaddingRight(14);

    // Barra de distribuição por nível — mini tabela inline com cores fortes
    var tNiv = body.insertTable(idx++);
    tNiv.setBorderWidth(1).setBorderColor('#DEE2E6');
    var rNH = tNiv.appendTableRow();
    ['Nível 1 (Gap)', 'Nível 2 (Desenv.)', 'Nível 3 (Meta)', 'Nível 4 (Ref.)'].forEach(function(h) {
      var hc = rNH.appendTableCell(h);
      hc.editAsText().setBold(true).setFontSize(7).setForegroundColor('#FFFFFF');
      hc.setBackgroundColor(NAVY);
      hc.getChild(0).asParagraph().setAlignment(DocumentApp.HorizontalAlignment.CENTER);
    });
    var rNV = tNiv.appendTableRow();
    var nivPcts = [
      { v: comp.pct_n1||0, bg: N1_BG, cor: N1_BOLD },
      { v: comp.pct_n2||0, bg: N2_BG, cor: N2_BOLD },
      { v: comp.pct_n3||0, bg: N3_BG, cor: N3_BOLD },
      { v: comp.pct_n4||0, bg: N4_BG, cor: N4_BOLD },
    ];
    nivPcts.forEach(function(n) {
      var cN = rNV.appendTableCell(n.v + '%');
      cN.editAsText().setBold(true).setFontSize(18).setForegroundColor(n.cor);
      cN.setBackgroundColor(n.bg);
      cN.getChild(0).asParagraph().setAlignment(DocumentApp.HorizontalAlignment.CENTER);
    });

    // ── Tabela de descritores com heatmap intenso ──
    var descs = comp.descritores || [];
    if (descs.length > 0) {
      var tD = body.insertTable(idx++);
      tD.setBorderWidth(1).setBorderColor('#DEE2E6');
      var rDHd = tD.appendTableRow();
      ['Descritor', 'Nível 1 (Gap)', 'Nível 2 (Desenv.)', 'Nível 3 (Meta)', 'Nível 4 (Ref.)'].forEach(function(h, hi) {
        var hCell = rDHd.appendTableCell(h);
        hCell.editAsText().setBold(true).setFontSize(8).setForegroundColor('#FFFFFF');
        hCell.setBackgroundColor(NAVY);
        if (hi === 0) {
          hCell.setWidth(200);
        } else {
          hCell.getChild(0).asParagraph().setAlignment(DocumentApp.HorizontalAlignment.CENTER);
        }
      });

      descs.forEach(function(d) {
        var n1 = d.pct_n1||0, n2 = d.pct_n2||0, n3 = d.pct_n3||0, n4 = d.pct_n4||0;
        var semDados = (n1 === 0 && n2 === 0 && n3 === 0 && n4 === 0);
        var rD = tD.appendTableRow();

        // Coluna descritor (larga)
        var nomeCell = rD.appendTableCell('');
        _ia4LimparCelula(nomeCell);
        nomeCell.setWidth(200);
        var pNome = nomeCell.appendParagraph(_ia4Safe(d.nome || ''));
        pNome.editAsText().setFontSize(9).setBold(false).setForegroundColor(semDados ? '#AAAAAA' : NAVY);
        if (semDados) pNome.editAsText().setItalic(true);

        if (semDados) {
          rD.appendTableCell('').setBackgroundColor('#F5F5F5');
          var seCell = rD.appendTableCell('');
          _ia4LimparCelula(seCell);
          seCell.setBackgroundColor('#F5F5F5');
          var pSe = seCell.appendParagraph('Sem evidência suficiente');
          pSe.editAsText().setFontSize(9).setItalic(true).setForegroundColor('#AAAAAA').setBold(false);
          pSe.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
          rD.appendTableCell('').setBackgroundColor('#F5F5F5');
          rD.appendTableCell('').setBackgroundColor('#F5F5F5');
        } else {
          var pctData = [
            { v: n1, bg: _heatN1(n1),
              cor: n1 >= 80 ? '#FFFFFF' : n1 >= 50 ? '#FFFFFF' : n1 > 0 ? N1_BOLD : '#999999',
              bold: n1 >= 50 },
            { v: n2, bg: n2 >= 40 ? N2_BG : n2 >= 20 ? '#FEF9E7' : '#FFFFFF',
              cor: n2 > 0 ? N2_BOLD : '#999999',
              bold: n2 >= 40 },
            { v: n3, bg: n3 > 0 ? '#D5F5E3' : '#FFFFFF',
              cor: n3 > 0 ? N3_BOLD : '#999999',
              bold: n3 >= 50 },
            { v: n4, bg: _heatN3N4(n4),
              cor: n4 > 0 ? N4_BOLD : '#999999',
              bold: n4 >= 50 },
          ];
          pctData.forEach(function(item) {
            var cell = rD.appendTableCell('');
            _ia4LimparCelula(cell);
            cell.setBackgroundColor(item.bg);
            var pVal = cell.appendParagraph(item.v + '%');
            pVal.editAsText().setFontSize(11).setBold(item.bold).setForegroundColor(item.cor);
            pVal.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
          });
        }
      });
    }

    // Interpretação da IA
    var iaComp = iaByComp[comp.competencia.toLowerCase()] || {};
    if (iaComp.forca_descritor || iaComp.oportunidade_descritor || iaComp.interpretacao) {
      var tInt = body.insertTable(idx++);
      tInt.setBorderWidth(0);
      var cInt = tInt.appendTableRow().appendTableCell();
      _ia4LimparCelula(cInt);
      cInt.setBackgroundColor(CINZA);
      if (iaComp.forca_descritor) {
        cInt.appendParagraph('✅ Força: ' + _ia4Safe(iaComp.forca_descritor.nome || '') + ' — ' + _ia4Safe(iaComp.forca_descritor.dado || ''))
          .editAsText().setBold(false).setForegroundColor(N3_BOLD).setFontSize(9);
      }
      if (iaComp.oportunidade_descritor) {
        cInt.appendParagraph('🔸 Oportunidade: ' + _ia4Safe(iaComp.oportunidade_descritor.nome || '') + ' — ' + _ia4Safe(iaComp.oportunidade_descritor.dado || ''))
          .editAsText().setBold(false).setForegroundColor('#E65100').setFontSize(9);
      }
      if (iaComp.interpretacao) {
        cInt.appendParagraph(_ia4Safe(iaComp.interpretacao)).editAsText()
          .setBold(false).setItalic(true).setForegroundColor('#555555').setFontSize(9);
      }
      cInt.setPaddingTop(6).setPaddingBottom(6).setPaddingLeft(10).setPaddingRight(10);
    }
    body.insertParagraph(idx++, ' ');
  });

  // ══════════════════════════════════════════════════════════════════════════
  // PADRÕES IDENTIFICADOS
  // ══════════════════════════════════════════════════════════════════════════
  var padroes = json.padroes || [];
  if (padroes.length > 0) {
    body.insertParagraph(idx++, '🧩  PADRÕES IDENTIFICADOS').setHeading(DocumentApp.ParagraphHeading.HEADING1)
      .editAsText().setForegroundColor(NAVY).setBold(true).setFontSize(18);
    body.insertParagraph(idx++, ' ');
    padroes.forEach(function(p, pi) {
      var tP = body.insertTable(idx++);
      tP.setBorderWidth(0);
      var rP = tP.appendTableRow();
      // Barra lateral
      var cPBar = rP.appendTableCell();
      _ia4LimparCelula(cPBar);
      cPBar.setBackgroundColor(NAVY);
      cPBar.appendParagraph(String(pi + 1)).editAsText()
        .setBold(true).setFontSize(16).setForegroundColor(GOLD);
      cPBar.getChild(cPBar.getNumChildren()-1).asParagraph().setAlignment(DocumentApp.HorizontalAlignment.CENTER);
      cPBar.setWidth(35).setPaddingTop(8).setPaddingBottom(8);
      // Conteúdo
      var cPC = rP.appendTableCell();
      _ia4LimparCelula(cPC);
      cPC.setBackgroundColor('#EBF5FB');
      cPC.appendParagraph(_ia4Safe(p.titulo || '')).editAsText().setBold(true).setForegroundColor(NAVY).setFontSize(11);
      cPC.appendParagraph(_ia4Safe(p.descricao || '')).editAsText().setBold(false).setForegroundColor('#333333').setFontSize(10);
      cPC.setPaddingTop(8).setPaddingBottom(8).setPaddingLeft(12).setPaddingRight(12);
      body.insertParagraph(idx++, ' ');
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PRIORIDADES DE FORMAÇÃO
  // ══════════════════════════════════════════════════════════════════════════
  var prioridades = json.prioridades_formacao || [];
  if (prioridades.length > 0) {
    var tPrioH = body.insertTable(idx++);
    tPrioH.setBorderWidth(0);
    var cPrioH = tPrioH.appendTableRow().appendTableCell();
    _ia4LimparCelula(cPrioH);
    cPrioH.setBackgroundColor(GOLD);
    cPrioH.appendParagraph('🎯  PRIORIDADES DE FORMAÇÃO').editAsText()
      .setBold(true).setForegroundColor('#FFFFFF').setFontSize(18);
    cPrioH.setPaddingTop(12).setPaddingBottom(12).setPaddingLeft(16).setPaddingRight(16);
    body.insertParagraph(idx++, ' ');

    if (prioridades.length <= 4) {
      var tPrio = body.insertTable(idx++);
      tPrio.setBorderWidth(0);
      var rPrio = tPrio.appendTableRow();

      prioridades.forEach(function(pr, pi) {
        var cPr = rPrio.appendTableCell();
        _ia4LimparCelula(cPr);
        cPr.setBackgroundColor('#EBF5FB');

        cPr.appendParagraph(String(pr.prioridade || pi + 1)).editAsText()
          .setBold(true).setFontSize(32).setForegroundColor(GOLD);
        cPr.getChild(cPr.getNumChildren()-1).asParagraph().setAlignment(DocumentApp.HorizontalAlignment.CENTER);

        cPr.appendParagraph(_ia4Safe(pr.foco || '')).editAsText()
          .setBold(true).setForegroundColor(NAVY).setFontSize(10);

        if (pr.por_que) cPr.appendParagraph(_ia4Safe(pr.por_que)).editAsText()
          .setBold(false).setForegroundColor('#333333').setFontSize(8);
        if (pr.impacto_alunos) cPr.appendParagraph('🎓 ' + _ia4Safe(pr.impacto_alunos)).editAsText()
          .setBold(false).setForegroundColor(TEAL).setFontSize(8);
        if (pr.formato_sugerido) cPr.appendParagraph('📋 ' + _ia4Safe(pr.formato_sugerido)).editAsText()
          .setBold(false).setForegroundColor('#555555').setFontSize(8);
        if (pr.quando_comecar) cPr.appendParagraph('⏰ ' + _ia4Safe(pr.quando_comecar)).editAsText()
          .setBold(true).setForegroundColor(GOLD).setFontSize(8);

        cPr.setPaddingTop(10).setPaddingBottom(10).setPaddingLeft(8).setPaddingRight(8);
      });
      body.insertParagraph(idx++, ' ');
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // AÇÕES IMEDIATAS — cards de compromisso com borda lateral
  // ══════════════════════════════════════════════════════════════════════════
  var acoes = json.acoes_imediatas || [];
  if (acoes.length > 0) {
    var tAcaoH = body.insertTable(idx++);
    tAcaoH.setBorderWidth(0);
    var cAcaoH = tAcaoH.appendTableRow().appendTableCell();
    _ia4LimparCelula(cAcaoH);
    cAcaoH.setBackgroundColor(TEAL);
    cAcaoH.appendParagraph('🚀  O QUE JÁ PODEMOS FAZER JUNTOS').editAsText()
      .setBold(true).setForegroundColor('#FFFFFF').setFontSize(18);
    cAcaoH.setPaddingTop(14).setPaddingBottom(14).setPaddingLeft(16).setPaddingRight(16);
    body.insertParagraph(idx++, ' ');

    var acaoCores = [TEAL, NAVY, GOLD, N4_BOLD];
    acoes.forEach(function(a, i) {
      var tA = body.insertTable(idx++);
      tA.setBorderWidth(0);
      var rA = tA.appendTableRow();

      // Borda lateral colorida
      var cBord = rA.appendTableCell();
      _ia4LimparCelula(cBord);
      cBord.setBackgroundColor(acaoCores[i % acaoCores.length]);
      cBord.appendParagraph(String(i + 1)).editAsText()
        .setBold(true).setFontSize(20).setForegroundColor('#FFFFFF');
      cBord.getChild(cBord.getNumChildren()-1).asParagraph().setAlignment(DocumentApp.HorizontalAlignment.CENTER);
      cBord.setWidth(40).setPaddingTop(10).setPaddingBottom(10);

      // Conteúdo da ação — card de compromisso
      var cAC = rA.appendTableCell();
      _ia4LimparCelula(cAC);
      cAC.setBackgroundColor('#E8F8F5');
      cAC.appendParagraph(_ia4Safe(a.o_que || '')).editAsText()
        .setBold(true).setForegroundColor(NAVY).setFontSize(11);
      var detalhes = [];
      if (a.quando) detalhes.push('📅 ' + _ia4Safe(a.quando));
      if (a.quem) detalhes.push('👥 ' + _ia4Safe(a.quem));
      if (detalhes.length) cAC.appendParagraph(detalhes.join('  •  ')).editAsText()
        .setBold(false).setForegroundColor('#555555').setFontSize(9);
      if (a.resultado_30_dias) {
        cAC.appendParagraph('✅ Em 30 dias: ' + _ia4Safe(a.resultado_30_dias)).editAsText()
          .setBold(true).setForegroundColor(TEAL).setFontSize(10);
      }
      cAC.setPaddingTop(10).setPaddingBottom(10).setPaddingLeft(14).setPaddingRight(14);

      body.insertParagraph(idx++, ' ');
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PROFISSIONAIS REFERÊNCIA
  // ══════════════════════════════════════════════════════════════════════════
  if (json.profissionais_referencia) {
    body.insertParagraph(idx++, '🌟  NOSSOS PROFISSIONAIS REFERÊNCIA').setHeading(DocumentApp.ParagraphHeading.HEADING1)
      .editAsText().setForegroundColor(GOLD).setBold(true).setFontSize(14);
    var tRef = body.insertTable(idx++);
    tRef.setBorderWidth(0);
    var cRef = tRef.appendTableRow().appendTableCell();
    cRef.setBackgroundColor('#FEF9E7');
    _ia4LimparCelula(cRef);
    cRef.appendParagraph(_ia4Safe(json.profissionais_referencia)).editAsText()
      .setBold(false).setForegroundColor(NAVY).setFontSize(10);
    cRef.setPaddingTop(12).setPaddingBottom(12).setPaddingLeft(16).setPaddingRight(16);
    body.insertParagraph(idx++, ' ');
  }

  // ══════════════════════════════════════════════════════════════════════════
  // MENSAGEM FINAL — fundo navy com destaque visual
  // ══════════════════════════════════════════════════════════════════════════
  if (json.mensagem_final) {
    body.insertParagraph(idx++, ' ');
    var tFinal = body.insertTable(idx++);
    tFinal.setBorderWidth(2).setBorderColor(GOLD);
    var cFinal = tFinal.appendTableRow().appendTableCell();
    _ia4LimparCelula(cFinal);
    cFinal.setBackgroundColor(NAVY);

    var pStar1 = cFinal.appendParagraph('✦  ✦  ✦');
    pStar1.editAsText().setForegroundColor(GOLD).setFontSize(14).setBold(true);
    pStar1.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
    pStar1.setSpacingAfter(6);

    var pMsg = cFinal.appendParagraph(_ia4Safe(json.mensagem_final));
    pMsg.editAsText().setBold(false).setItalic(true).setForegroundColor('#FFFFFF').setFontSize(13);
    pMsg.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
    pMsg.setSpacingBefore(4).setSpacingAfter(6);

    var pStar2 = cFinal.appendParagraph('✦  ✦  ✦');
    pStar2.editAsText().setForegroundColor(GOLD).setFontSize(14).setBold(true);
    pStar2.setAlignment(DocumentApp.HorizontalAlignment.CENTER);

    cFinal.setPaddingTop(24).setPaddingBottom(24).setPaddingLeft(30).setPaddingRight(30);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Forçar fonte Syne + line spacing em TODO o documento (padrão Foresea)
  // ══════════════════════════════════════════════════════════════════════════
  var _applyFont = function(para) {
    para.editAsText().setFontFamily(FORESEA_FONT);
    para.setLineSpacing(1.5);
    // Garantir padding extra nas descendentes via spacingAfter mínimo
    if ((para.getSpacingAfter() || 0) < 2) para.setSpacingAfter(2);
  };
  for (var ei = 0; ei < body.getNumChildren(); ei++) {
    var child = body.getChild(ei);
    var tipo = child.getType();
    if (tipo === DocumentApp.ElementType.PARAGRAPH) {
      _applyFont(child.asParagraph());
    } else if (tipo === DocumentApp.ElementType.TABLE) {
      var tbl = child.asTable();
      for (var tri = 0; tri < tbl.getNumRows(); tri++) {
        var trow = tbl.getRow(tri);
        for (var tci = 0; tci < trow.getNumCells(); tci++) {
          var cellEl = trow.getCell(tci);
          for (var pi = 0; pi < cellEl.getNumChildren(); pi++) {
            var cp = cellEl.getChild(pi);
            if (cp.getType() === DocumentApp.ElementType.PARAGRAPH) {
              _applyFont(cp.asParagraph());
            }
          }
        }
      }
    }
  }
}
