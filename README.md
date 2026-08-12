# Pal Crossing Planner

Calculadora genética para Palworld com catálogo completo de Pals, combinações de reprodução, caminhos genéticos e herança de passivas.

## Funcionalidades

- catálogo com retratos dos Pals;
- cálculo de combinações diretas com as regras de reprodução do Palworld 1.0;
- busca do melhor caminho genético em até cinco gerações;
- importação local dos JSONs convertidos de `Level.sav` e dos jogadores;
- separação da Palbox e filtros pelo nome do jogador;
- seleção pesquisável de até quatro passivas em português brasileiro;
- filtragem de passivas internas ou não selecionáveis;
- interface responsiva com temática gamer.

Os arquivos JSON importados são processados localmente no navegador e não são enviados para servidores externos.

## Requisitos

- Node.js 22.13 ou superior;
- npm.

## Executar localmente

```bash
npm install
npm run dev
```

Abra o endereço exibido pelo Vite no terminal.

## Compilar

```bash
npm run build
```

## Importação dos saves

Converta os arquivos `.sav` do mundo para JSON e selecione simultaneamente:

- `Level.json`;
- os arquivos JSON individuais dos jogadores ativos.

Arquivos terminados em `_dps.json` são ignorados.

## Estrutura principal

- `app/page.tsx`: interface e planejador genético;
- `app/pal-import.ts`: leitura dos saves e associação entre Pals e jogadores;
- `app/pals-catalog.ts`: catálogo e breeding ranks;
- `app/breeding-data.ts`: regras e combinações especiais;
- `app/passive-catalog.ts`: IDs, traduções e raridades das passivas;
- `public/pals/`: retratos locais dos Pals.

## Créditos

Ferramenta independente e não oficial. Palworld e seus personagens pertencem à Pocketpair. Dados e retratos foram revisados com referências públicas, incluindo Palworld.gg e dados extraídos dos arquivos do jogo.
