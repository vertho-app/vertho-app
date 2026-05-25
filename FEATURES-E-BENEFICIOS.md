# Vertho — Features e Benefícios

> Inventário das features em produção (Mentor IA + Pulso de Desenvolvimento + Radar) com o benefício correspondente para o cliente. Base para o site, materiais comerciais e ajuste de comunicação.
> Última atualização: 25/05/2026 — HEAD `2730cd7`.

---

## O que é a Vertho

A Vertho é uma plataforma SaaS B2B que **transforma diagnóstico de competências em desenvolvimento real**, usando IA conversacional, trilhas guiadas e relatórios automatizados.

Produtos vivos voltados ao cliente:

- **Mentor IA** (principal) — Diagnóstico, plano de desenvolvimento individual e trilha guiada, multi-tenant por empresa. Dois modos de uso:
  - **Programa Regular (DUO)** — 14 semanas desenvolvendo 2 competências em paralelo, em profundidade (nível-meta 3 / proficiência). É o modo default. *(Single-comp segue disponível como configuração pontual.)*
  - **Vertho Onboarding** — 10 semanas em espiral cobrindo 5 competências (nível-meta 2 / autonomia supervisionada), para profissionais recém-formados.
- **Pulso de Desenvolvimento** *(mai/2026)* — Instrumento leve T0/T2 para entender se o ambiente favorece ou bloqueia o desenvolvimento. Dashboard agregado com guard de anonimato (n≥7), Dual-IA classifica respostas abertas em 12 temas, PDFs executivo + complementar NR-1.
- **Radar Vertho** ([radar.vertho.ai](https://radar.vertho.ai)) — Inteligência pública nacional sobre escolas, municípios, redes e estados (Saeb, Ideb, ENEM, Censo, FUNDEB) com narrativa por IA.

A plataforma agora é **trilíngue** (pt-BR / pt-PT / es-ES) e aceita **login por WhatsApp** para colaboradores sem email — ampliando o público alcançável (operação, chão de fábrica, recém-formados).

> **Ferramenta interna (não comercializada):** *RadarEmpresas* — inteligência comercial B2B que ranqueia empresas brasileiras por oportunidade (Receita Federal + CAGED + RAIS), usada pelo próprio time de vendas da Vertho. Detalhada na seção 12. Não é feature de cliente.
>
> **Descontinuado:** *Radar Bett* (`radarbett.vertho.ai`) — site do Bett Brasil 2026 foi encerrado pós-evento; agora redireciona (301) pro Radar/site institucional. As frentes "Onde a Vertho pode ajudar" migraram pro Radar Vertho.

---

## 1. Mentor IA — Para o Colaborador

| Feature | O que é | Benefício |
|---|---|---|
| **Login sem senha** | Magic Link via email + senha tradicional opcional, Supabase Auth | "Acesso em 1 clique. Sem mais um login pra esquecer." |
| **Login por WhatsApp (OTP)** | Colaborador **sem email** entra com código de 6 dígitos enviado no WhatsApp (código em hash, expira em 10 min, anti-fraude) | Alcança quem não tem/não usa email corporativo — operação, chão de fábrica, recém-formados. Ninguém fica de fora. |
| **Plataforma trilíngue** | Interface em pt-BR, pt-PT e es-ES; idioma definido por empresa e ajustável por colaborador (next-intl) | Mesma plataforma atende Brasil, Portugal e mercados hispânicos — sem versão paralela. |
| **Dashboard personalizado** | Hero + próximo passo + acesso rápido + KPIs pessoais | Foco no que importa hoje, sem se perder em menus. |
| **Mapeamento Comportamental (DISC)** | Instrumento DISC completo em 29 passos com relatório detalhado | Autoconhecimento profundo do estilo comportamental, gratuito como entrada no programa. |
| **Diagnóstico Conversacional** | Avaliação por chat com IA (Sonnet 4.6) em 6 turnos com extração socrática de evidências | Acaba o "questionário Likert chato": o colaborador conversa em linguagem natural e a IA capta sinais reais. |
| **Votação de Competências** | Colaborador vota nas competências mais importantes do próprio cargo | Voz ativa no programa — quem é desenvolvido participa do diagnóstico. |
| **PDI Personalizado** | Plano de Desenvolvimento Individual gerado por IA: resumo, plano 30 dias (foco + ações), estudo recomendado | Plano concreto e curto, não "encheção de relatório" — focado em 30 dias. |
| **Trilha de 14 semanas (DUO)** | Cadência semanal automática: 9 semanas de conteúdo, 3 de prática, 2 de avaliação — cobrindo **2 competências em blocos paralelos**, com missões integradoras das duas | Evolui em duas frentes ao mesmo tempo, sem perder profundidade — 1 atividade por semana, gated por calendário. |
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
| **Envios em massa (WhatsApp + Email)** | Z-API + Resend + QStash (delay incremental 2s), com filtros (cargo · votação · perfil DISC), anexo PDF, anexo arbitrário, preview e variáveis dinâmicas | Campanha de engajamento em escala, com tracking — sem listinha de WhatsApp manual. |
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
| **Log de auditoria de admin** | `admin_audit_log` registra disparos e mutações sensíveis (quem, o quê, qual empresa, resultado, IP) + tela `/admin/auditoria` filtrável | Governança real — toda ação de admin fica rastreável, sem depender de log de servidor. |
| **Matriz de papéis e permissões** | Console `/admin/permissoes`: 5 papéis × 31 permissões nomeadas + overrides auditáveis por papel ou usuário (com motivo obrigatório) | Controle de acesso granular e explícito — dá pra liberar/bloquear capacidade específica sem mexer em código. |
| **Lixeira** | Restore de registros excluídos por 30 dias | Errou? Volta. Sem chamado pro suporte. |
| **Painéis Admin Vertho (internos)** | Evidências, Avaliação Acumulada, Auditoria Sem 14, Simulador de Custo | Time Vertho consegue auditar/regerar qualquer avaliação, com feedback contextual. |
| **System Health no dashboard admin** | KPIs operacionais em tempo real | Operação transparente — você vê o que está rodando. |

---

## 4. Diferenciais técnicos (selling points "sob o capô")

| Feature | O que é | Benefício |
|---|---|---|
| **Multi-tenant nativo** | Isolamento por `empresa_id` + **RLS real por tenant** (policies que limitam o cliente ao próprio tenant) + guard de admin centralizado server-side + auditoria | Segurança de dados auditável e em profundidade — dados de uma empresa nunca tocam outra, nem via browser. |
| **Trilíngue (i18n)** | next-intl com pt-BR / pt-PT / es-ES; locale por empresa + por colaborador | Pronta pra Brasil, Portugal e mercados hispânicos — sem fork de produto. |
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

## 5. Vertho Onboarding — Caso de uso para recém-formados

> Mesmo motor do Mentor IA configurado para acelerar profissionais em fase inicial de carreira. Não é produto separado: é um *modo* da plataforma, ativável por empresa. Beta privado em 3-4 escolas que pediram a feature no Bett Brasil 2026 (foco: professor recém-formado).

### 5.1 Como difere do programa Regular

| Dimensão | Programa Regular (DUO, default) | Vertho Onboarding |
|---|---|---|
| Duração | 14 semanas | **10 semanas** |
| Competências | 2 em paralelo, aprofundadas *(1 no modo single-comp)* | **5 em espiral** |
| Meta de proficiência | Nível 3 (proficiente) | **Nível 2 (autonomia supervisionada)** |
| Cadência | Blocos paralelos por comp → missões 4/8/12 integradoras das duas → avaliação | **Calibragem → fundamentos pareados → 3 missões integradoras** |
| Acompanhamento | Gestor (equipe inteira) | **Tutor** (1-N tutorados específicos) |
| Pricing previsto | Por seat anual | Por contratado/onboardeado (a definir) |

### 5.2 Features específicas do Onboarding

| Feature | O que é | Benefício |
|---|---|---|
| **Trilha de 10 semanas em espiral** | Sem 1 = calibragem; Sems 2/3/5/6/8 = fundamento de cada uma das 5 competências; Sems 4/7/9 = missões integradoras cumulativas; Sem 10 = cenário B + Evolution Report | Profissional sai de "saiu da faculdade" pra "consigo executar com supervisão" em ~2,5 meses, sem queimar etapas. |
| **Missões integradoras multi-competência** | Sem 4 cobre Comps 1+2; sem 7 cobre 1-4; sem 9 cobre todas. IA monta cenários onde as competências precisam ser exercidas juntas, não isoladas | Aprendizado coerente com a realidade do trabalho — onde nada acontece em silos. |
| **IA1 com viés por fase de carreira** | Configurável: `junior` prioriza competências operacionais/básicas; `senior` prioriza estratégicas/relacionais; `pleno` ou sem viés = comportamento default | Ranking de competências sintonizado com o momento da carreira — não pede "visão sistêmica" pra quem acabou de entrar. |
| **Acumulada parcial automática nas missões** | Após cada missão integradora (4/7/9), dupla-IA roda acumulada cobrindo só as competências da janela cumulativa, em background | RH/Tutor recebem leitura intermediária do progresso sem esperar 10 semanas. |
| **Régua nível-meta 2 (autonomia)** | Avaliações usam N2 como "Meta (autonomia supervisionada)" em vez de N3. Aprovação = todas as comps ≥ 2.0 | Critério calibrado à realidade do recém-formado — não é o mesmo nível esperado de um sênior. |
| **Cenário B na sem 10** | Wizard final unificado com 4 perguntas (situação/ação/raciocínio/autossensibilidade) cobrindo todas as 5 competências | Avaliação consolidada da formação, em situação realista do cargo. |
| **Papel "Tutor"** | Subset do papel Gestor: escopo restrito a `tutorados_ids` (não a uma equipe inteira por área). Dashboard mostra "Meus tutorados" | Professor sênior ou coordenador pedagógico acompanha 3-5 colegas em onboarding, sem ver dados de outras pessoas. |
| **Push WhatsApp ao tutor nas sems 4 e 7** | Após cada missão integradora cumulativa, tutor recebe automaticamente: nome do tutorado, semana, competências cobertas e 3 perguntas de pauta sugerida pro check-in | Tutor não precisa lembrar quando agendar conversa — sistema avisa com pauta pronta. |
| **Plenária do Onboarding (PDF)** | Mesmo motor da Plenária do Gestor, refatorado para aceitar título e responsável customizáveis. Pode ser entregue pelo Tutor ou RH | Documento consolidado da turma de recém-formados ao fim das 10 semanas. |
| **Toggle por empresa** | Admin liga/desliga via tab "Programa" em configurações; `sys_config.programa_modo` controla. Top 5 default vem de `competencias_onboarding` ou top 5 do cargo no IA1 | Mesma plataforma, dois usos — escola escolhe se quer onboarding ou desenvolvimento de cargo regular. |

### 5.3 Mensagens-chave do Onboarding (síntese pra copy)

1. **"Da diplomação à autonomia em 10 semanas."**
2. **"5 competências essenciais, exercidas juntas — como no trabalho real."**
3. **"O tutor recebe pauta pronta — não precisa adivinhar o que perguntar."**
4. **"Nível-meta calibrado pra quem está começando: autonomia supervisionada, não excelência sênior."**
5. **"Sem produto separado: é a mesma plataforma de desenvolvimento, em modo recém-formado."**

---

## 6. Pulso de Desenvolvimento — Saúde do ambiente que sustenta a evolução

> Instrumento leve para entender se o ambiente favorece ou bloqueia o desenvolvimento das pessoas. **Não** é pesquisa de clima tradicional, **não** promete diagnóstico psicossocial, burnout ou saúde mental. **Não** substitui PGR/PCMSO/SESMT. Conexão com NR-1 é benefício colateral via relatório complementar opcional.

### 6.1 Conceito

Lógica em 4 momentos: **Pulso T0 → Sinais da Jornada → Pulso T2 → Triangulação**. T0 estabelece linha de base declarada antes da jornada de desenvolvimento; sinais comportamentais (uso da MentorIA, profundidade de respostas, completude) são capturados ao longo; T2 mede percepção pós-jornada; triangulação cruza tudo e gera leitura agregada — sem expor pessoa.

### 6.2 Features

| Feature | O que é | Benefício |
|---|---|---|
| **Pesquisa T0/T2** | 12 perguntas Likert + 1 aberta em 6 dimensões (clareza, condições, liderança, segurança para aprender, aplicação prática, futuro e permanência) — ~3 min | Linha de base + medida final consistentes, sem reinventar a roda a cada ciclo. |
| **Coleta multi-canal** | Magic link pessoal por colab via Z-API/email; assignment idempotente; retomada de progresso | Liga o pulso à jornada de cada um — link cai direto na pergunta dele. |
| **Dashboard agregado com guard n≥7** | Cards principais (índice geral, respondentes, dimensão forte/crítica, delta T0→T2) + gráfico por dimensão + tabela com leitura automática | Gestor/RH vê o time, nunca a pessoa — anonimato preservado por construção. |
| **Sinais da jornada** | Métricas comportamentais derivadas de uso da MentorIA, respostas e completude — normalizadas 1-5, mapeadas pras dimensões | Cruza o "que dizem" com o "que fazem" — captura desejabilidade social. |
| **Dual-IA classifica texto aberto** | Sonnet 4.6 classifica em taxonomia fechada de 12 temas (falta de tempo, falta de apoio, sobrecarga, ausência de feedback, evolução percebida, reconhecimento, etc.) + Gemini Flash audita e rebaixa confidence | Insight do texto aberto sem expor texto bruto — só temas agregados. |
| **Triangulação agregada** | Cruza declarado × comportamental × temas para gerar: aceleradores, bloqueadores, alertas, divergências, recomendações | Discurso pronto pra RH apresentar, calibrado por dados. |
| **Linguagem cautelosa por design** | "Há sinais de…", "Os dados sugerem…", "Recomenda-se investigar" — nunca "isso prova que…", "esse gestor é o problema…", "há assédio…" | Reduz risco jurídico e mau uso — fala em desenvolvimento, não em diagnóstico. |
| **Recortes por área/cargo** | Apenas grupos com 7+ respondentes aparecem | Mantém anonimato mesmo em empresas grandes — não vira ferramenta de caça às bruxas. |
| **PDF Executivo** | Capa Vertho + KPIs + dimensões + sinais + temas + triangulação + recomendações | Apresentação pronta para liderança/board. |
| **PDF Complementar NR-1** | Versão com disclaimer obrigatório + mapeamento conceitual das 6 dimensões em linguagem organizacional | Insumo qualitativo complementar a profissionais técnicos — sem substituí-los. |
| **Audit log de acessos** | `pulse_audit_logs` registra cada view de dashboard, export de PDF, envio de convite, bloqueio por n<7 | LGPD by design — quem viu o quê e quando, rastreável. |
| **Stage por empresa** | `sys_config.pulse_stage`: experimental / calibrating / production. Em calibrating, admin Vertho revisa antes de exibir | Permite pilotar com cuidado sem expor cliente a leituras imaturas. |

### 6.3 Mensagens-chave do Pulso (síntese pra copy)

1. **"Não é pesquisa de clima. É leitura do ambiente que sustenta o desenvolvimento."**
2. **"Anonimato por construção — nada com menos de 7 respostas aparece."**
3. **"Cruza o que a equipe diz com o que ela faz — Dual-IA audita a leitura."**
4. **"Da resposta aberta ao tema dominante — sem expor o que ninguém escreveu."**
5. **"Não diagnosticamos burnout. Mostramos onde o ambiente está limitando a evolução."**
6. **"Complementar a NR-1 — não substitui análise técnica, mas oferece insumo qualitativo agregado."**

### 6.4 O que NÃO falar sobre Pulso

- ❌ "Pesquisa de clima organizacional" → ✅ "Pulso de desenvolvimento — ambiente que sustenta evolução"
- ❌ "Diagnóstico psicossocial / NR-1 compliance" → ✅ "Insumo qualitativo complementar a especialistas técnicos"
- ❌ "Identifica burnout / saúde mental" → ✅ "Sinaliza dimensões do ambiente que podem requerer atenção"
- ❌ "Ranking de gestores / líderes" → ✅ "Leitura agregada por dimensão, com n≥7 obrigatório"

---

## 7. Radar Vertho — Inteligência pública educacional

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

## 8. Radar Bett — Site Bett Brasil 2026 *(DESCONTINUADO)*

> ⚠️ **Encerrado pós-evento.** `radarbett.vertho.ai` agora redireciona (301): deep-links equivalentes → Radar Vertho, resto → vertho.ai. As frentes "Onde a Vertho pode ajudar" migraram pro Radar Vertho. O código segue dormant no repo. Mantido aqui como registro histórico — **não usar em material comercial novo.**

Era um site público em radarbett.vertho.ai (jornada comercial focada no Bett Brasil 2026):

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

## 9. Operação e suporte

| Feature | O que é | Benefício |
|---|---|---|
| **Backup diário automático** | Task Scheduler Windows + script PowerShell + cron Vercel | Dados protegidos sem ação manual. |
| **Smoke test automatizado** | CI/CD: 29 rotas testadas a cada push (GitHub Actions) | Cliente não vira beta-tester — bug não vai pra produção. |
| **Sentry com PII Scrub** | Error tracking em tempo real, sem PII | Bug detectado antes do cliente abrir chamado. |
| **27 testes E2E (Playwright)** | Cobertura dos fluxos críticos | Refatoração sem medo — testes guardam o fluxo. |
| **Documentação interna viva** | ARQUITETURA.md atualizado a cada release | Onboarding técnico em horas, não em semanas. |
| **RAG architecture documentado** | `docs/rag-architecture.md` | Time técnico do cliente entende o "como" se quiser. |

---

## 10. Mensagens-chave (síntese pra copy)

Para usar diretamente em hero, manchetes e materiais comerciais:

1. **"Diagnóstico que conversa, não interroga."** — Avaliação por chat com IA, não questionário.
2. **"De diagnóstico a desenvolvimento, em 14 semanas."** — Plataforma fecha o loop, não só mede.
3. **"A IA fala como sua empresa fala."** — RAG per-tenant com valores e cultura.
4. **"Cada decisão validada por duas IAs."** — Dual-IA em avaliações críticas e no Pulso.
5. **"Plataforma que veste sua empresa, do login ao PDF."** — Multi-tenant com branding completo.
6. **"Líder chega na conversa com documento, não com achismo."** — PDF individual + Plenária da equipe.
7. **"Granularidade 0.1 — capta evolução real, não só salto."**
8. **"LGPD por design: PII nunca toca a IA. Pulso tem guard n≥7 obrigatório."**
9. **"Pulso de Desenvolvimento — leitura do ambiente que sustenta a evolução, com anonimato por construção."**

---

## 11. O que NÃO falar (positioning trap)

Para a comunicação não soar genérica ou marketeira demais:

- ❌ Evitar "Inteligência Artificial revolucionária" → ✅ "IA que conversa em 6 turnos socráticos com extração de evidências validada por 2ª IA"
- ❌ Evitar "plataforma all-in-one" → ✅ "diagnóstico + plano + trilha + avaliação, no mesmo lugar"
- ❌ Evitar "transforma vidas" → ✅ "leva o colaborador de 'sei o que precisa melhorar' a 'tenho um plano de 30 dias'"
- ❌ Evitar "líder do mercado" → ✅ "validado em produção com [cliente piloto]"
- ❌ Evitar "altamente customizável" → ✅ "logo, 7 cores, labels e elementos visíveis configuráveis por empresa"

---

## 12. RadarEmpresas — Inteligência comercial B2B *(ferramenta interna)*

> **Uso interno do time de vendas da Vertho — não é produto de cliente, não vai pro site.** Documentado aqui para o time comercial entender a capacidade que sustenta a prospecção.

Mapeia empresas brasileiras a partir de dados públicos (Receita Federal + CAGED + RAIS + CEMPRE/SIDRA) e as ranqueia por um **Score de Oportunidade Vertho** (40% dor de pessoas + 30% capacidade de compra + 30% fit Vertho), classificando em *abordar agora / boa / nutrir / baixa*.

| Capacidade | O que entrega |
|---|---|
| **Funil endereçável** | De "todas as empresas ativas" até "priorizados top 10%", mostrando o universo real de leads operacionais por filtro. |
| **Score auditável** | Cada empresa tem breakdown explicável (por que pontuou X), com confiança e sinais setoriais reais (rotatividade = CAGED÷RAIS). |
| **Detecção de redes/franquias** | Franquias e grupos viram **1 lead** (negociação com a franqueadora, não unidade a unidade). |
| **Potencial por Cidade (TAM)** | Tamanho de mercado somável por município, cruzando empresas B2B + escolas privadas. |
| **Listas de prospecção** | Pipeline de status por lead (`new → reviewed → approved → contacted → meeting_scheduled`) + export CSV/XLSX. |
| **Pipeline nacional** | Processamento pesado local (DuckDB/Parquet); só agregados sobem ao Supabase. Escala dos ~20M de estabelecimentos do país. |

Disclaimer de uso (proprietário): os sinais são **hipóteses comerciais**, não afirmações — comunicação deve usar "sinais sugerem", "empresas desse perfil costumam".

---

*Inventário gerado a partir do código-fonte em 25/05/2026 (HEAD `2730cd7`). Sempre que entrar feature nova, atualizar aqui antes de virar copy de site.*
