/**
 * ============================================================
 * VERTHO APP — Auth Service
 * ============================================================
 * Identificação do usuário via Session do Google.
 * Aba Colaboradores: header na linha 4, dados a partir da linha 5.
 * ============================================================
 */

var AppAuth = {

  getUserByEmail: function(email) {
    if (!email) return null;
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    return AppData._getColaborador(ss, email.toLowerCase().trim());
  },

  getCurrentUser: function() {
    var email = Session.getActiveUser().getEmail();
    if (!email) return null;
    return AppAuth.getUserByEmail(email);
  }
};
