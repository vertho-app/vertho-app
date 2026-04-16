/**
 * ============================================================
 * VERTHO APP — Configuração Central + Data Access
 * ============================================================
 * Mapeia para as abas reais do projeto Ibipeba.
 * Conecta com funções existentes do pipeline.
 * ============================================================
 */

var APP_CONFIG = {
  // Nomes das abas reais
  SHEETS: {
    COLABORADORES:       'Colaboradores',
    RESPOSTAS:           'Respostas',
    PDI_DESCRITORES:     'PDI_Descritores',
    TRILHAS:             'Trilhas',
    CATALOGO:            'Catalogo_Enriquecido',
    FASE4_ENVIOS:        'Fase4_Envios',
    FASE4_EVIDENCIAS:    'Fase4_Evidencias',
    TUTOR_LOG:           'Tutor_Log',
    CICLOS_AVALIACAO:    'Ciclos_Avaliacao',
    COMPETENCIAS_V2:     'Competencias_v2',
    BANCO_CENARIOS:      'Banco_Cenarios',
    CIS_ASSESSMENT:      'CIS Assessment',
    EVOLUCAO:            'Evolucao',
    EVOLUCAO_DESCRITORES:'Evolucao_Descritores'
  },

  // Aba Colaboradores: header na linha 4 (índice 3), dados a partir da linha 5
  COLAB_HEADER_ROW: 4,
  COLAB_DATA_START: 5,

  STATUS: {
    CONCLUIDO: 'concluido',
    EM_ANDAMENTO: 'em_andamento',
    DISPONIVEL: 'disponivel',
    AGUARDANDO: 'aguardando',
    FUTURO: 'futuro'
  }
};


// ============================================================
// DATA ACCESS — Conecta com funções existentes do pipeline
// ============================================================

