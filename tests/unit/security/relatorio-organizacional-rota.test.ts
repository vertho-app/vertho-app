import { beforeEach, describe, expect, it, vi } from 'vitest';
import { criarSupabaseMock } from '../../helpers/supabase-mock';

/**
 * R-74 (revisão de 02/10/2026): a central do RH abria o Perfil Organizacional
 * (nome e DISC de cada pessoa), o DNA e o Ranking pela URL PÚBLICA e permanente
 * do bucket `conteudos`. A tela prometia "Leitura segura".
 *
 * Agora a tela recebe `/api/relatorios/organizacional?ref=...`, e a rota decide
 * no clique: sessão, empresa do ARQUIVO (nunca a do browser), papel. Só então
 * gera um link assinado e curto. Estes testes provam as quatro coisas que o
 * achado pede da leitura:
 *  · nega quem não é RH da empresa nem platform admin, SEM gerar link;
 *  · aceita os dois formatos (caminho novo no bucket privado e o antigo, como
 *    caminho ou como a URL pública que estava nas telas);
 *  · o link é assinado (`createSignedUrl`) e curto (≤ 5 min);
 *  · o caminho novo é lido do bucket PRIVADO.
 *
 * O gate (`podeLerRelatorio`) e o parser são os reais; só a sessão é simulada.
 */
const estado = vi.hoisted(() => ({ ctx: null as any }));

const sb = criarSupabaseMock();
vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => sb.client }));
vi.mock('@/lib/auth/request-context', () => ({
  requireUser: async () => estado.ctx ?? new Response(JSON.stringify({ error: 'não autenticado' }), { status: 401 }),
}));

import { GET } from '@/app/api/relatorios/organizacional/route';
import { TTL_LINK_RELATORIO_SEGUNDOS } from '@/lib/relatorios/relatorio-privado';

const EMP_A = '11111111-1111-4111-8111-111111111111';
const EMP_B = '22222222-2222-4222-8222-222222222222';
const NOVO = `${EMP_A}/perfil-org/1759500000000.pdf`;
const ANTIGO = `final/dna/${EMP_A}-1756555200000.pdf`;
const URL_PUBLICA = `https://projeto.supabase.co/storage/v1/object/public/conteudos/final/perfil-org/${EMP_A}-1756555200000.pdf`;

const sessao = (role: string, empresaId: string | null, extra: Record<string, any> = {}) => ({
  email: `${role}@empresa.com`, colaborador: { id: `${role}-1` }, role, empresaId, isPlatformAdmin: false, ...extra,
});

const pedir = (ref: string, extra = '') =>
  GET(new Request(`https://acme.vertho.ai/api/relatorios/organizacional?ref=${encodeURIComponent(ref)}${extra}`));

const assinaturas = () => sb.storageChamadas.filter((c) => c.metodo === 'createSignedUrl');

