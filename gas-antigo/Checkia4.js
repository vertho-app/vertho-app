// ═══════════════════════════════════════════════════════════════════════════════
// CheckIA4.gs v3.1 — Validação das Avaliações IA4 (v1 e v2)
// v3.1: + Régua de Maturidade no prompt (mesmos critérios da avaliação original)
//       + maxOutputTokens 8192 (fix "JSON incompleto")
// ═══════════════════════════════════════════════════════════════════════════════

function checkAvaliacoes() {
  _carregarCFG();
  _limparParada();

  var ss          = SpreadsheetApp.getActiveSpreadsheet();
  var wsRespostas = ss.getSheetByName('Respostas');
  var wsColab     = ss.getSheetByName('Colaboradores');

  if (!wsRespostas) {
    SpreadsheetApp.getUi().alert('\u274c Aba "Respostas" não encontrada.');
    return;
  }

  var headers = wsRespostas.getRange(1, 1, 1, wsRespostas.getLastColumn()).getValues()[0];
  var dados   = wsRespostas.getDataRange().getValues();

  var _h = function(label) {
    return headers.findIndex(function(h) {
      return _norm(h || '').toLowerCase().includes(label.toLowerCase());
    });
  };

  var iEmail    = _h('e-mail');
  if (iEmail < 0) iEmail = _h('id colaborador');
  var iNome     = _h('nome colaborador');
  var iCargo    = _h('cargo');
  var iComp     = _h('nome competência');
  if (iComp < 0) iComp = _h('nome compet');
  var iR1       = _h('r1');
  var iR2       = _h('r2');
  var iR3       = _h('r3');
  var iR4       = _h('r4');
  var iNivel    = _h('nível ia4');
  if (iNivel < 0) iNivel = _h('nivel ia4');
  if (iNivel < 0) iNivel = _h('nivel ia');
  var iNota     = _h('nota ia4');
  var iFeedback = _h('feedback ia4');
  var iPayload  = _h('payload');
  var iStatus   = _h('status ia 4');
  if (iStatus < 0) iStatus = _h('status ia4');
  if (iStatus < 0) iStatus = _h('status ia');
  if (iStatus < 0) iStatus = _h('status avalia');

  var iChkNota   = _buscarOuCriarColuna(wsRespostas, headers, 'nota check',   'Nota Check IA4');
  var iChkStatus = _buscarOuCriarColuna(wsRespostas, headers, 'status check', 'Status Check IA4');
  var iChkJust   = _buscarOuCriarColuna(wsRespostas, headers, 'revis',        'Revisão Check IA4');

  Logger.log('checkAvaliacoes v3.1 — iniciando (com Régua de Maturidade)');

  // Carregar perfis CIS e Régua de Maturidade
  var perfisCIS = _lerPerfisCISIA4(wsColab);
  var dbReguas  = {};
  try {
    var _db  = _carregarBasesIA4(ss);
    dbReguas = _db.reguas || {};
    Logger.log('Régua de Maturidade carregada: ' + Object.keys(dbReguas).length + ' entradas');
  } catch(e) {
    Logger.log('Aviso: Régua não carregada — ' + e.message);
  }

  var THRESHOLD  = 90;
  var avaliados  = 0, aprovados = 0, revisar = 0, pulados = 0, semStatus = 0;
  var _chkModel  = _CFG.modelo || Config.MODEL_VALIDACAO;
  var _startTime = new Date().getTime();
  var MAX_MS     = 5.5 * 60 * 1000;

  SpreadsheetApp.getActive().toast('[' + Config.modelLabel(_chkModel) + ']\nCarregando...', '\ud83d\udd0d Check IA4', 4);

  for (var r = 1; r < dados.length; r++) {
    var row = dados[r];
    if (!row[iNome] || !row[iComp]) continue;

    var st = _norm(String(row[iStatus] || '')).toLowerCase();
    var statusOk = (iStatus < 0) ||
      st === 'avaliado' || st === 'pdf enviado' ||
      st === 'concluido' || st === 'concluído' ||
      st.includes('avali') || st.includes('pdf');
    if (!statusOk) { semStatus++; continue; }

    var notaExist = String(row[iChkNota] !== undefined ? row[iChkNota] : '').trim();
    if (notaExist && notaExist !== '0' && notaExist.toLowerCase() !== 'erro') { pulados++; continue; }

    if (_deveParar()) { _limparParada(); break; }
    if (new Date().getTime() - _startTime > MAX_MS) {
      SpreadsheetApp.getActive().toast('Tempo limite.\nRode novamente.', '\u23f1\ufe0f Check IA4', 6);
      break;
    }

    var nivel   = Number(row[iNivel]) || 0;
    var nota    = Number(String(row[iNota] || '').replace(',', '.')) || 0;
    var email   = _norm(String(row[iEmail] || '')).toLowerCase();
    var cisData = perfisCIS[email] || {};

    // Buscar régua da competência
    var reguaComp  = _norm(String(row[iComp]  || ''));
    var reguaCargo = _norm(String(row[iCargo] || ''));
    var reguaObj   = dbReguas[_ia4Chave(reguaCargo + '_' + reguaComp)]
                  || dbReguas[_ia4Chave(reguaComp)]
                  || {};
    var reguaTexto = (reguaObj.texto || '').slice(0, 3000);

    // Ler payload v2
    var payloadJson = iPayload >= 0 ? String(row[iPayload] || '') : '';
    var payloadObj  = null;
    try { if (payloadJson) payloadObj = JSON.parse(payloadJson); } catch(e) {}

    SpreadsheetApp.getActive().toast(
      '[' + Config.modelLabel(_chkModel) + ']\n' + _norm(String(row[iNome]||'')) + ' — ' + _norm(String(row[iComp]||'')),
      '\ud83d\udd0d Check IA4: ' + (avaliados + 1), 5
    );

    var resultado = _chkChamarIA({
      nome:       _norm(String(row[iNome]    || '')),
      cargo:      _norm(String(row[iCargo]   || '')),
      comp:       _norm(String(row[iComp]    || '')),
      cis:        cisData,
      r1:         _norm(String(row[iR1]      || '')),
      r2:         _norm(String(row[iR2]      || '')),
      r3:         _norm(String(row[iR3]      || '')),
      r4:         _norm(String(row[iR4]      || '')),
      nivel:      nivel,
      nota:       nota,
      feedback:   _norm(String(row[iFeedback]|| '')),
      payloadObj: payloadObj,
      regua:      reguaTexto,
    }, _chkModel);

    if (resultado.erro) {
      wsRespostas.getRange(r + 1, iChkNota   + 1).setValue('Erro');
      wsRespostas.getRange(r + 1, iChkStatus + 1).setValue('Erro');
      wsRespostas.getRange(r + 1, iChkJust   + 1).setValue(resultado.mensagem);
      Logger.log('\u274c Check L' + (r + 1) + ': ' + resultado.mensagem);
      continue;
    }

    var notaChk = resultado.nota;
    var status  = notaChk >= THRESHOLD ? 'Aprovado' : 'Revisar';
    var bg      = notaChk >= THRESHOLD ? '#D4EDDA'  : '#FFF3CD';

    wsRespostas.getRange(r + 1, iChkNota   + 1).setValue(notaChk).setBackground(bg);
    wsRespostas.getRange(r + 1, iChkStatus + 1).setValue(status).setBackground(bg);
    wsRespostas.getRange(r + 1, iChkJust   + 1).setValue(resultado.revisao);

    avaliados++;
    if (status === 'Aprovado') aprovados++; else revisar++;
    SpreadsheetApp.flush();
  }

  Logger.log('checkAvaliacoes v3.1 — concluído. Avaliados=' + avaliados);
  SpreadsheetApp.getUi().alert(
    '\ud83d\udd0d Check IA4 — Concluído\n\n' +
    '\u2705 Aprovados (\u2265' + THRESHOLD + '): ' + aprovados + '\n' +
    '\ud83d\udd36 Revisar (<' + THRESHOLD + '): ' + revisar + '\n' +
    '\u23ed Já checados (pulados): ' + pulados + '\n' +
    '\ud83d\udcca Total checados agora: ' + avaliados +
    (semStatus > 0 ? '\n\n\u23ed Pulados (sem status): ' + semStatus : '')
  );
}


// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

function _buscarOuCriarColuna(ws, headers, buscaParcial, nomeCompleto) {
  var idx = headers.findIndex(function(h) {
    return _norm(h || '').toLowerCase().includes(buscaParcial.toLowerCase());
  });
  if (idx >= 0) return idx;
  var novaCol = ws.getLastColumn() + 1;
  ws.getRange(1, novaCol).setValue(nomeCompleto)
    .setBackground('#0F2B54').setFontColor('#FFFFFF').setFontWeight('bold');
  headers.push(nomeCompleto);
  Logger.log('Coluna criada: "' + nomeCompleto + '" em ' + novaCol);
  return headers.length - 1;
}


function _chkFormatarCIS(cis) {
  if (!cis || (!cis.d && !cis.val_teorico && !cis.tp_sensorial)) return '(perfil CIS não disponível)';
  var discMap = { D: cis.d||0, I: cis.i||0, S: cis.s||0, C: cis.c||0 };
  var discDom = Object.keys(discMap).filter(function(k){ return discMap[k] >= 60; }).join('+') || 'neutro';
  var valMap  = { Teorico: cis.val_teorico||0, Economico: cis.val_economico||0, Estetico: cis.val_estetico||0,
                  Social: cis.val_social||0, Politico: cis.val_politico||0, Religioso: cis.val_religioso||0 };
  var valTop  = Object.keys(valMap).sort(function(a,b){ return valMap[b]-valMap[a]; }).slice(0,2).join(', ');
  var tpMap   = { Sensorial: cis.tp_sensorial||0, Intuitivo: cis.tp_intuitivo||0, Racional: cis.tp_racional||0,
                  Emocional: cis.tp_emocional||0, Introvertido: cis.tp_introvertido||0, Extrovertido: cis.tp_extrovertido||0 };
  var tpDom   = Object.keys(tpMap).filter(function(k){ return tpMap[k] >= 50; }).join('+') || 'equilibrado';
  return (
    'DISC: D=' + (cis.d||0) + ' I=' + (cis.i||0) + ' S=' + (cis.s||0) + ' C=' + (cis.c||0) + '  → dominante: ' + discDom + '\n' +
    'VALORES: Teo=' + (cis.val_teorico||0) + ' Eco=' + (cis.val_economico||0) + ' Est=' + (cis.val_estetico||0) +
      ' Soc=' + (cis.val_social||0) + ' Pol=' + (cis.val_politico||0) + ' Rel=' + (cis.val_religioso||0) + '  → top-2: ' + valTop + '\n' +
    'TIPOS: Sen=' + (cis.tp_sensorial||0) + ' Int=' + (cis.tp_intuitivo||0) + ' Rac=' + (cis.tp_racional||0) +
      ' Emo=' + (cis.tp_emocional||0) + ' Iv=' + (cis.tp_introvertido||0) + ' Ev=' + (cis.tp_extrovertido||0) + '  → dominantes: ' + tpDom
  );
}


