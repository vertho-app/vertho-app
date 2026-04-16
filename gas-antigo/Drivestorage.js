// =====================================================================
// VERTHO - DriveStorage.gs  (Fase 3 v3)
//
// Persiste conversas como arquivos JSON no Google Drive.
// Pasta raiz fixa: 1lN6HTXA9J4LZUTSaeLjheuAWj-UjiNPb
// Estrutura: {raiz}/Conversas_IA/{ciclo_id}/{email}/sessao_{id}.json
//
// Dependencias: Config.gs
// =====================================================================

var DriveStorage = {

  ROOT_FOLDER_ID: "1lN6HTXA9J4LZUTSaeLjheuAWj-UjiNPb",
  SUBFOLDER_NAME: "Conversas_IA",

  /**
   * Salva o estado completo da conversa como JSON no Drive.
   */
  saveConversation: function(state) {
    var folder = this._getSessionFolder(state.ciclo_id, state.colaborador_id);
    var fileName = "sessao_" + state.sessao_id + ".json";

    var payload = {
      sessao_id: state.sessao_id,
      ciclo_id: state.ciclo_id,
      colaborador: state.colaborador || { email: state.colaborador_id },
      competencia: {
        id: state.competencia_id,
        nome: state.competencia || ""
      },
      cenario_usado: state.cenarios || [],
      baseline: state.baseline || null,
      fase: state.fase,
      status: state.status || "ativa",
      turnos: state.history || [],
      aprofundamentos_cenario1: state.aprofundamentos_cenario1 || 0,
      contraexemplo_usado: state.contraexemplo_usado || false,
      cenario_atual: state.cenario_atual || 0,
      resultado: state.resultado || null,
      validacao: state.validacao || null,
      created_at: state.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    var jsonStr = JSON.stringify(payload, null, 2);

    var existing = folder.getFilesByName(fileName);
    if (existing.hasNext()) {
      var file = existing.next();
      file.setContent(jsonStr);
      return file.getId();
    }

    var newFile = folder.createFile(fileName, jsonStr, MimeType.PLAIN_TEXT);
    return newFile.getId();
  },

  /**
   * Adiciona um turno ao historico da conversa no Drive.
   */
  addTurn: function(sessaoId, cicloId, colaboradorId, role, content) {
    var folder = this._getSessionFolder(cicloId, colaboradorId);
    var fileName = "sessao_" + sessaoId + ".json";

    var existing = folder.getFilesByName(fileName);
    if (!existing.hasNext()) {
      Logger.log("DriveStorage.addTurn: arquivo nao encontrado: " + fileName);
      return false;
    }

    var file = existing.next();
    var data = JSON.parse(file.getBlob().getDataAsString());

    if (!data.turnos) data.turnos = [];
    data.turnos.push({
      role: role,
      content: content,
      timestamp: new Date().toISOString()
    });
    data.updated_at = new Date().toISOString();

    file.setContent(JSON.stringify(data, null, 2));
    return true;
  },

  /**
   * Le a conversa completa do Drive.
   */
  loadConversation: function(sessaoId, cicloId, colaboradorId) {
    var folder = this._getSessionFolder(cicloId, colaboradorId);
    var fileName = "sessao_" + sessaoId + ".json";

    var existing = folder.getFilesByName(fileName);
    if (!existing.hasNext()) return null;

    var file = existing.next();
    try {
      return JSON.parse(file.getBlob().getDataAsString());
    } catch (e) {
      Logger.log("DriveStorage.loadConversation: erro ao ler JSON: " + e.message);
      return null;
    }
  },

  /**
   * Atualiza campos especificos no JSON da conversa.
   */
  updateConversation: function(sessaoId, cicloId, colaboradorId, updates) {
    var folder = this._getSessionFolder(cicloId, colaboradorId);
    var fileName = "sessao_" + sessaoId + ".json";

    var existing = folder.getFilesByName(fileName);
    if (!existing.hasNext()) return false;

    var file = existing.next();
    var data = JSON.parse(file.getBlob().getDataAsString());

    var keys = Object.keys(updates);
    for (var i = 0; i < keys.length; i++) {
      data[keys[i]] = updates[keys[i]];
    }
    data.updated_at = new Date().toISOString();

    file.setContent(JSON.stringify(data, null, 2));
    return true;
  },

  /**
   * Retorna o historico de turnos de uma conversa.
   */
  getHistory: function(sessaoId, cicloId, colaboradorId) {
    var conv = this.loadConversation(sessaoId, cicloId, colaboradorId);
    if (!conv) return [];
    return conv.turnos || [];
  },

  /**
   * Retorna o file ID do JSON da conversa.
   */
  getFileId: function(sessaoId, cicloId, colaboradorId) {
    var folder = this._getSessionFolder(cicloId, colaboradorId);
    var fileName = "sessao_" + sessaoId + ".json";

    var existing = folder.getFilesByName(fileName);
    if (!existing.hasNext()) return null;
    return existing.next().getId();
  },

  /**
   * Retorna URL do arquivo para link direto.
   */
  getFileUrl: function(fileId) {
    if (!fileId) return "";
    return "https://drive.google.com/file/d/" + fileId + "/view";
  },

  // ── PASTAS ─────────────────────────────────────────────────────────

  _getSessionFolder: function(cicloId, colaboradorId) {
    var root = DriveApp.getFolderById(this.ROOT_FOLDER_ID);
    var conversas = this._getOrCreateSubfolder(root, this.SUBFOLDER_NAME);
    var cicloFolder = this._getOrCreateSubfolder(conversas, cicloId || "sem_ciclo");
    var colabFolder = this._getOrCreateSubfolder(cicloFolder, colaboradorId || "sem_colab");
    return colabFolder;
  },

  _getOrCreateSubfolder: function(parent, name) {
    var folders = parent.getFoldersByName(name);
    if (folders.hasNext()) {
      return folders.next();
    }
    return parent.createFolder(name);
  }
};