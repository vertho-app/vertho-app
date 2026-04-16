// ═══════════════════════════════════════════════════════════════════════════════
// VERTHO — FASE 4: TUTOR IA v1
// Arquivo: Fase4_Tutor.gs — adicione ao projeto GAS junto com Fase4.gs e Fase4_OTP.gs
//
// Cobre (doc seção 6):
//   · chatTutor(email, historico)     — processa mensagem com Haiku, memória de sessão
//   · serveTutor(token)               — serve o HTML do chat do tutor
//   · _tutor_buscarContexto(email)    — lê pílula atual + resumo_tutor da aba Pilulas
//   · _tutor_disponivel()             — verifica se é segunda ou terça (janela de acesso)
//   · _tutor_promptSistema(...)       — monta prompt com governança (doc 6.5)
//   · _tutor_chamarAPI (fallback B)   — segunda chamada com conteúdo completo (doc 6.3)
//   · _tutor_logInteracao(...)        — salva em aba Tutor_Log (doc 6.7)
//   · criarAbaTutorLog()              — cria aba Tutor_Log se não existir
//
// Modelo: claude-haiku-4-5-20251001 (~R$0,02/sessão conforme doc)
// Disponibilidade: segunda e terça apenas (doc 6.2)
// Memória: últimas 5 trocas (10 mensagens) — sem persistência server-side (doc 6.6)
// ═══════════════════════════════════════════════════════════════════════════════

// ── CONFIGURAÇÕES ──────────────────────────────────────────────────────────────
var TUTOR_MODELO          = 'claude-haiku-4-5-20251001';
var TUTOR_MAX_TOKENS      = 400;   // respostas curtas (doc: máx 3 parágrafos)
var TUTOR_ABA_PILULAS     = 'Pilulas';
var TUTOR_ABA_LOG         = 'Tutor_Log';
var TUTOR_DIAS_DISPONIVEIS = [0,1,2,3,4,5,6]; // MODO TESTE — todos os dias (restaurar [1,2] em produção)
var TUTOR_WEBAPP_URL      = 'https://script.google.com/macros/s/AKfycbw8amze2KniDCPGsBnJnotNgZzeFNIvqIHqePH2_44XkXEH12WaLH_SABKPY73XYgRTjQ/exec';

// Colunas aba Pilulas (1-indexed)
var TP_COMPETENCIA   = 1;  // col A
var TP_NIVEL         = 2;  // col B
var TP_SEMANA        = 3;  // col C
var TP_TITULO        = 4;  // col D
var TP_URL           = 5;  // col E
var TP_RESUMO_TUTOR  = 6;  // col F — ~500 palavras para o tutor (doc 6.3)
var TP_CONTEUDO_FULL = 7;  // col G — conteúdo completo para fallback B

// Colunas aba Tutor_Log (1-indexed)
var TL_DATA       = 1;
var TL_EMAIL      = 2;
var TL_NOME       = 3;
var TL_SEMANA     = 4;
var TL_COMPETENCIA= 5;
var TL_PILULA     = 6;
var TL_PERGUNTA   = 7;
var TL_RESPOSTA   = 8;
var TL_FALLBACK   = 9;  // TRUE se usou fallback B


// ═══════════════════════════════════════════════════════════════════════════════
// CHAT TUTOR — chamado pelo frontend via google.script.run
// email:     e-mail do colaborador (já autenticado via OTP)
// historico: array de { role, content } — últimas 5 trocas (10 msgs) do frontend
//
// Retorna: { reply, fallback, disponivel, fora_escopo }
// ═══════════════════════════════════════════════════════════════════════════════
function chatTutor(email, historico) {
  email = String(email || '').toLowerCase().trim();

  // 1. Verifica disponibilidade (seg/ter)
  if (!_tutor_disponivel()) {
    return {
      reply: 'O Tutor IA está disponível toda segunda e terça, das 7h às 22h. Anote sua dúvida e traga na próxima segunda! 📝',
      disponivel: false
    };
  }

  // 2. Valida sessão OTP (token vem pelo historico[0].token se necessário — aqui confiamos no email já validado pelo doGet)
  if (!email) return { reply: 'Sessão inválida. Faça login novamente.', disponivel: true };

  // 3. Busca contexto: colaborador + pílula atual + resumo
  var ctx = _tutor_buscarContexto(email);
  if (!ctx) {
    return {
      reply: 'Não encontrei sua trilha ativa. Verifique com seu gestor.',
      disponivel: true
    };
  }

  // 4. Garante que historico é array válido com máx 10 mensagens
  if (!historico || !Array.isArray(historico)) historico = [];
  if (historico.length > 10) historico = historico.slice(-10);

  // 5. Última mensagem do usuário
  var ultimaMensagem = '';
  for (var i = historico.length - 1; i >= 0; i--) {
    if (historico[i].role === 'user') { ultimaMensagem = historico[i].content; break; }
  }
  if (!ultimaMensagem) return { reply: 'Não recebi sua mensagem. Tente novamente.', disponivel: true };

  // 6. Tenta Opção A: resposta com resumo (~500 palavras, barato)
  var promptSistema = _tutor_promptSistema(ctx, false);
  var respostaA     = _tutor_chamarAPI(promptSistema, historico);

  // 7. Detecta se precisa de Fallback B (tutor sinaliza que não consegue responder)
  var precisaFallback = _tutor_precisaFallback(respostaA);
  var resposta        = respostaA;
  var usouFallback    = false;

  if (precisaFallback && ctx.conteudo_full) {
    var promptB  = _tutor_promptSistema(ctx, true); // com conteúdo completo
    var respostaB = _tutor_chamarAPI(promptB, historico);
    if (respostaB && !respostaB.startsWith('ERRO')) {
      resposta     = respostaB;
      usouFallback = true;
    }
  }

  // 8. Loga interação
  _tutor_logInteracao(email, ctx, ultimaMensagem, resposta, usouFallback);

  return {
    reply:       resposta || 'Desculpe, tive um problema. Tente novamente.',
    disponivel:  true,
    fallback:    usouFallback,
    fora_escopo: resposta && resposta.indexOf('foge um pouco do nosso foco') >= 0
  };
}


// ═══════════════════════════════════════════════════════════════════════════════
// CONTEXTO DO TUTOR — chamado pelo frontend na carga inicial (sem invocar a API)
// Retorna disponibilidade + semana/competência/pílula para o ctx-bar
// ═══════════════════════════════════════════════════════════════════════════════
function getContextoTutor(email) {
  email = String(email || '').toLowerCase().trim();
  if (!email) return { disponivel: false };

  if (!_tutor_disponivel()) {
    return {
      disponivel: false,
      reply: 'O Tutor IA está disponível toda segunda e terça, das 7h às 22h. Anote sua dúvida e traga na próxima segunda! 📝'
    };
  }

  var ctx = _tutor_buscarContexto(email);
  return {
    disponivel:  true,
    semana:      ctx ? ctx.semana        : null,
    competencia: ctx ? ctx.competencia   : '—',
    pilula:      ctx ? ctx.pilula_titulo : '—',
    nome:        ctx ? ctx.nome          : ''
  };
}


// ═══════════════════════════════════════════════════════════════════════════════
// SERVE TUTOR — chamado pelo doGet quando view=tutor (após OTP validado)
// ═══════════════════════════════════════════════════════════════════════════════
function serveTutor(token) {
  var safeToken = String(token || '').replace(/[^a-zA-Z0-9\-_@\.]/g, '');
  var baseUrl = '';
  try { baseUrl = getURLWebApp() || ''; } catch(e2) {}

  // BYPASS TESTE: token = "TESTE__email@xxx.com"
  var testEmail = '';
  if (safeToken.indexOf('TESTE__') === 0) {
    testEmail = safeToken.substring(7);
    safeToken = 'TESTE';
  }

  var html = _tutor_htmlChat()
    .replace('<?= token ?>', safeToken)
    .replace('<?= baseUrl ?>', baseUrl)
    .replace('<?= testEmail ?>', testEmail);
  return HtmlService.createHtmlOutput(html)
    .setTitle('Tutor IA — Vertho')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}


// ═══════════════════════════════════════════════════════════════════════════════
// CRIAR ABA Tutor_Log (execute uma vez ou deixe criar automaticamente)
// ═══════════════════════════════════════════════════════════════════════════════
function criarAbaTutorLog() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss.getSheetByName(TUTOR_ABA_LOG)) {
    var ws = ss.insertSheet(TUTOR_ABA_LOG);
    ws.appendRow(['Data','E-mail','Nome','Semana','Competência','Pílula','Pergunta','Resposta','Fallback B']);
    ws.getRange(1,1,1,9).setFontWeight('bold').setBackground('#0f2b54').setFontColor('#fff');
    ws.setFrozenRows(1);
    ws.setColumnWidths(7,2,350);
    Logger.log('Aba Tutor_Log criada.');
  }

  // Cria aba Pilulas se não existir
  if (!ss.getSheetByName(TUTOR_ABA_PILULAS)) {
    var wsp = ss.insertSheet(TUTOR_ABA_PILULAS);
    wsp.appendRow(['Competência','Nível','Semana','Título','URL Moodle','Resumo Tutor (~500 palavras)','Conteúdo Completo (fallback)']);
    wsp.getRange(1,1,1,7).setFontWeight('bold').setBackground('#0f2b54').setFontColor('#fff');
    wsp.setFrozenRows(1);
    wsp.setColumnWidths(6,2,500);
    Logger.log('Aba Pilulas criada.');
  }

  try { SpreadsheetApp.getUi().alert('Abas Tutor_Log e Pilulas criadas/verificadas!'); } catch(e) {}
}


// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS INTERNOS
// ═══════════════════════════════════════════════════════════════════════════════

// Verifica se hoje é segunda (1) ou terça (2) — janela de disponibilidade
function _tutor_disponivel() {
  var dia = new Date().getDay(); // 0=dom, 1=seg, 2=ter, ...
  return TUTOR_DIAS_DISPONIVEIS.indexOf(dia) >= 0;
}

// Busca contexto do colaborador: semana atual, competência, pílula, resumo
function _tutor_buscarContexto(email) {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var wsEnv = ss.getSheetByName(F4_ABA_ENVIOS); // da Fase4.gs
  if (!wsEnv) return null;

  var dados = wsEnv.getDataRange().getValues();
  var linhaColab = null;

  for (var i = 1; i < dados.length; i++) {
    if (String(dados[i][F4E_EMAIL - 1]).trim().toLowerCase() === email
        && String(dados[i][F4E_STATUS - 1]).trim() === 'Ativo') {
      linhaColab = dados[i];
      break;
    }
  }
  if (!linhaColab) return null;

  var nome        = String(linhaColab[F4E_NOME - 1]).trim();
  var cargo       = String(linhaColab[F4E_CARGO - 1]).trim();
  var semanaAtual = parseInt(linhaColab[F4E_SEMANA_ATU - 1]) || 1;
  var sequencia   = [];
  try { sequencia = JSON.parse(String(linhaColab[F4E_SEQUENCIA - 1])); } catch(e) {}

  // Pílula da semana atual (ignora semanas de implementação)
  var pilula = null;
  for (var s = 0; s < sequencia.length; s++) {
    if (sequencia[s].semana === semanaAtual && sequencia[s].tipo === 'pilula') {
      pilula = sequencia[s];
      break;
    }
  }

  // Busca contexto da aba Trilhas (título, descrição, descritor, URL)
  var resumo_tutor  = '';
  var conteudo_full = '';
  var trilhaUrl     = '';
  var wsTri = ss.getSheetByName(F4_ABA_TRILHAS);
  if (wsTri && pilula) {
    var dadosTri = wsTri.getDataRange().getValues();
    for (var p = 1; p < dadosTri.length; p++) {
      var lt = dadosTri[p];
      var emailMatch  = String(lt[F4T_EMAIL - 1] || '').trim().toLowerCase() === email;
      var compMatch   = String(lt[F4T_COMPETENCIA - 1] || '').trim().toLowerCase() === (pilula.competencia || '').trim().toLowerCase();
      var semanaMatch = parseInt(lt[F4T_SEMANA - 1]) === semanaAtual;
      if (emailMatch && compMatch && semanaMatch) {
        var titulo   = String(lt[F4T_TITULO - 1] || '').trim();
        var descricao = String(lt[F4T_DESCRICAO - 1] || '').trim();
        var descritor = String(lt[F4T_DESCRITOR - 1] || '').trim();
        trilhaUrl     = String(lt[F4T_URL - 1] || '').trim();
        // Resumo básico da trilha (o resumo completo vem do Catálogo Enriquecido)
        resumo_tutor = 'Título: ' + titulo + '\nDescrição: ' + descricao + '\nDescritor foco: ' + descritor;
        break;
      }
    }
  }

  // Busca resumo_tutor do Catálogo Enriquecido (formato 864 linhas: Cod_Desc + Nível + Cargo)
  if (pilula) {
    var wsCat = ss.getSheetByName('Catalogo_Enriquecido');
    if (wsCat && wsCat.getLastRow() > 1) {
      var dadosCat = wsCat.getDataRange().getValues();
      var catHdr = dadosCat[0];
      var _catNh = function(s) {
        return String(s || '').toLowerCase().replace(/[\s\n_]/g, '')
          .replace(/[áàâã]/g, 'a').replace(/[éèê]/g, 'e').replace(/[íì]/g, 'i')
          .replace(/[óòôõ]/g, 'o').replace(/[úù]/g, 'u').replace(/[ç]/g, 'c');
      };
      var _catFh = function(label) {
        var ln = _catNh(label);
        for (var ch = 0; ch < catHdr.length; ch++) {
          if (_catNh(catHdr[ch]).indexOf(ln) >= 0) return ch;
        }
        return -1;
      };
      var iCatComp    = _catFh('competencia');
      var iCatCargo   = _catFh('cargo');
      var iCatCodDesc = _catFh('coddesc');
      var iCatDesc    = _catFh('descritor');
      var iCatNivel   = _catFh('niveltransicao');
      var iCatResumo  = _catFh('resumotutor');
      var iCatTransc  = _catFh('transcricao');
      var iCatCurso   = _catFh('cursomoodle');
      var iCatStatus  = _catFh('status');

      // Determinar nível de transição do colaborador
      var nivelTrans = (pilula.nivel === 1 || pilula.nivel === '1') ? 'N1' : 'N2';
      var cargoNorm = cargo.toLowerCase().replace(/[()]/g, '');

      // Buscar TODOS os resumos relevantes (mesma competência + cargo + nível)
      var resumos = [];
      var compNorm = (pilula.competencia || '').trim().toLowerCase();
      for (var c = 1; c < dadosCat.length; c++) {
        var catStatus = iCatStatus >= 0 ? String(dadosCat[c][iCatStatus] || '').trim().toLowerCase() : '';
        if (catStatus !== 'coberto') continue;

        var catCargo = iCatCargo >= 0 ? String(dadosCat[c][iCatCargo] || '').trim().toLowerCase().replace(/[()]/g, '') : '';
        if (catCargo && catCargo.indexOf(cargoNorm) < 0 && cargoNorm.indexOf(catCargo) < 0) continue;

        var catNivel = iCatNivel >= 0 ? String(dadosCat[c][iCatNivel] || '') : '';
        if (catNivel.indexOf(nivelTrans) < 0) continue;

        var catComp = iCatComp >= 0 ? String(dadosCat[c][iCatComp] || '').trim().toLowerCase() : '';
        if (catComp !== compNorm) continue;

        var catResumo = iCatResumo >= 0 ? String(dadosCat[c][iCatResumo] || '').trim() : '';
        var catTransc = iCatTransc >= 0 ? String(dadosCat[c][iCatTransc] || '').trim() : '';
        var catDesc   = iCatDesc >= 0 ? String(dadosCat[c][iCatDesc] || '').trim() : '';
        var catCurso  = iCatCurso >= 0 ? String(dadosCat[c][iCatCurso] || '').trim() : '';

        if (catResumo.length > 50 || catTransc.length > 50) {
          resumos.push({
            descritor: catDesc,
            curso: catCurso,
            resumo: catResumo,
            transcricao: catTransc
          });
        }
      }

      // Montar contexto completo a partir de todos os resumos encontrados
      if (resumos.length > 0) {
        var partes = resumos.map(function(r) {
          var parte = '=== Descritor: ' + r.descritor + (r.curso ? ' | Curso: ' + r.curso : '') + ' ===\n';
          if (r.resumo) parte += r.resumo + '\n';
          if (r.transcricao && r.transcricao.length > 50 && r.transcricao.indexOf('sem vídeos') < 0) {
            parte += '\n[TRANSCRIÇÃO]\n' + r.transcricao.substring(0, 3000) + '\n';
          }
          return parte;
        });
        conteudo_full = partes.join('\n');
        resumo_tutor = partes.slice(0, 3).join('\n'); // top 3 para resumo rápido
        Logger.log('Tutor contexto: ' + resumos.length + ' resumos, ' + conteudo_full.length + ' chars');
      }
    }
  }

  // PDI gap para contextualizar o tutor
  var contrato = {};
  try { contrato = JSON.parse(String(linhaColab[F4E_CONTRATO - 1])); } catch(e) {}

  // Buscar micro-desafio da semana ATUAL (se for semana de prática 4/8/12)
  var desafioAtual = '';
  var desafioAnterior = '';
  if (wsTri) {
    var dadosTri2 = wsTri.getDataRange().getValues();
    var ehSemanaImpl = (semanaAtual === 4 || semanaAtual === 8 || semanaAtual === 12);
    var semanaFollowUp = (semanaAtual === 5) ? 4 : (semanaAtual === 9) ? 8 : (semanaAtual === 13) ? 12 : 0;

    for (var t = 1; t < dadosTri2.length; t++) {
      var tEmail = String(dadosTri2[t][F4T_EMAIL - 1] || '').trim().toLowerCase();
      if (tEmail !== email) continue;
      var tSemana = parseInt(dadosTri2[t][F4T_SEMANA - 1]) || 0;
      var tTipo = String(dadosTri2[t][F4T_TIPO_SEMANA - 1] || '').trim().toLowerCase();

      // Desafio da semana atual (para semanas 4/8/12)
      if (ehSemanaImpl && tSemana === semanaAtual && tTipo === 'aplicacao') {
        desafioAtual = String(dadosTri2[t][F4T_DESCRICAO - 1] || dadosTri2[t][F4T_TITULO - 1] || '').trim();
      }
      // Desafio da semana anterior (para follow-up nas semanas 5/9/13)
      if (semanaFollowUp > 0 && tSemana === semanaFollowUp && tTipo === 'aplicacao') {
        desafioAnterior = String(dadosTri2[t][F4T_DESCRICAO - 1] || dadosTri2[t][F4T_TITULO - 1] || '').trim();
      }
    }
  }

  return {
    nome:         nome,
    cargo:        cargo,
    email:        email,
    semana:       semanaAtual,
    competencia:  pilula ? pilula.competencia : (contrato.competencia || ''),
    pilula_titulo:pilula ? pilula.titulo      : '(semana de implementação)',
    nivel:        pilula ? pilula.nivel       : '',
    gap:          contrato.foco || '',
    resumo_tutor: resumo_tutor,
    conteudo_full:conteudo_full,
    trilha_url:   trilhaUrl,
    eh_impl:      !pilula, // é semana de implementação
    desafio_atual:    desafioAtual,    // micro-desafio da semana atual (para semanas 4/8/12)
    desafio_anterior: desafioAnterior  // micro-desafio da semana prática anterior (para follow-up 5/9/13)
  };
}

