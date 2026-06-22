import React from 'react';
import {
  Clock, CalendarClock, Hourglass, MessageCircle, Ear, Mic, Megaphone,
  Users, User, Handshake, HeartHandshake, TrendingUp, Target, Crosshair,
  Rocket, Award, Lightbulb, Brain, Eye, Search, Compass, CheckCircle2,
  ListChecks, Workflow, Settings, BookOpen, GraduationCap, PenLine, FileText,
  AlertTriangle, ShieldCheck, Star, Heart, Scale, ThumbsUp, Map as MapIcon,
  Flag, Link, Puzzle, Gauge, Sparkles, RefreshCw, Anchor,
} from 'lucide-react';

type IconCmp = React.FC<{ size?: number; color?: string; strokeWidth?: number; style?: React.CSSProperties }>;

/**
 * Vocabulário CURADO de ícones (nome semântico em pt → componente lucide). A IA do
 * roteiro escolhe um destes nomes por bullet (campo `scene.icons`), casando com o
 * SENTIDO do item. Nome inválido/ausente → fallback ciclado. Mantenha esta lista e
 * a do prompt (`roteiro-prompt.ts`) em sincronia.
 */
export const ICON_REGISTRY: Record<string, IconCmp> = {
  relogio: Clock, prazo: CalendarClock, tempo: Hourglass,
  conversa: MessageCircle, escuta: Ear, voz: Mic, comunicar: Megaphone,
  equipe: Users, pessoa: User, acordo: Handshake, cuidado: HeartHandshake,
  crescimento: TrendingUp, meta: Target, foco: Crosshair, avancar: Rocket,
  reconhecimento: Award, ideia: Lightbulb, pensar: Brain, observar: Eye,
  analisar: Search, direcao: Compass, feito: CheckCircle2, checklist: ListChecks,
  processo: Workflow, ajuste: Settings, aprender: BookOpen, ensino: GraduationCap,
  registrar: PenLine, documento: FileText, risco: AlertTriangle, protecao: ShieldCheck,
  destaque: Star, valor: Heart, equilibrio: Scale, aprovar: ThumbsUp, plano: MapIcon,
  prioridade: Flag, conexao: Link, encaixe: Puzzle, medir: Gauge, melhoria: Sparkles,
  ciclo: RefreshCw, firmeza: Anchor,
};

/** Nomes válidos (para o prompt e validação). */
export const ICON_NAMES = Object.keys(ICON_REGISTRY);

// Fallback quando a cena não trouxe ícone (ou nome inválido): ciclo neutro e variado.
const FALLBACK: IconCmp[] = [Lightbulb, Target, Compass, ListChecks];

/** Resolve o ícone do item `idx` a partir do nome (semântico) ou cai no fallback. */
export function iconByName(name: string | undefined, idx: number): IconCmp {
  const key = String(name || '').trim().toLowerCase();
  return ICON_REGISTRY[key] || FALLBACK[idx % FALLBACK.length];
}
