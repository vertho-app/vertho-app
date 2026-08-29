# Mapeamento Comparativo Completo: GAS vs Next.js

> Vertho Mentor IA — Inventario funcional exhaustivo
> Gerado em: Abril/2026

---

## Legenda de Status

| Icone | Significado |
|---|---|
| ✅ | Implementado e funcional |
| ⚡ | Implementado com melhorias sobre o GAS |
| 🔨 | Implementado como stub (estrutura pronta, logica pendente) |
| ❌ | Nao implementado |

---

## 1. AUTENTICACAO & ACESSO

| Funcionalidade | GAS | Next.js | Status |
|---|---|---|---|
| OTP 6 digitos por email | CacheService 15min, GmailApp | — | ❌ Substituido |
| Anti-spam (5 OTP/hora, 3 erros = block) | CacheService + contadores | — | ❌ Substituido |
| Magic Link (passwordless) | — | Supabase Auth OTP nativo | ⚡ Novo |
| Login com senha (fallback teste) | — | supabase.auth.signInWithPassword | ⚡ Novo |
| Sessao persistente (JWT) | Token manual 4h no CacheService | JWT automatico Supabase Auth | ⚡ Mais robusto |
| RBAC por cargo (regex) | detectRole() em runtime | Substituido por coluna role | ⚡ Explícito |
| RBAC por role (coluna) | — | colaboradores.role (colaborador/gestor/rh) | ⚡ Novo |
| Admin por email (env publica) | NEXT_PUBLIC_ADMIN_EMAILS | Removido | ⚡ Corrigido |
| Admin de plataforma (tabela) | — | platform_admins (server-side) | ⚡ Novo |
| UI gerenciar roles | — | Tab Equipe em configuracoes | ⚡ Novo |
| UI gerenciar admins | — | /admin/platform-admins | ⚡ Novo |
| Camada central authz | — | lib/authz.js (getUserContext, isPlatformAdmin, etc) | ⚡ Novo |

---

## 2. MULTI-TENANT

| Funcionalidade | GAS | Next.js | Status |
|---|---|---|---|
| Isolamento por empresa | 1 planilha por empresa | 1 banco, empresa_id em todas tabelas | ⚡ Mais escalável |
| Deploy por empresa | 1 deploy GAS por empresa | 1 deploy unico para todas | ⚡ Unificado |
| RLS (Row-Level Security) | Nenhum | Policies Supabase por empresa_id | ⚡ Novo |
| Roteamento por subdominio | — | middleware.js extrai slug → header | ⚡ Novo |
| Resolucao de tenant | — | lib/tenant-resolver.js (cache 5min) | ⚡ Novo |
| Branding por empresa (logo) | Fixo Vertho | Upload logo → Supabase Storage | ⚡ Novo |
| Branding por empresa (cores) | Fixo | 7 color pickers + preview ao vivo | ⚡ Novo |
| Branding por empresa (fonte) | — | font_color + font_color_secondary | ⚡ Novo |
| Subdominio por empresa | — | {slug}.vertho.com.br | ⚡ Novo |
| UI config labels/hidden | ui_config JSONB | ui_config JSONB (lib/ui-resolver.js) | ✅ Mantido |
| sys_config (IA, cadencia) | ScriptProperties | sys_config JSONB na tabela empresas | ⚡ Por tenant |
| Dominio proprio | script.google.com/... | vertho.com.br (Cloudflare + Vercel) | ⚡ Profissional |

---

## 3. FASE 0 — ONBOARDING

| Funcionalidade | GAS | Next.js | Status |
|---|---|---|---|
| Criar empresa | Manual (duplicar planilha) | UI: /admin/empresas/nova (auto-slug) | ⚡ Automatizado |
| Import colaboradores | Colar na aba Colaboradores | UI: CSV upload com dedup por email | ⚡ Automatizado |
| Setup abas auxiliares | setupFase3() via menu | Automatico (tabelas Supabase) | ⚡ Sem fricção |
| Config API keys | ScriptProperties manual | UI: aba IA em configuracoes | ⚡ Visual |
| Config cadencia | ScriptProperties | UI: aba Automacoes | ⚡ Visual |
| Config envios | ScriptProperties | UI: aba Envios | ⚡ Visual |
| Import com role | — | Coluna role/papel no CSV | ⚡ Novo |

