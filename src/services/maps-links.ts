/**
 * Mesma fórmula de deep link usada no portal do entregador (Web):
 * src/lib/share/maps-links.ts::singleStopUrl. Reimplementada aqui (sem
 * dependência entre os dois repositórios) em vez de inventar uma lógica
 * nova.
 */
export function singleStopMapsUrl(latitude: number, longitude: number): string {
  const params = new URLSearchParams({
    api: '1',
    destination: `${latitude},${longitude}`,
    travelmode: 'driving',
  })
  return `https://www.google.com/maps/dir/?${params.toString()}`
}
