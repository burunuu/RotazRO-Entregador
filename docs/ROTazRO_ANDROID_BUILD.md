# Build Android — RotazRO Entregador

> Auditoria de 2026-09-15. Baseado em builds reais executados nesta e em sessões anteriores, não em suposição.

## Stack de build

- Vite 8 + TypeScript 6 (`tsc -b && vite build`) gera o bundle web em `dist/`.
- Capacitor 8 copia `dist/` para `android/app/src/main/assets/public` (`npx cap sync android`).
- Gradle compila o APK Android nativo.

## Comando completo (dev local)

```bash
npm run lint
npm run build          # tsc -b && vite build
npx cap sync android
cd android
./gradlew.bat assembleDebug
```

APK gerado em: `android/app/build/outputs/apk/debug/app-debug.apk`.

## Bug de ambiente conhecido — leitura obrigatória antes de tentar buildar

**Sintoma**: `./gradlew assembleDebug` falha com `Unable to establish loopback connection` (erro do Gradle daemon, não do código do app).

**Causa raiz real** (confirmada por diagnóstico extenso em sessão anterior — NÃO é VirtualBox, NÃO é versão de JDK, ambos foram testados e descartados): o JDK usa `WEPollSelectorImpl` no Windows, que cria um socket `AF_UNIX` com caminho derivado de `%TEMP%`. O Windows limita `sockaddr_un.sun_path` a 108 bytes. Em ambientes com `%TEMP%` profundo (ex.: dentro de um sandbox de agente), o caminho efetivo estoura esse limite.

**Correção que funciona sempre**: apontar `TEMP`/`TMP` para um caminho curto antes de rodar o Gradle.

```bash
mkdir -p /c/jtmp
TEMP=C:\\jtmp TMP=C:\\jtmp JAVA_HOME="<caminho do JDK>" ./gradlew.bat assembleDebug --console=plain
```

Referência: `github.com/anthropics/claude-code/issues/77508`.

## JDK usado

`C:\Users\Bruno Henrique\.jdks\jbr-21.0.11` (JetBrains Runtime 21) — testado e funcionando. `android/gradle.properties` também tem `-Djava.net.preferIPv4Stack=true -Djava.net.preferIPv6Addresses=false` em `org.gradle.jvmargs` — tentativa defensiva de uma rodada anterior, não resolveu sozinha o bug acima (o fix real é o `TEMP` curto), mas foi mantida por ser inofensiva.

## CI

**Não existe.** Nenhum `.github/workflows` neste repositório. Toda validação (lint/build/assembleDebug) até hoje foi manual, rodada localmente por um agente ou pelo desenvolvedor. Isso é uma lacuna real para produção — nenhum PR passa por verificação automática antes de merge.

## ADB neste ambiente de sandbox (aviso para sessões futuras de IA)

Comandos de metadado (`adb devices`) funcionam neste sandbox específico, mas qualquer operação de transferência de dados (`adb shell`, `adb install`, `adb push`, `adb logcat`, `adb exec-out`) falha consistentemente com `error: closed` — mesmo depois de matar processos `adb.exe` órfãos e reiniciar o servidor. Causa não identificada (mesma classe de limitação do bug do Gradle: sockets de longa duração dentro do sandbox). **Nunca finja ter testado no dispositivo** — reporte essa limitação honestamente e peça para o usuário testar manualmente, como já é prática estabelecida neste projeto.

## Assinatura / release

Não auditado nesta rodada (fora do escopo — nenhuma menção a keystore de release, Play Store, ou pipeline de assinatura foi encontrada nos arquivos revisados). Antes de qualquer publicação real, isso precisa ser levantado à parte.