// Monta prompt do sistema (doc 6.5)
// usarConteudoFull: false = Opção A (resumo ~500 palavras) | true = Fallback B (completo)
function _tutor_promptSistema(ctx, usarConteudoFull) {
  var conteudo = usarConteudoFull ? ctx.conteudo_full : ctx.resumo_tutor;
  var semanaInfo = ctx.eh_impl
    ? 'Esta é uma SEMANA DE PRÁTICA (semana ' + ctx.semana + ' de 14).\n'
      + (ctx.desafio_atual
        ? 'O MICRO-DESAFIO desta semana é:\n"""\n' + ctx.desafio_atual + '\n"""\n'
          + 'Seu papel: ajudar o colaborador a ENTENDER o desafio, PLANEJAR como vai executar,\n'
          + 'e TIRAR DÚVIDAS sobre como aplicar na prática do dia a dia.\n'
          + 'Pergunte sobre o contexto dele e ajude a adaptar o desafio à realidade da escola.'
        : 'Foco: praticar o que aprendeu nas últimas semanas.')
    : 'Pílula da semana: ' + ctx.pilula_titulo + ' (Semana ' + ctx.semana + ' de 14)';

  // Follow-up do micro-desafio (semanas 5, 9, 13 — logo após implementação)
  var followUpDesafio = '';
  if (ctx.desafio_anterior) {
    followUpDesafio = '\nIMPORTANTE — FOLLOW-UP DO MICRO-DESAFIO:\n'
      + 'Na semana passada o colaborador recebeu este desafio prático:\n'
      + '"""\n' + ctx.desafio_anterior + '\n"""\n'
      + 'Na PRIMEIRA mensagem do colaborador, pergunte sobre o desafio:\n'
      + '"Na semana passada você recebeu um desafio prático. Como foi? Conseguiu aplicar?"\n'
      + 'Se ele responder que fez, peça detalhes e parabenize.\n'
      + 'Se não fez, normalize ("é normal, o importante é tentar") e sugira uma versão menor.\n\n';
  }

  return 'Você é um tutor educacional da plataforma Vertho.\n'
    + 'Ajude o colaborador a ENTENDER e APLICAR o conteúdo da pílula semanal.\n\n'
    + 'CONTEXTO:\n'
    + '- Colaborador: ' + ctx.nome + ', ' + ctx.cargo + '\n'
    + '- Competência: ' + ctx.competencia + '\n'
    + '- ' + semanaInfo + '\n'
    + '- Gap do PDI: ' + (ctx.gap || 'não informado') + '\n'
    + (conteudo ? ('- Conteúdo da pílula:\n"""\n' + conteudo + '\n"""\n') : '')
    + followUpDesafio
    + '\nREGRAS DE GOVERNANÇA:\n'
    + '1. Responda em NO MÁXIMO 3 parágrafos curtos\n'
    + '2. SEMPRE cite a pílula da semana ("como vimos na pílula...")\n'
    + '3. SEMPRE pergunte ao final: "O que você já tentou aplicar disso?"\n'
    + '4. Use linguagem escolar (HTPC, sala de aula, reunião de pais)\n'
    + '5. Dê EXEMPLOS do dia a dia escolar\n'
    + '6. Se a dúvida for fora do escopo responda EXATAMENTE: "Ótima pergunta! Isso foge um pouco do nosso foco desta semana, mas sugiro anotar e trazer no check-in com seu gestor."\n'
    + '7. NUNCA avalie, julgue ou dê nota\n'
    + '8. NUNCA mencione nível, PDI, DISC ou dados internos\n'
    + '9. Se não conseguir responder com o material disponível, responda EXATAMENTE: "Deixe eu revisar o material completo..."\n'
    + '10. Máximo 3 parágrafos — seja direto e prático';
}

// Chama a API do Claude (Haiku)
function _tutor_chamarAPI(promptSistema, historico) {
  try {
    var payload = {
      model:      TUTOR_MODELO,
      max_tokens: TUTOR_MAX_TOKENS,
      system:     promptSistema,
      messages:   historico
    };

    var response = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
      method:  'post',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         PropertiesService.getScriptProperties().getProperty('ANTHROPIC_API_KEY') || '',
        'anthropic-version': '2023-06-01'
      },
      payload:             JSON.stringify(payload),
      muteHttpExceptions:  true
    });

    var code = response.getResponseCode();
    if (code !== 200) {
      Logger.log('Tutor API erro ' + code + ': ' + response.getContentText().substring(0, 200));
      return 'ERRO_API';
    }

    var data = JSON.parse(response.getContentText());
    if (data.content && data.content[0] && data.content[0].text) {
      return data.content[0].text.trim();
    }
    return 'ERRO_VAZIO';
  } catch(e) {
    Logger.log('Tutor chamarAPI exception: ' + e.message);
    return 'ERRO_EXCEPTION';
  }
}

// Detecta se a resposta A precisa de fallback B
function _tutor_precisaFallback(resposta) {
  if (!resposta || resposta.startsWith('ERRO')) return false;
  return resposta.indexOf('Deixe eu revisar o material completo') >= 0;
}

// Salva interação no Tutor_Log — 1 linha por sessão (email+data), conversa completa
function _tutor_logInteracao(email, ctx, pergunta, resposta, fallback) {
  try {
    var ss  = SpreadsheetApp.getActiveSpreadsheet();
    var ws  = ss.getSheetByName(TUTOR_ABA_LOG);
    if (!ws) {
      ws = ss.insertSheet(TUTOR_ABA_LOG);
      ws.appendRow(['Início','Última Msg','E-mail','Nome','Semana','Competência','Pílula','Turnos','Conversa','Usou Fallback']);
      ws.getRange(1,1,1,10).setFontWeight('bold').setBackground('#0f2b54').setFontColor('#fff');
      ws.setFrozenRows(1);
    }

    var agora = new Date();
    var hoje = Utilities.formatDate(agora, Session.getScriptTimeZone(), 'yyyy-MM-dd');

    // Buscar linha existente da sessão (mesmo email + mesma data)
    var dados = ws.getDataRange().getValues();
    var linhaExistente = -1;
    for (var i = dados.length - 1; i >= 1; i--) {
      var rowEmail = String(dados[i][2] || '').trim().toLowerCase();
      var rowData = '';
      try { rowData = Utilities.formatDate(new Date(dados[i][0]), Session.getScriptTimeZone(), 'yyyy-MM-dd'); } catch(de) {}
      if (rowEmail === email.toLowerCase() && rowData === hoje) {
        linhaExistente = i + 1; // 1-indexed
        break;
      }
    }

    var novaTroca = '👤 ' + pergunta + '\n🤖 ' + resposta;

    if (linhaExistente > 0) {
      // Atualizar linha existente — append à conversa
      var conversaAtual = String(ws.getRange(linhaExistente, 9).getValue() || '');
      var turnosAtual = parseInt(ws.getRange(linhaExistente, 8).getValue()) || 0;
      var usouFb = String(ws.getRange(linhaExistente, 10).getValue() || '');

      ws.getRange(linhaExistente, 2).setValue(agora); // última msg
      ws.getRange(linhaExistente, 8).setValue(turnosAtual + 1); // turnos
      ws.getRange(linhaExistente, 9).setValue((conversaAtual + '\n\n' + novaTroca).substring(0, 45000)); // conversa (limit 45k chars)
      if (fallback && usouFb !== 'SIM') ws.getRange(linhaExistente, 10).setValue('SIM');
    } else {
      // Nova sessão
      ws.appendRow([
        agora,                    // Início
        agora,                    // Última Msg
        email,                    // E-mail
        ctx.nome,                 // Nome
        ctx.semana,               // Semana
        ctx.competencia,          // Competência
        ctx.pilula_titulo,        // Pílula
        1,                        // Turnos
        novaTroca.substring(0, 45000), // Conversa
        fallback ? 'SIM' : 'NÃO' // Usou Fallback
      ]);
    }
  } catch(e) {
    Logger.log('Tutor log erro: ' + e.message);
  }
}


// ═══════════════════════════════════════════════════════════════════════════════
// GERAR RESUMOS PARA O TUTOR — Processa trilhas que não têm resumo ainda
// Usa IA para gerar ~500 palavras de contexto a partir do catálogo
// ═══════════════════════════════════════════════════════════════════════════════

