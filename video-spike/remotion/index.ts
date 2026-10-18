import { registerRoot } from 'remotion';
// Primeiro: segura o render até as fontes da marca carregarem (ver fontes.ts).
import './fontes';
import { RemotionRoot } from './Root';

registerRoot(RemotionRoot);