---

## 4. FASE 1 — ENGENHARIA DE COMPETENCIAS

| Funcionalidade | GAS | Next.js | Status |
|---|---|---|---|
| IA1: Top 10 competencias/cargo | Menu da planilha → Claude | Pipeline UI → callAI (4096 tokens) | ✅ |
| IA2: Gabarito 5 niveis | Menu → Claude | Pipeline UI → callAI (4096 tokens) | ✅ |
| IA3: Cenarios situacionais | Menu → Claude (P1-P4, CIS gatilho) | Pipeline UI → callAI (6000 tokens) | ✅ |
| Popular cenarios de template | Batch (2 por execucao, auto-continue) | Funcao unica (sem timeout GAS) | ⚡ Sem limite 6min |
| Selecao manual Top 5 | Aba Cargos na planilha | /admin/cargos (placeholder) | 🔨 Stub |
| Status aprovacao cenarios | Coluna Status (Gerado/Aprovado/Revisao) | — | ❌ Nao implementado |
| Cenario B (follow-up DISC) | CenarioBGenerator.js (Claude+Gemini) | — | ❌ Nao implementado |
| Auto-continuacao timeout | ScriptProperties + trigger | Nao necessario (serverless) | ⚡ Resolvido |
| Versionamento regua | — | versao_regua em competencias | ⚡ Novo |
| Escolha de modelo no momento | Fixo por config | Modal picker no pipeline (6 modelos) | ⚡ Novo |

---

## 5. FASE 2 — COLETA & ENVIOS

| Funcionalidade | GAS | Next.js | Status |
|---|---|---|---|
| Gerar formularios | Copia Google Forms (makeCopy) | Token UUID em envios_diagnostico | ⚡ Sem arquivos |
| Disparar emails | GmailApp (100/dia limite) | Resend API (sem limite pratico) | ⚡ Escalavel |
| Disparar WhatsApp | Z-API com 1s delay (sincrono) | QStash + Z-API (2s delay, async) | ⚡ Sem timeout |
| Rate limit WhatsApp | 1s sleep sincrono | QStash delay incremental | ⚡ Async |
| Retry automatico WhatsApp | — | QStash backoff exponencial | ⚡ Novo |
| Enviar links CIS | EnvioLinkCIS.js → Z-API | QStash → webhook → Z-API | ⚡ Async |
| Coletar respostas | Le aba Respostas | Poll envios_diagnostico | ✅ |
| Status envios | Aba Envios manual | verStatusEnvios() com contagens | ✅ |
| Monitor progresso | Olhar planilha | Pipeline visual com metricas inline | ⚡ Tempo real |
| Template email HTML | GmailApp inline | lib/notifications.js (5 templates) | ✅ |
| Template WhatsApp | Mensagem hardcoded | lib/notifications.js (3 templates) | ✅ |

---

## 6. FASE 3 — DIAGNOSTICO IA (MOTOR CONVERSACIONAL)