// F4T_RESUMO_TUTOR removido — resumo agora vem do Catálogo Enriquecido

/**
 * Gera Resumos Tutor e Transcrições para cursos no Catalogo_Enriquecido.
 * Varre a aba, identifica cursos sem Resumo Tutor ou Transcrição,
 * extrai conteúdo do Moodle (páginas + vídeos YouTube), gera resumo via IA.
 */
function gerarResumosTutor() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var wsCat = ss.getSheetByName('Catalogo_Enriquecido');
  if (!wsCat || wsCat.getLastRow() < 2) {
    SpreadsheetApp.getUi().alert('Aba "Catalogo_Enriquecido" não encontrada ou vazia.\nRode "Catalogar Conteúdos (IA)" primeiro.');
    return;
  }

  _carregarCFG();

  // Descobrir colunas dinamicamente
  var headers = wsCat.getRange(1, 1, 1, wsCat.getLastColumn()).getValues()[0];
  var _nh = function(s) {
    return String(s || '').toLowerCase().replace(/\s+/g, '').replace(/\n/g, '')
      .replace(/[áàâã]/g, 'a').replace(/[éèê]/g, 'e').replace(/[íì]/g, 'i')
      .replace(/[óòôõ]/g, 'o').replace(/[úù]/g, 'u').replace(/[ç]/g, 'c');
  };
  var _fh = function(label) {
    var ln = _nh(label);
    for (var h = 0; h < headers.length; h++) {
      if (_nh(headers[h]).indexOf(ln) >= 0) return h + 1; // 1-indexed
    }
    return -1;
  };

  var colCurso     = _fh('curso');
  var colUrl       = _fh('urlcurso');
  var colModulos   = _fh('modulos');
  var colComp      = _fh('compconfirmada'); if (colComp < 0) colComp = _fh('competencia');
  var colDesc1     = _fh('descritor1');
  var colDesc2     = _fh('descritor2');
  var colDesc3     = _fh('descritor3');
  var colCargo     = _fh('cargo');
  var colCourseId  = _fh('courseid');
  var colResumo    = _fh('resumotutor');
  var colTransc    = _fh('transcric');
  var colStatus    = _fh('status');

  if (colResumo < 0 || colTransc < 0) {
    SpreadsheetApp.getUi().alert('Colunas "Resumo Tutor" e/ou "Transcrições" não encontradas.\nRode "Catalogar Conteúdos (IA)" para recriar a aba com o formato correto.');
    return;
  }

  var dados = wsCat.getDataRange().getValues();
  var gerados = 0, transcritos = 0, erros = 0;
  var MAX_POR_EXEC = 5;

  for (var i = 1; i < dados.length; i++) {
    if (gerados + transcritos + erros >= MAX_POR_EXEC) {
      Logger.log('Limite de ' + MAX_POR_EXEC + ' por execução — rode novamente para continuar.');
      break;
    }

    var curso    = colCurso > 0 ? String(dados[i][colCurso - 1] || '').trim() : '';
    var comp     = colComp > 0 ? String(dados[i][colComp - 1] || '').trim() : '';
    var url      = colUrl > 0 ? String(dados[i][colUrl - 1] || '').trim() : '';
    var modulos  = colModulos > 0 ? String(dados[i][colModulos - 1] || '').trim() : '';
    var desc1    = colDesc1 > 0 ? String(dados[i][colDesc1 - 1] || '').trim() : '';
    var desc2    = colDesc2 > 0 ? String(dados[i][colDesc2 - 1] || '').trim() : '';
    var desc3    = colDesc3 > 0 ? String(dados[i][colDesc3 - 1] || '').trim() : '';
    var cargo    = colCargo > 0 ? String(dados[i][colCargo - 1] || '').trim() : '';
    var courseId = colCourseId > 0 ? String(dados[i][colCourseId - 1] || '').trim() : '';

    if (!curso && !comp) continue;

    // Só processar linhas com Status="coberto" ou "parcial" (pular "vazio")
    var rowStatus = colStatus > 0 ? String(dados[i][colStatus - 1] || '').trim().toLowerCase() : '';
    if (rowStatus === 'vazio' || rowStatus === '') continue;

    var resumoExist = colResumo > 0 ? String(dados[i][colResumo - 1] || '').trim() : '';
    var transcExist = colTransc > 0 ? String(dados[i][colTransc - 1] || '').trim() : '';

    // Detectar se "resumo" é na verdade JSON bruto (não é resumo real)
    var temResumo = resumoExist.length > 50 && resumoExist.charAt(0) !== '[' && resumoExist.charAt(0) !== '{';
    var temTransc = transcExist.length > 10;
    if (temResumo && temTransc) continue;

    // Extrair courseId da URL se não houver coluna
    if (!courseId && url) {
      var match = url.match(/[?&]id=(\d+)/);
      if (match) courseId = match[1];
    }

    // ── 1. Extrair conteúdo do Moodle (páginas + vídeos) ──
    var moodleConteudo = '';
    var transcricoes = '';
    if (courseId && !temTransc) {
      try {
        var extracao = _tutor_extrairConteudoMoodleCompleto(parseInt(courseId));
        moodleConteudo = extracao.texto || '';
        transcricoes = extracao.transcricoes || '';

        // Salvar transcrições na coluna
        if (transcricoes.length > 10) {
          // Limite de 50k chars por célula
          if (transcricoes.length > 49000) {
            // Salvar excedente no Drive
            var folder = _getDriveFolderOrCreate('Vertho_Transcricoes');
            var file = folder.createFile(curso + '_transcricoes.txt', transcricoes, 'text/plain');
            wsCat.getRange(i + 1, colTransc).setValue('[Drive] ' + file.getUrl());
          } else {
            wsCat.getRange(i + 1, colTransc).setValue(transcricoes);
          }
          transcritos++;
          Logger.log('Transcrição salva: ' + curso + ' (' + transcricoes.length + ' chars)');
        } else {
          wsCat.getRange(i + 1, colTransc).setValue('(sem vídeos/áudios)');
        }
      } catch (me) {
        Logger.log('Erro extração Moodle courseId=' + courseId + ': ' + me.message);
        moodleConteudo = '';
      }
    } else if (temTransc && !temResumo) {
      // Já tem transcrição, usar para gerar resumo
      transcricoes = transcExist;
      if (transcricoes.indexOf('[Drive]') === 0) {
        // Tentar ler do Drive
        try {
          var driveUrl = transcricoes.replace('[Drive] ', '');
          var fileId = driveUrl.match(/\/d\/([^/]+)/);
          if (fileId) {
            transcricoes = DriveApp.getFileById(fileId[1]).getBlob().getDataAsString();
          }
        } catch(de) { transcricoes = ''; }
      }
    }

    // ── 2. Gerar resumo se não existe ──
    if (!temResumo) {
      var descritores = [desc1, desc2, desc3].filter(Boolean).join(', ');
      var conteudoTotal = '';
      if (moodleConteudo) conteudoTotal += 'CONTEUDO DAS PAGINAS DO CURSO:\n' + moodleConteudo.substring(0, 20000) + '\n\n';
      if (transcricoes && transcricoes.indexOf('[Drive]') !== 0) conteudoTotal += 'TRANSCRICOES DE VIDEOS:\n' + transcricoes.substring(0, 20000) + '\n\n';

      var prompt = [
        'Gere um resumo detalhado (~2000 palavras) sobre o conteudo deste curso para um tutor educacional de IA.',
        'O resumo deve permitir que o tutor responda duvidas dos colaboradores sobre TODOS os temas abordados no curso.',
        '',
        'CURSO: ' + curso,
        'COMPETENCIA: ' + comp,
        'CARGO: ' + cargo,
        'DESCRITORES FOCO: ' + descritores,
        'MODULOS: ' + modulos.substring(0, 500),
        '',
        conteudoTotal || 'Sem conteudo completo disponivel — gere resumo conceitual detalhado baseado nos titulos dos modulos e descritores.',
        '',
        'REGRAS:',
        '- Cubra TODOS os modulos/secoes do curso',
        '- Para cada modulo, explique os conceitos-chave e como se aplicam na pratica escolar',
        '- Conecte o conteudo aos descritores: como este curso desenvolve cada descritor listado',
        '- Inclua exemplos praticos do contexto escolar (gestao, sala de aula, coordenacao)',
        '- Antecipe perguntas frequentes que os colaboradores podem ter',
        '- Use linguagem acessivel, sem jargao tecnico',
        '- Se houver transcricoes de video, extraia os insights mais relevantes',
        '',
        'FORMATO: Retorne APENAS texto corrido em portugues, organizado por topicos com subtitulos.',
        'NAO retorne JSON, code blocks, ou estrutura de dados. Apenas texto narrativo puro.'
      ].join('\n');

      try {
        var modelo = _CFG.modelo || 'claude-sonnet-4-20250514';
        var resumo = '';
        var modeloLower = modelo.toLowerCase();

        if (modeloLower.indexOf('gpt') >= 0 || modeloLower.indexOf('o1') >= 0 || modeloLower.indexOf('o3') >= 0 || modeloLower.indexOf('o4') >= 0) {
          resumo = _ia4OpenAIRawV2(modelo, 'Voce e um especialista em educacao e desenvolvimento profissional.', prompt, false);
        } else if (modeloLower.indexOf('gemini') >= 0) {
          resumo = _ia4GeminiRawV2(modelo, 'Voce e um especialista em educacao e desenvolvimento profissional.', prompt);
        } else {
          resumo = _ia4ClaudeRawV2(modelo, 'Voce e um especialista em educacao e desenvolvimento profissional.', prompt, false);
        }

        // Limpar se IA retornou JSON ao invés de texto
        if (resumo && (resumo.charAt(0) === '{' || resumo.charAt(0) === '[')) {
          try {
            var parsed = JSON.parse(resumo);
            // Extrair texto do JSON (tentar campos comuns)
            resumo = parsed.resumo || parsed.texto || parsed.conteudo || parsed.summary || parsed.content || '';
            if (!resumo && typeof parsed === 'object') {
              // Concatenar todos os valores string
              resumo = Object.keys(parsed).map(function(k) {
                var v = parsed[k];
                return typeof v === 'string' ? v : '';
              }).filter(Boolean).join('\n\n');
            }
          } catch(jp) {
            // Não é JSON válido — tentar extrair texto removendo marcadores JSON
            resumo = resumo.replace(/^\s*[\[{]/, '').replace(/[\]}]\s*$/, '')
              .replace(/"[^"]+"\s*:\s*/g, '').replace(/[{}\[\]]/g, '').replace(/",?\s*/g, '\n').trim();
          }
        }
        // Garantir que resumo é string (Gemini pode retornar objeto)
        if (typeof resumo !== 'string') {
          resumo = JSON.stringify(resumo);
        }
        // Remover markdown code blocks se houver
        resumo = (resumo || '').replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();

        if (resumo && resumo.length > 100) {
          wsCat.getRange(i + 1, colResumo).setValue(resumo);
          gerados++;
          Logger.log('Resumo gerado: ' + curso + ' (' + resumo.length + ' chars)');
        } else {
          erros++;
          Logger.log('Resumo vazio/curto: ' + curso);
        }
      } catch (e) {
        erros++;
        Logger.log('Erro resumo: ' + curso + ' | ' + e.message);
      }

      Utilities.sleep(2000);
    }
  }

  var msg = gerados + ' resumo(s) gerado(s), ' + transcritos + ' transcrição(ões)';
  if (erros > 0) msg += ', ' + erros + ' erro(s)';
  var pendentes = 0;
  for (var j = 1; j < dados.length; j++) {
    var rj = colResumo > 0 ? String(dados[j][colResumo - 1] || '').trim() : '';
    var sj = colStatus > 0 ? String(dados[j][colStatus - 1] || '').trim().toLowerCase() : '';
    // Só conta pendentes com Status coberto/parcial (ignora vazio)
    if (sj !== 'vazio' && sj !== '' && rj.length < 50 && String(dados[j][0] || '').trim()) pendentes++;
  }
  if (pendentes > 0) msg += '. Restam ' + pendentes + ' cobertos pendentes — rode novamente.';
  SpreadsheetApp.getActive().toast(msg, 'Resumos Tutor', 10);
  Logger.log('gerarResumosTutor: ' + msg);
}


