// ═══════════════════════════════════════════════════════════════════════════════
// VERTHO MENTOR IA — TrilhaBuilder.js
// Monta trilhas de 14 semanas personalizadas por colaborador × competência.
// Usa catálogo enriquecido + perfil CIS para personalização.
// Paleta: navy #0F2B54 · teal #0D9488 · gold #F59E0B
// ═══════════════════════════════════════════════════════════════════════════════

// ── Estrutura das 14 semanas ────────────────────────────────────────────────
// Bloco 1: Sem 1-3 conteúdo, Sem 4 aplicação
// Bloco 2: Sem 5-7 conteúdo, Sem 8 aplicação
// Bloco 3: Sem 9-11 conteúdo, Sem 12 aplicação
// Fechamento: Sem 13 revisão (micro-desafios), Sem 14 revisão (autoavaliação)
// ═══════════════════════════════════════════════════════════════════════════════


/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * ENTRY POINT — Chamado pelo menu. Lê avaliados e monta trilhas em lote.
 * ═══════════════════════════════════════════════════════════════════════════════
 */
function montarTrilhasLote() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ui = SpreadsheetApp.getUi();

  // ── Ler abas necessárias ──────────────────────────────────────────────────
  var wsRes   = ss.getSheetByName(F4_ABA_RESPOSTAS);
  var wsColab = ss.getSheetByName('Colaboradores');
  var wsTri   = ss.getSheetByName(F4_ABA_TRILHAS);

  if (!wsRes)   { ui.alert('Aba "' + F4_ABA_RESPOSTAS + '" não encontrada.'); return; }
  if (!wsColab) { ui.alert('Aba "Colaboradores" não encontrada.'); return; }

  // ── Garantir aba Trilhas com headers corretos (11 colunas) ───────────────
  var _TB_HEADERS = ['Email','Competência','Nível Entrada','Semana','Tipo Semana',
    'Título da Pílula','URL Moodle','Descrição Breve','Descritor Foco','Nota Descritor','Fonte','Status'];
  if (!wsTri) {
    wsTri = ss.insertSheet(F4_ABA_TRILHAS);
    wsTri.getRange(1, 1, 1, _TB_HEADERS.length).setValues([_TB_HEADERS])
      .setFontWeight('bold').setBackground('#0F2B54').setFontColor('#FFFFFF');
    wsTri.setFrozenRows(1);
  } else {
    // Validar headers — se não batem, limpar e recriar
    var hdrAtual = wsTri.getRange(1, 1, 1, wsTri.getLastColumn()).getValues()[0];
    var hdrOk = hdrAtual.length >= _TB_HEADERS.length
      && _TB_HEADERS.every(function(h, i) {
        return _cobNorm(String(hdrAtual[i]||'')) === _cobNorm(h);
      });
    if (!hdrOk) {
      Logger.log('TrilhaBuilder: headers desatualizados (' + hdrAtual.length + ' cols). Limpando e recriando.');
      wsTri.clear();
      wsTri.getRange(1, 1, 1, _TB_HEADERS.length).setValues([_TB_HEADERS])
        .setFontWeight('bold').setBackground('#0F2B54').setFontColor('#FFFFFF');
      wsTri.setFrozenRows(1);
    }
  }

  // ── Carregar dados de apoio ───────────────────────────────────────────────
  var catalogo      = _cobLerCatalogo(ss);
  var baseComp      = _lerBaseCompetenciasV2(ss);
  var dadosRespostas = wsRes.getDataRange().getValues();

  Logger.log('TrilhaBuilder: catálogo com ' + catalogo.length + ' itens, competências: ' + Object.keys(baseComp).length);

  // ── Localizar colunas D1-D6 Nota dinamicamente ─────────────────────────
  var hdrRes = dadosRespostas[0];
  var _normH = function(s) { return String(s||'').toLowerCase().replace(/\s+/g,'').replace(/[áàâã]/g,'a').replace(/[éèê]/g,'e').replace(/[íì]/g,'i').replace(/[óòô]/g,'o').replace(/[úù]/g,'u'); };
  var iDCols = [];
  for (var di = 1; di <= 6; di++) {
    var target = 'd' + di + 'nota';
    var found = -1;
    for (var hi = 0; hi < hdrRes.length; hi++) {
      if (_normH(hdrRes[hi]) === target) { found = hi; break; }
    }
    iDCols.push(found);
  }

  // ── Coletar avaliados — UMA trilha por colaborador (competência de menor nível) ──
  var porEmail = {};  // email → { ...dados, nivel, notasDescritores }
  for (var r = 1; r < dadosRespostas.length; r++) {
    var row   = dadosRespostas[r];
    var email = String(row[F4R_EMAIL - 1] || '').trim().toLowerCase();
    var cargo = String(row[F4R_CARGO - 1] || '').trim();
    var compId   = String(row[F4R_ID_COMP - 1] || '').trim();
    var compNome = String(row[F4R_NOME_COMP - 1] || '').trim();
    var nivel    = parseInt(row[F4R_NIVEL_IA4 - 1]) || 0;

    if (!email || !compNome || nivel <= 0) continue;

    // Ler notas por descritor das colunas D1-D6 Nota
    var notasDesc = {};
    for (var dd = 0; dd < 6; dd++) {
      if (iDCols[dd] >= 0) {
        var val = parseFloat(row[iDCols[dd]]);
        if (isFinite(val) && val > 0) {
          notasDesc[String(dd + 1)] = { nivel: val };
        }
      }
    }

    // Manter apenas a competência de menor nível por colaborador
    if (!porEmail[email] || nivel < porEmail[email].nivel) {
      porEmail[email] = {
        email: email,
        cargo: cargo,
        compId: compId,
        compNome: compNome,
        nivel: nivel,
        notasDescritores: notasDesc
      };
    }
  }

  var avaliados = [];
  var emails = Object.keys(porEmail);
  for (var e = 0; e < emails.length; e++) {
    avaliados.push(porEmail[emails[e]]);
  }

  if (avaliados.length === 0) {
    ui.alert('Nenhum colaborador avaliado encontrado em "' + F4_ABA_RESPOSTAS + '".');
    return;
  }

  Logger.log('TrilhaBuilder: ' + avaliados.length + ' colaborador(es), cada um com a competência de menor nível');

  // ── Montar trilhas ────────────────────────────────────────────────────────
  var todasLinhas = [];
  var contSucesso = 0;

  for (var a = 0; a < avaliados.length; a++) {
    var av = avaliados[a];

    // Buscar descritores da competência
    var descritoresV2 = baseComp[av.compId] ? baseComp[av.compId].descritores : [];

    // Ler perfil CIS do colaborador
    var perfilCIS = _tbLerPerfilCIS(wsColab, av.email);

    try {
      var linhas = montarTrilha(
        av.email, av.cargo, av.compNome, av.compId,
        av.nivel, catalogo, descritoresV2, perfilCIS, av.notasDescritores
      );
      for (var l = 0; l < linhas.length; l++) {
        todasLinhas.push(linhas[l]);
      }
      contSucesso++;
    } catch (e) {
      Logger.log('TrilhaBuilder ERRO para ' + av.email + ' / ' + av.compNome + ': ' + e.message);
    }
  }

  // ── Gravar tudo na aba Trilhas ────────────────────────────────────────────
  if (todasLinhas.length > 0) {
    var ultimaLinha = Math.max(wsTri.getLastRow(), 1);
    wsTri.getRange(ultimaLinha + 1, 1, todasLinhas.length, todasLinhas[0].length)
         .setValues(todasLinhas);
  }

  var msg = contSucesso + ' trilha(s) montada(s) com ' + todasLinhas.length + ' linhas no total.';
  Logger.log('TrilhaBuilder: ' + msg);
  ss.toast(msg, 'Trilhas montadas', 5);
}


