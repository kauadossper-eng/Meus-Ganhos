# Meus Ganhos

App para registrar cada dia trabalhado (recepcionista ou monitor), quanto recebeu, e acompanhar o total do mês, a meta e a comparação com o mês anterior.

Site: https://profound-mousse-575028.netlify.app

## Arquivos

| Arquivo | O que é |
|---|---|
| `index.html` | Estrutura das telas |
| `estilo.css` | Cores, fontes e animações |
| `app.js` | Funcionamento do app |
| `config.js` | Ligação com o Firebase (não mexer) |
| `manifest.webmanifest`, `sw.js`, `icone-*.png`, `apple-touch-icon.png` | Ícone na tela inicial, tela cheia e uso sem internet |
| `firestore.rules` | Regras de segurança do banco (copiar para o Firebase quando mudar) |
| `netlify.toml` | Configuração de publicação no Netlify |

## Onde ficam os dados

Firebase Firestore, projeto `meu-rendimento-1ec1f`:

- `usuarios/{id do usuário}/ganhos/{id}` — `data` (AAAA-MM-DD), `valor` (número), `funcao` (`recepcionista` ou `monitor`), `criadoEm`, `editadoEm`
- `usuarios/{id do usuário}/metas/{AAAA-MM}` — `valor`

Não renomeie esses caminhos nem os campos, senão os dados salvos deixam de aparecer.

## Como publicar uma mudança

O Netlify está ligado a este repositório: qualquer arquivo alterado e salvo (commit) aqui no GitHub vai para o ar sozinho em cerca de 1 minuto.
