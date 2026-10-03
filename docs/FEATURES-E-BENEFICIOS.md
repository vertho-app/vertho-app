# Vertho: Features e Benefícios

> Inventário das features em produção, com o benefício correspondente para o cliente. Base para o site, materiais comerciais e ajuste de comunicação.
> Última revisão: **03/10/2026**, alinhando o texto ao código e às decisões do dono na revisão de 02/10: login por WhatsApp é link de uso único (sem código nem SMS); os relatórios listados são os que chegam ao cliente (saíram a Plenária da Equipe, a Plenária RH e o Dossiê do Gestor); o Ranking de Adequação ao Cargo entrou; o Simulador de liderança vem com o Mapeamento de liderança; a dupla IA ficou restrita ao mapeamento, ao PDI e aos cenários; a Jornada de 7 semanas é o formato padrão (inclusive de empresa nova, sem formato gravado) e o programa de 14 semanas deixou de ser oferecido; o Personalizado virou programa completo de duração ajustável (1 a 6 semanas por competência, 1 ou 2 competências em sequência) e o Piloto deixou de ser oferecido; o kit entrega os 2 formatos preferidos da pessoa; a operação é da Vertho e o RH acompanha; Onboarding e Piloto descritos como desenho, sem resultado prometido; números sem origem retirados. A revisão completa anterior, linha a linha contra o código de produção (`origin/master`) e contagens de uso no banco, é de 22/09/2026. Quando uma feature existe no código mas ainda não rodou com cliente, o texto diz isso.

---

## O que é a Vertho

A Vertho é uma plataforma SaaS B2B que **transforma o mapeamento de competências em desenvolvimento real**, com IA conversacional, jornadas guiadas e relatórios automatizados.

Produtos vivos voltados ao cliente:

- **Mentor IA** (principal): mapeamento, plano de desenvolvimento individual e jornada guiada, multi-tenant por empresa. Formatos configuráveis **por empresa e por colaborador** (dá para misturar no mesmo tenant):
  - **Jornada Vertho** (o formato padrão): 7 semanas por competência, 6 de desenvolvimento e a 7ª de avaliação final (nível-meta 3, proficiência). Toda semana traz dois conteúdos curtos e um desafio prático. Ao concluir, a jornada seguinte começa sozinha na próxima competência; duas competências são duas jornadas em sequência. Quem precisa de 14 semanas faz duas Jornadas encadeadas, em sequência.
  - **Programa de 14 semanas (DUO e single)**: deixou de ser oferecido em 03/10/2026. As trilhas de 14 semanas já em andamento seguem como estão, até o fim.
  - **Vertho Onboarding**: 10 semanas em espiral cobrindo 5 competências (nível-meta 2, autonomia supervisionada), para recém-formados. Configurado na plataforma, ainda sem turma em produção.
  - **Personalizado**: uma Jornada de duração ajustável, de 1 a 6 semanas de desenvolvimento por competência, 1 ou 2 competências em sequência, com ou sem fechamento. Regras de programa completo: relatório com nível e avanço (quando há fechamento) e certificado com carga horária proporcional à duração. Configurado na plataforma, ainda sem trilha em produção (seção 5.5).
  - **Piloto** (degustação de 2 semanas): deixou de ser oferecido em 03/10/2026. O motor segue servindo quem já está nele (seção 5.4).
- **Simuladores** *(set/2026, módulos contratados)*: **Simulador de vendas**, **Simulador de atendimento** e **Simulador de liderança**, com devolutiva por competência e evidência literal; e o **Mapeamento de liderança**, leitura do RH sobre quem está pronto para liderar (seção 6).

A plataforma está em **4 idiomas** (português do Brasil, português de Portugal, espanhol e inglês) e aceita **login por WhatsApp** para colaboradores sem e-mail, o que amplia o público alcançável (operação, chão de fábrica, recém-formados).

> ⛔ **Fora do ar desde 31/08/2026** (código e dados preservados, mas **não é capacidade do produto**; não usar em material comercial): *Pulso de Desenvolvimento*, *Seleção de pessoas*, *RadarEmpresas*, *RadarBett* e a página do *CONARH 52*. As seções 7, 9 e 13 guardam só o registro.
>
> **Ferramentas internas (não comercializadas):** *Radar Vertho*, inteligência pública educacional usada pelo time Vertho em `app.vertho.ai/radar`, que deixou de ser site público em 10/08/2026 (seção 8). *Portal do Representante*, canal dos RCs parceiros, parado desde jul/2026 (seção 14).

---

## 1. Mentor IA: para o colaborador

