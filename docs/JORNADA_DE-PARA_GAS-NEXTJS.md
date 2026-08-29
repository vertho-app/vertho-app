# Jornada do Sistema: DE (GAS) / PARA (Next.js)

> Mapeamento comparativo completo das operacoes da Vertho Mentor IA.
> Documento de referencia para o time de produto e engenharia.
> Atualizado em: Abril/2026

---

## Indice

1. [Fluxo de Onboarding](#1-fluxo-de-onboarding)
2. [Fluxo de Setup e Disparo (Fases 1 e 2)](#2-fluxo-de-setup-e-disparo)
3. [Fluxo Core: Assessment do Colaborador (Fase 3)](#3-fluxo-core-assessment)
4. [Fluxo de Entrega de Valor: PDFs e PDI (Fase 4)](#4-fluxo-de-entrega-de-valor)

---

## 1. Fluxo de Onboarding

**Contexto:** O Super Admin adiciona um novo cliente corporativo a plataforma.

### COMO ERA NO GAS

```
Passo 1 — Criar a Planilha Mestre
  Quem: Super Admin (manualmente)
  Acao: Duplicar o template da planilha Google Sheets mestre
  Dado: Template com abas pre-configuradas (Colaboradores, Competencias_v2,
        Banco_Cenarios, Respostas, Sessoes, etc.)
  Destino: Nova planilha no Google Drive com ID unico

Passo 2 — Registrar o ID no Script
  Quem: Super Admin (manualmente)
  Acao: Abrir o Apps Script, ir em Config.js, atualizar ScriptProperties:
        - masterSpreadsheetId → ID da nova planilha
        - WEBAPP_URL → URL do WebApp publicado
  Destino: ScriptProperties (armazenamento chave-valor do GAS)

Passo 3 — Popular Colaboradores
  Quem: Super Admin (manualmente)
  Acao: Colar dados na aba "Colaboradores" (header na linha 4, dados a partir da 5)
        Colunas: ID, Nome, Empresa, Cargo, Area (Escola), Email, Telefone
  Fonte: Planilha Excel ou CSV enviada pelo cliente
  Destino: Aba "Colaboradores" do Google Sheets
  Validacao: Nenhuma (manual, sujeita a erros de formatacao)

Passo 4 — Configurar APIs
  Quem: Super Admin
  Acao: Inserir as chaves de API nas ScriptProperties:
        ANTHROPIC_API_KEY, GEMINI_API_KEY, OPENAI_API_KEY
  Destino: ScriptProperties

Passo 5 — Rodar Setup
  Quem: Super Admin
  Acao: Executar funcao setupFase3() via menu do Google Sheets
  Efeito: Cria abas auxiliares (Sessoes, Resultados_Diagnostico,
          Resultados_Avaliacao, Validacoes, Acoes_Pendentes, Ciclos_Avaliacao)
  Destino: Novas abas na mesma planilha
```

**Problemas:** Processo 100% manual. Sem validacao de dados. Um erro no ID da planilha quebrava tudo. Sem multi-tenant real — cada empresa era uma planilha separada com deploy separado.

---

### COMO E NO NEXT.JS

```
Passo 1 — Criar a Empresa (UI: /admin/empresas/nova)
  Quem: Super Admin (via interface web)
  Acao: Preenche nome + segmento (corporativo/educacao)
  
  Codigo: actions/onboarding.js → criarNovaEmpresa(dados)
    1. Gera slug automatico a partir do nome:
       "Escola Zula" → "escola-zula"
    2. INSERT na tabela empresas:
       { nome, segmento, slug }
    3. Retorna empresa com UUID gerado pelo Supabase
  
  Fonte: Formulario web
  Destino: Supabase → tabela "empresas"
  
  O que acontece automaticamente:
    - Slug unico criado (usado para subdomain: escola-zula.vertho.com.br)
    - ui_config JSONB inicializado com defaults
    - sys_config JSONB inicializado com defaults
    - empresa_id UUID disponivel para todas as operacoes

Passo 2 — Importar Colaboradores (UI: /admin/empresas/gerenciar)
  Quem: Super Admin (via interface web)
  Acao: Seleciona a empresa no dropdown → clica "Importar CSV"
  
  Codigo (frontend): app/admin/empresas/gerenciar/page.js
    1. Usuario seleciona arquivo .csv
    2. Browser faz parsing do CSV (split linhas, detecta header)
    3. Mapeia colunas: nome/nome_completo, email, cargo
    4. Filtra linhas sem email
    5. Envia array para Server Action
  
  Codigo (backend): actions/onboarding.js → importarColaboradoresLote()
    1. SELECT emails existentes na empresa (dedup)
    2. Filtra novos (email nao existente)
    3. INSERT em lotes de 100:
       { empresa_id, nome_completo, email, cargo }
    4. Retorna contagem de importados
  
  Fonte: Arquivo CSV do computador do admin
  Destino: Supabase → tabela "colaboradores"
  Validacao: Dedup por email, trim/lowercase automatico

Passo 3 — Configurar Branding (UI: /admin/empresas/{id}/configuracoes → aba Branding)
  Quem: Super Admin
  Acao: Define slug do subdominio, faz upload do logo, escolhe cores
  
  Codigo: configuracoes/actions.js → salvarBranding() + salvarSlug()
    1. Upload do logo:
       POST /api/upload-logo → Supabase Storage (bucket "logos")
       Retorna URL publica do logo
    2. Salvar cores e slug:
       UPDATE empresas SET ui_config = merge(ui_config, branding)
       UPDATE empresas SET slug = clean_slug
  
  Fonte: Interface web com color pickers + file upload
  Destino: Supabase → empresas.ui_config (JSONB) + empresas.slug
           Supabase Storage → bucket "logos"
  
  Resultado: escola-zula.vertho.com.br/login mostra logo e cores da empresa

Passo 4 — Configurar IA e Automacoes (mesma tela, abas diferentes)
  Quem: Super Admin
  Acao: Seleciona modelo padrao de IA, define cadencia de envios
  
  Codigo: configuracoes/actions.js → salvarConfig()
    UPDATE empresas SET sys_config = { ai, cadencia, envios }
  
  Destino: Supabase → empresas.sys_config (JSONB)
```

**Ganhos:** Processo guiado por interface. Multi-tenant real com um unico deploy. Validacao automatica. Subdominio por empresa. Branding personalizado.

---

## 2. Fluxo de Setup e Disparo

**Contexto:** O Admin opera as Fases 1 (Engenharia IA) e 2 (Coleta) para um cliente.

### COMO ERA NO GAS

```
FASE 1 — ENGENHARIA IA

Passo 1 — IA1: Top 10 Competencias
  Quem: Admin (via menu Google Sheets)
  Acao: Executa funcao rodarIA1() pelo menu
  
  Fluxo do dado:
    1. Le cargos unicos da aba "Colaboradores" (coluna Cargo)
    2. Para cada cargo:
       - Monta prompt com nome da empresa + segmento + PPP (se disponivel)
       - Chama Claude via AIRouter.callClaude()
       - Faz parse do JSON retornado
       - Grava 10 competencias na aba "Competencias_v2"
    3. Status de cada cargo atualizado na planilha
  
  Fonte: Aba "Colaboradores" (cargos)
  Destino: Aba "Competencias_v2" (uma linha por competencia)

Passo 2 — Selecao Manual Top 5
  Quem: Admin (manualmente na planilha)
  Acao: Revisa as 10 competencias, seleciona 5 na aba "Cargos"
  Destino: Aba "Cargos" → coluna top5_workshop

Passo 3 — IA2: Gabarito
  Quem: Admin (via menu)
  Acao: Executa rodarIA2()
  
  Fluxo:
    1. Le competencias da aba "Competencias_v2"
    2. Claude gera rubrica de 5 niveis (N1 a N4 + referencia)
    3. Grava resultado nas colunas tela1..tela4 da aba "Cargos"
  
  Destino: Aba "Cargos"

Passo 4 — IA3: Cenarios Situacionais
  Quem: Admin (via menu)
  Acao: Executa funcao de geracao de cenarios
  
  Fluxo (Fase2_Cenarios.js → gerarBancoCenarios):
    1. Cruza: cargo × escola × competencia_id
    2. Para cada combinacao, Claude gera 1 cenario com:
       Titulo, Contexto, P1 (situacao), P2 (acao), P3 (raciocinio), P4 (CIS gap)
    3. Grava na aba "Banco_Cenarios":
       Colunas A-P (Cargo, Escola, CompId, CompNome, Status, Titulo,
       Contexto, P1-P4, Cobertura, Diferenciais, Data, CIS_Gatilho)
  
  Destino: Aba "Banco_Cenarios"

---

FASE 2 — COLETA

Passo 5 — Gerar Formularios
  Quem: Admin (via menu)
  Acao: Executa gerarForms()
  
  Fluxo:
    1. Para cada colaborador, copia template do Google Forms:
       Template ID: 1bCZf4VVDRvCAfwoaGnfjSQQVqy4nO-AqmoRD7RKKKJo
       Usa makeCopy() para preservar header/banner
    2. Vincula cenario ao form via pre-fill URL
    3. Grava ID do form na aba "Envios"
  
  Destino: Google Forms (copia) + aba "Envios"

Passo 6 — Disparar Emails
  Quem: Admin (via menu)
  Acao: Executa dispararEmails()
  
  Fluxo:
    1. Le colaboradores da aba "Colaboradores" com email
    2. Gera link do form com token
    3. Envia via GmailApp.sendEmail() (ou MailApp)
    4. Template HTML com branding Vertho
  
  Destino: Caixa de email do colaborador

Passo 7 — Disparar WhatsApp (opcional)
  Quem: Admin (via menu)
  Acao: Executa enviarLinksCIS() (EnvioLinkCIS.js)
  
  Fluxo:
    1. Le aba "Envio Link CIS" (ID, Nome, Telefone, Email, Link, Status)
    2. Para cada linha com Status vazio:
       - Chama Z-API: POST send-text com link personalizado
       - Atualiza Status para "Enviado" ou "Erro"
    3. Rate limit: 1 segundo entre envios
  
  Destino: WhatsApp do colaborador via Z-API
```

**Problemas:** Tudo via menu da planilha. Sem feedback visual do progresso. Forms gerados como copias no Drive (centenas de arquivos). Rate limit basico. Sem fila de retry.

---

### COMO E NO NEXT.JS

```
FASE 1 — ENGENHARIA IA

Interface: /admin/empresas/{id} → Pipeline visual com fases expansiveis

Passo 1 — IA1: Top 10 Competencias
  Quem: Admin (clica botao "IA1 — Top 10" na Fase 1 do pipeline)
  Acao: Seleciona modelo de IA no modal picker → confirma
  
  Codigo: actions/fase1.js → rodarIA1(empresaId, aiConfig)
    1. SELECT nome, segmento FROM empresas WHERE id = empresaId
    2. SELECT DISTINCT cargo FROM colaboradores WHERE empresa_id
    3. Para cada cargo:
       a. callAI(system, user, aiConfig, 4096) via actions/ai-client.js
          - Roteia para Claude, Gemini ou OpenAI conforme aiConfig.model
          - System prompt: "Voce e um especialista em gestao por competencias..."
       b. extractJSON(resposta) — parse robusto (5 estrategias de fallback)
       c. UPSERT competencias (onConflict: empresa_id, cargo, nome)
    4. Retorna { success, message: "X competencias geradas para Y cargos" }
  
  Fonte: Supabase → colaboradores (cargos unicos)
  Processamento: Claude/Gemini/OpenAI via ai-client.js
  Destino: Supabase → tabela "competencias"

Passo 2 — Selecao Top 5 (UI: /admin/cargos?empresa={id})
  Quem: Admin (interface web com drag-and-drop)
  Destino: Supabase → tabela "cargos" → coluna top5_workshop

Passo 3 — IA2: Gabarito
  Codigo: actions/fase1.js → rodarIA2(empresaId, aiConfig)
    1. SELECT * FROM competencias WHERE empresa_id
    2. Para cada competencia:
       - Claude gera rubrica N1-N4 com indicadores comportamentais
       - UPDATE competencias SET gabarito = JSON com 5 niveis
  
  Destino: Supabase → competencias.gabarito (JSONB)

Passo 4 — IA3: Cenarios
  Codigo: actions/fase1.js → rodarIA3(empresaId, aiConfig)
    1. SELECT * FROM competencias WHERE empresa_id
    2. Para cada competencia:
       - Claude gera 3 cenarios × 4 alternativas (A-D mapeando para niveis)
       - INSERT banco_cenarios:
         { empresa_id, competencia_id, cargo, titulo, descricao, alternativas }
  
  Destino: Supabase → tabela "banco_cenarios"

---

FASE 2 — COLETA

Passo 5 — Gerar Forms (Envios)
  Codigo: actions/fase2.js → gerarForms(empresaId)
    1. SELECT colaboradores com cargo
    2. SELECT banco_cenarios por cargo
    3. Para cada colaborador:
       - Gera token UUID (crypto.randomUUID())
       - INSERT envios_diagnostico:
         { empresa_id, colaborador_id, email, token, status: 'pendente',
           cenarios_ids: [array de IDs matchados] }
  
  Fonte: Supabase → colaboradores + banco_cenarios
  Destino: Supabase → tabela "envios_diagnostico" (com token unico)

  DIFERENCA CRITICA: Nao cria arquivos no Drive. Nao copia formularios.
  O "formulario" e a propria interface /dashboard/assessment do Next.js.
  O token serve para rastrear quem respondeu.

Passo 6 — Disparar Emails
  Codigo: actions/fase2.js → dispararEmails(empresaId)
    1. SELECT envios WHERE status = 'pendente' AND enviado_em IS NULL
    2. SELECT empresa (nome, slug)
    3. Para cada envio:
       a. Monta link: https://{slug}.vertho.com.br/login
       b. POST para Resend API:
          { from: "Vertho <noreply@vertho.ai>",
            to: email,
            subject: "Sua avaliacao esta pronta",
            html: template com link personalizado }
       c. UPDATE envios SET status = 'enviado', enviado_em = now()
  
  Fonte: Supabase → envios_diagnostico
  API Externa: Resend (https://api.resend.com/emails)
  Destino: Email do colaborador + update status no Supabase

Passo 7 — Disparar WhatsApp
  Codigo: actions/whatsapp-lote.js → dispararLinksCIS(empresaId)
    1. SELECT envios JOIN colaboradores WHERE telefone IS NOT NULL
    2. Para cada envio:
       a. Formata telefone (+55 se necessario)
       b. POST Z-API: send-link com URL do assessment
       c. UPDATE envios SET status = 'enviado', canal = 'whatsapp'
       d. await sleep(1500) — rate limit 1.5s entre envios
  
  API Externa: Z-API (https://api.z-api.io/instances/{id}/token/{token}/send-link)
  Destino: WhatsApp do colaborador + update status no Supabase

Passo 8 — Monitorar Status (automatico no pipeline)
  Codigo: actions/fase2.js → verStatusEnvios(empresaId)
    SELECT * FROM envios_diagnostico GROUP BY status
    Retorna: { total, pendente, enviado, respondido }
  
  O pipeline visual mostra o progresso em tempo real na Fase 2.
```

**Ganhos:** Pipeline visual com progresso. Sem criacao de arquivos no Drive. Token UUID por envio. Rate limit robusto. Feedback imediato do status. Multi-modelo (escolhe IA no momento do clique).

---

## 3. Fluxo Core: Assessment do Colaborador

**Contexto:** O colaborador recebe o link, acessa a plataforma e faz sua avaliacao.

### COMO ERA NO GAS

```
Passo 1 — Colaborador Recebe o Link
  Canal: Email ou WhatsApp
  Link: URL do WebApp do Google Apps Script (doGet)
        https://script.google.com/macros/s/{DEPLOY_ID}/exec?view=diagnostico&email=fulano@email.com
  
  Problema: URL longa, nao confiavel, bloqueada por firewalls corporativos

Passo 2 — Autenticacao OTP
  Codigo: Otp.js → enviarOTP(email, origem)
    1. Valida email contra aba "Colaboradores"
    2. Gera codigo 6 digitos: Math.floor(100000 + Math.random() * 900000)
    3. Armazena no CacheService (TTL: 15 min)
    4. Envia email HTML via GmailApp:
       "123456 — Seu codigo de acesso Vertho"
    5. Anti-spam: max 5 envios/hora, max 3 erros = 15 min block
  
  Fonte: CacheService (chave-valor volátil do GAS)
  Destino: Email do colaborador

Passo 3 — Colaborador Acessa o Diagnostico
  Codigo: Main.js → doGet(e) → view=diagnostico
    1. Renderiza Diagnosticofase2.html (WebApp do GAS)
    2. Chama getDiagnosticoData(email):
       - Busca cenario do dia na aba "Banco_Cenarios"
       - Filtra por cargo + escola + competencia
       - Retorna cenario com P1, P2, P3, P4
    3. Colaborador responde 4 perguntas (R1-R4) por competencia

Passo 4 — Salvamento da Resposta
  Codigo: Diagnosticofase2.js → salvarRespostaDiagnostico(email, compId, compNome, respostas)
    1. Abre SpreadsheetApp pela ID mestre
    2. Localiza aba "Respostas"
    3. appendRow com: [email, compId, compNome, R1, R2, R3, R4, timestamp]
  
  Destino: Aba "Respostas" da planilha Google Sheets

---

Passo 5 — Assessment Conversacional (Fase 3 — Motor Principal)
  Interface: ChatWebApp.html (WebApp separado)
  
  Codigo: ConversationController.js → process(data)
    1. StateManager.getActiveSession(email)
       - Busca sessao ativa na aba "Sessoes"
       - Se nao existe: cria nova sessao
    
    2. Maquina de estados (7 fases):
       introducao → cenario → aprofundamento → contraexemplo → 
       encerramento → avaliacao → validacao
    
    3. Para cada turno:
       a. PromptBuilder monta prompt:
          - System prompt (regras, tom, proibicoes)
          - Contexto da competencia + regua de maturidade
          - Perfil DISC do colaborador
          - Historico completo da conversa (ultimos N turnos)
       b. AIRouter.callClaude(prompt, fase)
          - Extended thinking para fases de analise
          - Temperature varia por fase (0.1 avaliacao, 0.5+ geracao)
       c. Resposta do Claude inclui bloco [META]:
          { proximo_passo, confianca, evidencias }
       d. [META] e parseado e removido antes de enviar ao usuario
    
    4. Persistencia DUAL a cada turno:
       a. StateManager → aba "Sessoes" (metadados da sessao)
       b. DriveStorage → Google Drive JSON:
          Pasta: Conversas_IA/{ciclo_id}/{email}/sessao_{id}.json
          Conteudo: { metadata, turnos: [{ role, content, timestamp }] }
    
    5. Criterio de encerramento:
       - confianca >= 80% OU turnos >= 10
       → Dispara avaliacao final

Passo 6 — Avaliacao (2 etapas)
  Etapa 1 — Avaliador (Claude Sonnet):
    - Gera rascunho [EVAL]: nivel, nota, evidencias, feedback
    - Salva em: aba "Resultados_Avaliacao" + campo resultado na Sessao
  
  Etapa 2 — Auditor (Gemini Flash):
    - Audita 6 criterios: evidencias, nivel, nota, lacuna, alucinacoes, vies
    - Retorna [AUDIT]: aprovado/reprovado + correcoes
    - Salva em: aba "Validacoes"
  
  Resultado Final:
    - Se corrigido → usa avaliacao_corrigida
    - Se aprovado → mantem rascunho
    - Salva em: aba "Resultados_Diagnostico"
  
  Destinos: 3 abas diferentes da planilha + arquivo JSON no Drive
```

**Problemas:** URLs longas e bloqueaveis. OTP caseiro (sem padrao). Persistencia em planilha (lenta, 6M limite de celulas). Drive JSON como backup (dificil de consultar). Sem real-time. Sem multi-tenant.

---

### COMO E NO NEXT.JS

```
Passo 1 — Colaborador Recebe o Link
  Canal: Email (Resend) ou WhatsApp (Z-API)
  Link: https://escola-zula.vertho.com.br/login
  
  O subdominio ja carrega o branding da empresa automaticamente.
  URL curta, profissional, nao bloqueavel.

Passo 2 — Autenticacao Magic Link (Supabase Auth)
  Interface: /login (Server Component + Client Component)
  
  Fluxo do dado:
    a. middleware.js intercepta a request:
       - Extrai "escola-zula" do hostname
       - Injeta header x-tenant-slug: "escola-zula"
    
    b. app/login/page.js (Server Component):
       - Le x-tenant-slug dos headers
       - Chama resolveTenant("escola-zula"):
         SELECT id, nome, slug, ui_config FROM empresas WHERE slug
         (cache em memoria, TTL 5 min)
       - Extrai branding: logo_url, cores, subtitulo
       - Passa props para LoginForm
    
    c. app/login/login-form.js (Client Component):
       - Renderiza tela com logo e cores da empresa
       - Colaborador digita email
       - Chama supabase.auth.signInWithOtp({ email, emailRedirectTo })
       - Supabase envia Magic Link por email (infraestrutura propria)
       - Colaborador clica no link → autenticado automaticamente
       - Redirect para /dashboard
  
  Fonte: Input do usuario (email)
  API Externa: Supabase Auth (Magic Link nativo, sem codigo OTP caseiro)
  Destino: Cookie de sessao JWT no browser

  DIFERENCA CRITICA: Sem codigo OTP manual. Sem CacheService.
  Supabase Auth gerencia tudo: rate limit, expiracao, token JWT.

Passo 3 — Dashboard do Colaborador
  Interface: /dashboard (Client Component com RBAC)
  
  Codigo: app/dashboard/page.js
    1. supabase.auth.getUser() → pega email do JWT
    2. SELECT FROM colaboradores WHERE email → pega empresa_id, cargo
    3. detectRole(cargo):
       - /rh|diretor|ceo/ → role "rh" (ve KPIs da empresa)
       - /coordenador|gestor|gerente/ → role "gestor" (ve equipe)
       - outros → role "colaborador" (ve progresso individual)
    4. COUNT competencias + COUNT respostas avaliadas → progresso %
    5. Renderiza cards: Assessment, PDI, Praticar, Jornada
  
  Fonte: Supabase → colaboradores, competencias, respostas
  Destino: Tela do browser (React client-side)

Passo 4 — Assessment (Responder Cenarios)
  Interface: /dashboard/assessment
  
  Fluxo do dado:
    1. GET /api/assessment (API Route):
       a. supabase.auth.getUser() → email
       b. SELECT colaborador WHERE email → id, cargo, empresa_id
       c. SELECT banco_cenarios WHERE empresa_id AND email_colaborador
       d. SELECT competencia_id FROM respostas WHERE colaborador_id
          AND r1 IS NOT NULL (ja respondidas)
       e. Calcula pendentes = cenarios - respondidas
       f. Retorna: { colaborador, pendentes, total, respondidas }
    
    2. Colaborador ve cenario + 4 perguntas (P1-P4)
    
    3. POST /api/assessment (submissao):
       Body: { cenario_id, competencia_id, r1, r2, r3, r4 }
       a. Valida autenticacao
       b. SELECT colaborador → empresa_id
       c. INSERT respostas:
          { empresa_id, colaborador_id, competencia_id, cenario_id,
            r1, r2, r3, r4 }
       d. Retorna { success: true }
  
  Fonte: Supabase → banco_cenarios (cenarios) + auth JWT (identidade)
  Destino: Supabase → tabela "respostas"

Passo 5 — Avaliacao IA4 (Disparada pelo Admin)
  Interface: /admin/empresas/{id} → Fase 3 → botao "Rodar IA4"
  
  Codigo: actions/fase3.js → rodarIA4(empresaId, aiConfig)
    1. SELECT respostas JOIN colaboradores
       WHERE avaliacao_ia IS NULL (nao avaliadas)
    2. Para cada resposta:
       a. SELECT banco_cenarios JOIN competencias (contexto + gabarito)
       b. callAI(system, user, aiConfig, 2048):
          System: "Voce e um avaliador de competencias comportamentais..."
          User: cenario + respostas R1-R4 + gabarito dos 5 niveis
       c. extractJSON(resposta):
          { nivel_identificado, justificativa, pontos_fortes,
            pontos_desenvolvimento }
       d. UPDATE respostas SET avaliacao_ia = JSON, avaliado_em = now()
    3. Retorna: { success, message: "X respostas avaliadas" }
  
  Fonte: Supabase → respostas (nao avaliadas)
  Processamento: Claude/Gemini/OpenAI (escolhido pelo admin)
  Destino: Supabase → respostas.avaliacao_ia (JSONB)

  NOTA SOBRE VALIDACAO CRUZADA:
  No GAS, havia 2 etapas explicitas (Claude avalia → Gemini audita).
  No Next.js, a validacao cruzada esta preparada na arquitetura
  (sessoes_avaliacao com campos rascunho_avaliacao + validacao_audit +
  avaliacao_final) mas o motor conversacional de Fase 3 com chat
  em tempo real e state machine ainda esta em desenvolvimento.
  A avaliacao atual e por cenario escrito (R1-R4), nao conversacional.
```

**Ganhos:** URL profissional por subdominio. Auth nativa Supabase (Magic Link). JWT com RLS. Dashboard com RBAC automatico. Sem persistencia em planilha. Sem arquivos no Drive. Banco relacional com indices e consultas rapidas.

---

## 4. Fluxo de Entrega de Valor

**Contexto:** Apos a avaliacao, o sistema gera relatorios PDF e planos de desenvolvimento, e entrega ao colaborador.

### COMO ERA NO GAS

```
Passo 1 — Gerar Relatorio Individual (PDF)
  Quem: Admin (via menu da planilha)
  
  Codigo: Codigo.js (linhas 4000-4200)
    1. Para cada colaborador avaliado:
       a. Copia template do Google Docs:
          Template ID: 17BMU-vH3-APNghr_DbzP4oCP_AbAA6vZ5rcAoBlRAaY
          Pasta destino: 19RO21ZeHu3cOvZM7FecHtxkKsVy-QtZH
          Usa makeCopy() para preservar logo e footer
       
       b. Abre documento: DocumentApp.openById(copia.getId())
       
       c. Injeta conteudo dinamicamente:
          - Substituicao de tags: {{NOME}}, {{CARGO}}, {{DATA}}
          - Insercao de paragrafos com ParagraphHeading.HEADING2
          - Criacao de tabelas com cell-by-cell injection
          - Aplicacao de cores:
            C_TITULO (#0f2b54) para titulos
            C_FLAG_RED para pontos criticos
          - Limpeza de paragrafos vazios
       
       d. Salva e converte:
          doc.saveAndClose()
          const pdf = copia.getAs(MimeType.PDF)
          // Salva PDF na pasta do Drive
       
       e. Deleta documento temporario:
          copia.setTrashed(true)
  
  Fonte: Aba "Resultados_Diagnostico" (dados de avaliacao)
  Processamento: Google Docs API (DocumentApp)
  Destino: Google Drive → pasta de relatorios (PDF)

Passo 2 — Gerar Relatorio Gestor
  Similar ao individual, mas agrupa por area/departamento
  Template: 16Ec-Mf3JgFj-DDlBdbacTroJF_WSRNCrOxGFzryq8Bw
  Pasta: 107Sq2qVxlrmQGkKvTKT3JQ6XUQQ1r5HX

Passo 3 — Enviar PDF via WhatsApp
  Codigo: EnvioLinkCIS.js (adaptado para PDFs)
    1. Le arquivo PDF do Drive: DriveApp.getFileById(pdfId)
    2. Converte para base64: Utilities.base64Encode(blob.getBytes())
    3. POST para Z-API: send-document/pdf
       { phone, document: "data:application/pdf;base64,...", fileName }
    4. Rate limit: 1s entre envios
  
  Fonte: Google Drive (PDF gerado)
  API Externa: Z-API
  Destino: WhatsApp do colaborador
```

**Problemas:** Processo lento (Google Docs API e pesada). Template fragil (tags podem quebrar). Arquivo temporario no Drive (lixo). Conversao PDF com qualidade variavel. Sem caching. Tudo sincrono.

---

### COMO E NO NEXT.JS

```
Passo 1 — Gerar Relatorios Individuais (Narrativa IA)
  Quem: Admin (clica "Individuais" na Fase 3 do pipeline)
  
  Codigo: actions/fase3.js → gerarRelatoriosIndividuais(empresaId, aiConfig)
    1. SELECT colaboradores com respostas avaliadas:
       JOIN respostas ON colaborador_id
       JOIN banco_cenarios ON competencia_id
       WHERE avaliacao_ia IS NOT NULL
    
    2. Para cada colaborador:
       a. Agrega dados por competencia:
          { nome, nivel, classificacao, feedback, pontos_fortes }
       
       b. callAI para gerar narrativa consolidada:
          System: "Voce gera relatorios de avaliacao de competencias..."
          User: todos os dados agregados do colaborador
          Retorna JSON:
          {
            colaborador, cargo, resumo_executivo,
            competencias: [{ nome, nivel, classificacao, feedback }],
            pontos_fortes_gerais,
            areas_desenvolvimento,
            recomendacoes
          }
       
       c. UPSERT relatorios:
          { empresa_id, colaborador_id, tipo: 'individual',
            conteudo: JSON_narrativa, gerado_em: now() }
  
  Fonte: Supabase → respostas + banco_cenarios + competencias
  Processamento: Claude/Gemini/OpenAI (narrativa)
  Destino: Supabase → tabela "relatorios" (tipo='individual')

Passo 2 — Renderizar PDF (sob demanda)
  Interface: /api/relatorios/individual?colaboradorId=UUID
  
  Codigo: components/pdf/RelatorioIndividual.js
    1. Componente React puro usando @react-pdf/renderer:
       - Document → Page (A4) → View → Text
       - Importa RelatorioTemplate (header "VERTHO" + footer + paginacao)
       - Importa styles (paleta navy/cyan/teal, tipografia)
    
    2. Secoes renderizadas:
       a. Cabecalho: Nome, Cargo, Email, Data, Nota Final
       b. Tabela Resumo: Competencia | Nivel | Nota | Pilar
          (cores alternadas, header teal)
       c. Detalhamento: Para cada competencia:
          - Card com borda esquerda cyan
          - Titulo + nivel + feedback narrativo
          - Pontos fortes + areas de desenvolvimento
       d. Resumo PDI: Acoes recomendadas por competencia
          (bullets com bolinhas teal)
    
    3. API Route renderiza e retorna:
       const pdfBuffer = await renderToBuffer(<RelatorioIndividual {...props} />)
       return new Response(pdfBuffer, {
         headers: { 'Content-Type': 'application/pdf' }
       })
  
  Fonte: Supabase → relatorios (conteudo JSON)
  Processamento: @react-pdf/renderer (renderToBuffer, server-side)
  Destino: Response HTTP com PDF binario

  DIFERENCA CRITICA: Nao cria arquivo no Drive. Nao copia template.
  Nao injeta tags. O PDF e gerado em memoria sob demanda.
  Componente React = design versionado no codigo = nunca quebra.

Passo 3 — Gerar PDI (Plano de Desenvolvimento Individual)
  Codigo: actions/fase4.js → gerarPDIs(empresaId, aiConfig)
    1. SELECT relatorios WHERE tipo = 'individual'
    2. Para cada relatorio:
       a. callAI com relatorio completo como contexto:
          Retorna JSON:
          {
            colaborador,
            objetivos: [{
              competencia, nivel_atual, nivel_meta,
              acoes: [{ acao, prazo, tipo: curso|leitura|pratica|mentoria }],
              indicadores_sucesso
            }],
            cronograma_semanas: 12,
            checkpoints: [{ semana, meta }]
          }
       b. UPSERT pdis:
          { empresa_id, colaborador_id, conteudo: JSON, status: 'ativo' }
  
  Fonte: Supabase → relatorios individuais
  Processamento: Claude (gera plano pratico de 12 semanas)
  Destino: Supabase → tabela "pdis"

Passo 4 — Enviar PDFs via WhatsApp (Lote)
  Quem: Admin (clica "PDF + WhatsApp (Lote)" na Fase 3)
  
  Codigo: actions/automacao-envios.js → enviarPDFsLote(empresaId)
    1. SELECT relatorios JOIN colaboradores
       WHERE tipo = 'individual' AND telefone IS NOT NULL
    
    2. Para cada relatorio:
       a. GET /api/relatorio-pdf/{report_id}
          → @react-pdf/renderer gera PDF em memoria
          → Retorna buffer binario
       
       b. Converte para base64:
          Buffer.from(pdfBuffer).toString('base64')
       
       c. actions/whatsapp.js → enviarPDF(telefone, pdfBase64, filename):
          POST Z-API: send-document/pdf
          { phone, document: "data:application/pdf;base64,...",
            fileName: "Relatorio_Nome.pdf" }
       
       d. await sleep(1500) — rate limit 1.5s
       
       e. Log: { enviado: true/false, erro: msg }
    
    3. Retorna: { success, message: "X enviados, Y erros" }
  
  Fonte: Supabase → relatorios + colaboradores
  Processamento: React PDF (geracao) + Z-API (envio)
  Destino: WhatsApp do colaborador (PDF anexado)

  PIPELINE COMPLETO DO DADO:
  respostas (Supabase)
    → avaliacao_ia (Claude)
      → relatorios.conteudo (Supabase, JSON)
        → @react-pdf/renderer (PDF em memoria)
          → base64 encoding
            → Z-API (WhatsApp delivery)
              → Telefone do colaborador
```

**Ganhos:** PDF gerado em memoria (sem arquivos temporarios). Design versionado no codigo (nunca quebra). Geracao sob demanda (nao pre-gera centenas de arquivos). Rate limit robusto com contagem de erros. Pipeline visual mostra progresso. PDI gerado por IA com cronograma de 12 semanas.

---

## Resumo Comparativo

| Aspecto | GAS (Antes) | Next.js (Agora) |
|---------|-------------|-----------------|
| **Armazenamento** | Google Sheets (6M celulas max) + Drive (JSON) | Supabase PostgreSQL (ilimitado) |
| **Autenticacao** | OTP caseiro (CacheService, 15min) | Supabase Auth Magic Link (nativo) |
| **Multi-tenant** | 1 planilha por empresa, 1 deploy por empresa | 1 deploy, N empresas, subdominio wildcard |
| **Branding** | Fixo (Vertho) | Dinamico por empresa (logo, cores, fonte) |
| **PDF** | Google Docs template → makeCopy → inject → PDF → Drive | React PDF component → memoria → Response |
| **WhatsApp** | Z-API com 1s rate limit | Z-API com 1.5s rate limit + retry |
| **Email** | GmailApp (limite 100/dia) | Resend API (sem limite pratico) |
| **IA** | Claude fixo (AIRouter basico) | ai-client.js universal (Claude/Gemini/OpenAI, escolha no clique) |
| **Interface Admin** | Menu da planilha Google Sheets | Pipeline visual web com fases expansiveis |
| **Interface Colab** | WebApp do GAS (URL longa) | SPA Next.js (URL curta, subdominio) |
| **Monitoramento** | Olhar aba da planilha manualmente | Pipeline com contadores e progresso % |
| **RBAC** | Nenhum (todos viam a mesma coisa) | Automatico por cargo (RH/Gestor/Colab) |
| **Persistencia** | Dual (Sheets + Drive JSON) | Unica (Supabase com RLS) |
| **Validacao Cruzada** | Claude avalia → Gemini audita (2 etapas) | Preparado na arquitetura, em desenvolvimento |

---

*Documento gerado a partir da analise comparativa do codigo-fonte GAS (gas-antigo/) e Next.js (nextjs-app/).*
*Vertho Mentor IA — Abril/2026*