describe('rota de leitura dos relatórios organizacionais (R-74)', () => {
  beforeEach(() => { sb.reset(); estado.ctx = null; });

  describe('quem NÃO pode ler não recebe link nenhum', () => {
    it('sem sessão: 401 e nenhuma assinatura', async () => {
      const res = await pedir(NOVO);
      expect(res.status).toBe(401);
      expect(assinaturas()).toHaveLength(0);
    });

    it('🔴 RH de OUTRA empresa: 403 e nenhuma assinatura', async () => {
      estado.ctx = sessao('rh', EMP_B);
      const res = await pedir(NOVO);
      expect(res.status).toBe(403);
      expect(assinaturas()).toHaveLength(0);
    });

    it('🔴 gestor e colaborador da MESMA empresa: 403 (o Perfil traz o DISC de cada pessoa)', async () => {
      for (const role of ['gestor', 'colaborador']) {
        estado.ctx = sessao(role, EMP_A);
        const res = await pedir(NOVO);
        expect(res.status, role).toBe(403);
      }
      expect(assinaturas()).toHaveLength(0);
    });

    it('🔴 o arquivo antigo também é conferido pela empresa do NOME, não pela sessão', async () => {
      estado.ctx = sessao('rh', EMP_B);
      expect((await pedir(ANTIGO)).status).toBe(403);
      expect((await pedir(URL_PUBLICA)).status).toBe(403);
      expect(assinaturas()).toHaveLength(0);
    });

    it('referência que não diz de quem é: 400 sem tocar o Storage', async () => {
      estado.ctx = sessao('rh', EMP_A, { isPlatformAdmin: true });
      const invalidas = [
        `${EMP_A}/../${EMP_B}/perfil-org/1.pdf`,
        `final/perso/c1/${EMP_A}/SC.pdf`,
        `${EMP_A}/prontidao-lideranca/consolidado.pdf`,
        `${EMP_A}/adequacao-cargo/Professor-1.json`, // snapshot é insumo, não documento
        'https://projeto.supabase.co/storage/v1/object/public/video-assets/final/dna/x.pdf',
        '',
      ];
      for (const ref of invalidas) expect((await pedir(ref)).status, ref).toBe(400);
      expect(sb.storageChamadas).toHaveLength(0);
    });
  });

  describe('quem pode ler recebe um link ASSINADO e CURTO', () => {
    it('RH da própria empresa, caminho novo: redireciona para o link assinado do bucket PRIVADO', async () => {
      estado.ctx = sessao('rh', EMP_A);
      const res = await pedir(NOVO);
      expect(res.status).toBe(302);
      expect(res.headers.get('location')).toBe(`https://signed/${NOVO}`);
      expect(res.headers.get('cache-control')).toContain('no-store');

      const [assinatura] = assinaturas();
      expect(assinatura.bucket).toBe('relatorios-pdf');
      expect(assinatura.args[0]).toBe(NOVO);
      expect(assinatura.args[1]).toBe(TTL_LINK_RELATORIO_SEGUNDOS);
      expect(assinatura.args[1]).toBeLessThanOrEqual(300);
    });

    it('formato ANTIGO (caminho): assina no bucket antigo, sem devolver a URL pública', async () => {
      estado.ctx = sessao('rh', EMP_A);
      const res = await pedir(ANTIGO);
      expect(res.status).toBe(302);
      const [assinatura] = assinaturas();
      expect(assinatura.bucket).toBe('conteudos');
      expect(assinatura.args[0]).toBe(ANTIGO);
      expect(res.headers.get('location')).not.toContain('/object/public/');
    });

    it('formato ANTIGO (URL pública que estava nas telas): extrai o caminho e assina', async () => {
      estado.ctx = sessao('rh', EMP_A);
      const res = await pedir(URL_PUBLICA);
      expect(res.status).toBe(302);
      const [assinatura] = assinaturas();
      expect(assinatura.bucket).toBe('conteudos');
      expect(assinatura.args[0]).toBe(`final/perfil-org/${EMP_A}-1756555200000.pdf`);
    });

    it('platform admin lê relatório de qualquer empresa (a régua do Relatório de RH)', async () => {
      estado.ctx = sessao('colaborador', null, { isPlatformAdmin: true });
      expect((await pedir(NOVO)).status).toBe(302);
      expect(assinaturas()).toHaveLength(1);
    });

    it('"Baixar PDF" pede o download no próprio link assinado (o atributo `download` não atravessa domínio)', async () => {
      estado.ctx = sessao('rh', EMP_A);
      await pedir(NOVO, '&download=1');
      const [assinatura] = assinaturas();
      expect(assinatura.args[2]).toEqual({ download: 'vertho-perfil-org-1759500000000.pdf' });
    });

    it('objeto inexistente: 404; falha do Storage: 503 (nunca vira link quebrado)', async () => {
      estado.ctx = sessao('rh', EMP_A);
      sb.falharEm({ tabela: '__storage__', metodo: 'createSignedUrl', mensagem: 'Object not found' });
      expect((await pedir(NOVO)).status).toBe(404);
      sb.reset();
      sb.falharEm({ tabela: '__storage__', metodo: 'createSignedUrl', mensagem: 'timeout' });
      expect((await pedir(NOVO)).status).toBe(503);
    });
  });
});