/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * MONTAR TRILHA — Gera 14 semanas para 1 colaborador × 1 competência
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * REGRA CRÍTICA: nivelEntrada=1 → TODO conteúdo foca N1→N2 (catálogo nível 1).
 *                nivelEntrada=2 → TODO conteúdo foca N2→N3 (catálogo nível 2).
 *                NUNCA misturar níveis.
 *
 * @param {string} email
 * @param {string} cargo
 * @param {string} compNome
 * @param {string} compId
 * @param {number} nivelEntrada - 1, 2 ou 3
 * @param {Array}  catalogoItems - resultado de _cobLerCatalogo()
 * @param {Array}  descritoresV2 - descritores da competência [{cod, nome_curto, completo, n1, n2, n3, n4}]
 * @param {Object} perfilCIS - resultado de _tbLerPerfilCIS()
 * @returns {Array} 14 rows de 11 colunas cada
 */
function montarTrilha(email, cargo, compNome, compId, nivelEntrada, catalogoItems, descritoresV2, perfilCIS, notasDescritores) {
  var nivelAlvo = nivelEntrada;
  var linhas = [];
  notasDescritores = notasDescritores || {};

  // ── Buscar cursos do catálogo para esta comp/cargo/nível ──────────────────
  var cursosDisponiveis = _tbBuscarCursos(compNome, cargo, nivelAlvo, catalogoItems);
  Logger.log('TrilhaBuilder montarTrilha: ' + email + ' | ' + compNome + ' | nível ' + nivelEntrada + ' → ' + cursosDisponiveis.length + ' curso(s)');

  // ── Ordenar descritores por nota (menor → maior = pior primeiro) ──────────
  var descComNota = [];
  for (var d = 0; d < descritoresV2.length; d++) {
    var desc = descritoresV2[d];
    var dNum = String(d + 1);
    var notaInfo = notasDescritores[dNum] || {};
    descComNota.push({
      nome_curto: desc.nome_curto || '',
      completo:   desc.completo || '',
      cod:        desc.cod || ('D' + (d + 1)),
      n1: desc.n1, n2: desc.n2, n3: desc.n3, n4: desc.n4,
      nota:       notaInfo.nivel || 0,
      confianca:  notaInfo.confianca || 0
    });
  }
  descComNota.sort(function(a, b) { return a.nota - b.nota; }); // menor nota primeiro

  // ── Distribuir: top 3 piores = 2 semanas cada, 3 restantes = 1 semana cada ─
  // Resultado: 6 + 3 = 9 semanas de conteúdo
  var semanasConteudo = []; // [{desc, nota}, ...] — 9 itens
  var nDesc = descComNota.length; // normalmente 6
  for (var i = 0; i < nDesc; i++) {
    semanasConteudo.push(descComNota[i]);
    if (i < 3) { // top 3 piores recebem 2ª semana
      semanasConteudo.push(descComNota[i]);
    }
  }
  // Se houver menos de 6 descritores, completar até 9
  while (semanasConteudo.length < 9) {
    semanasConteudo.push(descComNota[semanasConteudo.length % nDesc]);
  }

  Logger.log('TrilhaBuilder: distribuição = ' + semanasConteudo.map(function(d) { return d.nome_curto + '(N' + d.nota + ')'; }).join(' | '));

  // ── Índice de curso consumido ─────────────────────────────────────────────
  var cursoIdx = 0;

  // ────────────────────────────────────────────────────────────────────────────
  // BLOCO 1: Semanas 1-3 (conteúdo do 1º pior descritor ×2 + 2º pior ×1)
  // ────────────────────────────────────────────────────────────────────────────
  for (var s = 0; s < 3; s++) {
    var descFoco = semanasConteudo[s];
    var curso = _tbConsumirCurso(cursosDisponiveis, cursoIdx, descFoco);
    cursoIdx = curso.nextIdx;
    linhas.push(_tbCriarLinhaConteudo(email, compNome, nivelEntrada, s + 1, descFoco, curso));
  }
  // Semana 4: micro-desafio bloco 1
  var descsBloco1 = [descComNota[0], descComNota[1]];
  var desafio1 = _tbGerarMicroDesafio(1, descsBloco1, compNome, cargo, descsBloco1, perfilCIS);
  linhas.push(_tbCriarLinhaAplicacao(email, compNome, nivelEntrada, 4, desafio1));

  // ────────────────────────────────────────────────────────────────────────────
  // BLOCO 2: Semanas 5-7 (2º pior desc 2ª sem + 3º pior ×2)
  // ────────────────────────────────────────────────────────────────────────────
  for (var s2 = 0; s2 < 3; s2++) {
    var descFoco2 = semanasConteudo[3 + s2];
    var curso2 = _tbConsumirCurso(cursosDisponiveis, cursoIdx, descFoco2);
    cursoIdx = curso2.nextIdx;
    linhas.push(_tbCriarLinhaConteudo(email, compNome, nivelEntrada, s2 + 5, descFoco2, curso2));
  }
  // Semana 8: micro-desafio bloco 2
  var descsBloco2 = [descComNota[1], descComNota[2]];
  var desafio2 = _tbGerarMicroDesafio(2, descsBloco2, compNome, cargo, descsBloco2, perfilCIS);
  linhas.push(_tbCriarLinhaAplicacao(email, compNome, nivelEntrada, 8, desafio2));

  // ────────────────────────────────────────────────────────────────────────────
  // BLOCO 3: Semanas 9-11 (4º, 5º, 6º descritor — 1 semana cada)
  // ────────────────────────────────────────────────────────────────────────────
  for (var s3 = 0; s3 < 3; s3++) {
    var descFoco3 = semanasConteudo[6 + s3];
    var curso3 = _tbConsumirCurso(cursosDisponiveis, cursoIdx, descFoco3);
    cursoIdx = curso3.nextIdx;
    linhas.push(_tbCriarLinhaConteudo(email, compNome, nivelEntrada, s3 + 9, descFoco3, curso3));
  }
  // Semana 12: micro-desafio bloco 3
  var descsBloco3 = nDesc > 3 ? [descComNota[3], descComNota[4], descComNota[5]].filter(Boolean) : [descComNota[0]];
  var desafio3 = _tbGerarMicroDesafio(3, descsBloco3, compNome, cargo, descsBloco3, perfilCIS);
  linhas.push(_tbCriarLinhaAplicacao(email, compNome, nivelEntrada, 12, desafio3));

  // ────────────────────────────────────────────────────────────────────────────
  // SEMANA 13: Revisão — consolidação dos 3 micro-desafios
  // ────────────────────────────────────────────────────────────────────────────
  var descRevisao = 'Revise os 3 micro-desafios realizados nas semanas 4, 8 e 12. '
    + 'Identifique padrões de evolução, pontos que melhoraram e o que ainda precisa de atenção. '
    + 'Registre suas reflexões e compartilhe com seu gestor.';

  linhas.push([
    email,                                    // F4T_EMAIL
    compNome,                                 // F4T_COMPETENCIA
    nivelEntrada,                             // F4T_NIVEL_ENTRADA
    13,                                       // F4T_SEMANA
    'revisao',                                // F4T_TIPO_SEMANA
    'Consolidação: Meus 3 Micro-Desafios',   // F4T_TITULO
    '',                                       // F4T_URL
    descRevisao,                              // F4T_DESCRICAO
    '',                                       // F4T_DESCRITOR
    '',                                       // Nota Descritor
    'sistema',                                // F4T_FONTE
    'pendente'                                // F4T_STATUS
  ]);

  // ────────────────────────────────────────────────────────────────────────────
  // SEMANA 14: Revisão — autoavaliação e próximos passos
  // ────────────────────────────────────────────────────────────────────────────
  var transicaoLabel = 'N' + nivelEntrada + ' → N' + (nivelEntrada + 1);
  var descAutoaval = 'Autoavaliação final da competência "' + compNome + '" (transição ' + transicaoLabel + '). '
    + 'Responda: (1) Quais comportamentos mudaram nas últimas 14 semanas? '
    + '(2) Quais descritores você sente que avançou? '
    + '(3) O que precisa continuar desenvolvendo? '
    + 'Use as evidências dos micro-desafios como base.';

  linhas.push([
    email,                                           // F4T_EMAIL
    compNome,                                        // F4T_COMPETENCIA
    nivelEntrada,                                    // F4T_NIVEL_ENTRADA
    14,                                              // F4T_SEMANA
    'revisao',                                       // F4T_TIPO_SEMANA
    'Autoavaliação: ' + compNome + ' (' + transicaoLabel + ')',  // F4T_TITULO
    '',                                              // F4T_URL
    descAutoaval,                                    // F4T_DESCRICAO
    '',                                              // F4T_DESCRITOR
    '',                                              // Nota Descritor
    'sistema',                                       // F4T_FONTE
    'pendente'                                       // F4T_STATUS
  ]);

  return linhas;
}


