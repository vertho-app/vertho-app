/**
 * Para onde mandar quem ficou sem sessão dentro do dashboard: o login, levando a
 * tela em que a pessoa estava (`?redirect=`, que o `login-form` honra).
 *
 * Existe em função porque eram dois caminhos e só um levava o destino: a carga da
 * página levava, e a sessão que caía NO MEIO do uso (`onAuthStateChange`) mandava
 * para `/login` puro. Em 08/10/2026 uma pessoa de Ibipeba respondia o mapeamento,
 * "saiu", entrou de novo e caiu na home, que a levou para as semanas da jornada
 * anterior: o mapeamento ficou a três toques de distância.
 */
export function loginComDestino(pathname: string, search = ''): string {
  const destino = `${pathname || ''}${search || ''}`;
  return destino && destino !== '/dashboard' && destino.startsWith('/')
    ? `/login?redirect=${encodeURIComponent(destino)}`
    : '/login';
}
