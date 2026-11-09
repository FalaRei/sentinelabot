# Sentinela: copiloto de trading com IA

App web que vê o gráfico do trader (partilha de ecrã), explica-o em voz alta com o Claude e aplica regras de disciplina e risco.

## Comandos

| Comando | O que faz |
|---|---|
| `npm install` | Instala as dependências (só na primeira vez) |
| `npm run dev` | Abre a app em modo de desenvolvimento (http://localhost:5173) |
| `npm test` | Corre os testes automáticos |
| `npm run site` | Gera a pasta `dist/` (página de vendas, app em `dist/app/` e termos) pronta a publicar |
| `npm run servir` | Mostra a pasta `dist/` em http://localhost:4173 |
| `npm run licencas -- 50` | Gera 50 chaves de licença para vender |
| `npm run testar-api` | Teste real da IA (precisa de `ANTHROPIC_API_KEY`; custa ~1 cêntimo) |

## Estrutura

```
index.html      página de vendas (gráfico ao vivo, simulador de 50 traders, teste de perfil)
app/index.html  a app (cockpit)
termos.html     termos, aviso de risco e privacidade
src/core/       lógica pura e testada: risco, regras, diário, análise, licenças, patentes/XP,
                simulador Monte Carlo, mercado simulado, deteção de mudanças
src/services/   browser e API: Claude, captura de ecrã, voz, armazenamento
src/ui/         gráficos (TradingView Lightweight Charts + SVG) e sons
src/landing/    código da página de vendas e do teste de perfil
src/main.js     interface da app
src/config.js   DEFINIÇÕES DO VENDEDOR: links de pagamento, apoio, afiliados, vagas, contacto
marketing/      guia de venda, guiões de vídeo, plano de receita (simulador)
scripts/        gerador de licenças, teste da API, servidor local
```

## Lançar

Segue `marketing/LANCAMENTO.md` pela ordem. `npm run verificar` diz o que falta antes de vender (links de pagamento, contacto, termos, licenças, site compilado). `netlify.toml` e `public/_headers` já estão prontos para o Netlify, com cabeçalhos de segurança; `npm run servir` aplica os mesmos cabeçalhos em casa.

## Como funciona a IA

- Uma só chave nas Definições: `AIza...` usa a Google (`gemini-3.8-flash`, o padrão e o mais barato), `sk-ant-...` usa a Anthropic (`claude-sonnet-5-5` ou `claude-opus-5-5`). Todo o acesso passa por `src/services/ia.js`.
- Google: Interactions API (`/v1beta/interactions`, `response_format` com o JSON schema, `store: false`), em `src/services/gemini.js`. Ainda não foi testada com uma chave real: corre `npm run testar-api` com `GEMINI_API_KEY`.
- Anthropic: saída estruturada, esforço `low` e `fallbacks: "default"` (beta `server-side-fallback-2026-07-01`), em `src/services/claude.js`.
- A IA lê o gráfico **no fecho de cada vela** do timeframe escolhido (`src/core/cadencia.js`), mais quando o trader carrega em "Ler agora" ou faz uma pergunta.
- A voz fala só o importante por defeito: alertas, mudança de estrutura e regras cumpridas. Escolhe automaticamente as vozes "Natural" do Edge.
- Modo Prop Firm (`src/core/propfirm.js` e `folgas` em `src/core/rules.js`): perda diária, perda total e meta, com aviso antes de um trade cujo stop faça passar um limite.
- O prompt proíbe ordens de compra e venda e previsões; a IA só descreve, explica e verifica as regras do trader.
- A chave é do cliente e vai diretamente do browser para a Google ou a Anthropic.
