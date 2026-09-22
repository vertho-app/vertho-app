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
