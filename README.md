# LinkedIn Feed Adblock

Remove posts patrocinados e sugeridos do feed do LinkedIn. Não tem popup, background, servidor nem permissões extras: só um content script.

## Instalar

**Chrome / Brave / Edge:** abra `chrome://extensions/`, ative o **Modo do desenvolvedor**, clique em **Carregar sem compactação** e escolha esta pasta.

**Firefox (128+):** abra `about:debugging#/runtime/this-firefox`, clique em **Carregar extensão temporária** e escolha o `manifest.json`. Nesse modo ela some ao fechar o Firefox.

## Conferir

No console da aba do feed:

```js
__linkedinAdblock.getStats()
```

- `promoted` e `suggested`: itens removidos das respostas da API.
- `hiddenCards`: cards escondidos na página.

## Como funciona

1. **Rede:** intercepta `window.fetch` e tira os itens das respostas da API do feed.
2. **Página:** um `MutationObserver` esconde, em `/feed`, os cards com rótulos como "Promoted" ou "Sugerido".

Os rótulos ficam no início do `content.js`. Se o LinkedIn mudar textos ou classes, é lá e em `findCard` que se ajusta.
