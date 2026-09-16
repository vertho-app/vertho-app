# Relatórios das apresentações offline

PDFs estáticos, exclusivamente dos dados fictícios de `schoolOfflineData()` e
`acmeOfflineData()`. Usam os mesmos componentes `RelatorioIndividual`,
`RelatorioGestor` e `RelatorioRH` da aplicação online.

Para atualizar conteúdo ou diagramação, execute na raiz do app:

```
node scripts/generate-demo-offline-documents.mts
npm run build:demo-offline
```

A regeneração dos PDFs precisa de internet para as fontes públicas dos componentes.
O build normal só copia estes arquivos e calcula os hashes; não consulta serviços
nem requer credenciais. Confira os documentos no leitor da apresentação antes de
publicar uma atualização.