| Feature | O que é | Benefício |
|---|---|---|
| **Login sem senha** | Magic Link por e-mail, com senha tradicional opcional (Supabase Auth) | "Acesso direto pelo link. Sem mais um login pra esquecer." |
| **Login por WhatsApp** *(ago/2026)* | Colaborador **sem e-mail** recebe pelo WhatsApp oficial (template aprovado da Meta) um **link de acesso de uso único**, que abre no navegador do aparelho e já entra logado. Não há código para digitar | Alcança quem não tem ou não usa e-mail corporativo: operação, chão de fábrica, recém-formados. Ninguém fica de fora, e quem vive no celular entra pelo próprio WhatsApp. |
| **Plataforma em 4 idiomas** | pt-BR, pt-PT, es-ES e en-US; idioma definido por empresa e ajustável por colaborador (next-intl) | A mesma plataforma atende Brasil, Portugal, mercados hispânicos e de língua inglesa, sem versão paralela. |
| **Dashboard personalizado** | Hero, próximo passo, acesso rápido e KPIs pessoais | Foco no que importa hoje, sem se perder em menus. |
| **Mapeamento Comportamental (DISC natural)** | Instrumento focado no perfil natural: 8 rankings, 6 escolhas forçadas, preferências de aprendizagem, **vídeo de instruções** e relatório detalhado (16 competências naturais e insights executivos por IA). O antigo perfil adaptado foi retirado do mapeamento e dos relatórios | Autoconhecimento com uma leitura única e coerente, sem misturar comportamento espontâneo com contexto de trabalho. |
| **Mapeamento por cenário** | O colaborador lê um caso realista do próprio cargo e responde 4 perguntas abertas (situação, ação, raciocínio, análise). Uma IA avalia pela régua da competência e outra IA, de família diferente, audita a avaliação | Sem questionário Likert: a pessoa mostra como age num caso concreto, e a nota não depende de uma IA só. |
| **Votação de Competências** | Colaborador escolhe e ordena as 5 competências mais importantes entre as Top 10 do próprio cargo (a lista que a IA selecionou e o admin revisou) | Voz ativa no programa: quem é desenvolvido participa do mapeamento. |
| **PDI Personalizado** | Plano de Desenvolvimento Individual gerado por IA a partir do que a pessoa escreveu no cenário: resumo, plano de 30 dias (foco e ações, copiadas do plano da jornada), estudo recomendado. Todo PDI é conferido por uma 2ª IA de outra família, que aponta afirmação sem base nas respostas; o veredito (aprovado, alerta, reprovado) aparece no painel da equipe, com o trecho e o motivo, e o PDI pode ser regerado por pessoa. A pessoa lê o PDI na tela e baixa em PDF | Plano concreto e curto, focado em 30 dias, não "encheção de relatório", e que só diz sobre a pessoa o que as respostas dela mostram. |
| **Jornada de 7 semanas** | Por competência: 6 semanas de desenvolvimento (2 conteúdos curtos e 1 desafio aplicado por semana) e a 7ª de avaliação final. Cadência automática, com a semana liberada pelo calendário | Profundidade em uma competência de cada vez, com prática toda semana. |
| **Microconteúdos multi-formato** | O conteúdo da semana é produzido em até 4 formatos: vídeo (avatar apresentador HeyGen, cenas animadas Remotion e narração própria, entregue via Bunny), texto, podcast (áudio gerado por IA, masterizado com vinhetas de marca) e estudo de caso, mais o desafio. Cada pessoa recebe os **2 primeiros formatos** da ordem que marcou nas preferências de aprendizagem; quem não respondeu recebe texto e estudo de caso, e o vídeo só entra para quem o pôs entre os 2 primeiros. Kits gerados antes de 02/10/2026 seguem com todos os formatos | Aprende no formato que prefere, sem receber o que não pediu. |
| **Vídeos de microlearning personalizados** | Vídeo de 3 a 5 min gerado a partir do Módulo-Base: avatar apresentador na abertura e no fecho, cenas animadas no miolo (texto, ícones, comparações, passos, dados, frases), narração com voz própria e legendas. Roteiro por IA, avatar com lip-sync da narração e streaming adaptativo (240p a 1080p). Feito sob medida para a combinação **cargo × perfil comportamental (DISC dominante) × contexto da instituição** (PPP; em redes, a síntese das escolas) e reaproveitado por todos os colaboradores da mesma célula. Entra no kit de quem tem o vídeo entre os 2 formatos preferidos | Quem prefere vídeo recebe um que fala a língua do cargo dele, no tom do seu perfil e com a cara da instituição: produção em escala, sem gravação. |
| **PDF de conteúdo premium** | O conteúdo de texto e case vira uma **publicação editorial em PDF** (capa temática, diagramação por IA com box de síntese, cards, fluxos, comparativos e pull quotes), sem reescrever o conteúdo, só dando função visual a cada página | Material que parece guia visual de aprendizagem, não apostila: algo que o colaborador quer guardar e reler. |
| **Conteúdo personalizado (DISC + contexto)** | O mesmo PDF ganha 2 seções extras geradas por IA: "Para o seu perfil" (ancorada no arquétipo DISC do colaborador) e "No contexto da sua instituição" (ancorada no PPP; em redes, no que as escolas têm em comum). O núcleo curricular fica intacto | O conteúdo fala com o estilo da pessoa e com a realidade da instituição, em vez de material genérico. |
| **Tira-Dúvidas (chat reativo)** | Chat sobre o tema da semana, ancorado no material da competência e do cargo e nos documentos que a empresa carregou na base de conhecimento (regimentos, manuais, políticas) | Resposta na hora, contextualizada, sem sair da semana. |
| **Evidências Socráticas** | Conversa de 6 turnos por semana sobre os conteúdos e o desafio, com DISC, anti-alucinação e grounding | Treina pensamento crítico: a IA não dá respostas, faz perguntas que provocam reflexão. |
| **Desafio aplicado semanal** | Toda semana, uma tarefa para o dia a dia, relatada e aprofundada com a IA | Aprendizado aplicado, não teórico: vira tarefa real do dia a dia. |
| **Evidências das semanas no fechamento** | Na Jornada de 7 semanas, o que a pessoa registrou nas 6 semanas de desenvolvimento entra direto na avaliação final, junto com o cenário; essa avaliação já passa por uma 2ª IA e pela arguição. A leitura acumulada separada (1ª IA pontua descritor por descritor, cega para o ponto de partida, e 2ª IA audita) roda no Piloto e nas trilhas de 14 semanas ainda em andamento; no Onboarding, após cada missão integradora, roda uma leitura parcial só pela 1ª IA. Na Jornada, não roda | O resultado final não sai de uma resposta isolada: a trajetória das semanas pesa no fechamento. |
| **Avaliação final** | Cenário realista do cargo com 4 perguntas (situação, ação, raciocínio, autossensibilidade), seguido de uma **arguição**: a IA aprofunda a resposta por turnos (critério, robustez, limite reconhecido) e ajusta a leitura em até meio ponto por regra de código auditável. A devolutiva é escrita para o resultado final: o texto e o nível mostrado dizem o mesmo | Avaliação final em situação realista, comparável à inicial, e com sustentação ao vivo. |
| **Relatório de evolução** | Devolutiva, nível de cada competência (de onde partiu e aonde chegou), avanço por comportamento, momentos da jornada, desafios e próximos passos, em tela e PDF. Mostra nível e avanço, **nunca nota**, e não rotula queda como regressão | Resultado tangível e honesto: o colaborador leva o PDF e vê o próprio avanço. |
| **Histórico de jornadas** *(set/2026)* | Jornada → Ver histórico: as temporadas concluídas, com conteúdos e desafios em modo leitura, relatório, PDF e certificado de cada uma | O percurso fica com a pessoa enquanto a empresa mantiver o acesso. |
| **Certificado de Conclusão** *(jul/2026)* | PDF A4 no padrão de marca (selo, dupla assinatura, logo do tenant), emitido ao concluir a temporada com **participação ≥ 75%**, com carga horária proporcional à duração do programa (Jornada de 7 semanas = 24h; no Personalizado, pela duração escolhida, inclusive quando ele é configurado sem fechamento). O Piloto (degustação, descontinuado) **não** emite | Reconhecimento formal que a pessoa mostra e guarda, com critério explícito, não certificado de presença. |
| **Kit Semanal (conteúdo por perfil)** | O que a pessoa recebe na semana é montado pela combinação **competência × descritor × DISC**, resolvida na leitura, não no que está gravado. O kit produz até 4 formatos (texto, podcast, vídeo, estudo de caso) e a pessoa vê os 2 primeiros da preferência dela. O desafio tem a mesma ação e a mesma exigência para todos do tema; o perfil DISC muda a forma de executar e de registrar | Duas pessoas na mesma semana e no mesmo cargo podem receber formatos diferentes e um desafio com forma diferente, sob a mesma régua de cumprimento. |
| **BETO (tutor flutuante)** | Chat contextual em qualquer página do dashboard, **no idioma do colaborador**. Desde 22/09/2026 o Beto também atende no **WhatsApp** todo colaborador da empresa: acesso, recuperação de link e dúvidas de uso, passando para a equipe quando o assunto pede | Mentor permanente, na tela ou no WhatsApp, na língua da pessoa. |
| **Perfil + Avatar** | Foto ou avatar, dados de cadastro (e-mail, cargo, área, empresa), troca do idioma da plataforma e saída | Identidade reconhecida desde o primeiro acesso, e o idioma na mão da pessoa. |

---

## 2. Mentor IA: para o gestor

| Feature | O que é | Benefício |
|---|---|---|
| **Dashboard do Gestor** | Hub com KPIs da equipe e atalhos | Visão de líder em 1 tela, sem dashboards genéricos. |
| **Equipe: Evolução** | Lista de liderados com avanço e status (confirmada / parcial / estável), filtros e ordenação | Mostra quem precisa de atenção, sem planilha. |
| **Engajamento da equipe** *(set/2026)* | Acesso, consumo e evidência de cada liderado, pela etapa em que a pessoa está | O gestor vê quem precisa de apoio antes do fechamento. |
| **Detalhe do liderado + PDF da temporada** | Clique em cada liderado abre o detalhe da jornada dele: nível por competência, avanço comportamento a comportamento e a recomendação de acompanhamento. Quando a trilha está concluída, o gestor baixa o PDF de evolução da temporada daquela pessoa | Conversa de feedback embasada: chega com documento, não com "achismo". |
| **Relatório do Gestor (IA)** | Um relatório por gestor, sobre a própria equipe: leitura executiva, destaques e pontos de atenção por competência, perfil comportamental da equipe e ações sugeridas para esta semana, as próximas e o médio prazo. Aparece no painel do gestor e em PDF | Pauta pronta para as conversas de desenvolvimento com o time, com argumento de impacto e risco. |

---

## 3. Mentor IA: para o RH e a liderança

> **A Vertho opera, o RH acompanha.** As telas de operação das seções 3.1 e 3.2 e as de governança da 3.3 (log de auditoria, matriz de permissões, lixeira, lotes de IA, base de conhecimento e painéis internos) ficam no painel `/admin`, que só a equipe Vertho acessa: o RH do cliente não entra lá. O RH acompanha pelo próprio dashboard: central de relatórios, painel da equipe, engajamento, Ranking de Adequação ao Cargo e, quando contratados, o acompanhamento dos simuladores e o Mapeamento de liderança. Decisões como o Top 5 e o calendário são tomadas com o RH; quem as executa na plataforma é a Vertho.

