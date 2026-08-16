// O tema da pílula é a ÚNICA parte da trilha que sai do produto e chega no
// celular da pessoa. Código interno vazando ali não tem tela onde ser percebido
// antes — só chega.
//
// 🔴 Medido em 16/08/2026 (Ibipeba): os descritores de Coordenação Pedagógica
// entraram com o identificador da matriz colado no texto ("COO03_D6 — Busca de
// apoio"), enquanto os de Gestão Escolar, na MESMA competência, não. São 79 de
// 648 itens de plano; 18 cairiam na semana 5, e a mensagem sairia como
// "Autocuidado e resiliência emocional — COO03_D6 — Busca de apoio".
//
// ⚠️ A limpeza é de EXIBIÇÃO. O `descritor` é a chave que casa o kit por
// (DISC × cargo) — mexer no dado para consertar texto arriscaria o casamento.
import { describe, it, expect } from 'vitest';
import { temaPilula, descritorParaHumano } from '@/lib/notifications/pilula-envio';

describe('descritor que sai para fora', () => {
  it('🔴 tira o código da matriz do texto que a pessoa recebe', () => {
    expect(descritorParaHumano('COO03_D6 — Busca de apoio')).toBe('Busca de apoio');
    expect(descritorParaHumano('COO03_D1 — Consciência de limites')).toBe('Consciência de limites');
  });

  it('aceita as variações de travessão e de espaçamento', () => {
    expect(descritorParaHumano('GES12_D3 – Registro e devolutiva')).toBe('Registro e devolutiva');
    expect(descritorParaHumano('DIR7_D10-Presença junto às unidades')).toBe('Presença junto às unidades');
  });

  it('🔴 descritor SEM código passa intacto — a maioria é assim', () => {
    // Falso positivo aqui apaga metade do assunto da mensagem.
    for (const d of [
      'Busca de apoio e rede',
      'Sustentabilidade pessoal',
      'Registro e devolutiva',
      'Orientação técnico-pedagógica',
    ]) expect(descritorParaHumano(d)).toBe(d);
  });

  it('texto que só PARECE código não é tocado', () => {
    expect(descritorParaHumano('Plano B — o que fazer quando falha')).toBe('Plano B — o que fazer quando falha');
    expect(descritorParaHumano('BNCC — competências gerais')).toBe('BNCC — competências gerais');
  });

  it('🔴 descritor que é SÓ o código devolve o original, não vazio', () => {
    // Assunto vazio é pior que assunto feio: a mensagem fica sem tema nenhum.
    expect(descritorParaHumano('COO03_D6')).toBe('COO03_D6');
    expect(descritorParaHumano('COO03_D6 — ')).toBe('COO03_D6 — ');
  });

  it('🔴 o tema completo da pílula sai limpo', () => {
    expect(temaPilula({
      competencia: 'Autocuidado e resiliência emocional',
      descritor: 'COO03_D6 — Busca de apoio',
    })).toBe('Autocuidado e resiliência emocional — Busca de apoio');
  });

  it('sem descritor, o tema continua sendo a competência', () => {
    expect(temaPilula({ competencia: 'Autocuidado e resiliência emocional' }))
      .toBe('Autocuidado e resiliência emocional');
  });

  it('sem nada, cai no texto genérico — nunca string vazia', () => {
    expect(temaPilula({})).toBe('novo conteúdo da semana');
  });
});
