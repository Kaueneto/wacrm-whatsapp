// Standalone vector exploration. Does not change the application identity.
const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');
const out = __dirname;
const ink = '#152922', paper = '#f1f0e9', green = '#087f5b';
const concepts = [
  {
    id: '01-alcance', name: 'Alcance', tag: 'UM NÚCLEO. OITO DIREÇÕES.',
    idea: ['Oito braços afilados saem de um corpo oblíquo.', 'A assimetria cria avanço e uma silhueta aberta.'],
    strength: 'Expressivo • orgânico • direcional', risk: 'Refinar os intervalos entre os braços a 16 px.',
    body: `<path d="M105 74 C86 63 65 49 40 48 C27 47 22 39 27 32 C34 24 48 28 60 33 L112 53 C102 37 91 22 80 16 C71 10 76 2 86 5 C108 11 121 33 131 53 C137 34 146 17 162 10 C173 5 180 13 171 21 C157 32 153 45 153 62 C175 47 195 45 215 51 C227 55 226 66 214 66 C194 62 179 70 166 81 C191 81 212 88 225 102 C233 111 226 119 216 112 C200 101 184 100 165 103 C183 117 195 134 196 154 C197 166 186 170 182 157 C176 140 164 130 149 123 C150 147 144 167 131 180 C122 189 113 182 120 172 C130 155 129 140 123 124 C112 148 96 162 76 166 C64 168 60 158 73 153 C92 146 101 132 105 114 C109 103 108 95 105 87 Z" transform="translate(-3 14)"/>`,
  },
  {
    id: '02-nucleo', name: 'Núcleo', tag: 'COORDENAÇÃO EM OITO EIXOS.',
    idea: ['Um centro octogonal distribui oito braços radiais.', 'O mesmo módulo organiza toda a expansão.'],
    strength: 'Compacto • preciso • estável', risk: 'O ritmo radial pode lembrar um sol ou conector.',
    body: `<path fill-rule="evenodd" d="M93 69 L123 57 L153 69 L165 99 L153 129 L123 141 L93 129 L81 99 Z M109 86 L109 112 L135 112 L135 86 Z"/>${Array.from({length:8},(_,i)=>`<path d="M111 76 L111 29 Q111 18 123 18 Q135 18 135 29 L135 76 Z" transform="rotate(${i*45} 123 99)"/>`).join('')}`,
  },
  {
    id: '03-orbita', name: 'Órbita', tag: 'O NOME DENTRO DO GESTO.',
    idea: ['Um braço se dobra e delimita o O em espaço negativo.', 'Dois terminais revelam alcance e continuidade.'],
    strength: 'Sóbrio • fluido • próximo ao nome', risk: 'A relação com o polvo é mais sutil nesta direção.',
    body: `<path d="M186 49 C165 27 132 22 105 30 C67 41 44 72 44 110 C44 151 75 181 115 181 C145 181 171 165 183 141 C191 125 193 112 188 101 C183 90 170 88 161 96 C156 101 155 109 151 118 C145 133 132 142 117 142 C96 142 81 127 81 107 C81 86 98 68 119 65 C140 61 154 69 164 78 C173 87 185 84 191 76 L215 43 C220 36 216 29 209 31 Z"/><path d="M63 131 C49 142 32 151 20 151 C11 151 8 160 16 165 C35 178 59 170 79 159 Z"/>`,
  },
  {
    id: '04-manto', name: 'Manto', tag: 'UMA ANATOMIA TRANSFORMADA EM MARCA.',
    idea: ['Uma cobertura contínua se abre em quatro pares.', 'Os oito terminais nascem da mesma massa.'],
    strength: 'Silhueta forte • acolhedor • memorável', risk: 'É a direção mais próxima de uma criatura.',
    body: `<path d="M29 109 C39 102 43 87 49 71 C61 38 89 24 120 24 C153 24 178 43 187 71 C193 90 197 102 213 109 C224 114 223 126 213 129 C202 132 190 125 180 115 L194 146 C198 156 188 162 181 154 L156 126 L163 161 C165 172 154 176 149 166 L131 130 L143 169 C146 180 135 185 130 174 L120 150 L111 174 C106 185 95 180 98 169 L109 131 L92 166 C87 176 76 172 78 161 L85 126 L60 154 C53 162 43 156 47 146 L61 115 C50 126 39 133 29 129 C18 126 18 114 29 109 Z"/>`,
  },
  {
    id: '05-trama', name: 'Trama', tag: 'CANAIS INDEPENDENTES. AÇÃO CONJUNTA.',
    idea: ['Quatro faixas se cruzam e preservam um vazio central.', 'A conexão aparece no encaixe entre os módulos.'],
    strength: 'Modular • arquitetônico • expansível', risk: 'A trama pode se aproximar de um hashtag; refinar o gesto.',
    body: `<g transform="rotate(-12 120 120)"><path d="M75 39 Q75 28 86 28 Q97 28 97 39 L97 201 Q97 212 86 212 Q75 212 75 201 Z M143 39 Q143 28 154 28 Q165 28 165 39 L165 201 Q165 212 154 212 Q143 212 143 201 Z"/><path d="M39 75 L201 75 Q212 75 212 86 Q212 97 201 97 L39 97 Q28 97 28 86 Q28 75 39 75 Z M39 143 L201 143 Q212 143 212 154 Q212 165 201 165 L39 165 Q28 165 28 154 Q28 143 39 143 Z"/></g>`,

  },
];
const esc = s => s.replaceAll('&','&amp;').replaceAll('<','&lt;');
function text(x,y,s,size=16,color=ink,extra='') { return `<text x="${x}" y="${y}" font-family="Arial, sans-serif" font-size="${size}" fill="${color}" ${extra}>${esc(s)}</text>`; }
function symbol(c,x,y,size,color=ink) { return `<g transform="translate(${x} ${y}) scale(${size/240})" fill="${color}">${c.body}</g>`; }
function svg(w,h,body,title) { return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${title}">${body}</svg>`; }
function card(c,x,y) {
  return `<g transform="translate(${x} ${y})"><rect width="548" height="534" rx="6" fill="#fafaf6"/>`+
    text(28,39,c.id.slice(0,2)+' / '+c.name,21,ink,'font-weight="700"')+
    text(28,65,c.tag,10,'#5e6c62','letter-spacing="1.2"')+
    symbol(c,144,76,260)+
    `<path d="M28 334 H520" stroke="#dedfd5"/>`+
    c.idea.map((s,i)=>text(28,362+i*22,s,14)).join('')+
    text(28,419,c.strength,13,green)+
    `<rect x="28" y="447" width="76" height="64" rx="12" fill="${ink}"/>`+symbol(c,39,453,54,'#ffffff')+
    symbol(c,135,463,32)+symbol(c,189,469,24)+symbol(c,235,473,16)+
    [green,'#3468d4','#8556ce','#c44585','#d36c26'].map((col,i)=>symbol(c,319+i*38,465,28,col)).join('')+`</g>`;
}
async function save(name,w,h,body,title) {
  const data = svg(w,h,body,title);
  fs.writeFileSync(path.join(out,name+'.svg'),data);
  await sharp(Buffer.from(data)).png().toFile(path.join(out,name+'.png'));
}
(async()=>{
  for(const c of concepts) {
    fs.writeFileSync(path.join(out,c.id+'.svg'),svg(240,240,`<g fill="currentColor">${c.body}</g>`,'OCTA — '+c.name+' — estudo conceitual'));
    let detail = `<rect width="1440" height="1000" fill="${paper}"/>`+
      text(56,65,'OCTA / '+c.id.slice(0,2)+' — '+c.name,34,ink,'font-weight="700"')+
      text(56,100,c.tag,12,green,'letter-spacing="2"')+
      `<rect x="56" y="140" width="570" height="490" rx="8" fill="#fafaf6"/>`+symbol(c,146,178,390)+
      `<rect x="650" y="140" width="734" height="240" rx="8" fill="${ink}"/>`+symbol(c,695,177,175,'white')+text(897,285,'OCTA',82,'#fff','font-weight="700" letter-spacing="5"')+
      `<rect x="650" y="400" width="350" height="230" rx="8" fill="#fafaf6"/>`+symbol(c,755,417,140)+text(775,594,'OCTA',28,ink,'font-weight="700" letter-spacing="4"')+
      `<rect x="1024" y="400" width="360" height="230" rx="8" fill="#e0e5dc"/>`+
      `<rect x="1131" y="434" width="148" height="148" rx="34" fill="${ink}"/>`+symbol(c,1147,450,116,'#fff')+
      text(56,679,'CONSTRUÇÃO',11,green,'letter-spacing="2"')+
      c.idea.map((s,i)=>text(56,713+i*26,s,18)).join('')+
      text(56,791,'Ponto forte: '+c.strength,16)+text(56,823,'Atenção: '+c.risk,16)+
      text(812,679,'REDUÇÃO / 48 · 32 · 24 · 16 PX',11,green,'letter-spacing="1.5"')+
      symbol(c,815,704,48)+symbol(c,891,715,32)+symbol(c,951,720,24)+symbol(c,1001,724,16)+
      [green,'#3468d4','#8556ce','#c44585','#d36c26'].map((col,i)=>symbol(c,812+i*85,791,60,col)).join('')+
      `<path d="M56 910 H1384" stroke="#ced4c9"/>`+
      text(56,945,'EXPLORAÇÃO 01 / Assinaturas tipográficas provisórias. Símbolo vetorial sem efeitos.',13,'#5e6c62')+
      text(56,970,'O SVG independente usa currentColor. Liquid glass reservado para a direção escolhida.',13,'#5e6c62');
    await save(c.id+'-prancha',1440,1000,detail,'OCTA — estudo '+c.name);
  }
  const panelX=1228,panelY=760;
  let board = `<rect width="1832" height="1390" fill="${paper}"/>`+
    text(56,77,'OCTA',52,ink,'font-weight="700" letter-spacing="6"')+
    text(1780,58,'IDENTIDADE / EXPLORAÇÃO 01',12,green,'text-anchor="end" letter-spacing="2"')+
    text(56,125,'Uma inteligência. Múltiplos alcances.',25)+
    text(56,164,'Cinco estruturas para escolher pela silhueta. Vetores planos, sem efeitos ou dependência de cor.',16,'#5e6c62')+
    concepts.map((c,i)=>card(c,56+(i%3)*586,202+Math.floor(i/3)*558)).join('')+
    `<g transform="translate(${panelX} ${panelY})">`+
    text(0,41,'COMO LER ESTA RODADA',13,green,'letter-spacing="2"')+
    text(0,92,'01  Alcance',25,ink,'font-weight="700"')+text(0,124,'Para priorizar gesto, expansão e personalidade.',16)+
    text(0,181,'04  Manto',25,ink,'font-weight="700"')+text(0,213,'Para priorizar uma silhueta compacta e própria.',16)+
    text(0,278,'Minha aposta inicial: aprofundar 01 e 04.',17,green)+
    text(0,316,'02, 03 e 05 testam alternativas mais geométricas.',15)+
    text(0,394,'As marcas são estudos, não uma identidade final.',14,'#5e6c62')+
    text(0,420,'Nome composto em tipografia provisória.',14,'#5e6c62')+
    text(0,446,'Liquid glass entra após a escolha da forma.',14,'#5e6c62')+`</g>`+
    text(56,1346,'OCTA / DIREÇÃO DE MARCA',11,'#5e6c62','letter-spacing="2"')+
    text(1776,1346,'SÍMBOLO → REFINAMENTO → TIPOGRAFIA → APLICAÇÕES',11,'#5e6c62','text-anchor="end" letter-spacing="1"');
  await save('octa-cinco-conceitos',1832,1390,board,'OCTA — cinco conceitos de identidade');
  console.log('Generated five symbols, five detail boards and comparison board.');
})();
