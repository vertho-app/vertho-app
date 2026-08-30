import React from 'react';
import { renderToBuffer } from '@react-pdf/renderer';
import { describe, expect, it } from 'vitest';
import RelatorioGestorPDF from '@/components/pdf/RelatorioGestor';
import RelatorioIndividualPDF from '@/components/pdf/RelatorioIndividual';
import RelatorioRHPDF from '@/components/pdf/RelatorioRH';
import {
  ACME_DEMO_REPORT_DIRECTORY,
  criarPdiAcmeDemo,
  criarRelatorioGestorAcmeDemo,
  criarRelatorioRhAcmeDemo,
} from '@/lib/demo/acme-rh-report-fixture';

describe('PDFs demonstrativos da central do RH', () => {
  it('renderiza PDI, liderança e consolidado como PDFs válidos', async () => {
    const pessoa = ACME_DEMO_REPORT_DIRECTORY.find((item) => item.role === 'colaborador')!;
    const gestor = ACME_DEMO_REPORT_DIRECTORY.find((item) => item.role === 'gestor')!;
    const equipe = ACME_DEMO_REPORT_DIRECTORY.filter((item) => item.gestor_email === gestor.email);

    const documentos = [
      React.createElement(RelatorioIndividualPDF, {
        data: {
          conteudo: criarPdiAcmeDemo(pessoa),
          colaborador_nome: pessoa.nome_completo,
          colaborador_cargo: pessoa.cargo,
        },
        empresaNome: 'ACME Demo',
      }),
      React.createElement(RelatorioGestorPDF, {
        data: {
          conteudo: criarRelatorioGestorAcmeDemo(gestor, equipe),
          gestor_nome: gestor.nome_completo,
        },
        empresaNome: 'ACME Demo',
      }),
      React.createElement(RelatorioRHPDF, {
        data: { conteudo: criarRelatorioRhAcmeDemo() },
        empresaNome: 'ACME Demo',
      }),
    ];

    for (const documento of documentos) {
      const buffer = await renderToBuffer(documento as any);
      expect(buffer.subarray(0, 4).toString()).toBe('%PDF');
      expect(buffer.byteLength).toBeGreaterThan(10_000);
    }
  }, 30_000);
});