| Funcionalidade | GAS | Next.js | Status |
|---|---|---|---|
| Chat conversacional | ChatWebApp.html → ConversationController | /dashboard/assessment/chat → POST /api/chat | ✅ |
| State machine (fases) | 7 fases (intro→cenario→aprofundamento→contraexemplo→encerramento→avaliacao→validacao) | 5 fases (cenario→aprofundamento→contraexemplo→encerramento→concluida) | ✅ Simplificado |
| System prompt builder | PromptBuilder.js (DISC, regua, CIS, historico) | buildSystemPrompt() (competencia, cenario, regua, fase, turno) | ✅ Mais compacto |
| Bloco [META] | — | Confianca, evidencias, sinais, proximo_passo | ⚡ Novo |
| Persistencia historico | Drive JSON + aba Sessoes | mensagens_chat (Supabase) | ⚡ Queryavel |
| Persistencia sessao | Aba Sessoes (row) | sessoes_avaliacao (Supabase) | ⚡ Relacional |
| Criterio encerramento | Confianca >= 80% OU turnos >= 10 | Confianca >= 80% OU turnos >= 10 OU [META] "encerrar" | ✅ |
| Max aprofundamentos | 10 | Sem limite hard (decidido por confianca) | ⚡ Mais flexivel |
| Timeout sessao (48h reset) | LimpezaSessoes.js trigger | — | ❌ Nao implementado |
| **AVALIACAO [EVAL]** | Claude Sonnet/Opus (nivel, nota, evidencias, lacuna) | Claude (32768 tokens) → [EVAL] JSON | ✅ Tokens alinhados |
| **AUDITORIA [AUDIT]** | Gemini (3 criterios: inventada/divergente/ok) | Gemini (65536 tokens) → [AUDIT] 6 criterios | ⚡ Mais criterios |
| Resultado final | rascunho → validacao → resultado | rascunho → audit → avaliacao_final | ✅ |
| Fallback se LLM falhar | — | Mensagem de erro + sessao preservada | ⚡ Resiliente |
| Extended Thinking | Configurable (disabled/adaptive/max_effort) | — | ❌ Nao implementado |
| Cache de system prompt | cache_control ephemeral (Claude) | — | ❌ Nao implementado |
| Versionamento prompt | — | prompt_versions (SHA-256 dedup) | ⚡ Novo |
| UI do chat | ChatWebApp.html (GAS embedded) | /dashboard/assessment/chat (React) | ✅ |
| Badges fase/confianca na UI | — | Sim (fase, confianca %, status) | ⚡ Novo |
| Card avaliacao final na UI | — | Nivel, nota, lacuna, pontos fortes/melhoria | ⚡ Novo |

---

## 7. FASE 3 — RELATORIOS

| Funcionalidade | GAS | Next.js | Status |
|---|---|---|---|
| Relatorio individual PDF | Google Docs template → inject → PDF → Drive | @react-pdf/renderer em memoria | ⚡ Sem arquivos temp |
| Relatorio gestor PDF | Template makeCopy → inject | callAI 64000 tokens → UPSERT relatorios | ✅ |
| Relatorio RH PDF | Template makeCopy → inject | callAI 8000 tokens → UPSERT relatorios | ✅ |
| Relatorio plenaria | Agregado anonimo para reuniao | callAI 4096 tokens | ✅ |
| Envio email relatorios | GmailApp | Resend API | ✅ |
| Envio WhatsApp relatorios | Z-API (PDF base64) | QStash → Z-API | ⚡ Async |
| Envio lote PDF+WhatsApp | Sincrono com 1s delay | QStash delay incremental | ⚡ Async |
| Template PDF design | Google Docs (logo/footer preservados) | React PDF (styles.js, RelatorioTemplate.js) | ✅ |
| Componente PDF individual | — | RelatorioIndividual.js (perfil+tabela+feedback+PDI) | ✅ |
| API renderizar PDF | — | /api/relatorios/individual (renderToBuffer) | 🔨 Stub |

---

## 8. FASE 4 — PDI & CAPACITACAO