// ═══════════════════════════════════════════════════════════════════════════════
// EXTRAIR CONTEÚDO DO MOODLE — Puxa texto real das seções e módulos de um curso
// Usa: core_course_get_contents (retorna seções com módulos e descrições)
// ═══════════════════════════════════════════════════════════════════════════════

function _tutor_extrairConteudoMoodle(courseId) {
  var textos = [];
  var totalChars = 0;
  var MAX_CHARS = 15000; // Limite generoso para resumos ricos

  // ── 1. Estrutura do curso (seções + módulos + descrições) ──
  var dados = _moodle_chamada('core_course_get_contents', { courseid: courseId });
  if (!dados || !Array.isArray(dados)) return '';

  for (var s = 0; s < dados.length; s++) {
    var secao = dados[s];
    var secNome = String(secao.name || '').trim();
    var secResumo = _tutor_stripHtml(String(secao.summary || ''));

    if (secNome && secNome.toLowerCase() !== 'geral') {
      textos.push('=== ' + secNome + ' ===');
      totalChars += secNome.length + 10;
    }
    if (secResumo) {
      textos.push(secResumo);
      totalChars += secResumo.length;
    }

    var modulos = secao.modules || [];
    for (var m = 0; m < modulos.length; m++) {
      if (totalChars >= MAX_CHARS) break;

      var mod = modulos[m];
      var modNome = String(mod.name || '').trim();
      var modDesc = _tutor_stripHtml(String(mod.description || ''));

      if (modNome) {
        textos.push('• ' + modNome);
        totalChars += modNome.length + 4;
      }
      if (modDesc) {
        textos.push('  ' + modDesc.substring(0, 800));
        totalChars += Math.min(modDesc.length, 800);
      }

      // Detectar módulos de vídeo/áudio e transcrever
      var modType = String(mod.modname || '').toLowerCase();
      var fileUrl = '';
      if (mod.contents && mod.contents.length > 0) {
        for (var fi = 0; fi < mod.contents.length; fi++) {
          var fc = mod.contents[fi];
          var mime = String(fc.mimetype || '').toLowerCase();
          var furl = String(fc.fileurl || '');
          if (mime.indexOf('audio') >= 0 || mime.indexOf('video') >= 0 ||
              furl.match(/\.(mp3|mp4|m4a|wav|ogg|webm|flac)(\?|$)/i)) {
            fileUrl = furl;
            break;
          }
        }
      }
      // Recurso de URL externo ou embed YouTube
      if (!fileUrl && modType === 'url') {
        var modUrl = String(mod.url || '');
        if (modUrl.match(/\.(mp3|mp4|m4a|wav|ogg)(\?|$)/i)) {
          fileUrl = modUrl;
        } else if (modUrl.match(/youtube\.com|youtu\.be/i)) {
          fileUrl = modUrl; // Worker detecta YouTube e busca legendas
        }
      }
      // Detectar YouTube em embeds dentro da descrição
      if (!fileUrl && modDesc) {
        var ytEmbed = modDesc.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
        if (ytEmbed) {
          fileUrl = 'https://www.youtube.com/watch?v=' + ytEmbed[1];
        }
      }

      if (fileUrl && totalChars < MAX_CHARS) {
        try {
          var transcricao = _tutor_transcreverMidia(fileUrl);
          if (transcricao && transcricao.length > 50) {
            textos.push('  [TRANSCRIÇÃO]: ' + transcricao.substring(0, MAX_CHARS - totalChars));
            totalChars += Math.min(transcricao.length, MAX_CHARS - totalChars);
            Logger.log('Transcrição OK: ' + modNome + ' (' + transcricao.length + ' chars)');
          }
        } catch(te) {
          Logger.log('Transcrição falhou: ' + modNome + ' | ' + te.message);
        }
      }
    }
    if (totalChars >= MAX_CHARS) break;
  }

  // ── 2. Conteúdo completo das páginas (mod_page) ──
  try {
    var pages = _moodle_chamada('mod_page_get_pages_by_courses', { 'courseids[0]': courseId });
    if (pages && pages.pages && pages.pages.length > 0) {
      textos.push('\n=== CONTEÚDO COMPLETO DAS PÁGINAS ===');
      for (var p = 0; p < pages.pages.length; p++) {
        if (totalChars >= MAX_CHARS) break;
        var pg = pages.pages[p];
        var pgNome = String(pg.name || '').trim();
        var pgConteudo = _tutor_stripHtml(String(pg.content || ''));
        if (pgNome) {
          textos.push('\n--- ' + pgNome + ' ---');
          totalChars += pgNome.length + 10;
        }
        if (pgConteudo) {
          // Conteúdo real da página — preservar o máximo possível
          var limite = Math.min(pgConteudo.length, MAX_CHARS - totalChars);
          textos.push(pgConteudo.substring(0, limite));
          totalChars += limite;
        }
      }
      Logger.log('Moodle pages extraídas: ' + pages.pages.length + ' páginas, ' + totalChars + ' chars total');
    }
  } catch(pe) {
    Logger.log('mod_page_get_pages_by_courses falhou (courseId=' + courseId + '): ' + pe.message);
    // Não é crítico — segue com estrutura do curso
  }

  // ── 3. Labels (blocos de texto inline no curso) ──
  try {
    var labels = _moodle_chamada('mod_label_get_labels_by_courses', { 'courseids[0]': courseId });
    if (labels && labels.labels && labels.labels.length > 0) {
      for (var lb = 0; lb < labels.labels.length; lb++) {
        if (totalChars >= MAX_CHARS) break;
        var lbConteudo = _tutor_stripHtml(String(labels.labels[lb].intro || ''));
        if (lbConteudo && lbConteudo.length > 20) {
          textos.push(lbConteudo.substring(0, 1000));
          totalChars += Math.min(lbConteudo.length, 1000);
        }
      }
    }
  } catch(le) {
    // Labels são opcionais — ignorar erro silenciosamente
  }

  return textos.join('\n').substring(0, MAX_CHARS);
}

/**
 * Versão completa que retorna texto e transcrições SEPARADOS.
 * Usada pelo gerarResumosTutor() para salvar cada parte na coluna certa.
 * @return {Object} { texto: string, transcricoes: string }
 */