var AppData = {

  // ─── HOME / DASHBOARD ───────────────────────────────────

  getDashboard: function(email) {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var user = AppData._getColaborador(ss, email);
    if (!user) return { error: 'Colaborador não encontrado' };

    var jornada = AppData._getJornadaStatus(ss, email);
    var pdi     = AppData._getPDIResumo(ss, email);
    var foco    = AppData._getFocoDaSemana(ss, email);
    var evolucao= AppData._getEvolucaoResumo(ss, email);

    return {
      user: { nome: user.nome, cargo: user.cargo, escola: user.escola, email: email },
      jornada: jornada,
      pdi: pdi,
      focoDaSemana: foco,
      evolucao: evolucao
    };
  },

  // ─── JORNADA ────────────────────────────────────────────

  getEtapas: function(email) {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var etapas = [
      { id: 1, nome: 'Perfil Comportamental',     descricao: 'Mapeamento (Valores + Tipos)', icone: '1' },
      { id: 2, nome: 'Mapeamento de Competências', descricao: 'Cenários situacionais por competência',    icone: '2' },
      { id: 3, nome: 'Plano de Ação Individual (PDI)', descricao: 'Seu plano de desenvolvimento',              icone: '3' },
      { id: 4, nome: 'Trilha de Conteúdo',         descricao: '14 semanas de capacitação',                 icone: '4' },
      { id: 5, nome: 'Tira-Dúvida IA',             descricao: 'Tutor IA para suas dúvidas',                icone: '5' },
      { id: 6, nome: 'Prática Semanal',            descricao: 'Micro-desafios e evidências',               icone: '6' },
      { id: 7, nome: 'Mentor IA',                  descricao: 'Orientação personalizada',                  icone: '7' },
      { id: 8, nome: 'Reavaliação',                descricao: 'Cenário B + conversa de evolução',          icone: '8' },
      { id: 9, nome: 'Relatório de Evolução',      descricao: 'Fusão dos seus resultados',                 icone: '9' },
      { id: 10, nome: 'Próximo Ciclo',             descricao: 'Planejamento do ciclo seguinte',            icone: '10' }
    ];

    // Calcular status de cada etapa baseado nos dados reais
    var temCIS      = AppData._temCIS(ss, email);
    var temAvaliacao= AppData._temAvaliacao(ss, email);
    var temPDI      = AppData._temPDI(ss, email);
    var temTrilha   = AppData._temTrilha(ss, email);
    var semanaAtual = AppData._getSemanaAtual(ss, email);
    var temEvolucao = AppData._temEvolucao(ss, email);

    // Contagem de competências feitas/total para etapa 2
    var compProgress = AppData._getCompetenciasProgress(ss, email);

    etapas[0].status = temCIS ? 'concluido' : 'disponivel';
    etapas[1].status = temAvaliacao ? 'concluido' : (temCIS ? 'disponivel' : 'futuro');
    if (compProgress.total > 0) {
      etapas[1].progresso = compProgress.feitas + '/' + compProgress.total + ' competências avaliadas';
      if (compProgress.feitas > 0 && compProgress.feitas < compProgress.total) {
        etapas[1].status = 'em_andamento';
      }
    }
    etapas[2].status = temPDI ? 'concluido' : (temAvaliacao ? 'disponivel' : 'futuro');
    etapas[3].status = temTrilha ? (semanaAtual >= 14 ? 'concluido' : 'em_andamento') : (temPDI ? 'disponivel' : 'futuro');
    etapas[4].status = temTrilha ? 'disponivel' : 'futuro';
    etapas[5].status = (semanaAtual === 4 || semanaAtual === 8 || semanaAtual === 12) ? 'em_andamento' : (temTrilha ? 'disponivel' : 'futuro');
    etapas[6].status = temTrilha ? 'disponivel' : 'futuro';
    etapas[7].status = semanaAtual >= 15 ? 'disponivel' : 'futuro';
    etapas[8].status = temEvolucao ? 'concluido' : 'futuro';
    etapas[9].status = temEvolucao ? 'disponivel' : 'futuro';

    return etapas;
  },

  // ─── PDI ─────────────────────────────────────────────────

  getPDI: function(email) {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var emailNorm = email.toLowerCase().trim();

    // 1. Buscar competências avaliadas da aba Respostas (com pontos fortes/atenção)
    var wsResp = ss.getSheetByName(APP_CONFIG.SHEETS.RESPOSTAS);
    var comps = [];
    if (wsResp && wsResp.getLastRow() > 1) {
      var respDados = wsResp.getDataRange().getValues();
      var respHdr = respDados[0];
      var _rfh = function(label) {
        var ln = label.toLowerCase();
        for (var i = 0; i < respHdr.length; i++) {
          if (String(respHdr[i] || '').toLowerCase().indexOf(ln) >= 0) return i;
        }
        return -1;
      };
      var irEmail = _rfh('mail');
      var irComp  = _rfh('nome comp'); if (irComp < 0) irComp = _rfh('competencia');
      var irNivel = _rfh('vel ia4'); if (irNivel < 0) irNivel = _rfh('nivel');
      var irNota  = _rfh('nota ia4'); if (irNota < 0) irNota = _rfh('nota');
      var irFortes = _rfh('pontos fortes'); if (irFortes < 0) irFortes = _rfh('forte');
      var irAtencao = _rfh('pontos de aten'); if (irAtencao < 0) irAtencao = _rfh('atencao');
      var irFeedback = _rfh('feedback ia4'); if (irFeedback < 0) irFeedback = _rfh('feedback');
      var irStatus = _rfh('status ia');

      for (var r = 1; r < respDados.length; r++) {
        var re = String(respDados[r][irEmail >= 0 ? irEmail : 1] || '').trim().toLowerCase();
        if (re !== emailNorm) continue;
        var status = irStatus >= 0 ? String(respDados[r][irStatus] || '').toLowerCase() : '';
        if (status.indexOf('avali') < 0 && status.indexOf('pdf') < 0 && status.indexOf('conclu') < 0) continue;

        var nota = irNota >= 0 ? parseFloat(respDados[r][irNota]) || 0 : 0;
        var nivel = irNivel >= 0 ? parseInt(respDados[r][irNivel]) || 0 : 0;
        var compNome = irComp >= 0 ? String(respDados[r][irComp] || '') : '';

        // Evitar duplicatas (pegar a última avaliação de cada competência)
        var existIdx = -1;
        for (var ci = 0; ci < comps.length; ci++) {
          if (comps[ci].nome.toLowerCase() === compNome.toLowerCase()) { existIdx = ci; break; }
        }
        var compObj = {
          id: compNome.replace(/\s+/g, '_').substring(0, 20),
          nome: compNome,
          nivelAtual: nivel,
          nota: nota,
          meta: nivel < 3 ? nivel + 1 : 4,
          prioridade: nota < 1.5 ? 'alta' : (nota < 2.5 ? 'média' : 'baixa'),
          pontosFortes: irFortes >= 0 ? String(respDados[r][irFortes] || '') : '',
          pontosAtencao: irAtencao >= 0 ? String(respDados[r][irAtencao] || '') : '',
          feedback: irFeedback >= 0 ? String(respDados[r][irFeedback] || '') : '',
          proximaAcao: ''
        };
        if (existIdx >= 0) {
          comps[existIdx] = compObj; // atualiza com avaliação mais recente
        } else {
          comps.push(compObj);
        }
      }
    }

    // Ordenar por nota (menor primeiro = maior prioridade)
    comps.sort(function(a, b) { return a.nota - b.nota; });

    // Ciclo
    var trilha = AppData.getTrilha(email);
    var semanas = trilha.semanas || [];
    var concluidas = semanas.filter(function(s) { return s.status === 'concluido'; }).length;
    var progresso = semanas.length > 0 ? Math.round((concluidas / semanas.length) * 100) : 0;

    return {
      ciclo: { duracao: 14, progresso: progresso, objetivo: 'Desenvolver competências prioritárias' },
      competencias: comps
    };
  },

  // ─── TRILHA / ACADEMIA ───────────────────────────────────

  getTrilha: function(email) {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var ws = ss.getSheetByName(APP_CONFIG.SHEETS.TRILHAS);
    if (!ws || ws.getLastRow() < 2) return { semanas: [] };

    var dados = ws.getDataRange().getValues();
    var semanas = [];
    for (var r = 1; r < dados.length; r++) {
      var rowEmail = String(dados[r][0] || '').trim().toLowerCase();
      if (rowEmail !== email.toLowerCase()) continue;
      semanas.push({
        competencia: String(dados[r][1] || ''),
        nivel:       parseInt(dados[r][2]) || 0,
        semana:      parseInt(dados[r][3]) || 0,
        tipo:        String(dados[r][4] || ''),
        titulo:      String(dados[r][5] || ''),
        url:         String(dados[r][6] || ''),
        descricao:   String(dados[r][7] || ''),
        descritor:   String(dados[r][8] || ''),
        nota:        parseFloat(dados[r][9]) || 0,
        fonte:       String(dados[r][10] || ''),
        status:      String(dados[r][11] || 'pendente')
      });
    }

    return { semanas: semanas };
  },

  getConteudosRecomendados: function(email) {
    var trilha = AppData.getTrilha(email);
    var semanas = trilha.semanas || [];
    var semanaAtual = AppData._getSemanaAtualNum(email);

    // Conteúdos da semana atual e próximas
    var recomendados = semanas.filter(function(s) {
      return s.semana >= semanaAtual && s.semana <= semanaAtual + 2 && s.tipo === 'conteudo';
    });

    // Conteúdos já concluídos (para referência)
    var concluidos = semanas.filter(function(s) {
      return s.status === 'concluido';
    });

    return {
      recomendados: recomendados,
      concluidos: concluidos,
      semanaAtual: semanaAtual,
      totalSemanas: 14
    };
  },

  // ─── BETO / TUTOR IA ────────────────────────────────────

  processarMensagemBETO: function(email, mensagem, contexto, historico) {
    // Conectar com chatTutor existente
    var hist = (historico || []).map(function(m) {
      return { role: m.role, content: m.content };
    });
    hist.push({ role: 'user', content: mensagem });

    var resultado = chatTutor(email, hist);
    return {
      resposta: resultado.reply || 'Desculpe, tive um problema.',
      disponivel: resultado.disponivel !== false,
      fallback: resultado.fallback || false
    };
  },

  // ─── EVOLUÇÃO ───────────────────────────────────────────

  getProgressoGeral: function(email) {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var trilha = AppData.getTrilha(email);
    var semanas = trilha.semanas || [];

    var concluidas = semanas.filter(function(s) { return s.status === 'concluido'; }).length;
    var total = semanas.length;
    var percentual = total > 0 ? Math.round((concluidas / total) * 100) : 0;

    return {
      percentualCiclo: percentual,
      semanasConcluidas: concluidas,
      totalSemanas: total,
      competencia: semanas.length > 0 ? semanas[0].competencia : ''
    };
  },

  getResultadoCiclo: function(email) {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var ws = ss.getSheetByName(APP_CONFIG.SHEETS.EVOLUCAO);
    if (!ws || ws.getLastRow() < 2) return null;

    var dados = ws.getDataRange().getValues();
    for (var r = 1; r < dados.length; r++) {
      if (String(dados[r][0] || '').trim().toLowerCase() === email.toLowerCase()) {
        return {
          notaA: parseFloat(dados[r][6]) || 0,
          nivelA: parseInt(dados[r][7]) || 0,
          notaB: parseFloat(dados[r][8]) || 0,
          nivelB: parseInt(dados[r][9]) || 0,
          delta: parseFloat(dados[r][10]) || 0,
          feedback: String(dados[r][16] || '')
        };
      }
    }
    return null;
  },

  // ─── EVIDÊNCIAS ─────────────────────────────────────────

  registrarEvidencia: function(email, semana, acao, resultado) {
    return salvarEvidencia({
      email: email,
      semana: semana,
      acao: acao,
      resultado: resultado
    });
  },

  // ─── HELPERS PRIVADOS ───────────────────────────────────

  _getColaborador: function(ss, email) {
    var ws = ss.getSheetByName(APP_CONFIG.SHEETS.COLABORADORES);
    if (!ws) { Logger.log('App _getColaborador: aba Colaboradores não encontrada'); return null; }
    var dados = ws.getDataRange().getValues();
    if (dados.length < APP_CONFIG.COLAB_HEADER_ROW) { Logger.log('App _getColaborador: aba tem menos de ' + APP_CONFIG.COLAB_HEADER_ROW + ' linhas'); return null; }
    var hdr = dados[APP_CONFIG.COLAB_HEADER_ROW - 1]; // header na linha 4
    Logger.log('App _getColaborador: buscando ' + email + ' | header row=' + APP_CONFIG.COLAB_HEADER_ROW + ' | cols=' + hdr.length);

    var emailCols = [], iNome = -1, iCargo = -1, iEscola = -1, iWpp = -1;
    for (var h = 0; h < hdr.length; h++) {
      var hn = String(hdr[h] || '').toLowerCase();
      if (hn.indexOf('mail') >= 0) emailCols.push(h);
      if ((hn.indexOf('nome') >= 0 && hn.indexOf('completo') >= 0) || (hn === 'nome')) { if (iNome < 0) iNome = h; }
      if (hn.indexOf('cargo') >= 0) iCargo = h;
      if (hn.indexOf('escola') >= 0 || hn.indexOf('unidade') >= 0 || hn.indexOf('area') >= 0 || hn.indexOf('depto') >= 0 || hn.indexOf('lotac') >= 0) iEscola = h;
      if (hn.indexOf('whatsapp') >= 0 || hn.indexOf('telefone') >= 0 || hn.indexOf('celular') >= 0) iWpp = h;
    }
    // Fallback: se não achou "nome completo", pega primeiro "nome"
    if (iNome < 0) {
      for (var h2 = 0; h2 < hdr.length; h2++) {
        if (String(hdr[h2] || '').toLowerCase().indexOf('nome') >= 0) { iNome = h2; break; }
      }
    }
    if (emailCols.length === 0) { Logger.log('App _getColaborador: nenhuma coluna email encontrada'); return null; }
    Logger.log('App _getColaborador: emailCols=' + emailCols.join(',') + ' iNome=' + iNome + ' iCargo=' + iCargo + ' iEscola=' + iEscola);

    var emailNorm = email.toLowerCase().trim();
    for (var r = APP_CONFIG.COLAB_DATA_START - 1; r < dados.length; r++) {
      var found = false;
      for (var ec = 0; ec < emailCols.length; ec++) {
        if (String(dados[r][emailCols[ec]] || '').trim().toLowerCase() === emailNorm) { found = true; break; }
      }
      if (found) {
        return {
          nome:     iNome >= 0 ? String(dados[r][iNome] || '') : '',
          cargo:    iCargo >= 0 ? String(dados[r][iCargo] || '') : '',
          escola:   iEscola >= 0 ? String(dados[r][iEscola] || '') : '',
          whatsapp: iWpp >= 0 ? String(dados[r][iWpp] || '') : '',
          email:    email
        };
      }
    }

    // Fallback: buscar na aba Respostas (pode ter email diferente do Colaboradores)
    Logger.log('App _getColaborador: não encontrado em Colaboradores, tentando Respostas');
    var wsResp = ss.getSheetByName(APP_CONFIG.SHEETS.RESPOSTAS);
    if (wsResp && wsResp.getLastRow() > 1) {
      var respDados = wsResp.getDataRange().getValues();
      for (var rr = 1; rr < respDados.length; rr++) {
        if (String(respDados[rr][1] || '').trim().toLowerCase() === emailNorm) {
          return {
            nome:   String(respDados[rr][2] || ''),
            cargo:  String(respDados[rr][4] || ''),
            escola: '',
            whatsapp: '',
            email:  email
          };
        }
      }
    }
    return null;
  },

  _getJornadaStatus: function(ss, email) {
    var etapas = AppData.getEtapas(email);
    var concluidas = etapas.filter(function(e) { return e.status === 'concluido'; }).length;
    var emAndamento = '';
    for (var i = 0; i < etapas.length; i++) {
      if (etapas[i].status === 'em_andamento' || etapas[i].status === 'disponivel') {
        emAndamento = etapas[i].nome;
        break;
      }
    }
    return {
      percentual: Math.round((concluidas / etapas.length) * 100),
      etapaAtual: emAndamento || 'Concluído',
      totalEtapas: etapas.length,
      concluidas: concluidas
    };
  },

  _getPDIResumo: function(ss, email) {
    var pdi = AppData.getPDI(email);
    return {
      totalCompetencias: pdi.competencias.length,
      competencias: pdi.competencias.slice(0, 3)
    };
  },

  _getFocoDaSemana: function(ss, email) {
    var trilha = AppData.getTrilha(email);
    var semanaAtual = AppData._getSemanaAtualNum(email);
    var semanas = trilha.semanas || [];

    for (var i = 0; i < semanas.length; i++) {
      if (semanas[i].semana === semanaAtual) {
        return {
          competencia: semanas[i].competencia,
          titulo: semanas[i].titulo,
          tipo: semanas[i].tipo,
          descritor: semanas[i].descritor,
          url: semanas[i].url,
          semana: semanaAtual
        };
      }
    }
    return { competencia: '', semana: semanaAtual };
  },

  _getEvolucaoResumo: function(ss, email) {
    var resultado = AppData.getResultadoCiclo(email);
    if (!resultado) return { forcas: [], emDesenvolvimento: [] };
    return resultado;
  },

  _temCIS: function(ss, email) {
    var ws = ss.getSheetByName(APP_CONFIG.SHEETS.CIS_ASSESSMENT);
    if (!ws || ws.getLastRow() < 2) return false;
    var dados = ws.getDataRange().getValues();
    for (var r = 1; r < dados.length; r++) {
      if (String(dados[r][0] || '').trim().toLowerCase() === email.toLowerCase()) return true;
    }
    return false;
  },

  _temAvaliacao: function(ss, email) {
    var ws = ss.getSheetByName(APP_CONFIG.SHEETS.RESPOSTAS);
    if (!ws || ws.getLastRow() < 2) return false;
    var dados = ws.getDataRange().getValues();
    for (var r = 1; r < dados.length; r++) {
      if (String(dados[r][1] || '').trim().toLowerCase() === email.toLowerCase()
          && String(dados[r][15] || '').toLowerCase().indexOf('avali') >= 0) return true;
    }
    return false;
  },

  _getCompetenciasProgress: function(ss, email) {
    var ws = ss.getSheetByName(APP_CONFIG.SHEETS.RESPOSTAS);
    if (!ws || ws.getLastRow() < 2) return { feitas: 0, total: 0 };
    var dados = ws.getDataRange().getValues();
    var emailNorm = email.toLowerCase().trim();
    var compsFeitas = {};
    var compsTotal = {};
    for (var r = 1; r < dados.length; r++) {
      var rowEmail = String(dados[r][1] || '').trim().toLowerCase();
      if (rowEmail !== emailNorm) continue;
      var compNome = String(dados[r][6] || '').trim();
      if (!compNome) continue;
      // Resposta existe = competência respondida (independente de ter sido avaliada pela IA)
      compsFeitas[compNome] = true;
    }
    // Total sempre vem do Banco_Cenarios (quantas competências o cargo tem)
    var totalComps = 0;
    var colab = AppData._getColaborador(ss, email);
    if (colab && colab.cargo) {
      var wsBanco = ss.getSheetByName('Banco_Cenarios');
      if (wsBanco && wsBanco.getLastRow() > 1) {
        var bDados = wsBanco.getDataRange().getValues();
        var cargoNorm = colab.cargo.toLowerCase().replace(/[()]/g, '');
        var compsUnicas = {};
        for (var b = 1; b < bDados.length; b++) {
          var bCargo = String(bDados[b][0] || '').toLowerCase().replace(/[()]/g, '');
          if (bCargo.indexOf(cargoNorm) >= 0 || cargoNorm.indexOf(bCargo) >= 0) {
            var bComp = String(bDados[b][1] || '').trim();
            if (bComp) compsUnicas[bComp] = true;
          }
        }
        totalComps = Object.keys(compsUnicas).length;
      }
    }
    // Fallback: se não achou no banco, usa as respostas como total
    if (totalComps === 0) totalComps = Object.keys(compsFeitas).length;
    return { feitas: Object.keys(compsFeitas).length, total: totalComps };
  },

  _temPDI: function(ss, email) {
    var ws = ss.getSheetByName(APP_CONFIG.SHEETS.PDI_DESCRITORES);
    if (!ws || ws.getLastRow() < 2) return false;
    var dados = ws.getDataRange().getValues();
    for (var r = 1; r < dados.length; r++) {
      if (String(dados[r][0] || '').trim().toLowerCase() === email.toLowerCase()) return true;
    }
    return false;
  },

  _temTrilha: function(ss, email) {
    var ws = ss.getSheetByName(APP_CONFIG.SHEETS.TRILHAS);
    if (!ws || ws.getLastRow() < 2) return false;
    var dados = ws.getDataRange().getValues();
    for (var r = 1; r < dados.length; r++) {
      if (String(dados[r][0] || '').trim().toLowerCase() === email.toLowerCase()) return true;
    }
    return false;
  },

  _temEvolucao: function(ss, email) {
    var ws = ss.getSheetByName(APP_CONFIG.SHEETS.EVOLUCAO);
    if (!ws || ws.getLastRow() < 2) return false;
    var dados = ws.getDataRange().getValues();
    for (var r = 1; r < dados.length; r++) {
      if (String(dados[r][0] || '').trim().toLowerCase() === email.toLowerCase()) return true;
    }
    return false;
  },

  _getSemanaAtual: function(ss, email) {
    var ws = ss.getSheetByName(APP_CONFIG.SHEETS.FASE4_ENVIOS);
    if (!ws || ws.getLastRow() < 2) return 0;
    var dados = ws.getDataRange().getValues();
    for (var r = 1; r < dados.length; r++) {
      if (String(dados[r][1] || '').trim().toLowerCase() === email.toLowerCase()) {
        return parseInt(dados[r][5]) || 1; // coluna Semana Atual
      }
    }
    return 0;
  },

  _getSemanaAtualNum: function(email) {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    return AppData._getSemanaAtual(ss, email);
  }
};