| Funcionalidade | GAS | Next.js | Status |
|---|---|---|---|
| Gerar PDIs (12 semanas) | Claude → PDI_Descritores | callAI 6000 tokens → pdis | ✅ |
| PDIs com descritores | Enriquecimento por nivel | gerarPDIsDescritores() | ✅ |
| Montar trilhas (14 semanas) | TrilhaBuilder.js (1 path/colab/comp) | montarTrilhasLote() | ✅ |
| Estrutura fase 4 | iniciarFase4() | criarEstruturaFase4() | ✅ |
| Iniciar todos | Bulk enrollment | iniciarFase4ParaTodos() | ✅ |
| Triggers semanais (seg/qui) | Triggers GAS (8am configuravel) | — (cron stub) | 🔨 Stub |
| Status fase 4 | Painel com progresso | getStatusFase4() | ✅ |
| **Pilulas semanais** | 2/semana (seg + qui) via email + WhatsApp | — | ❌ Nao implementado |
| **Tutor IA (BETO fase4)** | Claude Haiku (400 tokens, contexto pilula) | — (BETO generico existe, sem contexto fase4) | 🔨 Parcial |
| **Painel do colaborador fase4** | HTML com progresso, pontos, badges, streak | — | ❌ Nao implementado |
| **Registro de evidencias** | Form web → Capacitacao | — | ❌ Nao implementado |
| **Gamificacao** | Pontos (5+5+10+10), badges (Explorer/Dedicated/Master), streak | — | ❌ Nao implementado |
| **Contrato pedagogico** | Email semana 1 | — | ❌ Nao implementado |
| **Nudge inatividade** | Email se 2+ semanas sem engajamento | — | ❌ Nao implementado |
| Moodle provisionar usuario | core_user_create_users | lib/moodle.js (moodleCreateUser) | ✅ |
| Moodle matricular | enrol_manual_enrol_users | lib/moodle.js (moodleEnrollUser) | ✅ |
| Moodle verificar conclusao | core_completion | lib/moodle.js (moodleGetCompletion) | ✅ |

---

## 9. FASE 5 — REAVALIACAO & EVOLUCAO

| Funcionalidade | GAS | Next.js | Status |
|---|---|---|---|
| Reavaliacao conversacional | ConversationController + Cenario B (semana 15) | iniciarReavaliacaoLote() | ✅ Estrutura |
| Relatorio evolucao (A vs B) | Evolucao + Evolucao_Descritores | gerarRelatoriosEvolucaoLote() 64000 tokens | ✅ |
| Plenaria evolucao | Agregado anonimo | gerarPlenariaEvolucao() 64000 tokens | ✅ |
| Relatorio RH manual | — | gerarRelatorioRHManual() | ✅ |
| Relatorio plenaria formal | — | gerarRelatorioPlenaria() | ✅ |
| Enviar links perfil | — | enviarLinksPerfil() | ✅ |
| Dossie gestor | Consolidado por equipe | gerarDossieGestor() 8000 tokens | ✅ |
| Check cenarios | — | checkCenarios() 64000 tokens | ✅ |
| **Delta por descritor** | Evolucao_Descritores (evidencia_B, convergencia, conexao_CIS) | — | ❌ Granularidade menor |
| **Convergencia CIS** | Cruza DISC + evolucao | — | ❌ Nao implementado |

---

## 10. INTEGRACAO WHATSAPP

| Funcionalidade | GAS | Next.js | Status |
|---|---|---|---|
| Enviar texto | _enviarTextoWpp() → Z-API send-text | enviarWhatsApp() → Z-API send-text | ✅ |
| Enviar PDF | _enviarDocumentoWpp() → Z-API send-file | enviarPDF() → Z-API send-document | ✅ |
| Enviar link | — | enviarLink() → Z-API send-link | ⚡ Novo |
| Lote sincrono | 1s delay entre envios | — | Substituido |
| Lote async (QStash) | — | QStash delay incremental 2s | ⚡ Novo |
| Webhook de entrega | — | /api/webhooks/qstash/whatsapp-cis | ⚡ Novo |
| Retry automatico | — | QStash backoff exponencial | ⚡ Novo |
| Verificacao assinatura | — | Receiver lazy (Upstash SDK) | ⚡ Novo |

---

## 11. INTEGRACAO MOODLE