/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * BUSCAR CURSOS — Filtra catálogo por comp + cargo + nível
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Normaliza nome da competência e faz match contra Comp. Confirmada OU Comp. Secundária.
 * Cargo: match exato ou "todos".
 * Nível Ideal = nivelAlvo.
 *
 * @param {string} comp - nome da competência
 * @param {string} cargo - cargo do colaborador
 * @param {number} nivelAlvo - nível do catálogo (1, 2 ou 3)
 * @param {Array}  catalogo - resultado de _cobLerCatalogo()
 * @returns {Array} cursos ordenados por relevância (descritores coincidentes desc)
 */
function _tbBuscarCursos(comp, cargo, nivelAlvo, catalogo) {
  var compNorm  = _cobNorm(comp);
  var cargoNorm = _cobNorm(cargo);

  var filtrados = [];
  for (var i = 0; i < catalogo.length; i++) {
    var cat = catalogo[i];

    // Filtrar por nível
    if (cat.nivel !== nivelAlvo) continue;

    // Filtrar por cargo (match exato ou "todos")
    var catCargo = _cobNorm(cat.cargo);
    if (catCargo !== cargoNorm && catCargo !== 'todos' && catCargo !== '') continue;

    // Filtrar por competência (match no nome normalizado)
    var catComp = _cobNorm(cat.comp);
    if (catComp.indexOf(compNorm) < 0 && compNorm.indexOf(catComp) < 0) continue;

    filtrados.push(cat);
  }

  // Ordenar por quantidade de descritores (mais descritores = mais relevante)
  filtrados.sort(function(a, b) {
    return (b.descritores ? b.descritores.length : 0) - (a.descritores ? a.descritores.length : 0);
  });

  return filtrados;
}


