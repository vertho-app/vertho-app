// =====================================================================
// VERTHO - PromptBuilder.gs  (Fase 3 v5)
//
// MUDANCAS v5:
// - Baseline enriquecido: DISC, PDI (focos + checklist), tracos CIS
// - Instrucoes para IA usar contexto sem mencionar ao colaborador
// - Mantém todas as proibicoes do v4 (sem julgamento, sem inducao)
//
// Dependencias: Config.gs, StateManager.gs, DriveStorage.gs
// =====================================================================

var PromptBuilder = {

  build: function(state, userMessage, userName) {
    var systemStatic = this._buildStaticSystem();
    var systemCompetencia = this._buildCompetenciaContext(state, userName || state.userName || "Colaborador");
    var messages = [];

    var history = [];
    if (state.sessao_id && state.ciclo_id) {
      try {
        history = DriveStorage.getHistory(state.sessao_id, state.ciclo_id, state.colaborador_id) || [];
      } catch(e) {
        history = state.history || [];
      }
    } else {
      history = state.history || [];
    }

    for (var i = 0; i < history.length; i++) {
      var h = history[i];
      if (h.role === "user" || h.role === "assistant") {
        messages.push({ role: h.role, content: h.content });
      }
    }

    if (userMessage) {
      messages.push({ role: "user", content: userMessage });
    }

    return {
      systemStatic: systemStatic,
      systemCompetencia: systemCompetencia,
      messages: messages
    };
  },

  _buildStaticSystem: function() {
    return [
      "## PAPEL",
      "Voce e a Mentor IA, uma ENTREVISTADORA comportamental da plataforma Vertho.",
      "Seu UNICO objetivo e COLETAR EVIDENCIAS comportamentais do colaborador.",
      "Voce NAO e coach, mentora, consultora ou professora.",
      "Voce FAZ PERGUNTAS e ESCUTA. Nada mais.",
      "",
      "## TOM E ESTILO",
      "- Empatica, profissional, curiosa, neutra",
      "- Concisa: maximo 1 frase de transicao + 1 pergunta",
      "- Trate como VOCE (2a pessoa). NUNCA 3a pessoa.",
      "- Use o primeiro nome do colaborador",
      "",
      "## PROIBICOES ABSOLUTAS — NUNCA FACA ISTO:",
      "",
      "### 1. NUNCA JULGUE (nem positiva nem negativamente)",
      "PROIBIDO:",
      "- 'Otima resposta', 'Excelente abordagem', 'Boa reflexao'",
      "- 'Isso mostra maturidade', 'Voce demonstrou...'",
      "- 'Interessante essa abordagem' (isso e um julgamento positivo)",
      "- Qualquer avaliacao sobre a qualidade da resposta",
      "",
      "### 2. NUNCA DE SUGESTOES, EXEMPLOS OU DICAS",
      "PROIBIDO:",
      "- 'Voce poderia tambem...', 'Uma opcao seria...'",
      "- 'Isso e importante porque...'",
      "- Dar exemplos do que poderia ser feito",
      "",
      "### 3. NUNCA FACA PERGUNTAS INDUTIVAS",
      "Pergunta indutiva = pergunta que INSINUA a resposta certa.",
      "Este e o erro mais critico. PROIBIDO:",
      "- 'Voce faria X ou Y?' (oferece opcoes que revelam o esperado)",
      "- 'Por exemplo: voce anotaria, marcaria prazo, ou...?' (da exemplos como opcoes)",
      "- 'Voce buscaria ela especificamente ou esperaria encontrar por acaso?'",
      "  (uma opcao e claramente melhor que a outra = indutiva)",
      "- 'Voce explicaria o raciocinio ou so daria o resultado?'",
      "  (uma opcao e claramente melhor = indutiva)",
      "- 'Como voce acha que ela SE SENTIRIA?' quando implica que a resposta do",
      "  colaborador foi inadequada (= julgamento disfarcado de pergunta)",
      "",
      "### COMO FORMULAR PERGUNTAS CORRETAS:",
      "PERMITIDO (perguntas abertas puras):",
      "- 'Como voce faria isso?'",
      "- 'O que voce diria?'",
      "- 'Como seria essa conversa?'",
      "- 'Me conta como voce lidaria com isso.'",
      "- 'E depois, o que aconteceria?'",
      "- 'O que voce fez quando isso aconteceu?'",
      "",
      "REGRA DE OURO: Se a pergunta contem 'ou', 'por exemplo',",
      "opcoes, ou alternativas — REFORMULE como pergunta aberta.",
      "Se a pergunta implica que a resposta anterior foi insuficiente — REFORMULE.",
      "",
      "### 4. NUNCA PROMETA QUE E A ULTIMA PERGUNTA",
      "- NAO diga: 'Essa e a ultima', 'Para finalizar...', 'So mais uma...'",
      "- Quem decide o encerramento e o SISTEMA, nao voce",
      "",
      "### 5. NUNCA revele nota, nivel ou avaliacao",
      "### 6. NUNCA mencione o diagnostico anterior, PDI, perfil DISC ou qualquer dado interno",
      "### 7. NUNCA invente cenarios",
      "### 8. NUNCA assuma comportamentos nao mencionados",
      "",
      "## O QUE VOCE PODE FAZER:",
      "- Perguntas abertas sobre a experiencia do colaborador",
      "- Pedir mais detalhes ('Conta mais sobre isso')",
      "- Pedir exemplos reais ('Ja passou por algo assim?')",
      "- Transicoes neutras CURTAS: 'Entendi.', 'Certo.'",
      "  (transicao = 1 frase, NAO e resumo da resposta)",
      "",
      "## FORMATO DE CADA MENSAGEM:",
      "1. Transicao neutra CURTA (opcional, max 5 palavras): 'Entendi.' ou 'Certo.'",
      "2. UMA pergunta aberta (sem opcoes, sem exemplos, sem inducao)",
      "3. Bloco [META]",
      "",
      "NAO RESUMA a resposta do colaborador. NAO PARAFRASEIE o que ele disse.",
      "Apenas faca a proxima pergunta.",
      "",
      "## COMO CONDUZIR A CONVERSA",
      "",
      "Voce tem 4 DIMENSOES a explorar: SITUACAO, ACAO, RACIOCINIO, AUTOSSENSIBILIDADE.",
      "NAO siga uma ordem fixa. Deixe a resposta do colaborador guiar a proxima pergunta.",
      "Se ele menciona uma acao, aprofunde a acao. Se menciona um sentimento, explore.",
      "Uma boa entrevista flui como conversa natural, nao como questionario.",
      "",
      "## COMO APROFUNDAR",
      "Baseado em EVIDENCIAS coletadas:",
      "- Precisa de pelo menos 2 evidencias EXPLICITAS",
      "- Evidencia explicita = acao concreta que ELE fez/faria",
      "- Evidencia forte = explicita + especifica + com resultado",
      "- 1 evidencia forte = 2 explicitas",
      "",
      "Sinais de que PRECISA aprofundar:",
      "- Sem primeira pessoa ('eu fiz', 'eu faria')",
      "- Sem contexto temporal/situacional",
      "- Verbos abstratos ('seria feito', 'poderia ser')",
      "- Resposta curta sem detalhes",
      "- Dimensao importante ainda nao explorada",
      "",
      "Sinais de que pode ENCERRAR:",
      "- 2+ evidencias explicitas mapeadas na regua",
      "- Exemplos reais com acoes concretas",
      "- Confianca >= 60%",
      "- Mais perguntas nao vao agregar",
      "- Pelo menos 2 dimensoes foram exploradas com profundidade",
      "",
      "## ANTI-CANSACO",
      "- Varie os tipos de pergunta",
      "- Se resposta 'treinada' (perfeita, sem falhas):",
      "  -> 'Ja aconteceu de isso nao funcionar?'",
      "- NAO repita estilo de pergunta consecutivamente",
      "",
      "## BLOCO [META] — OBRIGATORIO EM TODA RESPOSTA",
      '[META]{"proximo_passo":"aprofundar|contraexemplo|encerrar","razao":"explicacao curta","dimensao_explorada":"situacao|acao|raciocinio|autossensibilidade","dimensoes_cobertas":["lista das ja exploradas"],"evidencias_coletadas":[{"trecho":"o que disse","indicador":"qual indicador","tipo":"explicito|explicito_forte|inferido"}],"confianca_parcial":0,"aprofundamentos_feitos":0}[/META]',
      "",
      "## AVALIACAO FINAL (proximo_passo = 'encerrar')",
      "Use a REGUA DE AVALIACAO COMPLETA fornecida no contexto da competencia.",
      "Siga as evidencias-chave e regras de ouro da regua para classificar.",
      "Na duvida entre dois niveis, escolha o INFERIOR.",
      "",
      "## NOTA DECIMAL (nota_decimal)",
      "Alem do nivel (1-4), atribua uma nota com 2 casas decimais:",
      "- A parte inteira = nivel (ex: nivel 2 -> nota entre 2.00 e 2.99)",
      "- A parte decimal = forca dentro do nivel baseada nas evidencias:",
      "  .00-.25 = atende o minimo do nivel, com lacunas significativas",
      "  .26-.50 = atende o nivel com algumas lacunas",
      "  .51-.75 = atende bem o nivel, poucas lacunas",
      "  .76-.99 = quase no proximo nivel, evidencias fortes",
      "Exemplo: nivel 2 com evidencias fracas = 2.15 | nivel 2 solido = 2.45 | quase nivel 3 = 2.75",
      "",
      "## AVALIACAO POR DESCRITOR (OBRIGATORIO)",
      "Para CADA descritor da competencia, avalie separadamente:",
      "- Identifique em qual resposta (R1, R2, R3, R4) o descritor aparece",
      "- Atribua nivel (1-4) baseado na regua de maturidade para aquele descritor",
      "- Atribua confianca (0-100) baseada na qualidade da evidencia",
      "- Cite o trecho literal da resposta como evidencia",
      "- Resposta vaga/generica = maximo N1. 'Eu faria X' sem acao concreta = maximo N1.",
      "- Confianca < 70 com nivel N3+ e incoerente.",
      "",
      "## CONSOLIDACAO (OBRIGATORIO)",
      "Apos avaliar cada descritor:",
      "- Calcule media_descritores = media aritmetica dos niveis de todos os descritores",
      "- nivel_geral = arredondar SEMPRE para BAIXO (2.6 -> N2, 3.9 -> N3)",
      "- TRAVAS (regras de seguranca):",
      "  * Se qualquer descritor CRITICO esta em N1 -> nivel_geral MAXIMO N2",
      "  * Se 3+ descritores estao em N1 -> nivel_geral = N1",
      "- GAP = 3 - nivel_geral (se positivo, senao 0)",
      "- Liste todas as travas que foram aplicadas no array travas_aplicadas",
      "",
      "## DESCRITORES DESTAQUE (OBRIGATORIO)",
      "- pontos_fortes: os 2-3 descritores com maior nivel, com evidencia resumida",
      "- gaps_prioritarios: os 2-3 descritores com menor nivel, explicando o que faltou",
      "",
      "## FEEDBACK PERSONALIZADO (OBRIGATORIO)",
      "Escreva um feedback de 3-5 paragrafos que:",
      "- Cite comportamentos REAIS observados nas respostas (nao generico)",
      "- Adapte o TOM ao perfil DISC dominante do colaborador:",
      "  Alto D: direto, assertivo, foco em resultados",
      "  Alto I: inspirador, entusiasmado, foco em impacto",
      "  Alto S: acolhedor, encorajador, foco em processo",
      "  Alto C: detalhado, fundamentado, foco em qualidade",
      "- Conecte motivacao aos 2 Valores mais altos do colaborador",
      "- NAO mencione DISC, CIS, valores ou termos tecnicos — escreva naturalmente",
      "- NAO use feedback generico que poderia ser de qualquer pessoa",
      "",
      "## PLANO PDI (OBRIGATORIO — 3 prioridades)",
      "Para cada uma das 3 prioridades:",
      "- descritor_foco: qual descritor desenvolver",
      "- nivel_atual: nivel atual do descritor",
      "- nivel_meta: 3 (meta padrao)",
      "- acao: acao concreta e pratica (PROIBIDO sugerir livros/podcasts/cursos externos)",
      "- por_que_importa: conecte aos Valores top-2 do colaborador",
      "- como_desenvolver: use o estilo dos Tipos Psicologicos dominantes",
      "  (Sensorial: checklist pratico | Intuitivo: visao macro | Introvertido: reflexao | Extrovertido: pratica social)",
      "- barreira_provavel: obstaculo realista para o perfil DISC do colaborador",
      "",
      "## MENSAGEM DE ENCERRAMENTO",
      "- 'Obrigado pela conversa, [nome]. Voce recebera retorno em breve.'",
      "- NAO julgue, NAO elogie, NAO avalie, NAO resuma",
      "- Inclua [EVAL] apos [META] com a estrutura COMPLETA abaixo:",
      '[EVAL]{"competencia":"","avaliacao_por_resposta":{"R1":{"descritores_avaliados":[{"numero":1,"nome":"","nivel":0,"confianca":0,"evidencia":"trecho literal"}]},"R2":{"descritores_avaliados":[]},"R3":{"descritores_avaliados":[]},"R4":{"descritores_avaliados":[]}},"consolidacao":{"nivel_geral":0,"media_descritores":0.00,"gap":0,"confianca_geral":0,"travas_aplicadas":[]},"descritores_destaque":{"pontos_fortes":[{"descritor":"","nivel":0,"evidencia_resumida":""}],"gaps_prioritarios":[{"descritor":"","nivel":0,"o_que_faltou":""}]},"feedback":"texto personalizado 3-5 paragrafos","recomendacoes_pdi":[{"descritor_foco":"","nivel_atual":0,"nivel_meta":3,"acao":"","por_que_importa":"","como_desenvolver":"","barreira_provavel":""}],"nivel":0,"nota_decimal":0.00,"confianca":0,"evidencias":[{"trecho":"","indicador":"","tipo":""}],"lacuna":"","cenario_usado":"","aprofundamentos_total":0,"contraexemplo_usado":false}[/EVAL]'
    ].join("\n");
  },

  _buildCompetenciaContext: function(state, userName) {
    var comp = state.competencia_data || null;

    if (!comp || !comp.nome) {
      try {
        comp = StateManager.getCompetencia(state.competencia_id);
      } catch (e) {}
    }
    if (!comp) comp = {};

    var cenarios = state.cenarios || [];
    var baseline = state.baseline;
    var colaborador = state.colaborador;
    var parts = [];

    // ── Nome do colaborador ─────────────────────────────────────────
    var primeiroNome = "Colaborador";
    if (colaborador && colaborador.nome) {
      primeiroNome = colaborador.nome.split(" ")[0];
    } else if (userName && userName !== "Colaborador") {
      primeiroNome = userName.split(" ")[0];
    } else {
      try {
        var colab = StateManager.getColaborador(state.colaborador_id);
        if (colab && colab.nome) primeiroNome = colab.nome.split(" ")[0];
      } catch(e) {}
    }

    parts.push("## AVALIADO: " + primeiroNome);
    if (colaborador) {
      parts.push("Cargo: " + (colaborador.cargo || ""));
    }
    parts.push("");

    // ── Competencia e regua ─────────────────────────────────────────
    var compNome = comp.nome || state.competencia || "N/A";
    parts.push("## COMPETENCIA: " + compNome);
    if (comp.descricao) parts.push("Definicao: " + comp.descricao);
    if (comp.descritores) parts.push("Descritores: " + comp.descritores);
    parts.push("");

    // Tentar carregar regua completa da aba Regua Maturidade
    var reguaCompleta = null;
    var cargoColab = (colaborador && colaborador.cargo) ? colaborador.cargo : "";
    try {
      reguaCompleta = StateManager.getReguaMaturidade(cargoColab, compNome);
    } catch(e) {
      Logger.log("getReguaMaturidade erro: " + e.message);
    }

    if (reguaCompleta) {
      parts.push("REGUA DE AVALIACAO COMPLETA:");
      parts.push(reguaCompleta);
    } else {
      // Fallback: regua curta da aba Competencias
      parts.push("REGUA DE PROFICIENCIA (4 niveis):");
      parts.push("Nivel 1 (GAP): " + (comp.nivel1 || ""));
      parts.push("Nivel 2 (EM DESENVOLVIMENTO): " + (comp.nivel2 || ""));
      parts.push("Nivel 3 (META): " + (comp.nivel3 || ""));
      parts.push("Nivel 4 (REFERENCIA): " + (comp.nivel4 || ""));
    }
    parts.push("");

    // ── Tracos CIS cruzados com scores do colaborador ─────────────────
    if (comp.tracos_cis && comp.tracos_cis.length > 0) {
      parts.push("TRACOS COMPORTAMENTAIS RELEVANTES PARA ESTA COMPETENCIA:");

      var traitScores = (colaborador && colaborador.trait_scores) ? colaborador.trait_scores : null;
      var traitAliases = (colaborador && colaborador.trait_aliases) ? colaborador.trait_aliases : {};

      for (var t = 0; t < comp.tracos_cis.length; t++) {
        var tracoNome = comp.tracos_cis[t];
        var score = null;
        var scoreLabel = "";

        if (traitScores) {
          // Match direto
          score = traitScores[tracoNome] || null;

          // Via alias (ex: "Social" -> "Sociabilidade")
          if (!score) {
            var alias = traitAliases[tracoNome.toLowerCase()];
            if (alias) score = traitScores[alias] || null;
          }

          // Match parcial
          if (!score) {
            var keys = Object.keys(traitScores);
            for (var ki = 0; ki < keys.length; ki++) {
              if (keys[ki].toLowerCase().indexOf(tracoNome.toLowerCase()) >= 0
                  || tracoNome.toLowerCase().indexOf(keys[ki].toLowerCase()) >= 0) {
                score = traitScores[keys[ki]];
                break;
              }
            }
          }

          if (score !== null) {
            if (score <= 30) scoreLabel = " = " + score + " >>> GAP CRITICO (muito baixo)";
            else if (score <= 40) scoreLabel = " = " + score + " >> ATENCAO (baixo)";
            else if (score <= 60) scoreLabel = " = " + score + " (medio)";
            else if (score <= 80) scoreLabel = " = " + score + " (alto)";
            else scoreLabel = " = " + score + " (muito alto)";
          }
        }

        parts.push("- " + tracoNome + scoreLabel);
      }

      if (traitScores) {
        parts.push("");
        parts.push("-> Tracos com GAP CRITICO ou ATENCAO sao onde voce deve APROFUNDAR MAIS.");
        parts.push("   Explore se o colaborador demonstra evolucao nessas areas ou mantem o padrao anterior.");
      }

      parts.push("");
    }

    // ── Cenario ─────────────────────────────────────────────────────
    parts.push("## CENARIO (trate como VOCE, 2a pessoa)");
    for (var i = 0; i < cenarios.length; i++) {
      var c = cenarios[i];
      parts.push("");
      if (c.descricao) parts.push("Contexto: " + c.descricao);
      if (c.personagens) parts.push("Personagens: " + c.personagens);
      if (c.situacao_gatilho) parts.push("Situacao-Gatilho: " + c.situacao_gatilho);
      if (c.objetivo_conversacional) parts.push("OBJETIVO: " + c.objetivo_conversacional);

      parts.push("");
      parts.push("DIMENSOES A EXPLORAR (organicamente, ao longo da conversa):");
      parts.push("Nao siga uma ordem fixa. Deixe a conversa fluir naturalmente.");
      parts.push("Aprofunde cada dimensao conforme as respostas do colaborador.");
      parts.push("");

      if (c.pergunta_aprofund_1) {
        parts.push("  SITUACAO — Como o colaborador compreende o problema e seu contexto.");
        parts.push("    Inspiracao (NAO leia literalmente): " + c.pergunta_aprofund_1);
      }
      if (c.pergunta_aprofund_2) {
        parts.push("  ACAO — O que faria concretamente, com passos especificos e rastreaveis.");
        parts.push("    Inspiracao (NAO leia literalmente): " + c.pergunta_aprofund_2);
      }
      if (c.pergunta_raciocinio) {
        parts.push("  RACIOCINIO — Como pensa diante de dilemas ou conflitos de perspectiva.");
        parts.push("    Inspiracao (NAO leia literalmente): " + c.pergunta_raciocinio);
      }
      if (c.pergunta_cis) {
        parts.push("  AUTOSSENSIBILIDADE — Como lida internamente com criticas e frustracoes.");
        parts.push("    Inspiracao (NAO leia literalmente): " + c.pergunta_cis);
      }

      parts.push("");
      parts.push("REGRA: Formule SUAS PROPRIAS perguntas baseadas no que o colaborador acabou de dizer.");
      parts.push("As inspiracoes acima sao apenas direcoes, NUNCA leia-as ao pe da letra.");
      parts.push("Uma boa entrevista parece uma conversa natural, nao um questionario.");
    }

    // ── BASELINE — CONTEXTO INTERNO (expandido) ─────────────────────
    var hasBaseline = baseline && (baseline.nivel || baseline.pontos_atencao || baseline.perfil_disc || baseline.pdi);

    if (hasBaseline) {
      parts.push("");
      parts.push("## BASELINE — CONTEXTO INTERNO (NUNCA MENCIONAR AO COLABORADOR)");
      parts.push("Use para DIRECIONAR perguntas para as lacunas certas.");
      parts.push("Avalie EXCLUSIVAMENTE o que o colaborador demonstra NESTA conversa.");
      parts.push("NUNCA cite perfil, diagnostico, PDI ou qualquer dado abaixo.");
      parts.push("");

      // Nivel anterior
      if (baseline.nivel) {
        parts.push("DIAGNOSTICO ANTERIOR: Nivel " + baseline.nivel);
      }

      // Pontos de atencao (lacunas)
      if (baseline.pontos_atencao) {
        parts.push("LACUNAS IDENTIFICADAS: " + baseline.pontos_atencao);
      }

      // Perfil CIS FILTRADO via CISReferencia — só traços dominantes do colaborador
      if (colaborador && colaborador.trait_scores) {
        try {
          var perfilCIS = extrairPerfilCIS(colaborador.trait_scores);
          if (perfilCIS) {
            var cisData = getCISParaPDI(perfilCIS);
            var cisTexto = formatarCISParaPrompt(cisData, perfilCIS.disc_scores);
            if (cisTexto) {
              parts.push("");
              parts.push(cisTexto);
              parts.push("");
              parts.push("-> Use DISC para adaptar ESTILO de pergunta e TOM do feedback");
              parts.push("-> Use VALORES para conectar 'por_que_importa' no PDI");
              parts.push("-> Use TIPOS para adaptar 'como_desenvolver' no PDI (confianca BAIXA — sugestao, nao afirmacao)");
            }

            // Alertas de riscos CIS (scores extremos)
            var allScores = {};
            var ds = perfilCIS.disc_scores || {};
            allScores.d = ds.D || 0; allScores.i = ds.I || 0;
            allScores.s = ds.S || 0; allScores.c = ds.C || 0;
            var vs = perfilCIS.valores_scores || {};
            Object.keys(vs).forEach(function(k) { allScores['val_' + k.toLowerCase()] = vs[k]; });
            var riscos = getCISRiscos(allScores);
            if (riscos.length > 0) {
              parts.push("");
              parts.push("ALERTAS CIS (riscos por excesso/deficiencia):");
              riscos.forEach(function(r) {
                parts.push("  ⚠️ " + r.dim + ": " + r.texto);
              });
            }
          }
        } catch(e) {
          Logger.log('PromptBuilder: CISReferencia falhou: ' + e.message);
          // Fallback mínimo
          var discInfo = baseline.perfil_disc || (colaborador && colaborador.disc_descricao) || "";
          if (discInfo) {
            parts.push("");
            parts.push("PERFIL COMPORTAMENTAL (DISC): " + discInfo);
          }
        }
      } else {
        // Sem trait_scores — fallback mínimo
        var discInfo = baseline.perfil_disc || (colaborador && colaborador.disc_descricao) || "";
        if (discInfo) {
          parts.push("");
          parts.push("PERFIL COMPORTAMENTAL (DISC): " + discInfo);
        }
      }

      // Perfil dados (implicacao no cargo)
      if (baseline.perfil_dados && baseline.perfil_dados.implicacao) {
        parts.push("IMPLICACAO DO PERFIL NO CARGO: " + baseline.perfil_dados.implicacao);
      }

      // PDI — o que deveria ter praticado
      if (baseline.pdi) {
        parts.push("");
        parts.push("O QUE FOI TRABALHADO NO PDI (Fase 2 de aprendizagem):");
        parts.push("(Use para verificar se houve mudanca comportamental real)");

        if (baseline.pdi.focos_desenvolvimento && baseline.pdi.focos_desenvolvimento.length > 0) {
          parts.push("Focos do plano de 30 dias:");
          for (var f = 0; f < baseline.pdi.focos_desenvolvimento.length; f++) {
            parts.push("  - " + baseline.pdi.focos_desenvolvimento[f]);
          }
        }

        if (baseline.pdi.checklist_tatico && baseline.pdi.checklist_tatico.length > 0) {
          parts.push("Comportamentos que deveria estar praticando:");
          for (var k = 0; k < Math.min(baseline.pdi.checklist_tatico.length, 6); k++) {
            parts.push("  - " + baseline.pdi.checklist_tatico[k]);
          }
        }

        if (baseline.pdi.estudo_recomendado) {
          parts.push("Estudo recomendado: " + baseline.pdi.estudo_recomendado);
        }

        parts.push("");
        parts.push("ESTRATEGIA: Se o colaborador demonstra o MESMO padrao do diagnostico anterior,");
        parts.push("aprofunde nessa area para verificar se houve evolucao real.");
        parts.push("Se demonstra comportamento novo/melhorado, registre como evidencia positiva.");
      }
    } else {
      // Sem baseline — apenas DISC do colaborador se disponivel
      if (colaborador && colaborador.disc_descricao) {
        parts.push("");
        parts.push("## CONTEXTO DO AVALIADO (NUNCA MENCIONAR)");
        parts.push("PERFIL DISC: " + colaborador.disc_descricao);
        parts.push("Use para adaptar o estilo de pergunta, nao para avaliar.");
      }
    }

    return parts.join("\n");
  }
};