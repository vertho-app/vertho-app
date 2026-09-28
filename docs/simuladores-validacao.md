# Simuladores: correções e validação de 19/09/2026

## Comportamento

- Vendas: evolução calculada no servidor sobre todas as sessões elegíveis, em páginas de 500. A navegação do histórico segue em páginas de 30. Apenas devolutivas liberadas pela pesquisa e nas réguas nativas 1–4 entram na evolução.
- Vendas e atendimento: a distribuição inclui pessoas com avaliação concluída inteiramente sem nível. Quem não treinou e quem só tem relatório legado não entra nesse denominador.
- Exportação de vendas: Planejar (PL) independe da existência da média geral.
- Liderança: competências do encontro com a exigência de quatro descritores; média geral concentrada na síntese da jornada (decisão do dono confirmada em 22/09/2026, com teste que impede a volta da média ao encontro). O schema enviado à IA exige a quantidade exata e os códigos da matriz do encontro, inclusive descritores sem oportunidade.
- Celular: resultado e próxima prática antes dos detalhes; conversa e contexto concluídos recolhidos. Pesquisa de experiência de vendas permanece obrigatória.
- Atendimento: a tela explicita a janela das 20 sessões recentes e que a geração pode levar alguns minutos.

## Revisão humana (removida em 22/09/2026)

Saiu dos três simuladores por decisão do dono: não há parecer, painel de pendências nem rota de registro. RH e gestor acompanham os resultados da equipe pelo papel, e a aba Simuladores de `/admin/cargos` diz só quem treina. As tabelas de revisão ficaram no banco sem escritor; a seção seguinte explica por quê.

## Banco

A migração 265 acrescenta contexto às revisões da liderança e inclui revisões de vendas/liderança nos snapshots e hashes de exclusão. A retenção de vendas leva as revisões para o backup e aguarda seis meses da revisão mais recente. Desde 22/09/2026 o app não escreve nessas tabelas nem depende da 265; elas só podem sair numa migração que reescreva essas funções.

O verificador scripts/verify-simuladores-revisoes-db.mts faz backup das funções e revisões, aplica a migração duas vezes dentro de uma transação e testa isolamento, alteração do hash, retenção, restauração e permissões. A transação de teste sempre é revertida. A opção --aplicar aplica a migração somente após os testes. Exige certificado do Supabase em SUPABASE_CA_CERT.

## Ensaio de IA

scripts/run-simuladores-calibracao.mts --executar executa chamadas pagas pelos wrappers oficiais do projeto. Carregar .env.local pelo Node. CALIBRACAO_SIMULADOR pode limitar a vendas, atendimento ou lideranca. São casos sintéticos em memória: não cria sessões de participantes. Cada entrada é avaliada duas vezes, com hash da entrada, tempo, saída e diagnósticos salvos em backups/calibracao-simuladores-*.

A qualidade pretendida dos roteiros (fraca, mediana, boa) não é um gabarito humano. A planilha revisao-humana.csv fica para classificação independente. A comparação com profissionais deve preceder afirmações de validade psicométrica; a medição automatizada verifica formato, evidência e repetibilidade.

Os cinco encontros de liderança e as duas variantes aparecem na amostra, com maior profundidade no primeiro encontro. Atendimento cobre os quatro segmentos com o mesmo problema administrativo sintético; não representa todas as situações de cada segmento. Os ensaios de liderança e vendas medem a primeira resposta do avaliador, antes do retry de produção; atendimento passa pelo encerramento real com suas retentativas limitadas.

## Resultado medido nesta entrega

- Suíte completa: 5.911 testes passaram; 67 opcionais ignorados, sem falhas.
- TypeScript e build de produção passaram. No worktree, a raiz temporária do Turbopack incluiu a junction de node_modules; next.config.mjs foi restaurado e não integra a alteração.
- Interfaces: vendas 37 verificações; atendimento 13; liderança com cinco encontros, repetição, retomada, revisão e celular. Quatro idiomas, sem erros de navegador. APIs fictícias, componentes e CSS reais.
- Migração 265: aplicação duas vezes, isolamento entre empresas, hash, retenção, restauração e permissões testados em transação revertida. Aplicação definitiva depende de confirmação específica.

| Ensaio final | Avaliações válidas / total | Níveis iguais por competência entre repetições | Tempo mediano |
| --- | --- | --- | --- |
| Vendas | 6/6 | 15/15 | 22 s |
| Atendimento | 24/24 | 51/60 | 69 s |
| Liderança com schema específico | 20/20 | 23/30 | 17 s |

As comparações incluem a passagem entre nível e ausência de nível. Entradas idênticas por hash. São amostras pequenas: estabilidade de nível não equivale a acerto pedagógico nem à igualdade das notas decimais ou das justificativas.