### 3.1 Pipeline operacional por empresa (operado pela Vertho)
| Feature | O que é | Benefício |
|---|---|---|
| **Pipeline visual (Fases 0 a 5)** | Tela `/admin/empresas/{id}` com cada fase do programa e seu status | Operação inteira em 1 tela, sem dashboard fragmentado. |
| **Filtro por empresa persistente** | Header com seletor de empresa, salvo no navegador | Quem opera várias empresas não perde contexto ao navegar. |
| **Importação de colaboradores** | CSV/Excel com papel, área/departamento e ordenação por coluna | Cadastro em massa a partir da planilha do cliente, sem digitação manual. |
| **Turmas** *(ago/2026)* | Coortes dentro da mesma empresa, cada uma com configuração e etapas próprias | Ondas diferentes rodam em paralelo sem se misturar. |
| **Importação de cargos** | Planilha com a ficha de cada cargo: descrição, principais entregas, stakeholders, decisões recorrentes, tensões comuns, contexto e se é de liderança | A IA usa a ficha para escolher as competências do cargo e para montar cenários, conteúdos e kits com a cara do dia a dia de quem o ocupa. |
| **CRUD de Competências** | Por empresa, importável de uma base padrão (educação/corporativo) e por planilha (CSV/Excel) com títulos em português; os códigos de competência e descritor são gerados pelo sistema, e a mesma matriz pode ser usada em vários cargos | Não começa do zero: base pronta, customizável, e a matriz do cliente entra sem retrabalho de codificação. |
| **Top 10 + Top 5 + Gabarito** | A IA sugere o top 10 por cargo (com aderência cargo/mercado e motivo), o top 5 é fechado com o RH e a equipe Vertho gera o gabarito | Curadoria assistida: a IA prepara, o RH valida. |
| **Votação define o cenário** | A competência aprovada na votação dos colaboradores entra direto na geração de cenário, mesmo que não estivesse no Top 10 da IA | A voz da equipe vira avaliação de verdade, sem ficar presa a um pré-filtro. |
| **Banco de Cenários** | A IA gera cenários situacionais e uma 2ª IA checa | Cenários realistas, validados, sem o RH inventar caso a caso. |
| **Prontidão do Personalizado (e do Piloto)** | Checagem antes de liberar, em `/admin/temporadas`: por colaborador em Personalizado (ou no Piloto, para quem ainda está nele), valida o formato-core dos comportamentos que a geração vai trabalhar, o mapeamento das duas competências quando o Personalizado tem duas, e o Cenário B do cargo quando há fechamento; bloqueadores explícitos, opcionais degradam | Nenhum programa começa com semana vazia, fechamento quebrado ou segunda competência sem mapeamento. |
| **Cenários por escola (PPP local)** | Em redes com várias unidades, gera **um cenário por escola**, cada um ancorado no PPP daquela instituição. O colaborador é avaliado no cenário da SUA escola (com cenário de rede quando a escola não tem PPP) | Avaliação contextualizada: o gestor de uma escola quilombola ou de EJA responde a um caso da realidade dele, não a um genérico. |
| **Envios em massa (WhatsApp + e-mail)** | WhatsApp pela API oficial da Meta, com templates aprovados, status real de entrega e fila; e-mail pela Amazon SES, com registro de entrega, devolução e reclamação. Ao escolher um template, o servidor calcula o público correto pelos dados da jornada; cargo, votação, DISC e mapeamento ficam como refinamentos opcionais. A prévia mostra escopo, elegíveis, refinados, repetidos e lote final | Comunicação operacional em escala sem precisar adivinhar combinações de filtros, e sem a prévia divergir do disparo. |
| **Links de acesso em lote pelo WhatsApp** *(set/2026)* | Gera um link de acesso pessoal para cada colaborador do filtro e envia pelo template oficial da Meta, com o link num botão. O link abre no navegador do aparelho (Safari no iPhone, o navegador padrão no Android) e a pessoa já entra logada | Onboarding sem fricção: recebe, toca e está dentro, sem senha, e o login fica no navegador em que ela volta depois. |
| **Confirmação em ações de risco** | Ações em lote ou destrutivas pedem confirmação com nível de risco e escopo visível (itens, custo de IA); exclusão irreversível exige digitar o nome | Reduz erro humano: um clique acidental não derruba o programa. |

### 3.2 Branding e configuração por tenant (operado pela Vertho)
| Feature | O que é | Benefício |
|---|---|---|
| **Subdomínio próprio** | `{empresa}.vertho.ai` com isolamento de dados por `empresa_id` | Identidade própria: não é "mais uma plataforma da Vertho". |
| **Branding completo** | Logo, 7 cores, cor da fonte, subtítulo de login, esconder elementos e renomear labels (`ui_config`) | A plataforma "veste" a empresa cliente, do login ao dashboard. |
| **Puxar cores do site do cliente** *(jul/2026)* | Cola-se a URL do site da empresa: o sistema busca a página (com guarda anti-SSRF), a IA mapeia a paleta nos 7 slots da plataforma e o **contraste é garantido em código**, não pela IA | Branding a partir do próprio site do cliente, sem risco de sair um tema ilegível. |
| **Vincular ao Vercel** | Botão no painel para registrar o subdomínio | O subdomínio é registrado pelo próprio painel, sem ticket para o time de TI do cliente. |
| **Configuração por tenant** | `sys_config`: modelo de IA preferido, cadência, parâmetros de envio | Cada empresa ajusta o programa ao seu ritmo. |
| **Programa por colaborador** | Em Configurações → Equipe, cada pessoa pode ter formato próprio (Jornada, Onboarding, Personalizado), herdando o padrão da empresa; a trilha gerada carrega o **carimbo** do formato, e trocar o padrão não afeta trilha em andamento (inclusive as de 14 semanas que já existiam). Quem já estava gravado num formato que saiu da escolha (programa de 14 semanas, Piloto) o vê rotulado como descontinuado, e ele segue valendo até alguém escolher outro | Novatos em onboarding, veteranos na jornada e um programa sob medida, no MESMO tenant, sem empresa paralela. |