| Funcionalidade | GAS | Next.js | Status |
|---|---|---|---|
| Criar usuario | core_user_create_users | moodleCreateUser() | ✅ |
| Buscar usuario | core_user_get_users | moodleGetUser() | ✅ |
| Matricular | enrol_manual_enrol_users | moodleEnrollUser() | ✅ |
| Matricula lote | Iteracao sequencial | moodleEnrollBatch() | ⚡ Batch |
| Verificar conclusao | core_completion | moodleGetCompletion() | ✅ |
| Importar catalogo | Moodle_Catalogo (Sheet) | moodleImportarCatalogo() | 🔨 Stub |
| Catalogar conteudos (IA) | CatalogoEnriquecido.js (8 por batch) | catalogarConteudosMoodle() | 🔨 Stub |
| Cobertura conteudo | CoberturaConteudo.js | gerarCoberturaConteudo() | 🔨 Stub |

---

## 12. INTEGRACAO PPP

| Funcionalidade | GAS | Next.js | Status |
|---|---|---|---|
| Extrair PPP de URL | fetch via Jina AI | extrairPPP() → Jina AI + callAI 8000 | ✅ |
| Extrair PPP de arquivo | Drive PDF/DOCX/PPTX | — | ❌ Apenas URL |
| Multiplas URLs | Sim | Sim | ✅ |
| Salvar em ppp_escolas | PPP_Escolas (Sheet) | ppp_escolas (Supabase) | ✅ |
| UI extracao | Menu da planilha | /admin/ppp (placeholder) | 🔨 Stub |

---

## 13. MOTOR DE IA

| Funcionalidade | GAS | Next.js | Status |
|---|---|---|---|
| Roteador universal | AIRouter.js (Claude/Gemini/OpenAI) | ai-client.js (callAI + callAIChat) | ✅ |
| Single-turn | callClaude/callGemini/callOpenAI | callAI() | ✅ |
| Multi-turn (historico) | Prompt com historico injetado | callAIChat() (messages array) | ⚡ Nativo |
| Claude (Anthropic SDK) | fetch raw | new Anthropic() SDK oficial | ⚡ SDK |
| Gemini (REST) | fetch | fetch | ✅ |
| OpenAI (REST) | fetch | fetch | ✅ |
| Extended Thinking | Configurable (budget 32k/65k) | — | ❌ |
| Cache ephemeral | cache_control type ephemeral | — | ❌ |
| Modelo por fase | cfg_f3_conversa/avaliacao/relatorio/validacao | sys_config.ai.modelo_padrao | ⚡ Simplificado |
| Escolha por execucao | — | Modal picker (6 modelos) no pipeline | ⚡ Novo |
| Versionamento prompt | — | prompt_versions (SHA-256, tipo, modelo) | ⚡ Novo |
| Versionamento regua | — | versao_regua em competencias | ⚡ Novo |

**Tokens comparados:**

| Fase | GAS | Next.js |
|---|---|---|
| Conversa | 1.024 | 1.024 | ✅ |
| Avaliacao [EVAL] | 32.768 | 32.768 | ✅ |
| Auditoria [AUDIT] Gemini | 65.536 | 65.536 | ✅ |
| Relatorios | 64.000 | 64.000 | ✅ |
| PDI | 4.096 | 6.000 | ⚡ |
| Cenarios | — | 6.000 | ✅ |
| Tutor BETO | 400 | 500 | ⚡ |
| PPP | — | 8.000 | ✅ |

---

## 14. PDF & DOCUMENTOS

| Funcionalidade | GAS | Next.js | Status |
|---|---|---|---|
| Template | Google Docs (makeCopy + inject tags) | React PDF (@react-pdf/renderer) | ⚡ Em memoria |
| Geracao | DocumentApp → saveAndClose → getAs(PDF) | renderToBuffer() | ⚡ Sem temp files |
| Armazenamento | Google Drive (pasta por tipo) | — (sob demanda) | ⚡ Sem acumulo |
| Design system | Cores hardcoded no template | styles.js (paleta, tipografia) | ✅ |
| Template A4 | Header logo + footer paginacao | RelatorioTemplate.js | ✅ |
| Relatorio individual | Inject secoes por competencia | RelatorioIndividual.js (perfil+tabela+feedback) | ✅ |
| Relatorio gestor | Template separado (dossie) | Via callAI + relatorios table | ✅ |

---

## 15. ADMIN & OPERACOES

