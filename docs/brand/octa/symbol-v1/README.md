# OCTA — símbolo entrelaçado / refinamento 01

Direção escolhida: opção A da comparação anterior, com o laço superior maior para tornar a cabeça mais evidente. A nova referência enviada pelo usuário orienta a leveza do traço e a proporção entre a cabeça e os três laços menores.

## Arquivos

- `octa-symbol.svg`: símbolo com fundo transparente e cor herdada por `currentColor` (preto por padrão). Quadro ajustado à geometria com margem de respiro.
- `octa-symbol-white.svg`: mesma geometria em branco para fundo escuro.
- `octa-symbol-source.svg`: geometria na prancheta original de construção.
- `octa-symbol-figma.svg`: SVG exportado diretamente do componente no Figma.
- `octa-symbol-review.png` e `.svg`: comparação em fundo claro e escuro e amostras de redução.
- `build.cjs`: gerador reproduzível, executável com `node docs/brand/octa/symbol-v1/build.cjs` a partir da raiz do repositório.

## Construção

Quatro laços visíveis: um superior dominante, dois laterais e um inferior menor. O símbolo usa curvas Bézier e um traço uniforme de 16 unidades. O entrelaçamento usa interrupções reais no percurso, mantendo transparência sobre qualquer fundo, sem recortes pintados de branco, raster, máscaras ou filtros.

O número de laços não representa literalmente a contagem anatômica de braços. A direção preserva a sugestão de polvo através da cabeça, das extensões e da continuidade dos cruzamentos.

O traço fino desta direção pede uma futura versão óptica para favicon de 16 px. As amostras da prancha documentam essa limitação; não constituem uma aprovação final de legibilidade nesse tamanho.

## Status

Implementado na equipe PRIVADO: [OCTA — Símbolo entrelaçado](https://www.figma.com/design/bxkPsA3bW1YqfXzBoVdLo4?node-id=2-13).

Componente principal `2:12`; prancha de revisão `2:13`; versões clara e escura como instâncias do mesmo componente, com cores vinculadas às variáveis locais da marca. Componente contém um vetor editável e nenhum raster. Prancha verificada visualmente e SVG exportado diretamente do Figma. A identidade do aplicativo não foi alterada.
