/** Compartilhado pelo worker e pelo cron. Nenhum segredo fica no banco/log. */
export function bunnyPronto(b, altura = 720) {
  return [3, 4].includes(b?.status) && b.length > 0
    && String(b.availableResolutions || '').split(',').some(r => Number.parseInt(r, 10) >= altura);
}

export async function registrarPublicacao(pool, p) {
  if (!p.cellVideoId || !p.fingerprint || !p.bunnyId || !p.library || !p.url) throw new Error('Publicação sem identificação/revisão');
  const { rows: [row] } = await pool.query(`INSERT INTO video_publicacoes
    (cell_video_id,colaborador_id,bunny_video_id,bunny_library,video_url,deck_fingerprint,altura_minima)
    VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(bunny_video_id) DO UPDATE SET bunny_video_id=excluded.bunny_video_id RETURNING id`,
    [p.cellVideoId,p.colaboradorId || null,p.bunnyId,String(p.library),p.url,p.fingerprint,p.altura || 720]);
  if (p.colaboradorId) {
    await pool.query(`UPDATE videos_personalizados SET status=CASE WHEN bunny_video_id IS NOT NULL THEN 'done' ELSE 'processing' END,updated_at=now()
      WHERE cell_video_id=$1 AND colaborador_id=$2`, [p.cellVideoId,p.colaboradorId]);
  } else {
    await pool.query(`UPDATE videos_gerados SET status=CASE WHEN bunny_video_id IS NOT NULL THEN 'done' ELSE 'processing' END,etapa='encode_bunny',updated_at=now()
      WHERE id=$1 AND render_fingerprint=$2`, [p.cellVideoId,p.fingerprint]);
  }
  return row.id;
}

export async function confirmarPublicacoes(pool, opts = {}) {
  const token = opts.token || process.env.BUNNY_STREAM_API_KEY;
  if (!token) throw new Error('BUNNY_STREAM_API_KEY ausente');
  const { rows } = await pool.query(`SELECT * FROM video_publicacoes WHERE estado='pendente'
    AND ($2::uuid[] IS NULL OR id=ANY($2::uuid[])) ORDER BY updated_at,id LIMIT $1`, [Math.min(opts.limite || 80,200),opts.ids || null]);
  const resultado = { examinados: rows.length, publicados: 0, pendentes: 0, obsoletos: 0, falhas: 0 };
  for (let i = 0; i < rows.length; i += 4) await Promise.all(rows.slice(i,i+4).map(async p => {
    try {
      const r = await (opts.fetchFn || fetch)(`https://video.bunnycdn.com/library/${p.bunny_library}/videos/${p.bunny_video_id}`,
        { headers: { AccessKey: token }, signal: AbortSignal.timeout(10000) });
      if (!r.ok) throw new Error(`Bunny HTTP ${r.status}`);
      const b = await r.json();
      if ([5,8].includes(b.status)) {
        await pool.query("UPDATE video_publicacoes SET estado='erro',erro=$2,updated_at=now() WHERE id=$1",[p.id,`Bunny falhou (${b.status})`]);
        resultado.falhas++; return;
      }
      if (!bunnyPronto(b,p.altura_minima)) {
        // Rotaciona a próxima página: encodes lentos não bloqueiam todos os novos.
        await pool.query('UPDATE video_publicacoes SET updated_at=now(),erro=null WHERE id=$1',[p.id]);
        resultado.pendentes++; return;
      }
      // A revisão é validada NO UPDATE: um encode antigo nunca substitui um deck novo.
      const atualizado = p.colaborador_id
        ? await pool.query(`UPDATE videos_personalizados p SET status='done',video_url=$3,bunny_video_id=$4,bunny_library=$5,deck_fingerprint=$6,error=null,updated_at=now()
            FROM videos_gerados v WHERE p.cell_video_id=$1 AND p.colaborador_id=$2 AND v.id=p.cell_video_id AND v.render_fingerprint=$6 RETURNING p.id`,
            [p.cell_video_id,p.colaborador_id,p.video_url,p.bunny_video_id,p.bunny_library,p.deck_fingerprint])
        : await pool.query(`UPDATE videos_gerados SET status='done',etapa='done',video_url=$2,bunny_video_id=$3,bunny_library=$4,error=null,updated_at=now()
            WHERE id=$1 AND render_fingerprint=$5 RETURNING id`,[p.cell_video_id,p.video_url,p.bunny_video_id,p.bunny_library,p.deck_fingerprint]);
      const estado = atualizado.rowCount ? 'publicado' : 'obsoleto';
      await pool.query('UPDATE video_publicacoes SET estado=$2,erro=null,updated_at=now() WHERE id=$1 AND estado=\'pendente\'',[p.id,estado]);
      if (atualizado.rowCount) resultado.publicados++; else resultado.obsoletos++;
    } catch (e) {
      resultado.falhas++;
      await pool.query('UPDATE video_publicacoes SET erro=$2,updated_at=now() WHERE id=$1',[p.id,String(e?.message || e).slice(0,300)]);
    }
  }));
  return resultado;
}
