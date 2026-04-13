# Relatório Comportamental — Template Package

## Estrutura
```
report-package/
├── types/
│   └── behavioral-report.ts    # TypeScript interfaces (CIS → LLM → Template)
├── components/
│   └── BehavioralReport.tsx     # React component (5 páginas, Tailwind)
├── prompts/
│   └── behavioral-report-prompt.ts  # Prompt builder para gerar textos via LLM
├── data/
│   └── sample-paola.ts         # Dados de teste (Paola de Souza Pissolato)
└── README.md
```

## Fluxo de Dados

```
CIS API → Dados brutos (CISRawData)
                ↓
        Prompt builder → LLM API (Claude/Gemini)
                ↓
        Textos interpretativos (LLMGeneratedTexts)
                ↓
        React Component (BehavioralReport)
                ↓
        Tela (renderização) + PDF (html-to-pdf)
```

## Como usar

### 1. Instalar dependências
O componente usa React + Tailwind. Certifique-se de que estão configurados no projeto.

### 2. Gerar textos via LLM
```typescript
import { buildBehavioralReportPrompt } from './prompts/behavioral-report-prompt';

const prompt = buildBehavioralReportPrompt(cisRawData);

// Claude API
const response = await anthropic.messages.create({
  model: "claude-sonnet-4-20250514",
  max_tokens: 2000,
  messages: [{ role: "user", content: prompt }]
});
const texts = JSON.parse(response.content[0].text);

// OU Gemini API
const result = await model.generateContent(prompt);
const texts = JSON.parse(result.response.text());
```

### 3. Renderizar o relatório
```tsx
import BehavioralReport from './components/BehavioralReport';

<BehavioralReport data={{ raw: cisRawData, texts: llmTexts }} />
```

### 4. Exportar PDF
```typescript
import html2pdf from 'html2pdf.js';

const element = document.getElementById('behavioral-report');
html2pdf().set({
  margin: 0,
  filename: `relatorio-${nome}.pdf`,
  image: { type: 'jpeg', quality: 0.98 },
  html2canvas: { scale: 2 },
  jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
  pagebreak: { mode: ['css'] }
}).from(element).save();
```

## Integração com Antigravity

No Antigravity, a orquestração funciona assim:

1. **Trigger**: usuário solicita relatório no dashboard
2. **Supabase**: busca dados CIS do colaborador
3. **Edge Function ou Antigravity Agent**: 
   - Monta o prompt com `buildBehavioralReportPrompt()`
   - Chama Claude/Gemini API
   - Parseia o JSON de resposta
4. **Frontend (Vercel)**: renderiza `<BehavioralReport data={...} />`
5. **PDF**: botão de download usa html2pdf.js no client-side

## Personalização

### Cores
As cores seguem a paleta Vertho:
- Navy: `#1C2E4A` (títulos, destaques)
- Teal: `#0D9488` (acentos)
- DISC: Red (D), Amber (I), Green (S), Teal (C)

### Páginas
- **Página 1**: Capa + explicação DISC + snapshot do perfil
- **Página 2**: 4 quadrantes DISC detalhados
- **Página 3**: Radar de competências + top 5 forças/desenvolvimento
- **Página 4**: Liderança (pizza) + Tipo Psicológico (barras)
- **Página 5**: Pontos a desenvolver (checklist) + Plano de Ação (3 perguntas)
