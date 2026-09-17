import { describe, expect, it, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { schoolOfflineData } from '@/lib/demo/offline/data';
import { acmeOfflineData } from '@/lib/demo/offline/acme-data';

for (const [tenant, data] of [['escolas-acme', schoolOfflineData()], ['acme-demo', acmeOfflineData()]] as const) {
  describe(`Painéis locais de ${tenant}`, () => {
    it('preserva população e totais de cada filtro, sem misturar equipes ou inventar sinais', () => {
      for (const role of ['manager', 'organization'] as const) {
        for (const [key, panel] of Object.entries(data.panels.engagement[role])) {
          const [week, cargo] = JSON.parse(key);
          expect(panel.resumo.inscritos).toBe(panel.colaboradores.length);
          for (const row of panel.colaboradores) {
            const person = data.people.find(p => p.key === row.colaboradorId);
            expect(person, row.nome).toBeDefined();
            if (role === 'manager') expect(person!.manager).toBe(tenant === 'acme-demo' ? 'Carla Menezes' : 'Renata Coelho');
            if (cargo) expect(row.cargo).toBe(cargo);
            if (week) expect(row.semanaCalendario).toBeGreaterThanOrEqual(week);
          }
          if (panel.colaboradores.length) {
            expect(panel.resumo.consumiram).toBe(panel.colaboradores.filter((p: any) => p.consumiu).length);
            expect(panel.resumo.enviaramEvidencia).toBe(panel.colaboradores.filter((p: any) => p.enviouEvidencia).length);
          }
        }
      }
    });
    it('leva rankings e relatórios válidos apenas do elenco fictício', () => {
      expect(Object.keys(data.panels.rankings).length).toBeGreaterThan(0);
      for (const rank of Object.values(data.panels.rankings)) {
        expect(rank.success).toBe(true);
        for (const row of [...rank.elegiveis, ...rank.anexoGate]) expect(data.people.some(p => p.key === row.id && p.name === row.nome)).toBe(true);
        const pdf = readFileSync(`lib/demo/offline/${rank.pdfPath.replace('documents/', `documents/${tenant}/`)}`);
        expect(pdf.subarray(0,5).toString()).toBe('%PDF-');
      }
      const serialized = JSON.stringify(data.panels);
      expect(serialized).not.toMatch(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
      expect(serialized).not.toMatch(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/i);
      expect(serialized).not.toMatch(/access_token|refresh_token|service_role|transcript_completo/);
    });
  });
}

afterEach(() => vi.unstubAllGlobals());
it('atende as ações compartilhadas e o PDF da evolução localmente, preservando o recorte do gestor', async () => {
  vi.resetModules();
  const data = acmeOfflineData();
  vi.stubGlobal('__OFFLINE_TENANT__', 'acme-demo');
  vi.stubGlobal('__DEMO_DATA__', data);
  vi.stubGlobal('__OFFLINE_MEDIA__', []);
  const network = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response('%PDF-'));
  const browser = Object.assign(new EventTarget(), { location: { hash: '#/manager/dashboard', origin: 'https://demo.example', href: 'https://demo.example/apresentacao-offline-acme/index.html' }, fetch: network });
  vi.stubGlobal('window', browser);
  const actions = await import('@/lib/demo/offline/panel-actions');
  expect((await actions.getEngajamentoDoTime()).colaboradores.length).toBe(6);
  expect((await actions.getEngajamentoRh()).colaboradores.length).toBe(19);
  const row = data.panels.team.rows.find(r => data.panels.details[r.colabEmail]);
  expect((await actions.loadLideradoConcluida(row.colabEmail)).colab.nome).toBe(row.colab);
  expect(await actions.loadLideradoConcluida('fora-da-equipe')).toHaveProperty('error');
  const { installLocalTransport } = await import('@/lib/demo/offline/runtime');
  installLocalTransport();
  expect((await browser.fetch(`/api/temporada/concluida/pdf?email=${row.colabEmail}`)).status).toBe(200);
  expect(network).toHaveBeenCalledWith('/apresentacao-offline-acme/' + data.panels.details[row.colabEmail].pdfPath, { signal: undefined });
});