### 3.3 Relatórios e analytics
| Feature | O que é | Benefício |
|---|---|---|
| **Central de relatórios do RH** | Em Relatórios, no dashboard do RH: o painel de evolução da turma (com recorte por turma) e os documentos do programa num lugar só: Relatório RH consolidado, Perfil Organizacional, DNA Organizacional, PDF executivo de fim de jornada, o Relatório do Gestor de cada gestor e o PDI de cada pessoa | Os documentos do programa ficam com o cliente, sem pedir arquivo por e-mail. |
| **Relatório RH consolidado** | Por empresa, gerado por IA a partir dos mapeamentos: resumo executivo, visão por cargo, competências críticas, competência foco por cargo, perfil comportamental coletivo (força e risco) e plano de ação. Na central do RH, em tela e PDF | Briefing executivo para a diretoria, gerado por IA. |
| **Perfil Organizacional e DNA Organizacional** | Dois PDFs da empresa inteira na central do RH: o Perfil Organizacional agrega o mapeamento comportamental (DISC) de todos, calculado sem IA; o DNA Organizacional (Retrato de Competências) agrega o mapeamento de competências, com narrativa por IA | Retrato da empresa inteira para a diretoria, comportamento e competência lado a lado. |
| **PDF executivo de fim de jornada** *(set/2026)* | PDF para o RH levar à reunião, montado por cargo e no recorte de turma que está na tela: panorama da turma, onde o grupo mais avançou por competência, comportamento por comportamento, pessoa por pessoa e próximos passos (candidatos ao próximo ciclo, conversas a ter primeiro, quem pode multiplicar). O número de páginas depende do tamanho da turma | O RH leva a evolução da turma para a diretoria num documento só. |
| **Ranking de Adequação ao Cargo** | Para cada cargo com perfil ideal definido pela Vertho, o RH vê, em Ranking de adequação, a aderência do perfil comportamental de cada pessoa ao perfil ideal do cargo, em faixas (recomendado, com ressalvas, abaixo do corte), com os requisitos eliminatórios do cargo listados à parte; tela e PDF. É apoio à decisão: não é nota de desempenho nem seleção, e filtrar ou ordenar não escolhe nem elimina ninguém. Com cuidado: os blocos da aderência derivam do mesmo perfil comportamental, então o ranking distingue famílias de cargo diferentes, não cargos vizinhos | Mostra onde o perfil de cada pessoa encaixa no cargo e onde diverge, como insumo para a conversa de desenvolvimento. |
| **Knowledge Base (RAG)** | Upload de PDF/DOCX/TXT/MD (até 4 MB), seed inicial e prévia da busca | A IA fala "como sua empresa fala": usa manuais, regimentos e políticas internas. |
| **Registro de uso de IA** | Cada chamada que passa pelo cliente central de IA grava tarefa, modelo, tokens e custo | Custo de IA rastreável por tarefa, base do preço. |
| **Log de auditoria de admin** | `admin_audit_log` registra quem, o quê, qual empresa, resultado e IP das ações sensíveis: disparos, exclusões, permissões, limpeza de dados, restauração e esvaziamento da lixeira e senha de teste. A tela `/admin/auditoria` filtra. Se a gravação de um registro falhar, a falha vai para o monitoramento de erros | Governança real: as ações sensíveis do admin ficam rastreáveis, sem depender de log de servidor. |
| **Matriz de papéis e permissões** | Console `/admin/permissoes`: 5 papéis × 30 permissões nomeadas, com overrides auditáveis por papel ou usuário (motivo obrigatório). As ações de escrita checam a permissão do domínio | Controle de acesso granular e explícito, com cada exceção registrada e justificada. |
| **Admin Sócio (papel interno da Vertho)** | Papel de administrador da plataforma abaixo do Master, para os sócios da Vertho. No papel base, vê empresas, usuários, relatórios, auditoria, custos de IA e o canal comercial, e pode exportar; não tem permissão para gerenciar empresas, usuários, conteúdo ou permissões, disparar avaliações nem regerar IA. As permissões são configuráveis pela matriz (overrides por papel ou usuário), então o que um Sócio faz depende da configuração vigente (em 03/10/2026, o papel tinha permissões extras concedidas em produção). Não é papel para parceiros externos nem para o cliente: ele lê custo de IA, orçamento com margem e comissões | Visão ampla do painel para os sócios da Vertho. |
| **Lixeira** | Interna da Vertho (`/admin/lixeira`): a limpeza de registros do admin, por empresa ou por pessoa, copia as linhas para a lixeira antes de apagar, e a equipe Vertho as restaura; só sai da lixeira o que voltou para a tabela de origem. Os itens ficam lá até alguém esvaziar os que têm mais de 30 dias. Zerar campos e limpar os mapeamentos, os Cenários B e as sessões de reavaliação apagam direto, sem passar pela lixeira | Limpeza de dados com volta: um erro de operação da Vertho se desfaz sem depender de backup. |
| **Engajamento da trilha (telemetria)** *(jul-set/2026)* | Para o RH, em Engajamento no próprio dashboard (`/dashboard/gestor/engajamento`), com abas **Visão atual** e **Evolução semanal**: trilha visual de acesso → consumo → evidência, etapa individual separada do calendário da turma, trajetórias, recuperados, heatmap por área e leitura por coordenação ou por pessoa. O relatório de engajamento traz prioridades, ações sugeridas e leitura por cargo, em tela e PDF. A equipe Vertho vê o mesmo painel por empresa em `/admin/engajamento` | Distingue "recebeu" de "engajou", e "a turma chegou à semana N" de "esta pessoa concluiu até N−1": o RH identifica pendências reais sem perder contexto. |
| **Índice operacional transparente** | Ativação 20 + consumo 30 + evidência 40 + Tira-Dúvidas 10; o denominador longitudinal considera quem chegou à semana pelo calendário da cadência, enquanto a etapa individual usa conclusão sequencial | Acompanha o sinal da coorte e a pendência da pessoa com réguas distintas e explicáveis, sem vender o indicador como nota, competência ou desempenho individual. |
| **Lotes de IA em segundo plano** *(jul/2026)* | Geração em massa (cenários, conteúdo, gabaritos) sai do clique-e-espera: enfileira, mostra progresso e pode ser **parada** no meio. O modo "em lote" usa a Batch API (**−50% de custo**) quando o resultado não é urgente | Operação de IA não trava a tela nem a conta, e dá para abortar antes de gastar. |
| **Painéis Admin Vertho (internos)** | Evidências, Avaliação Acumulada, Auditoria do fechamento, Módulos-Base, Custos de IA e Orçamento comercial | O time Vertho audita e regera avaliações, acompanha o custo real e projetado e monta o orçamento. |
| **Saúde da operação** | Verificações automáticas antes e depois de cada envio e das próximas semanas de conteúdo | Problema pego antes de chegar ao colaborador. |

---

## 4. Diferenciais técnicos (selling points "sob o capô")

| Feature | O que é | Benefício |
|---|---|---|
| **Multi-tenant nativo** | Isolamento por `empresa_id` feito no código: filtro de tenant injetado nas consultas a dados de cliente (`tenantDb`), tenant da sessão conferido em cada ação (o navegador não escolhe a empresa) e **guards de CI que reprovam o build** se uma leitura ou escrita escapar do filtro. Mais guard de admin centralizado e log de auditoria | Isolamento **verificado a cada commit**, não prometido em slide. |
| **4 idiomas (i18n)** | next-intl com pt-BR, pt-PT, es-ES e en-US, com as mesmas chaves nos quatro; idioma por empresa e por colaborador | Pronta para Brasil, Portugal, mercados hispânicos e de língua inglesa, sem fork de produto. |
| **Dual-IA (validação cruzada)** | No mapeamento por cenário (inicial e de fechamento, com a avaliação e a auditoria), no PDI e na geração de cenários, uma 1ª IA gera e uma 2ª IA, por padrão de outra família de modelos, audita. Nos simuladores não há 2ª IA: cada nível exige a fala literal da pessoa, conferida por código, e uma regra de cobertura mínima de comportamentos observados | Onde a IA lê e escreve sobre a pessoa, há uma segunda leitura independente; no treino dos simuladores, a prova é a frase da própria pessoa. |
| **Régua de 4 níveis, relatório sem nota** | Cada comportamento é avaliado de N1 a N4. O relatório mostra nível e avanço, nunca a nota, e não rotula queda como regressão. Evolução "parcial" exige +0,2 e "confirmada" exige +0,5 | Ruído de medição não vira afirmação sobre a pessoa. |
| **Evolução medida pela mesma régua** | Compara o cenário inicial com o final pela mesma régua de 4 níveis; no fechamento, a leitura final cruza o cenário com as evidências registradas nas semanas e passa pela auditoria da 2ª IA | O antes e depois usa a mesma régua, e o resultado final não depende de uma resposta isolada. |
| **RAG por empresa** | Voyage 4 large (1024d), pgvector e busca híbrida (FTS PT-BR + semântica via RRF) sobre os documentos que a empresa carrega; sem reranker | IA contextualizada à empresa no Tira-Dúvidas, Evidências, feedback da Missão Prática e relatórios de Gestor/RH. |
| **Contexto por escola e por rede** | Em redes com várias unidades, o cenário usa o PPP da escola do colaborador (com o de rede como alternativa); o conteúdo personalizado usa a síntese pedagógica da rede | Cada unidade é avaliada na própria realidade, sem um molde único da rede. |
| **Minimização de dados pessoais** | Nas conversas da jornada, no Tira-Dúvidas, na arguição, na avaliação final, no mapeamento de competências e na auditoria dele, no PDI, na avaliação das práticas, no Beto e no Simulador de vendas, o nome e os contatos da própria pessoa viram um identificador antes de ir à IA externa, e o nome volta só no texto que ela lê. Seguem com nome, por desenho, os relatórios do gestor e do RH, o relatório e a devolutiva em áudio do perfil comportamental, o plano de desenvolvimento e a saudação dos vídeos; áudio vai como áudio. O fluxo por provedor está documentado para o DPO do cliente (`docs/FLUXO-DE-DADOS-PESSOAIS.md`) | Transparência de LGPD: o cliente sabe o que vai para cada provedor. |
| **Scrub de PII no Sentry** | `lib/sentry-scrub-pii.ts` remove e-mail, telefone, CPF e credenciais de URL (como o token do link de acesso) dos erros antes de enviá-los. Nome em texto livre não é detectado | Observabilidade sem expor os contatos de quem usa a plataforma. |
| **Filas e tarefas de fundo** | Envios e cadência em fila (QStash); geração pesada (vídeo, kits, lotes de IA) em tarefas de fundo com retentativa (Trigger.dev) e na Batch API | O sistema não trava em operação pesada. |
| **Cadência por calendário** | Trilhas usam data de início e liberação por semana: a semana só "abre" no dia certo, e a cadência respeita feriado nacional | Evita "speedrun": o colaborador respeita o ritmo do desenvolvimento. |
| **Painel de custo de IA (interno)** | Custo real, projeções e catálogo de modelos com cenários de troca | Preço apoiado em custo medido; a proposta sai do painel de orçamento. |