function _tutor_extrairConteudoMoodleCompleto(courseId) {
  var textos = [];
  var transcricoesList = [];
  var totalChars = 0;
  var MAX_CHARS = 30000;

  // ── 1. Estrutura do curso ──
  var dados = _moodle_chamada('core_course_get_contents', { courseid: courseId });
  if (!dados || !Array.isArray(dados)) return { texto: '', transcricoes: '' };

  for (var s = 0; s < dados.length; s++) {
    var secao = dados[s];
    var secNome = String(secao.name || '').trim();
    var secResumo = _tutor_stripHtml(String(secao.summary || ''));

    if (secNome && secNome.toLowerCase() !== 'geral') {
      textos.push('=== ' + secNome + ' ===');
    }
    if (secResumo) textos.push(secResumo);

    var modulos = secao.modules || [];
    for (var m = 0; m < modulos.length; m++) {
      var mod = modulos[m];
      var modNome = String(mod.name || '').trim();
      var modDesc = _tutor_stripHtml(String(mod.description || ''));
      var modType = String(mod.modname || '').toLowerCase();

      if (modNome) textos.push('• ' + modNome);
      if (modDesc) textos.push('  ' + modDesc.substring(0, 800));

      // Detectar vídeo/áudio
      var fileUrl = '';
      if (mod.contents && mod.contents.length > 0) {
        for (var fi = 0; fi < mod.contents.length; fi++) {
          var fc = mod.contents[fi];
          var mime = String(fc.mimetype || '').toLowerCase();
          var furl = String(fc.fileurl || '');
          if (mime.indexOf('audio') >= 0 || mime.indexOf('video') >= 0 ||
              furl.match(/\.(mp3|mp4|m4a|wav|ogg|webm|flac)(\?|$)/i)) {
            fileUrl = furl;
            break;
          }
        }
      }
      if (!fileUrl && modType === 'url') {
        var modUrl = String(mod.url || '');
        if (modUrl.match(/youtube\.com|youtu\.be/i)) fileUrl = modUrl;
        else if (modUrl.match(/\.(mp3|mp4|m4a|wav|ogg)(\?|$)/i)) fileUrl = modUrl;
      }
      if (!fileUrl && modDesc) {
        var ytEmbed = modDesc.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
        if (ytEmbed) fileUrl = 'https://www.youtube.com/watch?v=' + ytEmbed[1];
      }

      if (fileUrl) {
        try {
          var transcricao = _tutor_transcreverMidia(fileUrl);
          if (transcricao && transcricao.length > 50) {
            transcricoesList.push('[VIDEO ' + (transcricoesList.length + 1) + ': ' + modNome + ']\n' + transcricao);
            Logger.log('Transcrição OK: ' + modNome + ' (' + transcricao.length + ' chars)');
          } else {
            transcricoesList.push('[VIDEO ' + (transcricoesList.length + 1) + ': ' + modNome + ']\n(transcrição não disponível)');
          }
        } catch (te) {
          transcricoesList.push('[VIDEO ' + (transcricoesList.length + 1) + ': ' + modNome + ']\n(erro: ' + te.message + ')');
          Logger.log('Transcrição falhou: ' + modNome + ' | ' + te.message);
        }
      }
    }
  }

  // ── 2. Páginas completas + detectar YouTube embeds no HTML ──
  try {
    var pages = _moodle_chamada('mod_page_get_pages_by_courses', { 'courseids[0]': courseId });
    if (pages && pages.pages && pages.pages.length > 0) {
      textos.push('\n=== CONTEÚDO COMPLETO DAS PÁGINAS ===');
      for (var p = 0; p < pages.pages.length; p++) {
        var pg = pages.pages[p];
        var pgNome = String(pg.name || '').trim();
        var pgHtml = String(pg.content || '');
        var pgConteudo = _tutor_stripHtml(pgHtml);
        if (pgNome) textos.push('\n--- ' + pgNome + ' ---');
        if (pgConteudo) textos.push(pgConteudo.substring(0, 5000));

        // Detectar YouTube embeds dentro do HTML da página
        var ytRegex = /(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/g;
        var ytMatch;
        var ytIds = {};
        while ((ytMatch = ytRegex.exec(pgHtml)) !== null) {
          ytIds[ytMatch[1]] = true;
        }
        var ytUniqueIds = Object.keys(ytIds);
        if (ytUniqueIds.length > 0) {
          Logger.log('YouTube detectado em página "' + pgNome + '": ' + ytUniqueIds.length + ' vídeo(s)');
          for (var yi = 0; yi < ytUniqueIds.length; yi++) {
            var ytUrl = 'https://www.youtube.com/watch?v=' + ytUniqueIds[yi];
            try {
              var ytTransc = _tutor_transcreverMidia(ytUrl);
              if (ytTransc && ytTransc.length > 50) {
                transcricoesList.push('[VIDEO ' + (transcricoesList.length + 1) + ': ' + pgNome + ']\n' + ytTransc);
                Logger.log('Transcrição YouTube OK: ' + pgNome + ' / ' + ytUniqueIds[yi] + ' (' + ytTransc.length + ' chars)');
              } else {
                transcricoesList.push('[VIDEO ' + (transcricoesList.length + 1) + ': ' + pgNome + ']\n(transcrição não disponível)');
              }
            } catch (yte) {
              transcricoesList.push('[VIDEO ' + (transcricoesList.length + 1) + ': ' + pgNome + ']\n(erro: ' + yte.message + ')');
              Logger.log('Transcrição YouTube falhou: ' + pgNome + ' | ' + yte.message);
            }
          }
        }
      }
    }
  } catch (pe) {
    Logger.log('mod_page falhou courseId=' + courseId + ': ' + pe.message);
  }

  // ── 3. Labels + detectar YouTube embeds ──
  try {
    var labels = _moodle_chamada('mod_label_get_labels_by_courses', { 'courseids[0]': courseId });
    if (labels && labels.labels) {
      for (var lb = 0; lb < labels.labels.length; lb++) {
        var lbHtml = String(labels.labels[lb].intro || '');
        var lbConteudo = _tutor_stripHtml(lbHtml);
        if (lbConteudo && lbConteudo.length > 20) textos.push(lbConteudo.substring(0, 1000));

        // YouTube em labels também
        var lbYtRegex = /(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/g;
        var lbYtMatch;
        while ((lbYtMatch = lbYtRegex.exec(lbHtml)) !== null) {
          var lbYtUrl = 'https://www.youtube.com/watch?v=' + lbYtMatch[1];
          var lbNome = String(labels.labels[lb].name || 'Label').trim();
          try {
            var lbTransc = _tutor_transcreverMidia(lbYtUrl);
            if (lbTransc && lbTransc.length > 50) {
              transcricoesList.push('[VIDEO ' + (transcricoesList.length + 1) + ': ' + lbNome + ']\n' + lbTransc);
            }
          } catch (lte) {
            Logger.log('Transcrição YouTube label falhou: ' + lbNome + ' | ' + lte.message);
          }
        }
      }
    }
  } catch (le) { /* labels opcionais */ }

  return {
    texto: textos.join('\n').substring(0, MAX_CHARS),
    transcricoes: transcricoesList.join('\n\n')
  };
}

/**
 * Cria ou retorna pasta no Drive.
 */
function _getDriveFolderOrCreate(folderName) {
  var folders = DriveApp.getFoldersByName(folderName);
  if (folders.hasNext()) return folders.next();
  return DriveApp.createFolder(folderName);
}

/**
 * Diagnóstico: mostra o que o Moodle retorna para um curso e quais vídeos são detectados.
 * Rode no editor: diagnosticarMoodleCurso()
 */
function diagnosticarMoodleCurso() {
  var courseId = SpreadsheetApp.getUi().prompt('Diagnóstico Moodle', 'Informe o Course ID (ex: 4):', SpreadsheetApp.getUi().ButtonSet.OK_CANCEL).getResponseText().trim();
  if (!courseId) return;

  var resultado = [];
  resultado.push('=== DIAGNÓSTICO MOODLE COURSE ID: ' + courseId + ' ===\n');

  // 1. core_course_get_contents
  try {
    var dados = _moodle_chamada('core_course_get_contents', { courseid: courseId });
    resultado.push('core_course_get_contents: ' + (dados ? dados.length : 0) + ' seções\n');
    for (var s = 0; s < (dados || []).length; s++) {
      var sec = dados[s];
      resultado.push('SEÇÃO: ' + sec.name);
      for (var m = 0; m < (sec.modules || []).length; m++) {
        var mod = sec.modules[m];
        var desc = String(mod.description || '').substring(0, 200);
        var hasYT = desc.match(/youtube|youtu\.be/) ? ' *** YOUTUBE DETECTADO ***' : '';
        resultado.push('  MOD: [' + mod.modname + '] ' + mod.name + hasYT);
        if (mod.contents && mod.contents.length > 0) {
          for (var ci = 0; ci < mod.contents.length; ci++) {
            resultado.push('    CONTENT: type=' + mod.contents[ci].type + ' mime=' + (mod.contents[ci].mimetype || '') + ' url=' + (mod.contents[ci].fileurl || '').substring(0, 100));
          }
        }
        if (hasYT) resultado.push('    DESC: ' + desc);
      }
    }
  } catch (e) {
    resultado.push('ERRO core_course_get_contents: ' + e.message);
  }

  // 2. mod_page_get_pages_by_courses
  resultado.push('\n=== PÁGINAS ===');
  try {
    var pages = _moodle_chamada('mod_page_get_pages_by_courses', { 'courseids[0]': courseId });
    resultado.push('Páginas encontradas: ' + ((pages && pages.pages) ? pages.pages.length : 0));
    if (pages && pages.pages) {
      for (var p = 0; p < pages.pages.length; p++) {
        var pg = pages.pages[p];
        var pgHtml = String(pg.content || '');
        var ytMatches = pgHtml.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/g) || [];
        resultado.push('  PÁGINA: ' + pg.name + ' | HTML=' + pgHtml.length + ' chars | YouTube embeds=' + ytMatches.length);
        for (var yi = 0; yi < ytMatches.length; yi++) {
          resultado.push('    YT: ' + ytMatches[yi]);
        }
      }
    }
  } catch (e) {
    resultado.push('ERRO mod_page: ' + e.message);
  }

  // 3. Labels
  resultado.push('\n=== LABELS ===');
  try {
    var labels = _moodle_chamada('mod_label_get_labels_by_courses', { 'courseids[0]': courseId });
    resultado.push('Labels encontrados: ' + ((labels && labels.labels) ? labels.labels.length : 0));
    if (labels && labels.labels) {
      for (var lb = 0; lb < labels.labels.length; lb++) {
        var lbHtml = String(labels.labels[lb].intro || '');
        var lbYt = lbHtml.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/g) || [];
        resultado.push('  LABEL: ' + (labels.labels[lb].name || '(sem nome)') + ' | HTML=' + lbHtml.length + ' chars | YouTube=' + lbYt.length);
        for (var li = 0; li < lbYt.length; li++) {
          resultado.push('    YT: ' + lbYt[li]);
        }
      }
    }
  } catch (e) {
    resultado.push('ERRO labels: ' + e.message);
  }

  Logger.log(resultado.join('\n'));
  SpreadsheetApp.getUi().alert(resultado.join('\n').substring(0, 5000));
}

