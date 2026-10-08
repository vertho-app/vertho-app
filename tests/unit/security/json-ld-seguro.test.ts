import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { serializarJsonLd } from '@/lib/json-ld-seguro';

describe('JSON-LD embutido no HTML do Radar', () => {
  it.each(['</script><script>globalThis.injetado=true</script>', '</ScRiPt><img src=x onerror=alert(1)>', '<!--<script>'])('mantém %s como dado, sem delimitador HTML', (nome) => {
    const dado = { '@context': 'https://schema.org', '@type': 'School', name: nome, address: { addressLocality: 'São João "Centro" & região' }, value: 0, active: false };
    const resultado = serializarJsonLd(dado);
    expect(resultado).not.toMatch(/</);
    expect(JSON.parse(resultado)).toEqual(dado);
  });

  it.each(['app/radar/escola/[inep]/page.tsx', 'app/radar/municipio/[ibge]/page.tsx'])('%s usa o serializador no ponto de inserção', (arquivo) => {
    const fonte = readFileSync(arquivo, 'utf8');
    expect(fonte).toContain("import { serializarJsonLd } from '@/lib/json-ld-seguro'");
    expect(fonte).toMatch(/__html:\s*serializarJsonLd\(jsonLd\)/);
    expect(fonte).not.toMatch(/__html:\s*JSON\.stringify/);
  });
});