---

## 5. Formatos de programa: Onboarding, Piloto e Personalizado

> Mesmo motor do Mentor IA em configurações diferentes. Não são produtos separados: são *formatos* da plataforma, ativáveis por empresa **ou por colaborador** (dá para misturar no mesmo tenant). Uso medido em 22/09/2026: das trilhas geradas, a grande maioria é Jornada de 7 semanas; Onboarding e Personalizado não têm trilha em produção, e o Piloto só rodou no teste de ponta a ponta (tenant de demonstração ACME, 1 colaborador). O programa de 14 semanas (DUO e single) deixou de ser oferecido em 03/10/2026: quem precisa de 14 semanas faz duas Jornadas encadeadas, em sequência, e as trilhas de 14 semanas já em andamento seguem como estão. Na mesma data o Piloto (degustação de 2 semanas) também saiu da escolha, e o Personalizado passou a ser programa completo, de duração ajustável. A escolha oferecida hoje é Jornada, Onboarding ou Personalizado.

### 5.1 Como os formatos diferem

| Dimensão | Jornada Vertho (padrão) | Vertho Onboarding |
|---|---|---|
| Duração | **7 semanas** (6 de desenvolvimento e fechamento na 7ª) | **10 semanas** |
| Competências | **1 por jornada**; duas competências = duas jornadas em sequência (14 semanas = duas Jornadas encadeadas) | **5 em espiral** |
| Meta de proficiência | Nível 3 (proficiente) | **Nível 2 (autonomia supervisionada)** |
| Cadência | 2 conteúdos e 1 desafio por semana | **Calibragem, fundamentos pareados e 3 missões integradoras** |
| Acompanhamento | Gestor e RH | Gestor e RH |
| Preço | Por projeto, parcelado por ciclo (`docs/ORCAMENTO.md`) | A definir |

Programas de outra duração, de 1 a 6 semanas de desenvolvimento por competência, com 1 ou 2 competências em sequência, ficam no Personalizado (5.5).

### 5.2 Features específicas do Onboarding

> Configurado e testado na plataforma, **ainda sem turma em produção**.

| Feature | O que é | Benefício |
|---|---|---|
| **Trilha de 10 semanas em espiral** | Semana 1 = calibragem; semanas 2, 3, 5, 6 e 8 = fundamento de cada uma das 5 competências; semanas 4, 7 e 9 = missões integradoras; semana 10 = cenário final e relatório | Desenho: levar o recém-formado de "saiu da faculdade" a "consigo executar com supervisão", sem queimar etapas. Resultado ainda não medido, porque não houve turma. |
| **Missões integradoras multi-competência** | A semana 4 cobre as competências 1 e 2; a semana 7, as competências 3 e 4; a semana 9 é cumulativa e cobre as cinco. A IA monta cenários onde as competências precisam ser exercidas juntas | Aprendizado coerente com a realidade do trabalho, onde nada acontece em silos. |
| **IA de competências com viés por fase de carreira** | Configurável: `junior` prioriza competências operacionais e básicas; `senior` prioriza estratégicas e relacionais; `pleno` ou sem viés = comportamento padrão | Ranking de competências sintonizado com o momento da carreira. |
| **Acumulada parcial automática nas missões** | Após cada missão integradora (4, 7 e 9), a 1ª IA roda a leitura acumulada cobrindo só as competências daquela janela, em segundo plano; essa leitura parcial não passa pela auditoria da 2ª IA | Desenho: gestor e RH recebem leitura intermediária do progresso sem esperar 10 semanas. |
| **Régua nível-meta 2 (autonomia)** | As avaliações usam N2 como meta em vez de N3. Aprovação = todas as competências ≥ 2,0 | Critério calibrado à realidade do recém-formado, não ao nível esperado de um sênior. |
| **Cenário final na semana 10** | Wizard final com 4 perguntas (situação, ação, raciocínio, autossensibilidade) cobrindo as 5 competências | Avaliação consolidada da formação, em situação realista do cargo. |
| **Liga por empresa E por colaborador** | O admin define o padrão na aba "Programa" e pode sobrescrever por pessoa em Configurações → Equipe. O Top 5 padrão vem de `competencias_onboarding` ou do top 5 do cargo | Novatos em onboarding sem tirar os veteranos da Jornada. |

### 5.3 Mensagens-chave do Onboarding (síntese para copy)

> **Não usar até a primeira turma.** O Onboarding nunca rodou com cliente: as frases abaixo descrevem o desenho do programa, não um resultado.

1. **"Um programa de 10 semanas desenhado para levar da diplomação à autonomia supervisionada."**
2. **"5 competências essenciais, exercidas juntas, como no trabalho real."**
3. **"Nível-meta calibrado para quem está começando: autonomia supervisionada, não excelência sênior."**
4. **"Sem produto separado: é a mesma plataforma de desenvolvimento, em modo recém-formado."**

### 5.4 Modo Piloto (descontinuado em 03/10/2026)

> ⛔ **Não é mais oferecido** ("não temos mais degustação de jornada", decisão do dono em 03/10/2026). Saiu da tela de escolha e o servidor recusa gravá-lo de novo; o motor segue servindo as trilhas já carimbadas como piloto e quem está gravado nele. A seção abaixo descreve o desenho, não algo à venda: programa de outra duração é o Personalizado (5.5), e a degustação de um lead é a guiada (5.6).
>
> O cliente vive a jornada **completa** em 2 semanas, no próprio tenant: mapeamento integral (DISC, mapeamento de competências, DNA, Fit), conteúdo personalizado e fechamento com cenário e avaliação por dupla IA. O objetivo é demonstrar o MÉTODO, não a evolução: 2 semanas não medem desenvolvimento, e o produto é honesto quanto a isso. Testado de ponta a ponta em jul/2026 no tenant de demonstração (ACME, 1 colaborador); ainda não rodou com cliente. Doc técnico: `docs/MODO-PILOTO.md`. Para a degustação comercial de um lead, ver 5.6.

