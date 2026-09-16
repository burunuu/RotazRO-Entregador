/**
 * Mesma fórmula de deep link usada no portal do entregador (Web):
 * src/lib/share/maps-links.ts. Reimplementada aqui (sem dependência entre
 * os dois repositórios) em vez de inventar uma lógica nova.
 */

export interface LatLng {
  latitude: number | null
  longitude: number | null
}

/**
 * A URL de directions do Google Maps (api=1) aceita no máximo 9 waypoints
 * intermediários além de origem e destino — ou seja, até 10 paradas por link.
 */
export const MAX_WAYPOINTS = 9
export const MAX_STOPS_PER_LINK = MAX_WAYPOINTS + 1

function coord(point: LatLng): string | null {
  if (typeof point.latitude !== 'number' || typeof point.longitude !== 'number') return null
  return `${point.latitude},${point.longitude}`
}

export function singleStopMapsUrl(latitude: number, longitude: number): string {
  const params = new URLSearchParams({
    api: '1',
    destination: `${latitude},${longitude}`,
    travelmode: 'driving',
  })
  return `https://www.google.com/maps/dir/?${params.toString()}`
}

/**
 * Monta os links de navegação da rota completa, sempre na ordem recebida.
 * Nunca usa optimize — a sequência já foi decidida pelo RotazRO. Quando há
 * mais paradas do que o Google aceita em um link, divide em blocos
 * consecutivos (o último ponto de um bloco vira a origem do bloco seguinte).
 */
export function fullRouteUrls(origin: LatLng, stops: LatLng[]): string[] {
  const originCoord = coord(origin)
  const points = stops.map(coord).filter((value): value is string => value !== null)
  if (!originCoord || points.length === 0) return []

  const links: string[] = []
  let start = originCoord

  for (let i = 0; i < points.length; i += MAX_STOPS_PER_LINK) {
    const block = points.slice(i, i + MAX_STOPS_PER_LINK)
    const destination = block[block.length - 1]!
    const waypoints = block.slice(0, -1)
    const params = new URLSearchParams({
      api: '1',
      origin: start,
      destination,
      travelmode: 'driving',
    })
    if (waypoints.length > 0) params.set('waypoints', waypoints.join('|'))
    links.push(`https://www.google.com/maps/dir/?${params.toString()}`)
    start = destination
  }

  return links
}
