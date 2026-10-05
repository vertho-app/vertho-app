import { test, expect } from '@playwright/test';
import { build } from 'esbuild';
import path from 'node:path';

// Componente real com reconhecimento simulado: sem microfone, login ou banco.
let bundle: string;
test.beforeAll(async () => {
  const result = await build({
    stdin: {
      resolveDir: path.resolve(__dirname, '..'),
      loader: 'tsx',
      contents: `
        import React, { useRef, useState } from 'react';
        import { createRoot } from 'react-dom/client';
        import MicInput from './components/mic-input';
        const sessions = window.sessions = [];
        window.SpeechRecognition = window.webkitSpeechRecognition = class {
          constructor() { sessions.push(this); this.stops = 0; this.aborts = 0; }
          start() { this.started = true; }
          stop() { this.stops++; }
          abort() { this.aborts++; }
        };
        function App() {
          const mic = useRef(null);
          const [texts, setTexts] = useState(['Resposta digitada.', '']);
          const [step, setStep] = useState(0);
          const [disabled, setDisabled] = useState(false);
          return <>
            <MicInput key={step} ref={mic} value={texts[step]} disabled={disabled}
              onChange={text => setTexts(prev => prev.map((old, i) => i === step ? text : old))} />
            <textarea aria-label="Resposta" readOnly value={texts[step]} />
            <button onClick={() => { mic.current.stop(); setTexts(['', '']); }}>Enviar</button>
            <button onClick={() => setStep(step + 1)}>Próxima</button>
            <button onClick={() => setDisabled(true)}>Desabilitar</button>
          </>;
        }
        createRoot(document.getElementById('root')).render(<App />);
      `,
    },
    bundle: true,
    write: false,
    platform: 'browser',
    jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"development"' },
  });
  bundle = result.outputFiles[0].text;
});

test.beforeEach(async ({ page }) => {
  await page.goto('about:blank');
  await page.setContent('<div id="root"></div>');
  await page.addScriptTag({ content: bundle });
  await expect(page.getByRole('button', { name: 'Gravar por voz' })).toBeEnabled();
});

test('Android: atualiza a mesma posição sem acumular versões ou finais repetidos', async ({ page }) => {
  await page.getByRole('button', { name: 'Gravar por voz' }).click();
  for (const text of ['quem', 'quem', 'quem fala', 'quem fala é o supervisor']) {
    await page.evaluate(text => {
      const rec = (window as any).sessions[0];
      rec.onresult({ resultIndex: 0, results: [{ 0: { transcript: text }, isFinal: true }] });
    }, text);
    await expect(page.getByRole('textbox', { name: 'Resposta' })).toHaveValue(`Resposta digitada. ${text}`);
  }
  await page.evaluate(() => (window as any).sessions[0].onend());
  await page.getByRole('button', { name: 'Gravar por voz' }).click();
  await page.evaluate(() => (window as any).sessions[1].onresult({
    resultIndex: 0, results: [{ 0: { transcript: 'Vou conversar.' }, isFinal: true }],
  }));
  await expect(page.getByRole('textbox', { name: 'Resposta' }))
    .toHaveValue('Resposta digitada. quem fala é o supervisor Vou conversar.');
});

test('parar pelo botão recebe a última palavra e impede outra sessão antes de onend', async ({ page }) => {
  await page.getByRole('button', { name: 'Gravar por voz' }).click();
  await page.getByRole('button', { name: /Gravando/ }).click();
  await expect(page.getByRole('button', { name: /Gravando/ })).toHaveAttribute('aria-pressed', 'true');
  await page.evaluate(() => (window as any).sessions[0].onresult({
    resultIndex: 0, results: [{ 0: { transcript: 'Palavra final.' }, isFinal: true }],
  }));
  await expect(page.getByRole('textbox', { name: 'Resposta' })).toHaveValue('Resposta digitada. Palavra final.');
  await page.evaluate(() => (window as any).sessions[0].onend());
  await expect(page.getByRole('button', { name: 'Gravar por voz' })).toHaveAttribute('aria-pressed', 'false');
  expect(await page.evaluate(() => (window as any).sessions.length)).toBe(1);
});

for (const action of ['Enviar', 'Próxima', 'Desabilitar']) {
  test(`${action}: ignora resultados e encerramentos atrasados`, async ({ page }) => {
    await page.getByRole('button', { name: 'Gravar por voz' }).click();
    await page.evaluate(() => {
      const rec = (window as any).sessions[0];
      (window as any).lateResult = rec.onresult;
      (window as any).lateEnd = rec.onend;
    });
    await page.getByRole('button', { name: action, exact: true }).click();
    expect(await page.evaluate(() => (window as any).sessions[0].aborts)).toBe(1);
    const expected = action === 'Desabilitar' ? 'Resposta digitada.' : '';
    if (action !== 'Desabilitar') {
      await page.getByRole('button', { name: 'Gravar por voz' }).click();
    }
    await page.evaluate(() => {
      (window as any).lateResult({ resultIndex: 0, results: [{ 0: { transcript: 'Atrasado.' }, isFinal: true }] });
      (window as any).lateEnd();
    });
    await expect(page.getByRole('textbox', { name: 'Resposta' })).toHaveValue(expected);
    if (action !== 'Desabilitar') {
      await expect(page.getByRole('button', { name: /Gravando/ })).toHaveAttribute('aria-pressed', 'true');
    }
  });
}
