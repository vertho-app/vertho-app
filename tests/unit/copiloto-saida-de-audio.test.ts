import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { divergenciaDeSaida, explicarDivergencia } from '@/lib/copiloto/saida-de-audio';

/** A forma que `enumerateDevices()` devolve no Chrome, com os rótulos traduzidos. */
function saida(deviceId: string, label: string) {
  return { kind: 'audiooutput', deviceId, label, groupId: 'g' };
}
function entrada(label: string) {
  return { kind: 'audioinput', deviceId: 'default', label, groupId: 'g' };
}

describe('divergência entre as duas saídas padrão do Windows', () => {
  it('acusa o caso medido: som comum no alto-falante e chamada no fone', () => {
    // Os rótulos são os da máquina onde a reunião do Teams veio muda (11/09/2026).
    const achado = divergenciaDeSaida([
      entrada('Padrão - Microfone (Realtek(R) Audio)'),
      saida('default', 'Padrão - Alto-falantes (Realtek(R) Audio)'),
      saida('communications', 'Comunicações - Fones de ouvido (Realtek(R) Audio)'),
      saida('a1b2', 'Alto-falantes (Realtek(R) Audio)'),
    ]);

    expect(achado).toEqual({
      padrao: 'Alto-falantes (Realtek(R) Audio)',
      comunicacao: 'Fones de ouvido (Realtek(R) Audio)',
    });
  });

  it('fica calado quando as duas apontam para o mesmo aparelho', () => {
    // O prefixo traduzido difere ("Padrão -" contra "Comunicações -") mesmo quando
    // o aparelho é o mesmo: comparar com ele dentro acusaria todo mundo.
    expect(divergenciaDeSaida([
      saida('default', 'Padrão - Fones de ouvido (Realtek(R) Audio)'),
      saida('communications', 'Comunicações - Fones de ouvido (Realtek(R) Audio)'),
    ])).toBeNull();
  });

  it('fica calado no Chrome em inglês, que usa outro prefixo', () => {
    expect(divergenciaDeSaida([
      saida('default', 'Default - Speakers (Realtek(R) Audio)'),
      saida('communications', 'Communications - Speakers (Realtek(R) Audio)'),
    ])).toBeNull();
  });

  it('fica calado sem permissão de microfone, quando o rótulo vem vazio', () => {
    // Sem permissão o navegador devolve label ''. Acusar aqui mandaria o vendedor
    // mexer no som do computador por causa de um dado que ninguém leu.
    expect(divergenciaDeSaida([
      saida('default', ''),
      saida('communications', ''),
    ])).toBeNull();
  });

  it('fica calado onde não existe saída de comunicação (macOS e Linux)', () => {
    expect(divergenciaDeSaida([
      saida('default', 'Padrão - MacBook Pro Speakers'),
      saida('x9', 'MacBook Pro Speakers'),
    ])).toBeNull();
  });

  it('não confunde entrada com saída', () => {
    // O microfone também tem 'default' e 'communications'. Se o filtro de kind
    // cair, o par de ENTRADA responde no lugar do de saída e a tela acusa uma
    // divergência que não existe no som.
    expect(divergenciaDeSaida([
      { kind: 'audioinput', deviceId: 'default', label: 'Padrão - Microfone do headset', groupId: 'g' },
      { kind: 'audioinput', deviceId: 'communications', label: 'Comunicações - Microfone da webcam', groupId: 'g' },
      saida('default', 'Padrão - Fones de ouvido'),
      saida('communications', 'Comunicações - Fones de ouvido'),
    ])).toBeNull();
  });

  it('não quebra com entrada ausente ou fora de forma', () => {
    expect(divergenciaDeSaida(undefined)).toBeNull();
    expect(divergenciaDeSaida([])).toBeNull();
    expect(divergenciaDeSaida([null, { kind: 'audiooutput' }])).toBeNull();
  });

  it('a explicação nomeia os dois aparelhos, que é o que o vendedor precisa achar', () => {
    const frase = explicarDivergencia({ padrao: 'Alto-falantes', comunicacao: 'Fones de ouvido' });
    expect(frase).toContain('Alto-falantes');
    expect(frase).toContain('Fones de ouvido');
  });

  it('cada captura nova esquece o aviso da anterior', () => {
    // A captura só chama onOutputMismatch quando HÁ divergência. Em 25/09/2026 o
    // Windows já estava certo (as três funções nos fones, lidas pelo Core Audio) e
    // a tela seguia dizendo "o som comum toca em Alto-falantes", porque o estado
    // sobrevivia ao recompartilhamento. O zerar tem que vir antes de a captura nova
    // nascer: depois dela, apagaria o aviso fresco.
    const tela = readFileSync('app/copiloto/copilot-client.tsx', 'utf-8');
    const inicio = tela.indexOf('async function startCapture(');
    const nascimento = tela.indexOf('new LocalMeetingCapture(', inicio);
    expect(inicio).toBeGreaterThan(-1);
    expect(nascimento).toBeGreaterThan(inicio);
    const preparo = tela.slice(inicio, nascimento);
    // Âncora: o trecho é o bloco que zera o estado da captura, não outra função.
    expect(preparo).toContain("setCaptureSurface('unknown')");
    expect(preparo).toContain('setSaidaDivergente(null)');
  });
});
