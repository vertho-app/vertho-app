# Vertho — Features e Benefícios

> Inventário das features em produção (Mentor IA + Radar + Radar Bett) com o benefício correspondente para o cliente. Base para o site, materiais comerciais e ajuste de comunicação.
> Última atualização: 13/05/2026 — HEAD `eec468a`.

---

## O que é a Vertho

A Vertho é uma plataforma SaaS B2B que **transforma diagnóstico de competências em desenvolvimento real**, usando IA conversacional, trilhas de 14 semanas e relatórios automatizados.

Três produtos vivos:

- **Mentor IA** (principal) — Diagnóstico, plano de desenvolvimento individual e trilha guiada, multi-tenant por empresa.
- **Radar Vertho** ([radar.vertho.ai](https://radar.vertho.ai)) — Inteligência pública nacional sobre escolas, municípios, redes e estados (Saeb, Ideb, ENEM, Censo, FUNDEB) com narrativa por IA.
- **Radar Bett** ([radarbett.vertho.ai](https://radarbett.vertho.ai)) — Site dedicado ao Bett Brasil 2026 com jornada comercial focada em conversão.

---

## 1. Mentor IA — Para o Colaborador

| Feature | O que é | Benefício |
|---|---|---|
| **Login sem senha** | Magic Link via email + senha tradicional opcional, Supabase Auth | "Acesso em 1 clique. Sem mais um login pra esquecer." |
| **Dashboard personalizado** | Hero + próximo passo + acesso rápido + KPIs pessoais | Foco no que importa hoje, sem se perder em menus. |
| **Mapeamento Comportamental (DISC)** | Instrumento DISC completo em 29 passos com relatório detalhado | Autoconhecimento profundo do estilo comportamental, gratuito como entrada no programa. |
| **Diagnóstico Conversacional** | Avaliação por chat com IA (Sonnet 4.6) em 6 turnos com extração socrática de evidências | Acaba o "questionário Likert chato": o colaborador conversa em linguagem natural e a IA capta sinais reais. |
| **Votação de Competências** | Colaborador vota nas competências mais importantes do próprio cargo | Voz ativa no programa — quem é desenvolvido participa do diagnóstico. |
| **PDI Personalizado** | Plano de Desenvolvimento Individual gerado por IA: resumo, plano 30 dias (foco + ações), estudo recomendado | Plano concreto e curto, não "encheção de relatório" — focado em 30 dias. |
| **Trilha de 14 semanas** | Cadência semanal automática: 9 semanas de conteúdo, 3 de prática, 2 de avaliação | Desenvolvimento consistente sem sobrecarga — 1 atividade por semana, gated por calendário. |
| **Microconteúdos multi-formato** | Por semana: vídeo (Bunny), texto, podcast, case study, desafio | Aprende no formato que prefere — mesmo conteúdo, várias entradas. |
| **Tira-Dúvidas (chat reativo)** | Chat com Haiku 4.5, com grounding nos valores e cultura da empresa (RAG) | Resposta na hora, contextualizada à empresa do colaborador — não genérica. |
| **Evidências Socráticas** | Conversa de 6 turnos por descritor com DISC + anti-alucinação + grounding | Treina pensamento crítico — IA não dá respostas, faz perguntas que provocam reflexão. |
| **Missão Prática** | Semanas 4, 8, 12: aceita missão → cria compromisso → executa → relata → IA analisa em 10 turnos | Aprendizado aplicado, não teórico — vira tarefa real do dia a dia. |
| **Avaliação Acumulada** | Após semana 13, 1ª IA pontua descritor por descritor (cega para nota inicial); 2ª IA audita | Avaliação rigorosa por dupla IA, sem viés ancorado na nota anterior. |
| **Cenário B (Sem 14)** | Wizard de 4 perguntas (situação, ação, raciocínio, autossensibilidade) com cenário do banco da empresa | Avaliação final em situação realista, comparável à inicial. |
| **Evolution Report** | Consolida semanas 13+14 em 5 blocos (hero, comparativo, insights, missões, avaliação) + PDF | Resultado tangível — colaborador leva pra casa em PDF, mostra evolução. |
| **BETO (tutor flutuante)** | Chat contextual sempre disponível em qualquer página do dashboard | Mentor permanente — dúvida operacional resolvida sem sair da tela. |
| **Perfil + Avatar** | DISC preview + logout simples | Identidade reconhecida desde o primeiro acesso. |

---

## 2. Mentor IA — Para o Gestor

| Feature | O que é | Benefício |
|---|---|---|
| **Dashboard do Gestor** | Hub com KPIs da equipe + atalhos | Visão de líder em 1 tela, sem dashboards genéricos. |
| **Equipe — Evolução** | Lista de liderados com delta + status (confirmada / parcial / estagnação / regressão) + filtros + ordenação | Identifica em segundos quem precisa de atenção, sem planilha. |
| **Modal de detalhe + PDF Individual** | Click-through em cada liderado → PDF do relatório individual | Conversa de feedback embasada — chega com documento, não com "achismo". |
| **Plenária da Equipe (PDF)** | Documento consolidado do time: forças coletivas, riscos, oportunidades | Reunião de plenária em 30 minutos com dados, não em 3 horas pesando "vibes". |
| **Relatório Gestor (IA)** | Geração de relatório de devolutiva por colaborador para o gestor: resumo executivo, risco se não agir, impacto se não agir | Discurso pronto pra feedback formal, com argumento de impacto/risco. |

---

## 3. Mentor IA — Para o RH / Liderança

### 3.1 Pipeline operacional por empresa
| Feature | O que é | Benefício |
|---|---|---|
| **Pipeline visual (Fases 0–5)** | Tela `/admin/empresas/{id}` com cada fase do programa e seu status | Operação inteira em 1 tela — sem dashboard fragmentado. |
| **Filtro por empresa persistente** | Header com seletor de empresa via React Portal, salvo em localStorage | RH multiempresa não perde contexto ao navegar. |
| **Importação de colaboradores** | CSV/Excel com role + área/depto + ordenação por coluna | Onboarding em massa em minutos, sem cadastro manual. |
| **CRUD de Competências** | Por empresa, importável de uma base padrão (educação/corporativo) + import CSV | Não começa do zero — base pronta, customizável. |
| **Top 10 + Top 5 + Gabarito** | IA1 sugere top 10 por cargo (com aderência cargo/mercado + motivo), RH escolhe top 5, gera gabarito | Curadoria assistida — IA prepara, RH valida. |
| **Banco de Cenários** | IA3 gera cenários situacionais + checagem por 2ª IA | Cenários realistas, validados, sem RH inventar caso a caso. |
| **Envios em massa (WhatsApp + Email)** | Z-API + Resend + QStash (delay incremental 2s), com filtros, anexo PDF, anexo arbitrário, preview e variáveis dinâmicas | Campanha de engajamento em escala, com tracking — sem listinha de WhatsApp manual. |
| **Magic Links em lote** | Envia link de acesso direto (24h) por WhatsApp para um filtro de colaboradores | Onboarding sem fricção — recebe link, abre, está dentro. |
| **Confirmação preventiva em ações destrutivas** | `window.confirm` explícito em todas as ações em lote/destrutivas (gerar simulação, gerar relatórios, limpar dados, disparar mensagens) | Reduz erro humano — "clique acidental" não derruba programa. |

### 3.2 Branding e configuração por tenant
| Feature | O que é | Benefício |
|---|---|---|
| **Subdomínio próprio** | `{empresa}.vertho.ai` com isolamento de dados por `empresa_id` | Identidade própria — não é "mais uma plataforma da Vertho". |
| **Branding completo** | Logo + 7 cores + cor da fonte + subtítulo de login + esconder elementos + renomear labels (`ui_config` JSONB) | Plataforma "veste" a empresa cliente, do login ao dashboard. |
| **Vincular ao Vercel** | Botão no painel pra registrar o subdomínio no Vercel (lib/vercel-domain.ts) | Operação técnica em 1 clique — sem ticket pra time de TI. |
| **Configuração por tenant** | `sys_config` JSONB: modelo de IA preferido, cadência, parâmetros de envio | Cada empresa ajusta o programa ao seu ritmo. |

### 3.3 Relatórios e analytics
| Feature | O que é | Benefício |
|---|---|---|
| **Relatório RH consolidado** | Por empresa: resumo executivo, perfil DISC coletivo (força + risco), tendências | Briefing executivo pra C-Level, gerado por IA. |
| **Plenária RH (PDF)** | Documento da empresa inteira | Apresentação pronta pra board, não "slidão Frankenstein". |
| **Dossiê do Gestor** | Documento agregado por gestor para conversa com o RH | Cada gestor entrega contexto pronto da equipe. |
| **Knowledge Base (RAG)** | Upload PDF/DOCX/TXT/MD (até 4MB) + seed inicial + preview de busca FTS/vector/hybrid | A IA fala "como sua empresa fala" — usa valores, manuais, políticas internas. |
| **Audit trail de prompts** | Tabela `prompt_versions` com hash SHA-256 | Rastreabilidade total das decisões da IA — quem mudou o quê, quando. |
| **Lixeira** | Restore de registros excluídos por 30 dias | Errou? Volta. Sem chamado pro suporte. |
| **Painéis Admin Vertho (internos)** | Evidências, Avaliação Acumulada, Auditoria Sem 14, Simulador de Custo | Time Vertho consegue auditar/regerar qualquer avaliação, com feedback contextual. |
| **System Health no dashboard admin** | KPIs operacionais em tempo real | Operação transparente — você vê o que está rodando. |

---

## 4. Diferenciais técnicos (selling points "sob o capô")

| Feature | O que é | Benefício |
|---|---|---|
| **Multi-tenant nativo** | Isolamento por `empresa_id` + RLS + Auth Action Context em ~120 server actions | Segurança de dados auditável — dados de uma empresa nunca tocam outra. |
| **Dual-IA (validação cruzada)** | Avaliações críticas passam por 1ª IA (geração) + 2ª IA (auditoria) — Sonnet + Gemini | Decisão de IA não é unilateral — sempre validada por modelo independente. |
| **Extended Thinking** | Claude Sonnet com budget 32k/65k tokens em fases de avaliação e auditoria | Análise profunda — IA "pensa antes de responder" em decisões importantes. |
| **Granularidade 0.1 nas notas** | Notas de descritor 1.0 a 4.0 em passos de 0.1 (não 0.5) | Sensibilidade real pra capturar evolução pequena mas consistente. |
| **Triangulação na Sem 14** | Nota final = cenário + acumulada + evidências de 13 semanas (ponderação variável) | Avaliação final não cai em "um cenário ruim" — pondera trajetória inteira. |
| **RAG per-tenant** | Voyage 3-large (1024d) + pgvector + busca híbrida (FTS PT-BR + semântica via RRF) | IA contextualizada à empresa em todas as superfícies (chat, relatórios, missões). |
| **PII Mascarado** | Nomes, emails, telefones mascarados antes de chegar nas IAs externas (Claude/Gemini/OpenAI) | LGPD by design — dados pessoais não vazam para terceiros. |
| **Scrub PII no Sentry** | `lib/sentry-scrub-pii.ts` remove PII antes de enviar erros | Observabilidade sem expor PII. |
| **Versionamento de prompts** | Cada chamada de IA grava hash SHA-256 do prompt | Reprodutibilidade científica das avaliações. |
| **Filas async (QStash)** | Envios em massa, geração de PDF, ingest RAG via Upstash QStash | Sistema não trava em operação pesada — fila digere no ritmo certo. |
| **Cadência por calendário** | Trilhas usam `data_inicio` + week-gating: semana só "abre" no dia correto | Evita "speedrun" — colaborador respeita o ritmo do desenvolvimento. |
| **Simulador de custo de IA** | Calculadora interativa: chamadas × modelos × presets (Sonnet, Opus, Haiku, Gemini Flash/Pro) | Time comercial fecha precificação com base em custo real, não em chute. |
| **Simulador de evolução (testes)** | 4 perfis: evolução confirmada / parcial / estagnação / regressão | Demos com dados realistas, sem precisar de cliente real ativo. |

---

## 5. Radar Vertho — Inteligência pública educacional

Site público em [radar.vertho.ai](https://radar.vertho.ai).

| Feature | O que é | Benefício |
|---|---|---|
| **Base nacional INEP** | Saeb, Ideb, ENEM 3º EM, SARESP (escolas SP), FUNDEB, PDDE, Censo + microdados de docentes | Toda a base pública do MEC consolidada e navegável — sem precisar de cientista de dados. |
| **Página por Escola** | Hero + Saeb + Ideb + ENEM + SARESP + Censo + benchmarks + narrativa IA | Diagnóstico de qualquer escola do Brasil em 1 tela. |
| **Página por Município** | ICA + FUNDEB + VAAR + variabilidade + narrativa IA | Diagnóstico de rede municipal completo. |
| **Página por Rede Municipal** | Métricas agregadas da rede inteira | Visão de gestor público — comparação entre suas escolas. |
| **Página por Estado** | Stats UF + microrregiões + Top/Bottom 10 | Posicionamento estadual — quem puxa, quem precisa de atenção. |
| **Comparador (até 4 escolas)** | Lado a lado | Benchmarking direto, sem montar planilha. |
| **Busca avançada** | Por UF, rede, etapa + contagem (migrations 084–086) | Encontra rapidamente o universo de escolas relevantes. |
| **Narrativa por IA com cache** | Cache hash (`scope + prompt_version + dados_hash`) + detecção de bot | Texto natural sobre os dados, sem custo desnecessário em recargas. |
| **Benchmarks MEC oficiais** | ICA Brasil 2025=66%, valores por UF 2023-2025 | Comparação contra referência oficial, não palpite. |
| **Sitemap dinâmico** | Sitemap.xml por slug | SEO industrial — Google indexa todas as escolas. |
| **Tracking de funil** | Tabela `diag_eventos` + RPCs | Sabe exatamente onde o visitante converte ou desiste. |
| **Captura de lead comercial** | Modal de lead via `actions/lead-comercial.ts` | Tráfego SEO vira lead qualificado pra comercial. |
| **PDF da proposta** | Geração server-side com dados da escola/município | Lead recebe diagnóstico personalizado em PDF na hora. |

---

## 6. Radar Bett — Site Bett Brasil 2026

Site público em [radarbett.vertho.ai](https://radarbett.vertho.ai).

| Feature | O que é | Benefício |
|---|---|---|
| **Identidade Bett** | Tipografia Plus Jakarta Sans + Fraunces escopadas, modo claro | Site reconhecível como "do evento", não genérico. |
| **"Agendar conversa" via WhatsApp** | Botão dispara WhatsApp direto pré-formatado com contexto (`openWhatsAppAgendar(ctx)`) | Lead pula formulário e fala humano-com-humano em 1 clique. |
| **Sticky CTA + Lead Modal** | CTA fixo + modal de captura | Não perde lead na rolagem. |
| **Tracking de funil Bett** | Eventos dedicados (`_lib/tracking.ts`) | Mede ROI do investimento no evento com precisão. |
| **Jornada e Metodologia** | Páginas dedicadas | Educa o lead enquanto ele se interessa. |
| **Buscar / Comparar / Página de Escola** | Mesma engine do Radar, com identidade Bett | Reaproveita o melhor do Radar, com pitch comercial customizado. |
| **OpenGraph Image dinâmico** | Compartilhamento gera preview rico | Conteúdo viraliza melhor em LinkedIn/WhatsApp. |

---

## 7. Operação e suporte

| Feature | O que é | Benefício |
|---|---|---|
| **Backup diário automático** | Task Scheduler Windows + script PowerShell + cron Vercel | Dados protegidos sem ação manual. |
| **Smoke test automatizado** | CI/CD: 29 rotas testadas a cada push (GitHub Actions) | Cliente não vira beta-tester — bug não vai pra produção. |
| **Sentry com PII Scrub** | Error tracking em tempo real, sem PII | Bug detectado antes do cliente abrir chamado. |
| **27 testes E2E (Playwright)** | Cobertura dos fluxos críticos | Refatoração sem medo — testes guardam o fluxo. |
| **Documentação interna viva** | ARQUITETURA.md atualizado a cada release | Onboarding técnico em horas, não em semanas. |
| **RAG architecture documentado** | `docs/rag-architecture.md` | Time técnico do cliente entende o "como" se quiser. |

---

## 8. Mensagens-chave (síntese pra copy)

Para usar diretamente em hero, manchetes e materiais comerciais:

1. **"Diagnóstico que conversa, não interroga."** — Avaliação por chat com IA, não questionário.
2. **"De diagnóstico a desenvolvimento, em 14 semanas."** — Plataforma fecha o loop, não só mede.
3. **"A IA fala como sua empresa fala."** — RAG per-tenant com valores e cultura.
4. **"Cada decisão validada por duas IAs."** — Dual-IA em avaliações críticas.
5. **"Plataforma que veste sua empresa, do login ao PDF."** — Multi-tenant com branding completo.
6. **"Líder chega na conversa com documento, não com achismo."** — PDF individual + Plenária da equipe.
7. **"Granularidade 0.1 — capta evolução real, não só salto."**
8. **"LGPD por design: PII nunca toca a IA."**

---

## 9. O que NÃO falar (positioning trap)

Para a comunicação não soar genérica ou marketeira demais:

- ❌ Evitar "Inteligência Artificial revolucionária" → ✅ "IA que conversa em 6 turnos socráticos com extração de evidências validada por 2ª IA"
- ❌ Evitar "plataforma all-in-one" → ✅ "diagnóstico + plano + trilha + avaliação, no mesmo lugar"
- ❌ Evitar "transforma vidas" → ✅ "leva o colaborador de 'sei o que precisa melhorar' a 'tenho um plano de 30 dias'"
- ❌ Evitar "líder do mercado" → ✅ "validado em produção com [cliente piloto]"
- ❌ Evitar "altamente customizável" → ✅ "logo, 7 cores, labels e elementos visíveis configuráveis por empresa"

---

*Inventário gerado a partir do código-fonte em 13/05/2026. Sempre que entrar feature nova, atualizar aqui antes de virar copy de site.*
