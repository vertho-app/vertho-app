import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEMO_PRESENTATION_VIDEO, DEMO_PRESENTATION_WEEK_VIDEO } from '@/lib/demo/reset-acme-demo';

const read = (file: string) => readFileSync(join(process.cwd(), file), 'utf8');

describe('experiência de mídia na apresentação', () => {
  const week = read('app/dashboard/temporada/semana/[week]/page.tsx');
  const content = read('app/dashboard/conteudo/[id]/content-experience.tsx');
  const bunny = read('components/bunny-video-player.tsx');
  const tracking = read('lib/use-bunny-tracking.ts');

  it('mantém texto e case no leitor interno da semana', () => {
    expect(week).not.toContain('target="_blank"');
    expect(week).toContain("ativo === 'texto' || ativo === 'case'");
    expect(week).toContain('/api/conteudo/${encodeURIComponent(fonteId)}/pdf');
  });

  it('cada nova abertura de vídeo ou podcast começa em 00:00', () => {
    expect(bunny).toContain('player.setCurrentTime(0)');
    expect(tracking).toContain('player.setCurrentTime(0)');
    expect(week).toContain('event.currentTarget.currentTime = 0');
    expect(content).toContain('event.currentTarget.currentTime = 0');
    expect(week).toContain('setMediaSession((current) => current + 1)');
  });

  it('usa conteúdo editorial com saudação nominal da Bruna na mesma voz', () => {
    expect(DEMO_PRESENTATION_VIDEO.bunny_video_id)
      .toBe('e8b77be3-ce8d-4993-8e18-b1cc1514a5ab');
    expect(DEMO_PRESENTATION_VIDEO.titulo).not.toMatch(/jornada semanal|tutorial/i);
    expect(DEMO_PRESENTATION_WEEK_VIDEO.personalizedBunnyVideoId)
      .toBe('8c3fd9f0-eb48-4398-aac6-242a1398e1e1');
  });
});

describe('resultados e perfis da apresentação', () => {
  it('mostra somente o nível por competência, sem badge de nota', () => {
    const assessment = read('app/dashboard/assessment/page.tsx');
    expect(assessment).toContain("t('done.level')");
    expect(assessment).not.toContain("t('done.score')");
  });

  it('faz cada card do gestor abrir a experiência comportamental completa e escopada', () => {
    const page = read('app/dashboard/gestor/page.tsx');
    const profile = read('app/dashboard/perfil-comportamental/page.tsx');
    const action = read('app/dashboard/perfil-comportamental/perfil-comportamental-actions.ts');
    expect(page).toContain('/dashboard/perfil-comportamental?colaborador=');
    expect(profile).toContain('loadPerfilCISGestor(colaboradorAlvo)');
    expect(profile).toContain('loadBehavioralReportGestor(colaboradorAlvo)');
    expect(profile).toContain('canGenerateInsights={!visaoGestor}');
    expect(action).toContain('export async function loadPerfilCISGestor(colaboradorId: string)');
    expect(action).toContain('canViewColabJourney(ctx, alvo as any)');
  });

  it('leva a equipe para a trilha individual real em modo somente leitura', () => {
    const manager = read('app/dashboard/gestor/page.tsx');
    const season = read('app/dashboard/temporada/page.tsx');
    expect(manager).toContain('/dashboard/temporada?colaborador=');
    expect(manager).toContain("disabled={e.status === 'sem_trilha'}");
    expect(season).toContain('await loadTemporada(colaboradorAlvo)');
    expect(season).toContain("t('managerView.title')");
    expect(season).toContain('router.push(s.semana === semCenarioB ?');
    expect(season).toContain('urlConsulta');
    expect(season).not.toContain('disabled={!liberada || visaoGestor}');
  });

  it('abre a semana de terceiro em prévia sem gravar progresso ou telemetria', () => {
    const week = read('app/dashboard/temporada/semana/[week]/page.tsx');
    const videoAction = read('actions/gerar-video.ts');
    expect(week).toContain('await loadTemporada(colaboradorAlvo, { semanaTranscrito: semanaNum })');
    expect(week).toContain('resolverVideoDaSemanaGestor(colaboradorAlvo');
    expect(week).toContain('if (visaoLeitura) return;');
    expect(week).toContain('!visaoLeitura && !isAplicacao && !isAvaliacao');
    expect(videoAction).toContain('export async function resolverVideoDaSemanaGestor');
    expect(videoAction).toContain('canViewColabJourney(ctx, colab)');
    expect(videoAction).toContain('resolverVideoDaSemanaParaColaborador(tdb.raw, colab, competencia, descritor, false, opts)');
  });

  it('mantém o ranking estável por tenant e abre a primeira fotografia', () => {
    const ranking = read('components/ranking-adequacao-view.tsx');
    const rhPage = read('app/dashboard/gestor/ranking/page.tsx');
    expect(ranking).toContain('listarRef.current = listar');
    expect(ranking).toContain('}, [scopeKey]);');
    expect(ranking).toContain('void run(disponiveis[0])');
    expect(rhPage).toContain('scopeKey="rh-session"');
  });
});