| Feature | O que é | Benefício |
|---|---|---|
| **Trilha de 2 semanas, 4 conteúdos** | 2 conteúdos por semana, cada um sobre 1 descritor distinto (top-4 por gap do mapeamento), pelo mesmo motor de conteúdo | O cliente experimenta exatamente o produto real, nada de demo maquiada. |
| **Fechamento completo antecipado** | Cenário situacional do cargo, wizard de 4 perguntas e avaliação com auditoria por 2ª IA. Libera assim que os 2 conteúdos da semana 2 concluem | Em 2 semanas o cliente vê a peça mais impressionante do produto: a avaliação por IA. |
| **Arguição: defesa oral (2º instrumento)** | Depois das 4 perguntas escritas, a IA abre uma conversa por turnos que SONDA a resposta (critério, robustez sob variação, limite reconhecido) e ajusta a leitura em até meio ponto por regra de código auditável; a devolutiva é escrita para o resultado final. Ligada em todos os formatos (na Jornada, no fechamento da semana 7) | Triangulação de método: o que a resposta preparada esconde, a sustentação ao vivo revela. |
| **Trava de piso (honestidade estrutural)** | O nível mostrado no fechamento (nunca a nota) não fica abaixo do ponto de partida; a leitura bruta fica preservada com versão própria (`piloto-v1`), só para a auditoria interna, inconfundível com uma avaliação real | O piloto nunca "rebaixa" ninguém por falta de tempo de jornada, e o dado bruto continua auditável. |
| **Relatório sem falso delta** | Tela e PDF de conclusão em variante própria: competência como PONTO DE PARTIDA e fechamento como demonstração, sem "antes e depois" | Nenhuma promessa de evolução que 2 semanas não sustentam: credibilidade na venda. |
| **Conversão sem retrabalho** | Fechou? Troca o formato do colaborador e regenera a temporada: o mapeamento inteiro é reaproveitado no programa | O investimento do piloto vira o ponto de partida do programa real. |

**Mensagens-chave:** não usar. O Piloto não é mais oferecido.

### 5.5 Modo Personalizado: uma Jornada de duração ajustável *(out/2026)*

> Configurado na plataforma, ainda sem trilha em produção (03/10/2026). Desde 03/10/2026 é **programa completo**, com as regras da Jornada, e não degustação: sem trava de piso, relatório com nível e avanço quando há fechamento, certificado com carga horária proporcional. Até essa data era um builder de piloto (1 a 4 semanas, competências em paralelo, regras de degustação). Doc técnico: `docs/MODO-PILOTO.md`.

| Feature | O que é | Benefício |
|---|---|---|
| **Duração ajustável** | Na configuração do programa: **1 a 6 semanas de desenvolvimento por competência**. Cada semana é a da Jornada: 2 conteúdos curtos e 1 desafio prático, com os comportamentos escolhidos pela lacuna do mapeamento, como na Jornada (não precisa de um comportamento diferente por conteúdo) | O programa do tamanho que o cliente precisa, com a mesma semana do formato padrão. |
| **1 ou 2 competências, em sequência** | Cada competência é uma trilha própria; a segunda começa sozinha quando a primeira termina, como as Jornadas encadeadas. Com 2 competências e 6 semanas são 12 semanas de desenvolvimento, mais os fechamentos. A geração exige as duas competências definidas no cargo e mapeadas antes de começar; se não der, recusa e diz o que falta (nunca vira um programa de uma competência só sem aviso) | Duas competências sem paralelismo: profundidade em uma de cada vez, e nenhuma surpresa no meio do programa. |
| **Fechamento opcional** | A escolha vale para as duas competências. Com fechamento, a última semana de cada competência é a avaliação final da Jornada (cenário, arguição e 2ª IA) e o relatório traz nível e avanço. Sem fechamento, a trilha conclui ao terminar a última semana de desenvolvimento, e o relatório mostra o ponto de partida, dizendo que o avanço não foi medido | O cliente escolhe se quer a medição de chegada; quando não quer, o relatório não inventa avanço. |
| **Certificado** | Emitido em cada competência concluída, com participação ≥ 75%, e carga horária proporcional à duração (48h a cada 14 semanas: 6 semanas e o fechamento = 24h, como a Jornada) | Reconhecimento formal também no programa sob medida. |
| **Configuração congelada na trilha** | A configuração vai para a própria trilha na geração, inclusive a ordem das duas competências; a cadência automática para no fim do plano | Mexer no padrão da empresa **não** altera programa em andamento, nem a segunda competência de quem já começou. |
| **Mesmo motor, mesmos artefatos** | Reaproveita conteúdo, kit, cenário, arguição e relatório da Jornada; só a duração e o número de competências mudam | O cliente vê o produto completo, na duração escolhida. |

### 5.6 Degustação guiada *(set/2026)*

> É a degustação que o comercial usa hoje com um lead, no ambiente de demonstração, e não no tenant do cliente. Doc técnico: `docs/AMBIENTE-DEMO.md`.

| Feature | O que é | Benefício |
|---|---|---|
| **Um convite, três olhares** | O lead recebe um link só e percorre a plataforma pelos olhos do RH, do gestor e do colaborador, num ambiente já preenchido com uma empresa fictícia coerente | O lead entende o produto inteiro numa visita só, na ordem em que ele será usado. |
| **O próprio perfil, se quiser** | O lead pode fazer o próprio mapeamento comportamental e responder a uma competência; a análise fica pronta enquanto ele navega | A degustação fala dele, não só da empresa fictícia. |
| **Acesso por 10 dias** | O convite vale 10 dias. Plano de desenvolvimento, temporada e reavaliação aparecem como "fora da degustação" | Tempo para mostrar a quem decide, sem prometer o que só o programa entrega. |

---

## 6. Simuladores e Mapeamento de liderança *(set/2026, módulos contratados)*

> Três simuladores em que a pessoa treina uma conversa difícil com um personagem simulado por IA e recebe devolutiva por competência, e um mapeamento de liderança por cenários. São **módulos contratados à parte do Mentor IA**, ligados por empresa, e não gravam no mapeamento de competências, no PDI nem na jornada do Mentor IA. O vendas e o atendimento são contratados cada um por si; o **Simulador de liderança vem junto com o Mapeamento de liderança**: é o mesmo módulo, com o mesmo cargo-alvo e a mesma população, e não se contrata separado do Mapeamento. Nomes que o cliente lê: "Simulador de vendas", "Simulador de atendimento", "Simulador de liderança" e "Mapeamento de liderança". Docs técnicos: `docs/SIMULADOR-VENDAS.md`, `docs/recepcao-medica.md` (atendimento), `docs/SIMULADOR-LIDERANCA.md` e `docs/simuladores-validacao.md`.