| Funcionalidade | GAS | Next.js | Status |
|---|---|---|---|
| Painel admin | Menu Google Sheets | /admin/dashboard (KPIs + System Health) | ⚡ Visual |
| Pipeline da empresa | — (menu sequencial) | Fases 0-5 expansiveis com metricas | ⚡ Novo |
| System health | — | 6 tabelas verificadas em tempo real | ⚡ Novo |
| Configuracoes | Sidebar HTML (Interface.js) | 5 tabs (Equipe, Branding, IA, Automacoes, Envios) | ⚡ Mais completo |
| Limpeza sessoes antigas | limparSessoesAbandonadas() trigger | limparSessoesAntigas(dias) | ✅ |
| Limpeza teste | — | limparSessoesTeste() | ⚡ Novo |
| Estatisticas banco | — | estatisticasBanco() (11 tabelas) | ⚡ Novo |
| Excluir empresa | — | excluirEmpresa() com cascata | ✅ |
| Limpar por fase | — | limparRegistros(tabelas) | ⚡ Novo |
| Simulador sandbox | SimuladorConversaFase3.gs | /admin/simulador (placeholder) | 🔨 Stub |

---

## 16. DASHBOARD COLABORADOR

| Funcionalidade | GAS | Next.js | Status |
|---|---|---|---|
| Visao individual | Progresso + PDI + trilha | Cards (Assessment, PDI, Praticar, Jornada) | ✅ |
| Visao gestor | Equipe por area_depto | KPIs equipe (total + avaliacoes) | ✅ |
| Visao RH | KPIs empresa inteira | KPIs empresa inteira | ✅ |
| BETO chat | Tutor contextual (pilula + resumo) | Chat generico Claude (500 tokens) | ✅ Parcial |
| Bottom nav | — | 5 abas (Inicio, Assessment, PDI, Praticar, Perfil) | ✅ |
| Perfil CIS | CIS_Webapp.html | /dashboard/perfil-cis (placeholder) | 🔨 Stub |
| Jornada timeline | — | /dashboard/jornada (placeholder) | 🔨 Stub |
| Painel fase 4 | Fase4 painel.js (pontos, badges, streak) | — | ❌ |

---

## 17. PERSISTENCIA

| Aspecto | GAS | Next.js |
|---|---|---|
| Banco principal | Google Sheets (15+ abas) | Supabase PostgreSQL (20+ tabelas) |
| Conversas | Drive JSON (Conversas_IA/{ciclo}/{email}) | mensagens_chat (Supabase) |
| Sessoes | Aba Sessoes (1 row por sessao) | sessoes_avaliacao (Supabase) |
| Config | ScriptProperties (key-value) | empresas.sys_config (JSONB por tenant) |
| Segredos | ScriptProperties | Vercel env vars (server-side) |
| Arquivos | Google Drive (PDFs, JSONs) | Supabase Storage (logos) |
| Cache | CacheService 6h/15min | In-memory Map (tenant 5min) |
| Prompts | — | prompt_versions (SHA-256 hash) |

---

## 18. DEPLOY & INFRAESTRUTURA

| Aspecto | GAS | Next.js |
|---|---|---|
| Hospedagem | Google Apps Script (container-bound) | Vercel (serverless) |
| Dominio | script.google.com/macros/s/{ID}/exec | vertho.com.br + *.vertho.com.br |
| DNS/CDN | — | Cloudflare (Full Strict SSL) |
| Build | — | Next.js 16.2 Turbopack |
| Deploy | Publicar WebApp manualmente | git push → auto-deploy |
| CI/CD | — | GitHub → Vercel (automatico) |
| Timeout | 6 min (GAS limite) | 60s Vercel (serverless) |
| Workaround timeout | Auto-continue via trigger | QStash para operacoes longas |
| Filas | — | Upstash QStash |
| Repo | — | github.com/vertho-app/vertho-app |
| Migrations | — | 16 SQLs sequenciais (001-016) |

---

