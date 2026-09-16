import { describe, it, expect } from 'vitest';
import { parseSpreadsheet } from '@/lib/parse-spreadsheet';

// Forma real do arquivo que corrompeu 4 cargos da 4life-educacao em 16/09/2026:
// "CSV (separado por ponto e vírgula)" salvo pelo Excel no Windows, em Windows-1252,
// com vírgulas dentro do texto da descrição.
const CABECALHO = 'nome;area_depto;descricao';
const LINHA = 'Coordenação Pedagógica;Pedagógico;Assistir à professora nas tarefas, atividades e cuidados com os bebês e crianças';

const csv = (bytes: Uint8Array<ArrayBuffer>) => new File([bytes], 'cargos.csv', { type: 'text/csv' });

describe('parseSpreadsheet — CSV', () => {
  it('lê CSV em Windows-1252 (Excel no Windows) sem trocar acento por U+FFFD', async () => {
    const bytes = new Uint8Array(Buffer.from(`${CABECALHO}\r\n${LINHA}\r\n`, 'latin1'));
    // Pré-condição: o arquivo NÃO é UTF-8 válido (senão o teste não exercita o fallback).
    expect(() => new TextDecoder('utf-8', { fatal: true }).decode(bytes)).toThrow();

    const [cargo] = await parseSpreadsheet(csv(bytes));
    expect(cargo.nome).toBe('Coordenação Pedagógica');
    expect(cargo.area_depto).toBe('Pedagógico');
    expect(cargo.descricao).toBe('Assistir à professora nas tarefas, atividades e cuidados com os bebês e crianças');
    expect(JSON.stringify(cargo)).not.toContain('�');
  });

  it('lê "CSV UTF-8" do Excel (com BOM) sem sujar a 1ª chave do cabeçalho', async () => {
    const bytes = new Uint8Array(Buffer.from(`﻿${CABECALHO}\n${LINHA}\n`, 'utf8'));
    const [cargo] = await parseSpreadsheet(csv(bytes));
    expect(Object.keys(cargo)).toEqual(['nome', 'area_depto', 'descricao']);
    expect(cargo.nome).toBe('Coordenação Pedagógica');
  });

  it('célula entre aspas guarda separador, quebra de linha e aspa escapada sem deslocar colunas', async () => {
    const texto = `${CABECALHO};stakeholders\n` +
      'Recreacionista;Pedagógico;"Conduz o recreio; organiza jogos\nacompanha o ""horário livre""";Coordenação\n';
    const rows = await parseSpreadsheet(csv(new Uint8Array(Buffer.from(texto, 'utf8'))));
    expect(rows).toHaveLength(1);
    expect(rows[0].descricao).toBe('Conduz o recreio; organiza jogos\nacompanha o "horário livre"');
    expect(rows[0].stakeholders).toBe('Coordenação');
  });

  it('separador vírgula e linhas em branco continuam funcionando', async () => {
    const texto = 'nome,email\n\nAna Souza,ana@x.com\r\n,\n';
    const rows = await parseSpreadsheet(csv(new Uint8Array(Buffer.from(texto, 'utf8'))));
    expect(rows).toEqual([{ nome: 'Ana Souza', email: 'ana@x.com' }]);
  });
});
