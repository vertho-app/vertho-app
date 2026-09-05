import 'server-only';
import { maskTextPII } from '@/lib/pii-masker';
export { geradorRecepcao, codigoFalha } from './gerador';
// Redução de identificadores comuns; não equivale a detectar todos os dados pessoais.
export function textoParaTreino(texto:string) { return maskTextPII(texto).trim(); }
