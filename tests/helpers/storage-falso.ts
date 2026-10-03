/**
 * Storage falso COM ESTADO: sabe quais objetos existem em cada bucket.
 *
 * Nasceu na continuação do R-74 (áudio personalizado, 03/10/2026). O mock de
 * `supabase-mock.ts` assina qualquer caminho e só falha por bucket inteiro, o
 * que basta para "qual bucket foi usado", mas não para o fluxo do cache:
 * "não existe no privado, existe no antigo" e "gerou, gravou no privado e
 * agora assina o que acabou de gravar" pedem existência POR CAMINHO.
 *
 * Imita o que o Storage real faz e que o código usa:
 *  · `createSignedUrl` de objeto que não existe volta `Object not found`
 *    (o Storage confere a existência antes de assinar);
 *  · `upload` cria o objeto; `remove` apaga; `move` dentro do bucket;
 *  · `download` de objeto que não existe volta erro;
 *  · `list(pasta)` devolve os arquivos diretos da pasta, com `metadata.size`.
 * Falha programada: `falhar(bucket, metodo, mensagem)` (vale até `reset`).
 */
export interface ChamadaStorageFalso {
  bucket: string;
  metodo: string;
  args: any[];
}

export function criarStorageFalso(inicial: Record<string, string[]> = {}) {
  const objetos = new Map<string, Map<string, Uint8Array>>();
  const chamadas: ChamadaStorageFalso[] = [];
  const falhas: Array<{ bucket: string; metodo: string; mensagem: string }> = [];

  const doBucket = (bucket: string) => {
    if (!objetos.has(bucket)) objetos.set(bucket, new Map());
    return objetos.get(bucket)!;
  };
  const semear = (bucket: string, caminho: string, conteudo = 'mp3') => {
    doBucket(bucket).set(caminho, new TextEncoder().encode(conteudo));
  };
  for (const [bucket, caminhos] of Object.entries(inicial)) for (const c of caminhos) semear(bucket, c);

  const falha = (bucket: string, metodo: string) =>
    falhas.find((f) => (f.bucket === bucket || f.bucket === '*') && f.metodo === metodo) || null;

  const storage = {
    from: (bucket: string) => ({
      createSignedUrl: async (caminho: string, ttl: number, opcoes?: any) => {
        chamadas.push({ bucket, metodo: 'createSignedUrl', args: [caminho, ttl, opcoes] });
        const f = falha(bucket, 'createSignedUrl');
        if (f) return { data: null, error: { message: f.mensagem } };
        if (!doBucket(bucket).has(caminho)) return { data: null, error: { message: 'Object not found' } };
        return { data: { signedUrl: `https://assinado.exemplo/${bucket}/${caminho}?token=t&ttl=${ttl}` }, error: null };
      },
      upload: async (caminho: string, corpo: any, opcoes?: any) => {
        chamadas.push({ bucket, metodo: 'upload', args: [caminho, corpo, opcoes] });
        const f = falha(bucket, 'upload');
        if (f) return { data: null, error: { message: f.mensagem } };
        if (doBucket(bucket).has(caminho) && !opcoes?.upsert) return { data: null, error: { message: 'The resource already exists' } };
        doBucket(bucket).set(caminho, corpo instanceof Uint8Array ? corpo : new TextEncoder().encode(String(corpo)));
        return { data: { path: caminho }, error: null };
      },
      download: async (caminho: string) => {
        chamadas.push({ bucket, metodo: 'download', args: [caminho] });
        const f = falha(bucket, 'download');
        if (f) return { data: null, error: { message: f.mensagem } };
        const corpo = doBucket(bucket).get(caminho);
        if (!corpo) return { data: null, error: { message: 'Object not found' } };
        return { data: new Blob([Uint8Array.from(corpo)]), error: null };
      },
      list: async (pasta: string, opcoes?: any) => {
        chamadas.push({ bucket, metodo: 'list', args: [pasta, opcoes] });
        const f = falha(bucket, 'list');
        if (f) return { data: null, error: { message: f.mensagem } };
        const prefixo = pasta ? `${pasta}/` : '';
        const data = [...doBucket(bucket).entries()]
          .filter(([c]) => c.startsWith(prefixo) && !c.slice(prefixo.length).includes('/'))
          .map(([c, corpo]) => ({ id: c, name: c.slice(prefixo.length), metadata: { size: corpo.length } }));
        return { data, error: null };
      },
      remove: async (caminhos: string[]) => {
        chamadas.push({ bucket, metodo: 'remove', args: [caminhos] });
        const f = falha(bucket, 'remove');
        if (f) return { data: null, error: { message: f.mensagem } };
        for (const c of caminhos) doBucket(bucket).delete(c);
        return { data: [], error: null };
      },
      move: async (de: string, para: string, opcoes?: any) => {
        chamadas.push({ bucket, metodo: 'move', args: [de, para, opcoes] });
        const f = falha(bucket, 'move');
        if (f) return { data: null, error: { message: f.mensagem } };
        const corpo = doBucket(bucket).get(de);
        if (!corpo) return { data: null, error: { message: 'Object not found' } };
        doBucket(bucket).delete(de);
        doBucket(opcoes?.destinationBucket || bucket).set(para, corpo);
        return { data: { message: 'Successfully moved' }, error: null };
      },
      getPublicUrl: (caminho: string) => {
        chamadas.push({ bucket, metodo: 'getPublicUrl', args: [caminho] });
        return { data: { publicUrl: `https://projeto.supabase.co/storage/v1/object/public/${bucket}/${caminho}` } };
      },
    }),
  };

  return {
    storage: storage as any,
    chamadas,
    semear,
    existe: (bucket: string, caminho: string) => doBucket(bucket).has(caminho),
    caminhos: (bucket: string) => [...doBucket(bucket).keys()].sort(),
    falhar: (bucket: string, metodo: string, mensagem: string) => { falhas.push({ bucket, metodo, mensagem }); },
    reset(inicialNovo: Record<string, string[]> = {}) {
      objetos.clear();
      chamadas.length = 0;
      falhas.length = 0;
      for (const [bucket, caminhos] of Object.entries(inicialNovo)) for (const c of caminhos) semear(bucket, c);
    },
  };
}
