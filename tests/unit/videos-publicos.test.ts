import { describe, it, expect } from 'vitest';
import { VIDEOS_PUBLICOS, isVideoPublico, resolverSlugPublico } from '@/lib/videos-publicos';

// GUIDs dos tutoriais que vivem DENTRO do produto (Bunny library 636615).
// Eles falam de PDI/jornada/semana pra quem já está logado — se algum cair na
// allowlist, o gate de sessão do /v/ abre sem ninguém perceber.
const TUTORIAIS_PRIVADOS = [
  '89812149-0c2e-4299-b1ba-3f27013aba25', // disc-app
  'a352dbdf-4515-45ba-8797-72f62798402c', // disc-ajuda
  '4d17fac6-2dda-4c34-8436-bfe4c7f32f62', // jornada
  'b8a4534e-326a-4ba4-b638-befc63294dda', // pdi
  '80f4da74-4384-419f-aab8-89ed346e7b5b', // semana de missão
];

const BOASVINDAS_UNIANCHIETA = '3bb52aa2-1d63-4507-9bb1-028e9e7565e1';

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