function _chkChamarIA(inp, model) {
  var isV2 = !!(inp.payloadObj &&
    inp.payloadObj.consolidacao &&
    inp.payloadObj.consolidacao.nivel_geral !== undefined);

  Logger.log('Check [' + (inp.nome||'') + ' | ' + (inp.comp||'') + ']: isV2=' + isV2
    + ' | payloadObj=' + (inp.payloadObj ? 'SIM (keys: ' + Object.keys(inp.payloadObj).join(',') + ')' : 'NULL'));

  var systemPrompt = isV2 ? _chkSystemV2() : _chkSystemV1();
  var userPrompt   = isV2 ? _chkUserV2(inp) : _chkUserV1(inp);

  var isClaude = String(model).indexOf('claude') >= 0;
  var isGPT    = String(model).toLowerCase().indexOf('gpt') >= 0;

  try {
    var text = '';

    if (isClaude) {
      // ── Claude ────────────────────────────────────────────────────
      var apiKey = _getApiKey('CLAUDE');
      var resp = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
        method: 'post',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': Config.ANTHROPIC_VERSION,
          'content-type': 'application/json'
        },
        payload: JSON.stringify({
          model: model,
          max_tokens: 8192,
          temperature: Config.TEMPERATURE.validacao,
          system: systemPrompt,
          messages: [{ role: 'user', content: userPrompt }]
        }),
        muteHttpExceptions: true
      });
      var statusCode = resp.getResponseCode();
      var body = JSON.parse(resp.getContentText());
      if (statusCode !== 200 || body.error)
        return { erro: true, mensagem: 'Claude ' + statusCode + ': ' + (body.error ? body.error.message : JSON.stringify(body)) };
      text = body.content[0].text || '';

    } else if (isGPT) {
      // ── OpenAI (GPT 5.4 / 5.4-mini) ─────────────────────────────
      var apiKey = _getApiKey('OPENAI');
      var gptPayload = {
        model: model,
        max_completion_tokens: 8192,
        temperature: Config.TEMPERATURE.validacao,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ]
      };
      var resp = UrlFetchApp.fetch('https://api.openai.com/v1/chat/completions', {
        method: 'post',
        headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
        payload: JSON.stringify(gptPayload), muteHttpExceptions: true,
      });
      var statusCode = resp.getResponseCode();
      var body = JSON.parse(resp.getContentText());
      if (statusCode !== 200)
        return { erro: true, mensagem: 'OpenAI ' + statusCode + ': ' + (body.error ? body.error.message : JSON.stringify(body)) };
      text = body.choices[0].message.content || '';

    } else {
      // ── Gemini ────────────────────────────────────────────────────
      var apiKey = _getApiKey('GEMINI');
      var url = 'https://generativelanguage.googleapis.com/v1beta/models/' + model +
                ':generateContent?key=' + apiKey;
      var payload = {
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
        generationConfig: { maxOutputTokens: 8192, temperature: Config.geminiTemp(model, 'validacao') },
      };
      var resp = UrlFetchApp.fetch(url, {
        method: 'post', headers: { 'content-type': 'application/json' },
        payload: JSON.stringify(payload), muteHttpExceptions: true,
      });
      var statusCode = resp.getResponseCode();
      var body = JSON.parse(resp.getContentText());
      if (statusCode !== 200)
        return { erro: true, mensagem: 'Gemini ' + statusCode + ': ' + JSON.stringify(body.error) };
      text = body.candidates[0].content.parts[0].text || '';
    }

    var parsed = _extrairJSON(text);
    var notaR  = Number(parsed.nota) || 0;
    if (parsed.erro_grave === true && notaR > 60) notaR = 60;

    var just = parsed.justificativa || '';
    var rev  = (parsed.revisao || '').trim();
    return {
      erro:    false,
      nota:    notaR,
      revisao: just + (rev ? '\n\n\u270f\ufe0f Versão sugerida: ' + rev : ''),
    };
  } catch(e) {
    return { erro: true, mensagem: 'Exceção: ' + e.message };
  }
}


