# OCTA — exploração visual 01

Primeira rodada de direção de marca: cinco hipóteses estruturais para comparar antes de escolher e refinar. Não altera a identidade do aplicativo.

Abra `octa-cinco-conceitos.png` para a visão comparativa. Cada conceito tem um SVG independente e uma prancha em SVG e PNG com assinatura horizontal, vertical, ícone, inversão, redução e cinco cores. As assinaturas usam Arial provisoriamente; não são o desenho definitivo da palavra OCTA.

| Direção | Construção e relação com o polvo | Força | Limite nesta rodada |
| --- | --- | --- | --- |
| 01 — Alcance | Oito extensões afiladas em torno de uma massa oblíqua. A coordenação é central, mas os braços têm direções diferentes. | Gesto próprio, movimento e expansão. | A leitura pode se aproximar de uma criatura radial; os espaços precisam de ajuste óptico em tamanhos pequenos. |
| 02 — Núcleo | Centro octogonal vazado e oito extensões de mesma espessura. A inteligência central distribui o alcance. | Equilíbrio, compacidade e precisão. | A simetria aproxima o desenho de um asterisco ou conector; exige diferenciação para virar uma marca forte. |
| 03 — Órbita | Uma faixa retorna em torno de um vazio em O; os terminais prolongam o alcance. Usa a continuidade do tentáculo, sem exigir oito braços literais. | Boa associação ao nome e leitura sóbria. | Pode lembrar uma seta circular; é o vínculo mais indireto com o polvo. |
| 04 — Manto | Uma cobertura comum se abre em oito terminais. A anatomia está na divisão da massa, sem olhos ou ventosas. | Silhueta compacta e memorável. | É o limite mais figurativo da exploração: pode parecer um polvo ou uma água-viva. Para maior abstração, reduzir a cúpula e rever o ritmo inferior. |
| 05 — Trama | Quatro faixas, oito pontas e um vazio central; os canais se tornam uma única estrutura ao se cruzarem. | Modularidade e potencial para linguagem gráfica. | A proximidade com um hashtag é alta; precisa de terminais ou encaixes mais próprios para avançar. |

## Recomendação de direção

Priorizar **Alcance** para desenvolver uma marca orgânica com presença e **Manto** como contraponto de silhueta compacta. O refinamento deve aproximar a precisão de Manto da abstração de Alcance, sem fundir os desenhos automaticamente. Se a leitura de criatura for excessiva nos dois, Órbita é a alternativa mais abstrata, com o custo de uma associação menor ao conceito central.

Núcleo e Trama são hipóteses de contraste estrutural, com risco de genericidade maior. Nesta rodada não têm a mesma força de diferenciação das duas direções principais.

## Critérios para a próxima rodada

- Reconhecimento pela massa preta, sem nome ou cor.
- Distância de flor, sol, aranha, mascote e símbolos comuns de software.
- Revisão dos intervalos entre braços em 16, 24 e 32 px; as amostras são comparações visuais, não aprovação final de favicon.
- Ajuste de centro óptico, espessuras, terminais e espaço de proteção.
- Desenho tipográfico e espaçamento de OCTA depois da escolha do símbolo.
- Geometria final consolidada em contornos e preparação para edição no Figma.
- Liquid glass somente como aplicação complementar da forma aprovada.

## Arquivos e reprodução

Os cinco arquivos `01-alcance.svg` a `05-trama.svg` são vetores reais, com paths, fundo transparente, `viewBox="0 0 240 240"` e `fill="currentColor"`. Abrem em preto por padrão e aceitam outras cores. Não contêm fontes, raster, filtros ou gradientes. As pranchas mantêm textos editáveis e dependem da fonte para reprodução tipográfica.

Para regenerar as pranchas e símbolos a partir da raiz do repositório:

```sh
node docs/brand/octa/exploration/generate.cjs
```

O gerador usa o Sharp já instalado no projeto. Os PNGs servem para comparação e apresentação; os SVGs independentes são os arquivos de geometria. Estes são estudos de desenho e não incluem pesquisa de disponibilidade de marca ou validação de exclusividade.