| Feature | O que é | Benefício |
|---|---|---|
| **Simulador de vendas (método PACE)** | A pessoa registra um plano antes da conversa e negocia com um cliente simulado (três graus de dificuldade), montado a partir da configuração comercial da empresa: produtos, público-alvo, diferenciais, preços, condições e desafios. A devolutiva usa a matriz PACE: Planejamento comercial, Preparar, Analisar, Co-criar e Engajar, 6 comportamentos cada, de N1 a N4, com recomendações ancoradas no manual da metodologia. Treinos sem limite de quantidade no prazo contratado (normalmente 90 dias), com um treino aberto por vez e até 6 inícios por hora por pessoa | Treino de venda com um cliente que objeta de verdade, tantas vezes quanto a pessoa quiser no prazo, e devolutiva que aponta o comportamento, não um "bom trabalho" genérico. |
| **Simulador de atendimento** | Atendimento a uma pessoa simulada com restrições e objeções concretas (quer encaixe, teme nova remarcação, pressiona por informação de terceiros, recusa a orientação). O segmento é configuração da empresa: recepção de clínica, atendimento geral, secretaria escolar ou loja. Há um catálogo pronto de casos de recepção de clínica; nos outros segmentos a empresa parte de um caso em branco ou de um rascunho por IA, e publica a própria versão. Matriz de 5 competências (acolhimento e condução sob pressão, compreensão da demanda, clareza e precisão, resolução e encaminhamento, procedimentos e proteção de informações) | Separa qualidade de atendimento de satisfação: sustentar um limite com respeito conta a favor, e prometer o que não pode não ganha ponto. |
| **Simulador de liderança** | Jornada de cinco encontros com a mesma equipe fictícia: a pessoa prepara a conversa, conversa com o liderado (investigar atrasos, delegar, dar feedback, negociar prioridades, ouvir feedback sobre si), registra a reflexão e recebe a devolutiva. Os acordos e as consequências de um encontro seguem para o próximo. Cada encontro avalia a competência em foco e duas secundárias; a síntese mostra, por competência, o primeiro nível e o maior nível demonstrado. Serve a líderes atuais e a futuros líderes | Pratica as conversas centrais da liderança com continuidade, como numa equipe real, e mostra o avanço entre a primeira tentativa e as seguintes. |
| **Mapeamento de liderança** | Um segundo mapeamento da pessoa, por cenários, com a matriz global de liderança (5 competências, 6 comportamentos cada, igual em todos os clientes, com variantes para gestor em exercício e para potencial sucessor). O RH lê uma matriz 2×2 que cruza o que a pessoa demonstrou com o perfil comportamental em relação ao cargo-alvo, com parecer por pessoa, evidências literais e PDF do parecer e do consolidado. Vem com o Simulador de liderança, para o mesmo cargo-alvo e a mesma população | Mostra quem está pronto, quem está pronto com custo e quem é potencial, com evidência da resposta, lida pela mesma matriz em todos os clientes. |
| **Devolutiva com evidência** | Nos três simuladores, cada nível vem com a fala do participante que o sustenta. A competência só recebe nível com comportamentos suficientes observados (4 no atendimento e na liderança; no vendas, dois terços dos avaliáveis, o que dá 3 de 4 em Engajar); sem oportunidade de observar, fica sem nível em vez de nota baixa. Citação que não confere com o que a pessoa disse é descartada, e a devolutiva diz isso ("Evidência descartada") em vez de fingir falta de oportunidade | Nada de nota inventada: o que não apareceu na conversa não pesa contra a pessoa. |
| **Acompanhamento da equipe** | RH (a empresa) e gestor (os liderados) veem quem treinou, o progresso e o nível por competência, e abrem a devolutiva de cada pessoa. A conversa completa, a preparação e a reflexão ficam com a pessoa | O gestor acompanha a evolução sem virar leitor da conversa privada de cada um. |
| **4 idiomas e celular** | Telas em pt-BR, pt-PT, es-ES e en-US, com o resultado primeiro no celular; ditado por voz pelo navegador no vendas e na liderança | Treino curto, que cabe no intervalo, no idioma da pessoa. |

**O que dizer com cuidado:** o que foi medido até aqui é formato, evidência e repetibilidade (em 19/09/2026, a mesma conversa avaliada duas vezes deu o mesmo nível em 15 de 15 comparações no vendas, 51 de 60 no atendimento e 23 de 30 na liderança). A comparação com a classificação independente de profissionais **ainda está pendente**: não chamar de avaliação psicométrica validada. Desde 22/09/2026 não há parecer humano sobre as devolutivas: RH e gestor leem, não revisam. Também não há 2ª IA nos simuladores (a dupla IA vale para o mapeamento, o PDI e os cenários do Mentor IA): o que sustenta cada nível é a fala literal da pessoa, conferida por código, e a regra de cobertura.

**Mensagens-chave:** *"Treine a conversa difícil antes que ela aconteça."* · *"Cada nível vem com a frase que o sustenta."* · *"O que não apareceu na conversa não vira nota baixa."*

---

## 7. Pulso de Desenvolvimento ⛔ *(fora do ar desde 31/08/2026)*

> ⛔ **Não é capacidade do produto. Não usar em material comercial.** Desligado em 31/08/2026 (`lib/blocos-offline.ts`): as tabelas de execução nunca tiveram resposta, e o único ciclo criado ficou em rascunho. O código está preservado e religar é decisão do dono.

Era um instrumento leve T0/T2 para ler se o ambiente favorece ou bloqueia o desenvolvimento: 12 perguntas Likert e 1 aberta em 6 dimensões, dashboard agregado com anonimato (n ≥ 7), classificação do texto aberto por dupla IA em 12 temas e PDFs executivo e complementar NR-1. As perguntas de contexto do antigo perfil adaptado tinham ido para o Pulso v2, e ficaram desligadas junto com ele. Desenho completo no histórico do git e em `docs/ARQUITETURA.md`.

---

## 8. Radar Vertho: inteligência pública educacional *(ferramenta interna)*

> **Uso interno do time Vertho, não é produto de cliente.** Desde 10/08/2026 `radar.vertho.ai` responde 301 para vertho.ai; o Radar vive em `app.vertho.ai/radar`, só para administradores da plataforma, sem indexação nem captura de lead.

Consolida a base pública do MEC (Saeb, Ideb, ENEM, SARESP para escolas de SP, FUNDEB, PDDE, Censo com matrículas e microdados de docentes) em páginas por escola, município, rede e estado, comparador de até 4 escolas, busca avançada, benchmarks oficiais e narrativa por IA com cache. Serve à preparação de conversas comerciais com redes de ensino.

---

## 9. Radar Bett ⛔ *(descontinuado)*

> ⛔ Site do Bett Brasil 2026, encerrado depois do evento. `radarbett.vertho.ai` redireciona (301) para vertho.ai, e o bloco está fora do ar desde 31/08/2026. Registro histórico: **não usar em material comercial novo.**

---

## 10. Operação e suporte

| Feature | O que é | Benefício |
|---|---|---|
| **Backup diário automático dos dados** | Cópia diária das tabelas críticas, com checagem de integridade (esperado × exportado por tabela) e retenção de 7 dias | Dados protegidos sem ação manual. |
| **Smoke test a cada deploy** | 36 checagens em produção depois de cada deploy (29 páginas e 7 APIs), inclusive que página protegida não abre sem login | Quebra aparece em minutos, não pelo cliente. |
| **Guards e testes no CI** | Typecheck e milhares de testes unitários a cada commit, incluindo os guards de isolamento entre empresas; testes E2E (Playwright) de login, navegação e fluxos críticos | Refatoração sem medo: os testes guardam o fluxo e o isolamento. |
| **Sentry com PII Scrub** | Error tracking em tempo real; e-mail, telefone, CPF e credenciais de URL são removidos dos erros antes do envio | Bug detectado antes do cliente abrir chamado. |
| **Documentação interna viva** | `docs/ARQUITETURA.md` e os docs de cada área, mantidos junto com o código | Onboarding técnico em horas, não em semanas. |

---

## 11. Mensagens-chave (síntese para copy)

Para usar diretamente em hero, manchetes e materiais comerciais:

1. **"Mapeamento que mostra como a pessoa age, não o que ela marca num questionário."** Cenário realista do cargo, avaliado por uma IA e auditado por outra.
2. **"Do mapeamento ao desenvolvimento, uma competência a cada 7 semanas."** A plataforma fecha o ciclo, não só mede.
3. **"A IA fala como sua empresa fala."** Base de conhecimento por empresa, com os documentos dela.
4. **"No mapeamento, no PDI e nos cenários, uma segunda IA, de outra família, audita a primeira."** Nos simuladores, cada nível exige a fala literal da pessoa, conferida por código.
5. **"Plataforma que veste sua empresa, do login ao PDF."** Multi-tenant com branding completo.
6. **"Líder chega na conversa com documento, não com achismo."** Relatório do Gestor sobre a própria equipe e, ao fim da trilha, o PDF de evolução de cada liderado.
7. **"Veredito honesto: evolução parcial a partir de +0,2, confirmada a partir de +0,5, e ninguém é rotulado como regredido."**
8. **"Transparência de LGPD: o cliente sabe o que vai para cada provedor de IA."**
9. **"Conteúdo que fala com o seu perfil e com a sua instituição."** PDF premium personalizado por DISC e contexto, núcleo curricular intacto.
10. **"Cada escola avaliada na própria realidade."** Cenários gerados a partir do PPP de cada unidade da rede.
11. **"Treine a conversa difícil antes que ela aconteça."** Simuladores de vendas, atendimento e liderança, com evidência em cada nível.

---

## 12. O que NÃO falar (positioning trap)

Para a comunicação não soar genérica, marketeira ou prometer o que não existe:

