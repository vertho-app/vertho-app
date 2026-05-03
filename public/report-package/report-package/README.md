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

// Claude API (modelo padrão da plataforma: Sonnet 4.6)
const response = await anthropic.messages.create({
  model: "claude-sonnet-4-6",
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

## Integração com a plataforma Vertho

No Vertho Mentor IA (Next.js + Supabase), a orquestração funciona assim:

1. **Trigger**: colaborador conclui o mapeamento DISC ou solicita o relatório no dashboard
2. **Supabase**: dados CIS já residem em `colaboradores` / tabela CIS multi-tenant (RLS por `empresa_id`)
3. **Server Action (`actions/relatorios.ts` + helpers em `lib/perfil-comportamental.ts`)**:
   - Monta o prompt com `buildBehavioralReportPrompt()` (também replicado em `lib/prompts/behavioral-report-prompt.js` para compat)
   - Chama Claude (Sonnet 4.6) via `actions/ai-client.ts::callAI` com `extractJSON`
   - Persiste o JSON validado em `relatorios`
4. **Frontend**: `/dashboard/perfil-comportamental/relatorio` renderiza `<BehavioralReport data={...} />`
5. **PDF**: gerado server-side via `@react-pdf/renderer` (componentes em `components/pdf/`); este pacote `html2pdf.js` é apenas para uso fora da plataforma

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