// ─── SISTEMA V2 ───────────────────────────────────────────────────────────────

function _chkSystemV2() {
  return [
    'Você é um auditor de qualidade de Assessment Comportamental.',
    'Sua tarefa é verificar se a avaliação gerada por uma IA é ACEITÁVEL — não perfeita.',
    'A régua de maturidade contém os critérios N1–N4 para cada descritor.',
    '',
    'FILOSOFIA DA AUDITORIA:',
    '- Você NÃO está refazendo a avaliação. Está verificando se ela é RAZOÁVEL.',
    '- Diferenças de ±1 nível em descritores individuais são ACEITÁVEIS (margens de interpretação).',
    '- O foco é detectar ERROS GRAVES: nível completamente errado, feedback genérico, matemática errada.',
    '- Se o nível geral está dentro de ±1 do que você daria, a coerência é BOA.',
    '- Avaliações imperfeitas mas razoáveis devem receber nota 85-95.',
    '- Reserve notas < 70 para avaliações com erros OBJETIVOS (matemática, travas não aplicadas, feedback copiado).',
    '',
    'Avalie em 4 dimensões (25pts cada = 100pts):',
    '',
    '1. EVIDÊNCIAS E NÍVEIS (25pts)',
    '   • Descritores têm alguma evidência textual da resposta? (não precisa ser literal, pode ser paráfrase)',
    '   • Nível geral está dentro de ±1 do que a régua indica? Se sim → 20-25pts.',
    '   • Penalize APENAS se: nível N3+ sem NENHUMA evidência concreta, ou resposta claramente N1 avaliada como N3+.',
    '',
    '2. COERÊNCIA DA CONSOLIDAÇÃO (25pts)',
    '   Verificação matemática:',
    '   • media_descritores → nivel_geral: arredondar para baixo (2.6 → N2).',
    '   • Travas: descritor crítico N1 → max N2; mais de 3 descritores N1 → N1.',
    '   • GAP = 3 − nivel_geral.',
    '   • Se a matemática está correta → 23-25pts. Erro de arredondamento leve → 18-22pts.',
    '',
    '3. FEEDBACK + USO DO PERFIL CIS (25pts)',
    '   • Feedback menciona algo específico das respostas? (não precisa citar trechos literais)',
    '   • Se o CIS foi fornecido: tom minimamente alinhado ao perfil? Não precisa ser perfeito.',
    '   • Se NÃO foi fornecido CIS: NÃO penalize a ausência.',
    '   • ERRO GRAVE (→ nota máx 60 TOTAL): feedback 100% genérico que serviria para qualquer pessoa.',
    '',
    '4. PLANO PDI (25pts)',
    '   • Tem ações concretas (mesmo que simples)? → 20-25pts.',
    '   • Sugere livros/podcasts/cursos externos quando não deveria? Penalize -5pts.',
    '   • Se o PDI não foi gerado (avaliação v1): NÃO penalize, dê 20pts.',
    '',
    'Nota ≥ 90 = aprovado. Para < 90: indique o que melhorar em "revisao".',
    'Retorne APENAS JSON válido, sem markdown:',
    '{"nota": 87, "erro_grave": false, "dimensoes": {"evidencias_niveis": 22, "consolidacao": 23, "feedback_cis": 21, "pdi": 21}, "justificativa": "...", "revisao": "..."}'
  ].join('\n');
}