- ❌ "Inteligência Artificial revolucionária" → ✅ "IA que avalia um cenário real do cargo, com a avaliação auditada por uma 2ª IA"
- ❌ "toda avaliação passa por duas IAs" ou "a decisão nunca sai de um único julgamento" → ✅ "dupla IA no mapeamento, no PDI e nos cenários; nos simuladores, cada nível exige a fala literal da pessoa"
- ❌ Admin Sócio como papel para parceiros ou clientes → ✅ não citar: é papel interno da Vertho
- ❌ "plataforma all-in-one" → ✅ "mapeamento + plano + jornada + avaliação, no mesmo lugar"
- ❌ "transforma vidas" → ✅ "leva o colaborador de 'sei o que precisa melhorar' a 'tenho um plano de 30 dias'"
- ❌ "líder do mercado" → ✅ "validado em produção com [cliente]"
- ❌ "altamente customizável" → ✅ "logo, 7 cores, labels e elementos visíveis configuráveis por empresa"
- ❌ Pulso, pesquisa de ambiente, Radar público, RadarEmpresas ou Seleção de pessoas como oferta → ✅ não citar: estão fora do ar ou são internos
- ❌ "dados pessoais nunca chegam à IA" → ✅ "fluxo de dados documentado por provedor; o nome vira identificador nas conversas, na avaliação final, no mapeamento, no PDI, no Beto e no Simulador de vendas, e os relatórios ao gestor e ao RH vão com nome e cargo"
- ❌ "avaliação psicométrica validada" (simuladores) → ✅ "devolutiva com evidência literal e regra de cobertura; validação com profissionais em andamento"
- ❌ "tutor que acompanha os tutorados" → ✅ não existe: o papel tutor foi extinto em 22/09/2026; quem acompanha é o gestor e o RH
- ❌ "nota de evolução" ou "regressão" → ✅ "nível e avanço por competência"

---

## 13. RadarEmpresas ⛔ *(fora do ar desde 31/08/2026)*

> ⛔ **Ferramenta interna desligada.** Nenhuma ingestão desde 16/05/2026 e o recurso de listas nunca foi usado. O acervo (cerca de 92 mil empresas) segue no banco; desligar a interface é reversível.

Era a inteligência comercial B2B que ranqueava empresas brasileiras por um Score de Oportunidade (Receita Federal, CAGED, RAIS, CEMPRE/SIDRA), com detecção de redes e franquias e listas de prospecção.

---

## 14. Portal do Representante: canal comercial dos RCs *(ferramenta interna)*

> **Uso interno dos Representantes Comerciais parceiros, não é produto de cliente.** Canal autônomo em `/representante`, fora do multi-tenant (isolado por `representante_id`; tabelas `sales_*`). **Parado desde jul/2026** (não desligado): a última oportunidade é de 06/07/2026.

Dá ao RC um funil próprio de ponta a ponta: registra e qualifica oportunidades (score 0-100, **proteção de 90 dias** a partir do registro ou aceite), acompanha o pipeline por estágio e gera **propostas comerciais** que passam por **aprovação da Vertho** antes de ir ao cliente. Curadoria e visão consolidada em `/admin/comercial`. Propostas também saem direto do deal desk da Vertho, sem RC e sem comissão.

| Capacidade | O que entrega |
|---|---|
| **Funil de oportunidades** | Registro e qualificação com score 0-100, proteção de 90 dias, pipeline por estágio e KPIs (qualificado = score ≥ 70). |
| **Proposta comercial** | Documento público (`/proposta/[token]`) e PDF em tema claro da marca: capa sem preço, escopo antes do investimento, números do programa, seção de simuladores incluídos, **investimento total em destaque** com parcela e valor por participante, e aceite pelo próprio link. |
| **Versionamento** | De uma proposta enviada ou aprovada, o RC gera uma **nova versão** ajustada (`-Rn`) que reentra no fluxo de aprovação; a original vira "Substituída". |
| **Aprovação Vertho** | Nada vai ao cliente sem curadoria interna (`/admin/comercial`); comissão por tipo (aquisição 9% · recorrente 12% · renovação 6%). |
| **Ambiente de demo** | `/representante/demo` e o tenant `acme-demo` com personas prontas para a demonstração. |

Docs: `docs/PORTAL-REPRESENTANTE.md` (canal e proposta) · `docs/ORCAMENTO.md` (preço) · `docs/AMBIENTE-DEMO.md` (demo).

---

*Inventário conferido contra o código-fonte. Sempre que entrar feature nova, atualizar aqui antes de virar copy de site.*

> **Novidades 26/05 a 01/06/2026:** PDF de conteúdo premium (publicação editorial diagramada por IA) e personalização por DISC e PPP; cenários de avaliação por escola (PPP local); votação define o cenário (sem pré-filtro Top 10); papel interno **Admin Sócio** e matriz de permissões checada nas ações de escrita; Beto no idioma do colaborador; podcast e vídeo de conteúdo gerados por IA com produção de marca.
>
> **Novidades 10/06/2026:** **gerador de vídeos de microlearning personalizados**, com avatar apresentador (HeyGen), cenas animadas (Remotion), narração própria e legendas, feito sob medida por cargo × perfil DISC × contexto e reaproveitado por célula.
>
> **Novidades 20 a 28/07/2026:** **Modo Personalizado** (5.5). **Certificado de Conclusão** com critério de participação ≥ 75%. **Puxar cores do site do cliente** no branding. **Engajamento da trilha** com a aba **Evolução semanal**. O **perfil adaptado saiu do mapeamento e dos relatórios**. **Lotes de IA em segundo plano** com Batch API (−50%) e botão de parar. Isolamento multi-tenant **verificado por guards no CI**.
>
> **Novidades de agosto/2026:** **Jornada de 7 semanas** e encadeamento automático da jornada seguinte (05/08); push como terceiro canal da cadência (06/08); **Turmas** com configuração por turma (13/08); **WhatsApp oficial (API da Meta)** com status real de entrega e caixa de entrada, e Termos e Política de Privacidade públicos (14/08); link de acesso pelo WhatsApp que abre no navegador (15 a 18/08); PDI sem a marca Vertho por empresa (17/08); relatórios gerenciais e visões de decisão para RH e gestor (25 a 30/08). Em 31/08, Pulso, Seleção, RadarEmpresas, RadarBett e CONARH saíram do ar.
>
> **Novidades de setembro/2026:** evolução sem veredito de regressão (01/09); engajamento da equipe na tela do gestor (02/09); vocabulário por empresa (03/09); cadência respeita feriado nacional (04/09); e-mail pela Amazon SES (08/09); PDF executivo de fim de jornada (09/09); relatório de engajamento com prioridades e leitura por cargo, e tutoriais em vídeo (10/09); **Simulador de vendas PACE** (13/09); proposta 2.0 com aceite no link e deal desk (14/09); nível por competência "N1 → N2" e número de WhatsApp por empresa (16/09); **Simulador de liderança** e relatório com fecho em 2ª pessoa e próximos passos (17/09); devolutiva escrita para a nota final (18/09); **Mapeamento de liderança** com esse nome, e os três simuladores com nome único (19/09); histórico de jornadas do colaborador e ficha do cargo nos geradores semanais (21/09); **Beto no WhatsApp** para todos os colaboradores, fim da revisão humana nos simuladores e fim do papel tutor (22/09); PDI escrito a partir das respostas da pessoa, com a auditoria por 2ª IA visível no painel e regerar por pessoa (25/09); revisão dos três simuladores: no atendimento, "praticar novamente" no mesmo degrau e segmento escolhido ao habilitar; no vendas, nota depois da pesquisa e comentários anônimos a partir de 5 respondentes; na liderança, rascunho salvo e a equipe sem o texto da preparação e da reflexão (28/09).
>
> **Novidades de outubro/2026:** formatos de programa (03/10): a escolha passa a ser Jornada, Onboarding ou **Personalizado**, que virou programa completo de duração ajustável (1 a 6 semanas por competência, 1 ou 2 competências em sequência, fechamento opcional, certificado proporcional); o programa de 14 semanas e o Piloto saem da escolha e seguem só para quem já está neles; empresa nova nasce na Jornada.