/**
 * Transcreve áudio/vídeo via Worker Cloudflare + Whisper API.
 * URL do Worker configurada em ScriptProperties: TRANSCRIBE_WORKER_URL
 */
function _tutor_transcreverMidia(fileUrl) {
  // ── YouTube: extrair legendas direto no GAS (sem Worker) ──
  var ytMatch = fileUrl.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  if (ytMatch) {
    var ytId = ytMatch[1];
    Logger.log('YouTube detectado: ' + ytId + ' — extraindo legendas via GAS');
    try {
      var transcricao = _tutor_transcreverYouTube(ytId);
      if (transcricao && transcricao.length > 50) {
        Logger.log('Transcrição YouTube OK: ' + ytId + ' (' + transcricao.length + ' chars)');
        return transcricao;
      }
      _ytCache[ytId] = ''; // cachear falha
    } catch(yte) {
      Logger.log('Transcrição YouTube falhou: ' + ytId + ' | ' + yte.message);
      _ytCache[ytId] = ''; // cachear falha
    }
    return '';
  }

  // ── Mídia não-YouTube: usar Worker (Whisper) ──
  var workerUrl = PropertiesService.getScriptProperties().getProperty('TRANSCRIBE_WORKER_URL');
  if (!workerUrl) {
    Logger.log('TRANSCRIBE_WORKER_URL não configurada — transcrição desabilitada.');
    return '';
  }

  // Adicionar token do Moodle à URL se for interna
  if (fileUrl.indexOf('academia.vertho.ai') >= 0 && fileUrl.indexOf('token=') < 0) {
    var token = PropertiesService.getScriptProperties().getProperty('MOODLE_TOKEN') || '';
    if (token) {
      fileUrl += (fileUrl.indexOf('?') >= 0 ? '&' : '?') + 'token=' + token;
    }
  }

  var resp = UrlFetchApp.fetch(workerUrl + '/transcribe', {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({ url: fileUrl, language: 'pt' }),
    muteHttpExceptions: true,
    timeout: 120
  });

  var code = resp.getResponseCode();
  if (code !== 200) {
    Logger.log('Worker transcrição erro ' + code + ': ' + resp.getContentText().substring(0, 200));
    return '';
  }

  var data = JSON.parse(resp.getContentText());
  if (data.success && data.text) {
    Logger.log('Transcrição Whisper OK: ' + data.text.length + ' chars');
    return data.text;
  }

  Logger.log('Worker retornou sucesso=false: ' + (data.error || 'desconhecido'));
  return '';
}


/**
 * Transcreve vídeo do YouTube via Cloudflare Worker (vertho-transcribe).
 * O GAS IP é bloqueado pelo YouTube (429), então delega ao Worker.
 */
var _ytCache = {};

function _tutor_transcreverYouTube(videoId) {
  // Cache hit
  if (_ytCache[videoId] !== undefined) {
    Logger.log('YouTube cache hit: ' + videoId + ' (' + (_ytCache[videoId] || '').length + ' chars)');
    return _ytCache[videoId];
  }

  // ── Tentativa 1: Supadata API (mais confiável, sem bloqueio de IP) ──
  var supadataKey = PropertiesService.getScriptProperties().getProperty('SUPADATA_API_KEY');
  if (supadataKey) {
    try {
      Utilities.sleep(1500);
      var sdResp = UrlFetchApp.fetch(
        'https://api.supadata.ai/v1/youtube/transcript?videoId=' + videoId + '&lang=pt',
        { muteHttpExceptions: true, headers: { 'x-api-key': supadataKey } }
      );
      if (sdResp.getResponseCode() === 200) {
        var sdBody = sdResp.getContentText();
        var sdData = JSON.parse(sdBody);
        var sdContent = sdData.content || sdData;
        if (Array.isArray(sdContent) && sdContent.length > 0) {
          var sdText = sdContent.map(function(s) { return s.text || ''; }).join(' ');
          Logger.log('Supadata OK: ' + videoId + ' (' + sdText.length + ' chars, ' + sdContent.length + ' segs)');
          _ytCache[videoId] = sdText;
          return sdText;
        }
      }
      Logger.log('Supadata sem resultado: ' + videoId + ' (HTTP ' + sdResp.getResponseCode() + ')');
    } catch(sdErr) {
      Logger.log('Supadata erro: ' + videoId + ' | ' + sdErr.message);
    }
  }

  // ── Tentativa 2: Fallback — Worker Cloudflare ──
  var workerUrl = PropertiesService.getScriptProperties().getProperty('TRANSCRIBE_WORKER_URL');
  if (!workerUrl) {
    _ytCache[videoId] = '';
    return '';
  }

  Utilities.sleep(2000);
  Logger.log('YouTube transcrição via Worker: ' + videoId);

  var resp = UrlFetchApp.fetch(workerUrl + '/transcribe', {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({
      url: 'https://www.youtube.com/watch?v=' + videoId,
      language: 'pt'
    }),
    muteHttpExceptions: true,
    headers: { 'Accept': 'application/json' }
  });

  if (resp.getResponseCode() !== 200) {
    throw new Error('Worker retornou HTTP ' + resp.getResponseCode());
  }

  var data;
  try {
    data = JSON.parse(resp.getContentText());
  } catch(je) {
    throw new Error('Worker resposta não é JSON válido');
  }

  if (!data.success || !data.text) {
    throw new Error(data.error || 'Worker retornou sem texto');
  }

  Logger.log('YouTube transcrição OK via Worker: ' + videoId + ' (' + data.text.length + ' chars, source=' + (data.source || '') + ')');
  _ytCache[videoId] = data.text;
  return data.text;
}

/**
 * Remove tags HTML e decodifica entidades básicas
 */
function _tutor_stripHtml(html) {
  if (!html) return '';
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}