/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * PERSONALIZAR POR CIS — Define formato, motivador e canal para semanas de aplicação
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * @param {Object|null} semana - dados da semana (reservado para uso futuro)
 * @param {Object} perfilCIS - perfil CIS do colaborador
 * @returns {Object} {formato, motivador, canal, abordagem, tom}
 */
function personalizarPorCIS(semana, perfilCIS) {
  if (!perfilCIS) {
    return {
      formato:   'roteiro_guiado',
      motivador: 'aprendizado',
      canal:     'individual',
      abordagem: 'Siga o roteiro passo a passo, registrando cada etapa.',
      tom:       'neutro'
    };
  }

  // ── DISC dominante → formato de entrega ───────────────────────────────────
  var formato = 'roteiro_guiado';
  var abordagem = 'Siga o roteiro passo a passo, registrando cada etapa.';
  var tom = 'estruturado';
  var discDom = (perfilCIS.disc_dominantes && perfilCIS.disc_dominantes.length > 0)
    ? perfilCIS.disc_dominantes[0] : '';

  if (discDom === 'D') {
    formato = 'desafio_com_meta';
    abordagem = 'Assuma o desafio com metas claras e progressivas. Registre resultados concretos a cada semana.';
    tom = 'direto';
  } else if (discDom === 'I') {
    formato = 'troca_e_reflexao';
    abordagem = 'Compartilhe experiências com colegas e reflita sobre casos reais envolvendo pessoas.';
    tom = 'inspirador';
  } else if (discDom === 'S') {
    formato = 'roteiro_guiado';
    abordagem = 'Siga o roteiro passo a passo, com exemplos práticos e templates para cada etapa.';
    tom = 'acolhedor';
  } else if (discDom === 'C') {
    formato = 'analise_e_referencia';
    abordagem = 'Analise referências e dados, use checklists para monitorar seu progresso com precisão.';
    tom = 'analítico';
  }

  // ── Valores significativos → motivador ────────────────────────────────────
  var motivador = 'aprendizado';
  var valSig = (perfilCIS.valores_significativos && perfilCIS.valores_significativos.length > 0)
    ? _cobNorm(perfilCIS.valores_significativos[0]) : '';

  if (valSig === 'social') {
    motivador = 'impacto_nas_pessoas';
  } else if (valSig === 'teorico') {
    motivador = 'aprendizado';
  } else if (valSig === 'economico') {
    motivador = 'eficiencia';
  } else if (valSig === 'politico') {
    motivador = 'influencia';
  } else if (valSig === 'estetico') {
    motivador = 'criatividade';
  } else if (valSig === 'religioso') {
    motivador = 'proposito';
  }

  // ── Tipos psicológicos → canal ────────────────────────────────────────────
  var canal = 'individual';
  var tipoExtInt = perfilCIS.tipo_ext_int || '';

  if (_cobNorm(tipoExtInt) === 'extroversao') {
    canal = 'grupo';
  } else {
    canal = 'individual';
  }

  return {
    formato:   formato,
    motivador: motivador,
    canal:     canal,
    abordagem: abordagem,
    tom:       tom
  };
}


