# Ícone do app — aplicado

Registrado em 2026-09-27 (rodada "acabamento visual e branding"). O ícone
oficial do RotazRO já está aplicado no launcher Android, substituindo o
placeholder padrão do Capacitor/Android Studio (grade verde-azulada
genérica, `#26A69A`) que o projeto usava desde o scaffold inicial.

## Fonte

`icone app RotazRO.png` (raiz do repo) — PNG 1024×1024, fundo transparente,
enviado pelo usuário. A arte em si (o R amarelo com o pin/rota em grafite)
não foi redesenhada, recolorida nem distorcida — só redimensionada e
recentralizada dentro da safe zone do Android Adaptive Icon (ver abaixo).

## Como o Android gera os ícones aqui

Formato de **adaptive icon** (obrigatório desde o Android 8/API 26, com
fallback automático para telas mais antigas):

```
android/app/src/main/res/
  mipmap-anydpi-v26/ic_launcher.xml        # adaptive icon (Android 8+):
  mipmap-anydpi-v26/ic_launcher_round.xml  #   @color/ic_launcher_background + @mipmap/ic_launcher_foreground
  mipmap-{m,h,xh,xxh,xxxh}dpi/ic_launcher*.png  # fallback pré-API 26,
                                                  # um PNG por densidade
  values/ic_launcher_background.xml        # cor de fundo sólida (#C9862B)
```

O projeto usava antes um `drawable-v24/ic_launcher_foreground.xml`
(vetor) e `drawable/ic_launcher_background.xml` (vetor, a grade teal do
placeholder) que **não eram referenciados por nada** — o
`ic_launcher.xml` já apontava para `@mipmap/ic_launcher_foreground`
(PNG), não para o drawable vetorial. Esses dois arquivos mortos foram
removidos junto com a troca de ícone.

## O que foi feito

1. Recorte da margem transparente já existente no PNG (sem alterar o
   desenho) e reamostragem para caber dentro da **safe zone** do adaptive
   icon — a região central (~66–68% do canvas) garantida visível em
   qualquer máscara de launcher (círculo, squircle, cantos arredondados).
   Sem esse ajuste, a arte original (que já tocava quase todas as bordas
   do quadro 1024×1024) teria a base do R e a ponta do pin cortadas por
   uma máscara circular.
2. **Foreground**: o R centralizado, fundo transparente — vira
   `ic_launcher_foreground.png` em cada densidade (108/162/216/324/432px).
3. **Background**: cor sólida `#C9862B` — o mesmo âmbar institucional já
   usado como `--accent` em toda a UI do app (login, botões, GPS). Vira
   `@color/ic_launcher_background`.
4. **Legacy** (`ic_launcher.png`, pré-Android 8) e **round**
   (`ic_launcher_round.png`): mesmo composto (fundo + R), o round
   recortado num círculo — cobrindo mdpi/hdpi/xhdpi/xxhdpi/xxxhdpi
   (48/72/96/144/192px).
5. Nenhuma densidade ficou apontando para o ícone antigo — conferido
   byte a byte no APK debug gerado nesta rodada.

## Se um novo ícone for enviado no futuro

Um único arquivo é suficiente: **PNG 1024×1024, fundo transparente**, com
a marca dentro de ~66% do quadro central (ou full-bleed, como desta vez —
o recorte/reamostragem para a safe zone é feito aqui, não precisa vir
pronto). Se vier com fundo/cor de destaque separados, ainda melhor
(foreground e background como dois PNGs).

## Não confundir com

- `favicon.svg` na raiz do projeto: ícone da aba do navegador quando o app
  roda como PWA/web, não o ícone do launcher Android. Ainda não foi
  atualizado com a nova marca (fora do escopo desta rodada, que foi só
  Android).
- `applicationId`/`package_name` (`com.rotazro.entregador`): não mudou.