// ═══════════════════════════════════════════════════════════════════════════════
// HTML DO CHAT DO TUTOR (self-contained)
// ═══════════════════════════════════════════════════════════════════════════════
function _tutor_htmlChat() {
  return '<!DOCTYPE html>\n<html>\n<head>\n'
    + '<meta charset="utf-8">\n'
    + '<meta name="viewport" content="width=device-width, initial-scale=1">\n'
    + '<title>Tutor IA — Vertho</title>\n'
    + '<style>\n'
    + '* { box-sizing: border-box; margin: 0; padding: 0; }\n'
    + 'body { font-family: Arial, sans-serif; background: #f4f7fb; height: 100vh; display: flex; flex-direction: column; }\n'
    + '.header { background: #0f2b54; padding: 14px 20px; display: flex; align-items: center; gap: 10px; flex-shrink: 0; }\n'
    + '.header-logo { display: flex; align-items: center; }\n'
    + '.header-logo img { height: 28px; display: block; }\n'
    + '.header .sub  { color: rgba(255,255,255,.55); font-size: 12px; margin-left: 8px; }\n'
    + '.header .badge { margin-left: auto; background: #1e4080; color: #34c5cc; font-size: 11px; font-weight: 600; padding: 3px 10px; border-radius: 20px; }\n'
    + '.ctx-bar { background: #fff; border-bottom: 1px solid #e2e8f0; padding: 10px 18px; font-size: 12px; color: #64748b; display: flex; gap: 16px; flex-shrink: 0; }\n'
    + '.ctx-bar strong { color: #0f2b54; }\n'
    + '.msgs { flex: 1; overflow-y: auto; padding: 16px 12px; display: flex; flex-direction: column; gap: 10px; }\n'
    + '.bubble { max-width: 80%; padding: 12px 16px; border-radius: 14px; font-size: 14px; line-height: 1.6; }\n'
    + '.bubble.user { background: #0f2b54; color: #fff; align-self: flex-end; border-bottom-right-radius: 4px; }\n'
    + '.bubble.bot  { background: #fff; color: #1e293b; align-self: flex-start; border-bottom-left-radius: 4px; border: 1px solid #e2e8f0; }\n'
    + '.bubble.bot.loading { color: #94a3b8; font-style: italic; }\n'
    + '.bubble.system { background: #fff8ed; color: #92400e; border: 1px solid #fcd34d; align-self: center; font-size: 12px; border-radius: 10px; text-align: center; max-width: 90%; }\n'
    + '.input-area { background: #fff; border-top: 1px solid #e2e8f0; padding: 12px 16px; display: flex; gap: 10px; flex-shrink: 0; }\n'
    + 'textarea { flex: 1; border: 1.5px solid #e2e8f0; border-radius: 10px; padding: 10px 14px; font-size: 14px; font-family: Arial, sans-serif; resize: none; outline: none; max-height: 100px; transition: border .2s; }\n'
    + 'textarea:focus { border-color: #34c5cc; }\n'
    + 'button#btn-enviar { background: linear-gradient(135deg,#34c5cc,#2ba8af); color: #fff; border: none; border-radius: 10px; padding: 10px 18px; font-size: 14px; font-weight: 600; cursor: pointer; transition: opacity .2s; }\n'
    + 'button#btn-enviar:disabled { opacity: .45; cursor: default; }\n'
    + '.offline-msg { text-align: center; padding: 40px 20px; color: #64748b; font-size: 14px; line-height: 1.8; }\n'
    + '.offline-msg strong { color: #0f2b54; display: block; margin-bottom: 8px; font-size: 16px; }\n'
    + '</style>\n'
    + '</head>\n<body>\n'

    // Header
    + '<div class="header">\n'
    + '  <div class="header-logo"><img src="data:image/png;base64,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" style="height:28px;display:block" alt="Vertho"></div>\n'
    + '  <div class="sub">Tutor IA</div>\n'
    + '  <div class="badge" id="badge-dia">● Disponível</div>\n'
    + '</div>\n'

    // Barra de contexto (preenchida pelo JS após carregar)
    + '<div class="ctx-bar" id="ctx-bar" style="display:none">\n'
    + '  <span>Semana: <strong id="ctx-semana">—</strong></span>\n'
    + '  <span>Competência: <strong id="ctx-comp">—</strong></span>\n'
    + '  <span>Pílula: <strong id="ctx-pilula">—</strong></span>\n'
    + '</div>\n'

    // Área de mensagens
    + '<div class="msgs" id="msgs"></div>\n'

    // Input
    + '<div class="input-area" id="input-area">\n'
    + '  <textarea id="inp" placeholder="Digite sua dúvida sobre a pílula desta semana..." rows="1"></textarea>\n'
    + '  <button id="btn-enviar" onclick="enviar()">Enviar</button>\n'
    + '</div>\n'

    + '<script>\n'
    + 'var _token    = "<?= token ?>";\n'
    + 'var _baseUrl  = "<?= baseUrl ?>";\n'
    + 'var _testEmail = "<?= testEmail ?>";\n'
    + 'var _email    = "";\n'
    + 'var _historico = [];  // máx 10 mensagens (5 trocas)\n'
    + 'var _ctx      = null;\n'
    + 'var _online   = true;\n'
    + '\n'

    // Inicialização
    + 'window.onload = function() {\n'
    + '  // BYPASS TESTE: se testEmail preenchido, pula OTP\n'
    + '  if (_testEmail) {\n'
    + '    _email = _testEmail;\n'
    + '    carregarContexto();\n'
    + '    return;\n'
    + '  }\n'
    + '  // Verifica sessão OTP\n'
    + '  google.script.run\n'
    + '    .withSuccessHandler(function(sessao) {\n'
    + '      if (!sessao) { var _b = (_baseUrl && _baseUrl.indexOf("http") === 0) ? _baseUrl : window.location.href.split("?")[0]; window.top.location.href = _b + "?view=tutor"; return; }\n'
    + '      _email = sessao.email;\n'
    + '      carregarContexto();\n'
    + '    })\n'
    + '    .withFailureHandler(function() { mostrarSistema("Erro ao verificar sessão. Recarregue."); })\n'
    + '    .verificarSessao(_token);\n'
    + '};\n'
    + '\n'

    + 'function carregarContexto() {\n'
    + '  google.script.run\n'
    + '    .withSuccessHandler(function(r) {\n'
    + '      _online = r.disponivel !== false;\n'
    + '      if (!_online) {\n'
    + '        document.getElementById("badge-dia").textContent = "● Offline";\n'
    + '        document.getElementById("badge-dia").style.background = "#374151";\n'
    + '        document.getElementById("badge-dia").style.color = "#9ca3af";\n'
    + '        document.getElementById("input-area").style.display = "none";\n'
    + '        document.getElementById("msgs").innerHTML = \'<div class="offline-msg"><strong>Tutor IA indisponível</strong>\' + r.reply + \'</div>\';\n'
    + '      } else {\n'
    + '        document.getElementById("ctx-bar").style.display = "flex";\n'
    + '        if (r.semana)      document.getElementById("ctx-semana").textContent = r.semana;\n'
    + '        if (r.competencia) document.getElementById("ctx-comp").textContent   = r.competencia;\n'
    + '        if (r.pilula)      document.getElementById("ctx-pilula").textContent = r.pilula;\n'
    + '        var saudacao = r.nome ? "Olá, " + r.nome.split(" ")[0] + "!" : "Olá!";\n'
    + '        adicionarBubble("bot", saudacao + " Sou o Tutor IA da Vertho. Estou aqui para te ajudar com a pílula desta semana. Qual é sua dúvida?");\n'
    + '      }\n'
    + '    })\n'
    + '    .withFailureHandler(function() { mostrarSistema("Erro ao carregar. Recarregue a página."); })\n'
    + '    .getContextoTutor(_email);\n'
    + '}\n'
    + '\n'

    + 'function enviar() {\n'
    + '  var txt = document.getElementById("inp").value.trim();\n'
    + '  if (!txt || !_online) return;\n'
    + '\n'
    + '  adicionarBubble("user", txt);\n'
    + '  document.getElementById("inp").value = "";\n'
    + '  autoResize();\n'
    + '\n'
    + '  // Atualiza histórico (máx 10 msgs)\n'
    + '  _historico.push({ role: "user", content: txt });\n'
    + '  if (_historico.length > 10) _historico = _historico.slice(-10);\n'
    + '\n'
    + '  var loadId = adicionarBubble("bot loading", "Digitando...");\n'
    + '  document.getElementById("btn-enviar").disabled = true;\n'
    + '\n'
    + '  google.script.run\n'
    + '    .withSuccessHandler(function(r) {\n'
    + '      removerBubble(loadId);\n'
    + '      document.getElementById("btn-enviar").disabled = false;\n'
    + '      var resposta = r.reply || "Desculpe, tive um problema. Tente novamente.";\n'
    + '      adicionarBubble("bot", resposta);\n'
    + '      // Adiciona resposta ao histórico\n'
    + '      _historico.push({ role: "assistant", content: resposta });\n'
    + '      if (_historico.length > 10) _historico = _historico.slice(-10);\n'
    + '    })\n'
    + '    .withFailureHandler(function() {\n'
    + '      removerBubble(loadId);\n'
    + '      document.getElementById("btn-enviar").disabled = false;\n'
    + '      adicionarBubble("bot", "Erro de conexão. Tente novamente.");\n'
    + '    })\n'
    + '    .chatTutor(_email, _historico);\n'
    + '}\n'
    + '\n'

    + 'var _bubbleId = 0;\n'
    + 'function adicionarBubble(tipo, texto) {\n'
    + '  var id  = "b" + (++_bubbleId);\n'
    + '  var div = document.createElement("div");\n'
    + '  div.id        = id;\n'
    + '  div.className = "bubble " + tipo;\n'
    + '  div.textContent = texto;\n'
    + '  document.getElementById("msgs").appendChild(div);\n'
    + '  document.getElementById("msgs").scrollTop = 999999;\n'
    + '  return id;\n'
    + '}\n'
    + '\n'
    + 'function removerBubble(id) {\n'
    + '  var el = document.getElementById(id);\n'
    + '  if (el) el.remove();\n'
    + '}\n'
    + '\n'
    + 'function mostrarSistema(msg) {\n'
    + '  adicionarBubble("system", msg);\n'
    + '}\n'
    + '\n'

    // Auto-resize textarea
    + 'var inp = document.getElementById("inp");\n'
    + 'inp.addEventListener("input", autoResize);\n'
    + 'inp.addEventListener("keydown", function(e) {\n'
    + '  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); enviar(); }\n'
    + '});\n'
    + 'function autoResize() {\n'
    + '  inp.style.height = "auto";\n'
    + '  inp.style.height = Math.min(inp.scrollHeight, 100) + "px";\n'
    + '}\n'
    + '</script>\n'
    + '</body>\n</html>';
}