/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * GERAR MICRO-DESAFIO — Cria texto de desafio prático (sem chamada IA)
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Bloco 1: Observação — "Observe X no seu contexto e registre o que viu"
 * Bloco 2: Ação — "Implemente uma mudança específica e descreva resultado"
 * Bloco 3: Avaliação — "Avalie o resultado da mudança e proponha ajuste"
 *
 * @param {number} bloco - 1, 2 ou 3
 * @param {Array}  semanasBloco - descritores usados nas semanas do bloco
 * @param {string} compNome - nome da competência
 * @param {string} cargo - cargo do colaborador
 * @param {Array}  descritoresFoco - descritores priorizados
 * @param {Object} perfilCIS - perfil CIS
 * @returns {Object} {titulo, descricao, descritorFoco}
 */
function _tbGerarMicroDesafio(bloco, semanasBloco, compNome, cargo, descritoresFoco, perfilCIS) {
  var cis = personalizarPorCIS(null, perfilCIS);
  var descritorPrincipal = (descritoresFoco && descritoresFoco.length > 0)
    ? (descritoresFoco[0].nome_curto || descritoresFoco[0].cod || '') : '';

  // ── Templates base por bloco ──────────────────────────────────────────────
  var templates = {
    1: {
      titulo: 'Micro-Desafio 1: Observação — ' + compNome,
      base: 'Observe no seu dia a dia situações relacionadas a "' + compNome + '"'
        + (descritorPrincipal ? ', especialmente no aspecto "' + descritorPrincipal + '"' : '')
        + '. Registre pelo menos 2 situações que você vivenciou ou presenciou, '
        + 'descrevendo: (a) o que aconteceu, (b) como você reagiu, (c) o que poderia ter feito diferente.'
    },
    2: {
      titulo: 'Micro-Desafio 2: Ação — ' + compNome,
      base: 'Com base nas observações do Micro-Desafio 1, implemente uma mudança específica '
        + 'no seu comportamento relacionado a "' + compNome + '"'
        + (descritorPrincipal ? ' no aspecto "' + descritorPrincipal + '"' : '')
        + '. Descreva: (a) qual mudança você fez, (b) em qual situação aplicou, '
        + '(c) qual foi o resultado imediato.'
    },
    3: {
      titulo: 'Micro-Desafio 3: Avaliação — ' + compNome,
      base: 'Avalie o impacto da mudança implementada no Micro-Desafio 2 sobre "' + compNome + '"'
        + (descritorPrincipal ? ' no aspecto "' + descritorPrincipal + '"' : '')
        + '. Responda: (a) a mudança se sustentou? (b) qual feedback recebeu de colegas ou gestor? '
        + '(c) proponha um ajuste ou continuidade para consolidar a evolução.'
    }
  };

  var tpl = templates[bloco] || templates[1];

  // ── Personalizar pela CIS ─────────────────────────────────────────────────
  var complemento = '';

  // Formato (DISC)
  if (cis.formato === 'desafio_com_meta') {
    complemento += ' Defina uma meta concreta e mensurável para este desafio.';
  } else if (cis.formato === 'troca_e_reflexao') {
    complemento += ' Converse com pelo menos 1 colega sobre a situação e registre a troca.';
  } else if (cis.formato === 'roteiro_guiado') {
    complemento += ' Use o template abaixo como guia para registrar cada etapa.';
  } else if (cis.formato === 'analise_e_referencia') {
    complemento += ' Crie um checklist pessoal e analise os dados da sua experiência.';
  }

  // Motivador (Valores)
  if (cis.motivador === 'impacto_nas_pessoas') {
    complemento += ' Foque em como sua ação impactou as pessoas ao redor.';
  } else if (cis.motivador === 'eficiencia') {
    complemento += ' Meça a eficiência da mudança em termos de tempo ou resultado.';
  } else if (cis.motivador === 'aprendizado') {
    complemento += ' Registre o aprendizado adquirido em cada etapa.';
  }

  // Canal (Tipos)
  if (cis.canal === 'grupo') {
    complemento += ' Compartilhe suas reflexões com o grupo e solicite feedback.';
  } else {
    complemento += ' Reserve um momento individual para reflexão profunda.';
  }

  return {
    titulo: tpl.titulo,
    descricao: tpl.base + complemento,
    descritorFoco: descritorPrincipal
  };
}


