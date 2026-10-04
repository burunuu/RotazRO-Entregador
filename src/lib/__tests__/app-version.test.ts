import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { AppVersionLabel } from '../../components/AppVersionLabel'
import { APP_VERSION, appDisplayVersion, formatDisplayVersion } from '../app-version'
import { appPackageVersion, appRelease } from '../observability/version'
import packageRaw from '../../../package.json?raw'
import gradle from '../../../android/app/build.gradle?raw'
import appSource from '../../App.tsx?raw'

const packageJson = JSON.parse(packageRaw) as { version: string }

describe('versão do app', () => {
  it('A) a versão atual é 1.0.0-beta', () => {
    // Quando subir de versão (1.0.1, 1.1.0, 1.0.0 sem beta...), atualize aqui junto com package.json.
    expect(APP_VERSION).toBe('1.0.0-beta')
  })

  it('B) o display é "v1.0.0 (beta)"', () => {
    expect(appDisplayVersion()).toBe('v1.0.0 (beta)')
  })

  it('formata as variações previstas (patch, minor, sem beta, outros sufixos)', () => {
    expect(formatDisplayVersion('1.0.1-beta')).toBe('v1.0.1 (beta)')
    expect(formatDisplayVersion('1.1.0-beta')).toBe('v1.1.0 (beta)')
    expect(formatDisplayVersion('1.0.0')).toBe('v1.0.0')
    expect(formatDisplayVersion('2.0.0')).toBe('v2.0.0')
    expect(formatDisplayVersion('1.2.3-rc.1')).toBe('v1.2.3 (rc.1)')
    expect(formatDisplayVersion('qualquer-coisa')).toBe('vqualquer-coisa')
  })
})

describe('tela de login', () => {
  it('C/D) o rodapé renderiza "RotazRO • v1.0.0 (beta)" a partir da fonte central', () => {
    const html = renderToStaticMarkup(createElement(AppVersionLabel)).replace(/<!-- -->/g, '')
    expect(html).toContain('class="app-version"')
    expect(html).toContain('RotazRO • v1.0.0 (beta)')
    expect(html).toContain(`RotazRO • ${formatDisplayVersion(appPackageVersion())}`)
  })

  it('o login usa o componente de versão', () => {
    expect(appSource).toContain("import { AppVersionLabel } from './components/AppVersionLabel'")
    expect(appSource).toContain('<AppVersionLabel />')
  })
})

describe('coerência entre versão exibida, package.json e Android', () => {
  it('E) a UI mostra exatamente o version do package.json', () => {
    expect(APP_VERSION).toBe(packageJson.version)
    expect(appRelease()).toContain(`@${packageJson.version}+`)
  })

  it('E) o versionName do Android vem do package.json, sem literal próprio', () => {
    expect(gradle).toMatch(/JsonSlurper\(\)\.parse\(file\('\.\.\/\.\.\/package\.json'\)\)/)
    expect(gradle).toMatch(/versionName\s+appPackage\.version/)
    expect(gradle).not.toMatch(/versionName\s+["']/)
  })

  it('E) o versionCode é inteiro e está em 8 ou mais (nunca diminui)', () => {
    const code = Number(/versionCode\s+(\d+)/.exec(gradle)?.[1])
    expect(Number.isInteger(code)).toBe(true)
    expect(code).toBeGreaterThanOrEqual(8)
  })
})