## 19. FUNCIONALIDADES QUE EXISTEM SO NO GAS

| Funcionalidade | Arquivo GAS | Complexidade | Prioridade |
|---|---|---|---|
| Extended Thinking (Claude) | AIRouter.js | Media | Media |
| Cache ephemeral (Claude) | AIRouter.js | Baixa | Baixa |
| Cenario B (follow-up DISC) | CenarioBGenerator.js | Alta | Alta |
| Painel fase 4 (pontos/badges/streak) | Fase4 painel.js | Alta | Alta |
| Pilulas semanais (2/semana) | Fase4 whatsapp.js | Media | Alta |
| Tutor IA contextual (pilula) | Fase4 tutor.js | Media | Media |
| Registro evidencias semanal | Fase4 evidencia.js | Media | Alta |
| Contrato pedagogico | Fase4.js | Baixa | Baixa |
| Nudge inatividade | Fase4.js | Baixa | Media |
| Cron triggers (seg/qui) | Triggers GAS | Media | Alta |
| Timeout sessao 48h | LimpezaSessoes.js | Baixa | Media |
| Simulador conversa (fake data) | SimuladorConversaFase3.gs | Media | Baixa |
| AppSheet dashboard | DashboardFase3.js | Media | Baixa |
| Status aprovacao cenarios | Fase2_Cenarios.js | Baixa | Baixa |
| Extrair PPP de arquivo (nao URL) | PPPExtractor.js | Media | Baixa |
| Delta por descritor (evolucao) | Evolucao.js | Media | Media |
| Convergencia CIS (DISC + evolucao) | Evolucao.js | Alta | Media |

---

## 20. FUNCIONALIDADES QUE EXISTEM SO NO NEXT.JS

| Funcionalidade | Implementacao |
|---|---|
| Multi-tenant por subdominio | middleware.js + tenant-resolver.js |
| Branding visual por empresa | Tab Branding (logo, cores, fonte, preview) |
| RBAC explicito (coluna role) | Migration 015 + lib/authz.js |
| Platform admins (tabela) | platform_admins + UI de gestao |
| QStash (filas async) | whatsapp-lote.js + webhook |
| Versionamento de prompts | prompt_versions (SHA-256) |
| Versionamento de regua | versao_regua em competencias |
| System Health no admin | Verificacao de 6 tabelas |
| Bloco [META] no chat | Confianca, evidencias, sinais, proximo_passo |
| [AUDIT] com 6 criterios | evidencias, nivel, nota, lacuna, alucinacoes, vies |
| Login com senha (fallback) | signInWithPassword |
| Upload logo (Supabase Storage) | /api/upload-logo + bucket "logos" |
| Cloudflare DNS + CDN | CNAME + wildcard SSL |
| Auto-deploy via git push | GitHub → Vercel |

---

## 21. RESUMO QUANTITATIVO

| Metrica | GAS | Next.js |
|---|---|---|
| Arquivos de codigo | ~50 .js | 83 .js |
| Linhas estimadas | ~27.000 | ~12.000 |
| Tabelas/abas | 22+ Google Sheets | 20+ Supabase |
| Migrations | — | 16 SQL |
| APIs externas | 7 (Claude, Gemini, OpenAI, Z-API, Moodle, Gmail, Drive) | 7 (Claude, Gemini, OpenAI, Z-API, Moodle, Resend, QStash) |
| Modelos IA | 3+ (Haiku, Sonnet, Opus, Gemini, GPT) | 6 (Sonnet 4.6, Opus 4.6, Gemini 3 Flash, Gemini 3.1 Pro, GPT-5.4, GPT-5.4 Mini) |
| Env vars | ~10 (ScriptProperties) | 14 (Vercel) |
| Funcionalidades completas | ~45 | ~38 |
| Funcionalidades stub | 0 | ~12 |
| Funcionalidades exclusivas | 17 | 14 |

---

*Documento gerado a partir da analise exhaustiva de 50 arquivos GAS + 83 arquivos Next.js.*
*Vertho Mentor IA — Abril/2026*
