import { describe, expect, it } from 'vitest'
import { Sun, Moon, CloudSun, CloudMoon, Cloud, CloudFog, CloudDrizzle, CloudRain, CloudSnow, CloudLightning } from 'lucide-react'
import { weatherIcon, freshWeatherReading, WEATHER_STALE_MS, type WeatherReading } from '../weather'

describe('weatherIcon — condição tem prioridade, dia/noite só escolhe a variante', () => {
  it('céu limpo: sol de dia, lua de noite', () => {
    expect(weatherIcon(0, true)).toBe(Sun)
    expect(weatherIcon(0, false)).toBe(Moon)
    expect(weatherIcon(1, true)).toBe(Sun)
    expect(weatherIcon(1, false)).toBe(Moon)
  })

  it('parcialmente nublado: sol+nuvem de dia, lua+nuvem de noite', () => {
    expect(weatherIcon(2, true)).toBe(CloudSun)
    expect(weatherIcon(2, false)).toBe(CloudMoon)
  })

  it('nublado (overcast) não muda com dia/noite', () => {
    expect(weatherIcon(3, true)).toBe(Cloud)
    expect(weatherIcon(3, false)).toBe(Cloud)
  })

  it('neblina', () => {
    expect(weatherIcon(45, true)).toBe(CloudFog)
    expect(weatherIcon(48, false)).toBe(CloudFog)
  })

  it('garoa/drizzle (incl. congelante)', () => {
    for (const code of [51, 53, 55, 56, 57]) {
      expect(weatherIcon(code, true)).toBe(CloudDrizzle)
    }
  })

  it('chuva, chuva congelante e pancadas de chuva — mesma família', () => {
    for (const code of [61, 63, 65, 66, 67, 80, 81, 82]) {
      expect(weatherIcon(code, true)).toBe(CloudRain)
    }
  })

  it('neve e pancadas de neve', () => {
    for (const code of [71, 73, 75, 77, 85, 86]) {
      expect(weatherIcon(code, false)).toBe(CloudSnow)
    }
  })

  it('tempestade/trovoada (com ou sem granizo)', () => {
    for (const code of [95, 96, 99]) {
      expect(weatherIcon(code, true)).toBe(CloudLightning)
    }
  })

  it('código desconhecido não retorna um ícone padrão — nunca "sol por padrão"', () => {
    expect(weatherIcon(-1, true)).toBeNull()
    expect(weatherIcon(999, false)).toBeNull()
  })
})

describe('freshWeatherReading — não mostra dado velho como se fosse atual', () => {
  const reading: WeatherReading = {
    temperature: 27,
    weatherCode: 0,
    isDay: true,
    fetchedAt: 1_000_000,
  }

  it('sem leitura nenhuma: null', () => {
    expect(freshWeatherReading(null, 2_000_000)).toBeNull()
  })

  it('dentro da janela de frescor: retorna a leitura', () => {
    expect(freshWeatherReading(reading, reading.fetchedAt + WEATHER_STALE_MS - 1)).toBe(reading)
  })

  it('exatamente no limite ainda conta como fresco', () => {
    expect(freshWeatherReading(reading, reading.fetchedAt + WEATHER_STALE_MS)).toBe(reading)
  })

  it('passou do limite: vira null, nunca mostra o valor antigo', () => {
    expect(freshWeatherReading(reading, reading.fetchedAt + WEATHER_STALE_MS + 1)).toBeNull()
  })
})