/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * LER PERFIL CIS — Busca dados DISC/Valores/Tipos de um colaborador
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Headers na linha 4 (index 3) da aba Colaboradores.
 *
 * @param {Sheet} wsColab - aba Colaboradores
 * @param {string} email - email do colaborador
 * @returns {Object} perfil CIS formatado ou null
 */
function _tbLerPerfilCIS(wsColab, email) {
  if (!wsColab || !email) return null;

  var dados = wsColab.getDataRange().getValues();
  if (dados.length < 5) return null; // precisa de header + dados

  var headers = dados[3]; // headers na linha 4

  // ── Localizar colunas por nome ────────────────────────────────────────────
  var colMap = {};
  var camposDesejados = [
    'e-mail corporativo', 'email corporativo', 'email',
    'd_natural', 'd natural', 'i_natural', 'i natural',
    's_natural', 's natural', 'c_natural', 'c natural',
    'teorico', 'teórico', 'economico', 'econômico',
    'estetico', 'estético', 'social', 'politico', 'político',
    'religioso',
    'extroversao', 'extroversão', 'introversao', 'introversão',
    'sensacao', 'sensação', 'intuicao', 'intuição',
    'pensamento', 'sentimento'
  ];

  for (var h = 0; h < headers.length; h++) {
    var hNorm = _cobNorm(String(headers[h] || ''));
    for (var f = 0; f < camposDesejados.length; f++) {
      if (hNorm.indexOf(camposDesejados[f]) >= 0) {
        colMap[camposDesejados[f]] = h;
      }
    }
  }

  // ── Localizar coluna de email ─────────────────────────────────────────────
  var iEmail = colMap['e-mail corporativo'];
  if (iEmail === undefined) iEmail = colMap['email corporativo'];
  if (iEmail === undefined) iEmail = colMap['email'];
  if (iEmail === undefined) {
    Logger.log('_tbLerPerfilCIS: coluna de e-mail não encontrada em Colaboradores');
    return null;
  }

  // ── Buscar linha do colaborador ───────────────────────────────────────────
  var emailNorm = email.trim().toLowerCase();
  var rowColab = null;

  for (var r = 4; r < dados.length; r++) { // dados começam após header (linha 5+)
    var emailRow = String(dados[r][iEmail] || '').trim().toLowerCase();
    if (emailRow === emailNorm) {
      rowColab = dados[r];
      break;
    }
  }

  if (!rowColab) {
    Logger.log('_tbLerPerfilCIS: colaborador ' + email + ' não encontrado em Colaboradores');
    return null;
  }

  // ── Helper para ler valor numérico ────────────────────────────────────────
  var _val = function(keys) {
    for (var k = 0; k < keys.length; k++) {
      var idx = colMap[keys[k]];
      if (idx !== undefined) {
        var v = Number(rowColab[idx]);
        if (!isNaN(v)) return v;
      }
    }
    return 0;
  };

  // ── Ler scores DISC ───────────────────────────────────────────────────────
  var dScore = _val(['d_natural', 'd natural']);
  var iScore = _val(['i_natural', 'i natural']);
  var sScore = _val(['s_natural', 's natural']);
  var cScore = _val(['c_natural', 'c natural']);

  // Determinar dominantes (top 2) e baixos (bottom 2)
  var discArr = [
    { letra: 'D', score: dScore },
    { letra: 'I', score: iScore },
    { letra: 'S', score: sScore },
    { letra: 'C', score: cScore }
  ];
  discArr.sort(function(a, b) { return b.score - a.score; });

  var disc_dominantes = [discArr[0].letra, discArr[1].letra];
  var disc_baixos     = [discArr[2].letra, discArr[3].letra];

  // ── Ler scores Valores Motivadores ────────────────────────────────────────
  var valoresScores = {
    Teorico:   _val(['teorico', 'teórico']),
    Economico: _val(['economico', 'econômico']),
    Estetico:  _val(['estetico', 'estético']),
    Social:    _val(['social']),
    Politico:  _val(['politico', 'político']),
    Religioso: _val(['religioso'])
  };

  // Ordenar por score decrescente
  var valoresArr = [];
  var valKeys = Object.keys(valoresScores);
  for (var vk = 0; vk < valKeys.length; vk++) {
    valoresArr.push({ dim: valKeys[vk], score: valoresScores[valKeys[vk]] });
  }
  valoresArr.sort(function(a, b) { return b.score - a.score; });

  var valores_significativos = [valoresArr[0].dim, valoresArr[1].dim];
  var valores_indiferentes  = [valoresArr[valoresArr.length - 2].dim, valoresArr[valoresArr.length - 1].dim];

  // ── Ler Tipos Psicológicos ────────────────────────────────────────────────
  var extScore = _val(['extroversao', 'extroversão']);
  var intScore = _val(['introversao', 'introversão']);
  var senScore = _val(['sensacao', 'sensação']);
  var intuScore = _val(['intuicao', 'intuição']);
  var penScore = _val(['pensamento']);
  var sentScore = _val(['sentimento']);

  var tipo_ext_int = extScore >= intScore ? 'Extroversao' : 'Introversao';
  var tipo_sen_int = senScore >= intuScore ? 'Sensacao' : 'Intuicao';
  var tipo_pen_sen = penScore >= sentScore ? 'Pensamento' : 'Sentimento';

  return {
    disc_dominantes: disc_dominantes,
    disc_baixos: disc_baixos,
    valores_significativos: valores_significativos,
    valores_indiferentes: valores_indiferentes,
    valores_scores: valoresScores,
    tipo_ext_int: tipo_ext_int,
    tipo_sen_int: tipo_sen_int,
    tipo_pen_sen: tipo_pen_sen
  };
}


