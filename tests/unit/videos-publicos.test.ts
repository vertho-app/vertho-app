import { describe, it, expect } from 'vitest';
import { VIDEOS_PUBLICOS, isVideoPublico, resolverSlugPublico } from '@/lib/videos-publicos';
import { JORNADA_VIDEO_ID, APLICACAO_VIDEO_ID, CONCLUSAO_VIDEO_ID } from '@/lib/season-engine/programa-config';

/**
 * GUIDs dos tutoriais que vivem DENTRO do produto (Bunny library 636615).
 * Eles falam de PDI/jornada/semana pra quem já está logado — se algum cair na
 * allowlist, o gate de sessão do /v/ abre sem ninguém perceber.
 *
 * 🔴 OS QUE TÊM CONSTANTE VÊM DA CONSTANTE, e não de um GUID copiado.
 * Descoberto em 25/08/2026: o tutorial da jornada foi refeito, o GUID mudou em
 * `programa-config.ts`, e esta lista continuou apontando para o VELHO. O guard
 * não ficou vermelho — ele passou a provar que um vídeo inexistente é privado,
 * enquanto o vídeo que existe deixou de ser coberto. Guard que testa um alvo
 * morto é pior que guard nenhum: ele reporta verde.
 *
 * Os demais seguem literais porque não têm constante em lugar nenhum; se um dia
 * tiverem, entram aqui pelo mesmo caminho.
 */
const TUTORIAIS_PRIVADOS = [
  '89812149-0c2e-4299-b1ba-3f27013aba25', // disc-app
  'a352dbdf-4515-45ba-8797-72f62798402c', // disc-ajuda
  JORNADA_VIDEO_ID,                        // jornada (e, por reuso, a semana trancada)
  'b8a4534e-326a-4ba4-b638-befc63294dda', // pdi
  APLICACAO_VIDEO_ID,                      // semana de missão
];

const BOASVINDAS_UNIANCHIETA = '482e3eab-65bd-4e0d-98d6-1f2af6141071';

describe('allowlist de vídeos públicos', () => {
  it('libera o vídeo de boas-vindas (quem recebe ainda não tem acesso)', () => {
    expect(isVideoPublico(BOASVINDAS_UNIANCHIETA)).toBe(true);
  });

  it('é indiferente a maiúsculas no GUID', () => {
    expect(isVideoPublico(BOASVINDAS_UNIANCHIETA.toUpperCase())).toBe(true);
  });

  it('mantém os tutoriais de dentro do produto atrás do login', () => {
    for (const guid of TUTORIAIS_PRIVADOS) {
      expect(isVideoPublico(guid), `${guid} não pode ser público`).toBe(false);
    }
  });

  it('o vídeo da tela de semana TRANCADA também fica atrás do login', () => {
    // `CONCLUSAO_VIDEO_ID` reusa o da jornada hoje, mas é uma constante PRÓPRIA
    // — se um dia apontar para outro vídeo, este caso pega antes de ele nascer
    // público por descuido.
    expect(CONCLUSAO_VIDEO_ID && isVideoPublico(CONCLUSAO_VIDEO_ID)).toBe(false);
  });

  it('não libera GUID desconhecido nem entrada vazia', () => {
    expect(isVideoPublico('00000000-0000-0000-0000-000000000000')).toBe(false);
    expect(isVideoPublico('')).toBe(false);
  });

  it('cada entrada declara guid, tenant, slug e o motivo de ser pública', () => {
    for (const v of VIDEOS_PUBLICOS) {
      expect(v.guid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
      expect(v.tenant.trim().length, `${v.guid} sem tenant`).toBeGreaterThan(0);
      expect(v.slug).toMatch(/^[a-z0-9][a-z0-9-]{1,48}$/);
      expect(v.motivo.trim().length, `${v.guid} sem motivo`).toBeGreaterThan(10);
    }
  });

  it('não repete (tenant, slug) — dois vídeos no mesmo endereço', () => {
    const chaves = VIDEOS_PUBLICOS.map((v) => `${v.tenant}/${v.slug}`);
    expect(new Set(chaves).size).toBe(chaves.length);
  });
});

describe('apelido curto (/v/{slug})', () => {
  it('resolve o slug do tenant dono', () => {
    expect(resolverSlugPublico('boas-vindas', 'unianchieta')).toBe(BOASVINDAS_UNIANCHIETA);
    expect(resolverSlugPublico('BOAS-VINDAS', 'UniAnchieta')).toBe(BOASVINDAS_UNIANCHIETA);
  });

  it('NÃO vaza o vídeo de um tenant para outro', () => {
    // O risco real do apelido curto: "boas-vindas" é o nome óbvio, e o segundo
    // cliente vai querer o mesmo. Servir o vídeo do vizinho carregaria a página
    // normalmente — com a logo certa e o conteúdo errado.
    for (const outro of ['acme-demo', 'ibipeba', 'projetomacae', 'bett']) {
      expect(resolverSlugPublico('boas-vindas', outro), `vazou para ${outro}`).toBeNull();
    }
  });

  it('sem tenant resolvido, não resolve slug nenhum', () => {
    expect(resolverSlugPublico('boas-vindas', null)).toBeNull();
    expect(resolverSlugPublico('boas-vindas', '')).toBeNull();
  });

  it('ignora slug desconhecido e lixo', () => {
    expect(resolverSlugPublico('nao-existe', 'unianchieta')).toBeNull();
    expect(resolverSlugPublico('', 'unianchieta')).toBeNull();
    expect(resolverSlugPublico('../../etc/passwd', 'unianchieta')).toBeNull();
    expect(resolverSlugPublico('constructor', 'unianchieta')).toBeNull();
  });

  it('GUID passa direto (não é slug) — o endereço longo continua valendo', () => {
    expect(resolverSlugPublico(BOASVINDAS_UNIANCHIETA, 'unianchieta')).toBeNull();
  });
});