function _chkUserV2(inp) {
  var cis = inp.cis || {};
  var p   = inp.payloadObj || {};
  var con = p.consolidacao || {};
  var dd  = p.descritores_destaque || {};
  var apr = p.avaliacao_por_resposta || p.avaliacao_descritores || {};
  var pdi = p.recomendacoes_pdi || [];

  var avrTexto = ['R1','R2','R3','R4'].map(function(rk) {
    var ri = apr[rk];
    if (!ri || !ri.descritores_avaliados) return rk + ': (sem dados)';
    return rk + ':\n' + (ri.descritores_avaliados || []).map(function(d) {
      return '  [D' + d.numero + '] ' + d.nome + ' → N' + d.nivel +
        ' (conf:' + d.confianca + ') evidência: "' + (d.evidencia || '').slice(0, 100) + '"';
    }).join('\n');
  }).join('\n');

  var pfTexto = (dd.pontos_fortes || []).map(function(pf) {
    return '  + ' + pf.descritor + ' (N' + pf.nivel + '): ' + (pf.evidencia_resumida || '');
  }).join('\n') || '  (vazio)';

  var gpTexto = (dd.gaps_prioritarios || []).map(function(g) {
    return '  - ' + g.descritor + ' (N' + g.nivel + '): ' + (g.o_que_faltou || '');
  }).join('\n') || '  (vazio)';

  var pdiTexto = pdi.map(function(item, idx) {
    return (idx+1) + '. [' + (item.descritor_foco||'') + '] N' + (item.nivel_atual||'?') + '→N' + (item.nivel_meta||3) +
      '\n   Ação: '     + (item.acao              || '(vazio)') +
      '\n   Por quê: '  + (item.por_que_importa   || '(vazio)') +
      '\n   Como: '     + (item.como_desenvolver  || '(vazio)') +
      '\n   Barreira: ' + (item.barreira_provavel || '(vazio)');
  }).join('\n');

  var lines = [
    'COLABORADOR: ' + inp.nome + ' | CARGO: ' + inp.cargo,
    'COMPETÊNCIA: ' + inp.comp,
    '',
    'PERFIL CIS:',
    _chkFormatarCIS(cis),
    '',
    'RESPOSTAS DO COLABORADOR:',
    'R1: ' + inp.r1,
    'R2: ' + inp.r2,
    'R3: ' + inp.r3,
    'R4: ' + inp.r4,
  ];

  if (inp.regua) {
    lines.push('');
    lines.push('RÉGUA DE MATURIDADE (critérios N1–N4 por descritor):');
    lines.push(inp.regua);
  }

  lines.push('');
  lines.push('AVALIAÇÃO v2 GERADA PELA IA:');
  lines.push('nivel_geral: ' + (con.nivel_geral || inp.nivel) +
    ' | media_descritores: ' + (con.media_descritores || inp.nota) +
    ' | GAP: ' + (con.gap !== undefined ? con.gap : (3 - inp.nivel)) +
    ' | confianca_geral: ' + (con.confianca_geral || '-'));
  lines.push('Travas aplicadas: ' + ((con.travas_aplicadas || []).join('; ') || 'nenhuma'));
  lines.push('');
  lines.push('AVALIAÇÃO POR DESCRITOR (R1–R4):');
  lines.push(avrTexto);
  lines.push('');
  lines.push('PONTOS FORTES:');
  lines.push(pfTexto);
  lines.push('GAPS PRIORITÁRIOS:');
  lines.push(gpTexto);
  lines.push('');
  lines.push('FEEDBACK (primeiros 700 chars):');
  lines.push((inp.feedback || '').slice(0, 700));
  lines.push('');
  lines.push('PLANO PDI:');
  lines.push(pdiTexto || '(não disponível)');

  return lines.join('\n');
}