// ═══════════════════════════════════════════════════════════════════════════════
// FUNÇÕES AUXILIARES PRIVADAS
// ═══════════════════════════════════════════════════════════════════════════════


/**
 * Ordena descritores pelo gap (distância do nível de entrada ao próximo nível).
 * Descritores com maior necessidade de desenvolvimento vêm primeiro.
 *
 * @param {Array} descritores - [{cod, nome_curto, completo, n1, n2, n3, n4}]
 * @param {number} nivelEntrada - 1, 2 ou 3
 * @returns {Array} descritores ordenados
 */
function _tbOrdenarDescritoresPorGap(descritores, nivelEntrada) {
  if (!descritores || descritores.length === 0) return [];

  // Clonar para não alterar original
  var clone = [];
  for (var i = 0; i < descritores.length; i++) {
    clone.push(descritores[i]);
  }

  // Para cada descritor, o "gap" é o quanto falta para o próximo nível.
  // Descritores cujo texto do nível atual é mais complexo = mais gap percebido.
  // Usamos a posição como proxy (primeiros descritores tendem a ser fundacionais).
  // Em uma versão futura, podemos incorporar scores reais de avaliação.
  clone.sort(function(a, b) {
    // Priorizar descritores com código menor (fundacionais primeiro)
    var codA = String(a.cod || '').replace(/\D/g, '');
    var codB = String(b.cod || '').replace(/\D/g, '');
    return (parseInt(codA) || 999) - (parseInt(codB) || 999);
  });

  return clone;
}


/**
 * Distribui descritores igualmente nos 3 blocos (3 semanas cada).
 * Se há menos de 9 descritores, reutiliza ciclicamente.
 *
 * @param {Array} descOrdenados - descritores ordenados por prioridade
 * @returns {Array} [bloco1[], bloco2[], bloco3[]] — cada bloco com até 3 descritores
 */
function _tbDistribuirDescritores(descOrdenados) {
  var blocos = [[], [], []];

  if (!descOrdenados || descOrdenados.length === 0) {
    return blocos;
  }

  // Distribuir round-robin nos 3 blocos, 3 por bloco
  for (var i = 0; i < 9; i++) {
    var blocoIdx = Math.floor(i / 3);
    var descIdx  = i % descOrdenados.length; // reutiliza ciclicamente
    blocos[blocoIdx].push(descOrdenados[descIdx]);
  }

  return blocos;
}


/**
 * Consome o próximo curso disponível, tentando casar com o descritor foco.
 * Se não há match por descritor, retorna o próximo curso geral.
 * Se não há cursos, retorna placeholder para geração por IA.
 *
 * @param {Array}  cursosDisponiveis - cursos filtrados
 * @param {number} cursoIdx - índice atual
 * @param {Object|null} descFoco - descritor foco {cod, nome_curto, ...}
 * @returns {Object} {curso, url, fonte, descritorMatch, nextIdx}
 */