Na primeira rodada de liderança, 5 de 20 primeiras respostas foram rejeitadas: três por cobertura estrutural e duas por citação. A rodada posterior usou o schema com códigos e quantidade exatos, e completou as 20. Também ajustou os roteiros fraco/intermediário ao mínimo de três turnos; portanto não constitui experimento controlado para atribuir toda a melhoria ao schema. Mesmo sem falha final, a validação descartou nove descritores em cinco relatórios por evidência inválida; eles não receberam crédito. Não se afrouxaram as regras de evidência.

A prioridade pedagógica restante é revisar as transições entre ausência de oportunidade e nível baixo, sobretudo Clareza no atendimento e Priorização na liderança. Os arquivos CSV de revisão humana permanecem sem gabarito: dependem de classificação independente por profissionais. As conversas chamadas boas são intenções do roteiro, não referência validada de nível 4.

## Liderança: correções de 27/09/2026

Itens L-1 a L-14 da revisão de 27/09 (resumo em [SIMULADOR-LIDERANCA.md](SIMULADOR-LIDERANCA.md#correções-de-27092026)), sem migration e sem IA real. Cada defeito ganhou teste de regressão a partir da sonda da revisão, invertida, e cada teste foi conferido por mutação (a correção revertida localmente, o teste falhando, a correção restaurada). Medido no worktree `fix/sim-lideranca-20260927`, antes da integração:

- TypeScript sem erros; suíte completa com 6.701 testes aprovados (624 arquivos, 68 opcionais ignorados); recorte `simulador-lideranca simuladores prontidao-lideranca turmas demo tests/unit/security` com 1.430 aprovados.
- `node scripts/verify-lideranca-ui.mjs` com "UI OK", incluindo celular (390x844) e os quatro idiomas. As capturas foram conferidas uma a uma; o `toBeHidden` da síntese no fim da jornada virou o contrário, de propósito (L-9).
- Build de produção não rodado nesta etapa (fica para a integração).

## Vendas: correções da revisão de 27/09/2026

Itens V-1 a V-14 do plano da revisão (V-15, idioma da conversa, fica para ensaio real pago). O que mudou está em `docs/SIMULADOR-VENDAS.md`; aqui fica só a medição.

- Cada defeito ganhou teste que falha no código anterior (conferido por mutação, com o arquivo restaurado depois): tolerância de 24 h na consulta e na tela, comentários da pesquisa sem data e só a partir de 5 respondentes, resposta sem JSON, E5/E6 fora da cota de citação, uma nota por treino pace-4/pace-5 nas quatro saídas, rótulo de teste administrativo pelo dono, teto de 6 inícios por hora, Engajar em 3 de 4 (lendo os relatórios antigos com a regra que gravaram), aviso do moderador só no turno.
- Interfaces: `verify-pace-ui` com 43 verificações (eram 37), quatro idiomas, sem erros de navegador. O harness passou a usar as mesmas funções do serviço para histórico (`resumoPublico`), prazo (`acessoPeloPrazo`) e relatório da gestão; antes ele fotografava estados que a produção não produz.
- Suíte: filtro `simulador-vendas simuladores demo tests/unit/security` com 1.439 testes aprovados e 12 opcionais ignorados; suíte completa sem os ensaios `*-live*`, 6.669 aprovados e 16 ignorados. TypeScript sem erros. Build de produção não rodado nesta rodada.
- Migração 271 (rótulo de teste administrativo em `sim_vendas_exportar` e `owner_key` em `sim_vendas_historico_equipe`): só o arquivo; aplicação no deploy. O teste confere o texto SQL da definição vigente, não o banco.

## Correções da revisão de 27/09/2026 (comum aos três)

- **Evidência descartada não é falta de oportunidade (C-1).** Quando a competência fica sem nível e sem comportamento observado porque a citação de uma conduta avaliada não conferiu com a fala (`descartado` no descritor), o resumo da devolutiva comum (`components/simuladores/relatorio-competencias.tsx`) diz "Evidência descartada" (`SimuladoresRelatorio.discardedShort`, quatro idiomas), e não "Sem oportunidade de observar". Competência sem nenhuma conduta avaliada segue com o texto antigo. Teste: `tests/unit/simuladores-evidencia-descartada.test.ts`, pelo caminho real do atendimento (`consolidar` → adaptador → componente).
- **Atendimento:** as correções A-1 a A-16 da mesma revisão (degrau no Catálogo, "Praticar novamente", queda de rede, lotes da equipe, sessões abandonadas, orçamento do avaliador, projeções, segmento, relatório, celular, voz e textos por segmento) estão em `docs/recepcao-medica.md`, seção "Revisão de fluxo, UX e código (27/09/2026)". Duas peças novas servem aos outros simuladores: a opção `semRetentativa` de `callAI`/`callAIChat` (quem tem orçamento próprio de tentativas não recebe o retry nem o fallback do wrapper) e `tests/helpers/tabelas-em-memoria.ts` (tabelas em memória sobre o `criarSupabaseMock`, com filtros, `.or()`, ordem, limite e projeção por caminho JSON).