// ─── SISTEMA V1 (retrocompatibilidade) ───────────────────────────────────────

function _chkSystemV1() {
  return [
    'Você é um AUDITOR RIGOROSO de Assessment Comportamental.',
    'Esta é uma avaliação no formato simplificado (v1). NÃO penalize a ausência de: detalhamento por descritor, perfil CIS ou plano PDI.',
    'Avalie com RIGOR o que está presente, com base em 4 dimensões:',
    '',
    '1. COERÊNCIA NOTA × NÍVEL × RESPOSTAS (30pts)',
    '   Escala: N1 = 1.00–1.99 | N2 = 2.00–2.99 | N3 = 3.00–3.99 | N4 = 4.00.',
    '   REGRA CRÍTICA: Leia CADA resposta (R1-R4) do colaborador e valide se o nível atribuído é justo.',
    '   - Resposta vaga, hipotética ("eu faria...") ou genérica = máximo N1.',
    '   - Resposta com ação concreta mas sem impacto demonstrado = máximo N2.',
    '   - Resposta com prática consistente e exemplo real = N3.',
    '   - Somente respostas que mostrem liderança/multiplicação = N4.',
    '   Se a Régua de Maturidade for fornecida, COMPARE o nível atribuído com os critérios da régua.',
    '   Penalize PESADAMENTE notas infladas (nível alto sem evidência proporcional).',
    '',
    '2. QUALIDADE DAS EVIDÊNCIAS (25pts)',
    '   As evidências citadas no feedback são TRECHOS REAIS das respostas (R1-R4)?',
    '   TESTE: para cada evidência citada, verifique se existe texto correspondente nas respostas.',
    '   Evidência fabricada/parafraseada sem base = penalidade grave (-15pts).',
    '   Evidências insuficientes para sustentar o nível = penalidade moderada (-8pts).',
    '',
    '3. QUALIDADE DO FEEDBACK (25pts)',
    '   Personalizado? Cita comportamentos específicos DESTE colaborador?',
    '   Feedback genérico (serviria para qualquer pessoa) = máximo 10pts nesta dimensão.',
    '   Acionável? Dá direção clara para desenvolvimento?',
    '',
    '4. CONSISTÊNCIA INTERNA (20pts)',
    '   Pontos fortes e pontos de atenção são coerentes entre si?',
    '   Se feedback diz "excelente em X" mas nível é N1, há contradição.',
    '   Nota numérica bate com o nível? (ex: nota 3.5 deve ser N3, não N4).',
    '',
    'CALIBRAÇÃO DE NOTAS:',
    '   100 = avaliação perfeita (raro)',
    '   90-99 = aprovado, apenas ajustes menores',
    '   80-89 = bom mas com falhas pontuais',
    '   70-79 = aceitável com ressalvas significativas',
    '   60-69 = problemas sérios em pelo menos 1 dimensão',
    '   <60 = falhas críticas, requer reescrita',
    '',
    'ERRO GRAVE (nota máx 60): nota inflada sem evidência OU feedback 100% genérico OU evidências fabricadas.',
    '',
    'Retorne APENAS JSON válido:',
    '{"nota": 78, "erro_grave": false, "dimensoes": {"coerencia": 22, "evidencias": 18, "feedback": 20, "consistencia": 18}, "justificativa": "...", "revisao": "..."}'
  ].join('\n');
}


function _chkUserV1(inp) {
  var cis   = inp.cis || {};
  var lines = [
    'COLABORADOR: ' + inp.nome + ' | CARGO: ' + inp.cargo,
    'COMPETÊNCIA: ' + inp.comp,
    'PERFIL CIS: ' + (cis.perfil || '(não informado)'),
    'DISC: D=' + (cis.d||0) + ' I=' + (cis.i||0) + ' S=' + (cis.s||0) + ' C=' + (cis.c||0),
    '',
    'RESPOSTAS:',
    'R1: ' + inp.r1,
    'R2: ' + inp.r2,
    'R3: ' + inp.r3,
    'R4: ' + inp.r4,
  ];
  if (inp.regua) {
    lines.push('');
    lines.push('RÉGUA DE MATURIDADE:');
    lines.push(inp.regua);
  }
  lines.push('');
  lines.push('AVALIAÇÃO GERADA PELA IA:');
  lines.push('Nível: ' + inp.nivel + ' | Nota: ' + inp.nota);
  lines.push('Feedback: ' + (inp.feedback || '').slice(0, 700));
  return lines.join('\n');
}
// v3.1