function _tbConsumirCurso(cursosDisponiveis, cursoIdx, descFoco) {
  if (!cursosDisponiveis || cursosDisponiveis.length === 0) {
    return {
      curso: '',
      url: '',
      fonte: 'ia_gerado',
      descritorMatch: '',
      nextIdx: cursoIdx
    };
  }

  // Tentar encontrar curso que cubra o descritor foco
  if (descFoco) {
    var descNorm = _cobNorm(descFoco.nome_curto || descFoco.cod || '');

    for (var i = cursoIdx; i < cursosDisponiveis.length; i++) {
      var cat = cursosDisponiveis[i];
      if (cat.descritores) {
        for (var d = 0; d < cat.descritores.length; d++) {
          if (_cobNorm(cat.descritores[d]).indexOf(descNorm) >= 0 ||
              descNorm.indexOf(_cobNorm(cat.descritores[d])) >= 0) {
            return {
              curso: cat.curso || '',
              url: cat.url || '',
              fonte: 'catalogo',
              descritorMatch: cat.descritores[d],
              nextIdx: i + 1
            };
          }
        }
      }
    }
  }

  // Sem match por descritor — retorna próximo curso sequencial
  if (cursoIdx < cursosDisponiveis.length) {
    var cat2 = cursosDisponiveis[cursoIdx];
    return {
      curso: cat2.curso || '',
      url: cat2.url || '',
      fonte: 'catalogo',
      descritorMatch: (cat2.descritores && cat2.descritores.length > 0) ? cat2.descritores[0] : '',
      nextIdx: cursoIdx + 1
    };
  }

  // Catálogo esgotado
  return {
    curso: '',
    url: '',
    fonte: 'ia_gerado',
    descritorMatch: '',
    nextIdx: cursoIdx
  };
}


/**
 * Cria uma linha de conteúdo (semanas 1-3, 5-7, 9-11).
 *
 * @param {string} email
 * @param {string} compNome
 * @param {number} nivelEntrada
 * @param {number} semana
 * @param {Object|null} descFoco - descritor foco
 * @param {Object} curso - resultado de _tbConsumirCurso()
 * @returns {Array} linha de 11 colunas
 */
function _tbCriarLinhaConteudo(email, compNome, nivelEntrada, semana, descFoco, curso) {
  var descritorLabel = '';
  if (descFoco) {
    descritorLabel = descFoco.nome_curto || descFoco.cod || '';
  }

  var titulo = curso.curso || ('Conteúdo Semana ' + semana + ' — ' + compNome);
  var descricao = '';

  if (curso.fonte === 'catalogo') {
    descricao = 'Curso do catálogo para a competência "' + compNome + '", '
      + 'nível ' + nivelEntrada + ' → ' + (nivelEntrada + 1) + '.';
    if (curso.descritorMatch) {
      descricao += ' Foco no descritor: ' + curso.descritorMatch + '.';
    }
  } else {
    // Conteúdo a ser gerado por IA posteriormente
    titulo = 'Conteúdo a definir — ' + compNome + ' (Sem. ' + semana + ')';
    descricao = 'Conteúdo será gerado por IA para a competência "' + compNome + '", '
      + 'nível ' + nivelEntrada + ' → ' + (nivelEntrada + 1) + '.';
    if (descritorLabel) {
      descricao += ' Descritor foco: ' + descritorLabel + '.';
    }
  }

  var notaDesc = descFoco ? (descFoco.nota || '') : '';

  return [
    email,                    // F4T_EMAIL
    compNome,                 // F4T_COMPETENCIA
    nivelEntrada,             // F4T_NIVEL_ENTRADA
    semana,                   // F4T_SEMANA
    'conteudo',               // F4T_TIPO_SEMANA
    titulo,                   // F4T_TITULO
    curso.url || '',          // F4T_URL
    descricao,                // F4T_DESCRICAO
    descritorLabel,           // F4T_DESCRITOR
    notaDesc,                 // Nota Descritor
    curso.fonte || 'sistema', // F4T_FONTE
    'pendente'                // F4T_STATUS
  ];
}


/**
 * Cria uma linha de aplicação (semanas 4, 8, 12).
 *
 * @param {string} email
 * @param {string} compNome
 * @param {number} nivelEntrada
 * @param {number} semana
 * @param {Object} desafio - resultado de _tbGerarMicroDesafio()
 * @returns {Array} linha de 11 colunas
 */
function _tbCriarLinhaAplicacao(email, compNome, nivelEntrada, semana, desafio) {
  return [
    email,                            // F4T_EMAIL
    compNome,                         // F4T_COMPETENCIA
    nivelEntrada,                     // F4T_NIVEL_ENTRADA
    semana,                           // F4T_SEMANA
    'aplicacao',                      // F4T_TIPO_SEMANA
    desafio.titulo || 'Micro-Desafio',// F4T_TITULO
    '',                               // F4T_URL
    desafio.descricao || '',          // F4T_DESCRICAO
    desafio.descritorFoco || '',      // F4T_DESCRITOR
    '',                               // Nota Descritor (n/a para aplicação)
    'sistema',                        // F4T_FONTE
    'pendente'                        // F4T_STATUS
  ];
}
