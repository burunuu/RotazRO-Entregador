import { appDisplayVersion } from '../lib/app-version'

/** Identificação discreta da versão (rodapé da tela de login). */
export function AppVersionLabel() {
  return <p className="app-version">RotazRO • {appDisplayVersion()}</p>
}
