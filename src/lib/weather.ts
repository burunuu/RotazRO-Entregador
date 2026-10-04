import {
  Sun,
  Moon,
  Cloud,
  CloudSun,
  CloudMoon,
  CloudFog,
  CloudDrizzle,
  CloudRain,
  CloudSnow,
  CloudLightning,
  type LucideIcon,
} from 'lucide-react'

export type WeatherReading = {
  temperature: number
  weatherCode: number
  isDay: boolean
  fetchedAt: number
}

/**
 * WMO weather code (retornado pelo Open-Meteo em `current.weather_code`) +
 * dia/noite -> ícone Lucide. A condição tem prioridade; dia/noite só
 * escolhe entre as duas variantes de um mesmo estado (sol/lua,
 * parcialmente nublado dia/noite) — nunca troca por causa só do horário.
 * Códigos fora da tabela (ou clima desconhecido) não têm ícone — nunca cai
 * num sol "padrão" sem saber o clima de verdade.
 */
export function weatherIcon(code: number, isDay: boolean): LucideIcon | null {
  if (code === 0 || code === 1) return isDay ? Sun : Moon
  if (code === 2) return isDay ? CloudSun : CloudMoon
  if (code === 3) return Cloud
  if (code === 45 || code === 48) return CloudFog
  if ([51, 53, 55, 56, 57].includes(code)) return CloudDrizzle
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return CloudRain
  if ([71, 73, 75, 77, 85, 86].includes(code)) return CloudSnow
  if ([95, 96, 99].includes(code)) return CloudLightning
  return null
}

/** Além deste tempo sem uma leitura nova, o clima é tratado como
 * desconhecido na tela — nunca fica exibindo um valor antigo como se fosse
 * atual indefinidamente. */
export const WEATHER_STALE_MS = 45 * 60 * 1000

/** `null` quando não há leitura ou ela já passou de WEATHER_STALE_MS. */
export function freshWeatherReading(
  reading: WeatherReading | null,
  now: number,
): WeatherReading | null {
  if (!reading) return null
  return now - reading.fetchedAt <= WEATHER_STALE_MS ? reading : null
}
