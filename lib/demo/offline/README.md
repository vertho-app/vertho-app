# Painéis da apresentação offline

O pacote inclui as mesmas telas React do produto para:

- Coordenação/gestor: engajamento do time e evolução da equipe, com detalhes das jornadas concluídas.
- Direção/RH: engajamento da jornada, evolução semanal, relatório e adequação por cargo.
- PDFs de engajamento, ranking e das evoluções disponíveis para o gestor.

`panels-snapshot.json` guarda resultados dos leitores canônicos do produto,
congelados em `capturedAt`. A captura de 17/09/2026 consultou exclusivamente os
rosters fictícios de empresas marcadas como demo. IDs e contatos foram substituídos
por chaves locais. Quando não havia atividade (como a cadência escolar nesse
retrato), a tela mantém o estado vazio; não cria engajamento para a apresentação.

Os recortes por semana, função e área já estão calculados pela mesma régua online.
`panel-actions.ts` serve esses resultados, e `build-adapters.ts` liga os componentes
a essas leituras somente no bundle estático. Os filtros de busca, status e ordenação
seguem nos componentes originais. O pacote não usa autenticação nem consulta o banco.

Os PDFs em `documents/<ambiente>/` usam os templates canônicos do produto e entram
no manifesto com tamanho e SHA-256. Depois de atualizar os dados salvos, atualize
os PDFs correspondentes para manter a mesma leitura na tela e no documento.
`npm run build:demo-offline` apenas empacota os arquivos: não consulta rede ou banco.

O botão **Conferir pacote** foi removido. A verificação continua automática no
preparo e a cada abertura. Uma perda de arquivo faz o aviso de preparo reaparecer;
**Atualizar pacote** continua substituindo o conjunto completo de forma atômica.

Validação: `tests/unit/demo-offline-panels.test.ts` confere recortes, contagens,
identidades e PDFs; `scripts/verify-demo-offline-panels.mts` percorre as telas e os
leitores dentro do canário `scripts/verify-demo-offline.mts`, depois do reinício do
navegador sem conexão. Use também `--acme` para a sala empresarial.
