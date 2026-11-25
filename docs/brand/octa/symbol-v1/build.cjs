const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');
// One continuous four-loop route. The enlarged upper loop is the dominant mass.
const start = [222,260];
const controls = [
  [[188,224],[157,190],[157,144]],
  [[157,90],[200,50],[256,50]],
  [[312,50],[355,90],[355,144]],
  [[355,190],[320,228],[282,266]],
  [[249,298],[215,331],[182,363]],
  [[151,393],[101,374],[101,336]],
  [[101,305],[123,285],[149,293]],
  [[178,302],[202,338],[230,370]],
  [[245,388],[261,405],[276,423]],
  [[303,456],[278,489],[251,482]],
  [[220,474],[220,447],[239,422]],
  [[276,380],[315,336],[352,294]],
  [[381,265],[414,278],[414,310]],
  [[414,352],[382,369],[352,359]],
  [[319,347],[285,320],[255,292]],
  [[244,281],[233,271],[222,260]],
];
const curves = [];
let previous=start;
for(const c of controls) { curves.push([previous,...c]); previous=c[2]; }
const lerp=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t);
const at=(c,t)=>{const a=lerp(c[0],c[1],t),b=lerp(c[1],c[2],t),d=lerp(c[2],c[3],t);return lerp(lerp(a,b,t),lerp(b,d,t),t);};
function split(c,t) { const a=lerp(c[0],c[1],t),b=lerp(c[1],c[2],t),d=lerp(c[2],c[3],t),e=lerp(a,b,t),f=lerp(b,d,t),g=lerp(e,f,t);return [[c[0],a,e,g],[g,f,d,c[3]]]; }
function section(c,a,b) { let part=split(c,b)[0];return a===0 ? part : split(part,a/b)[1]; }
function intersection(a,b,c,d) { const x=b[0]-a[0],y=b[1]-a[1],u=d[0]-c[0],v=d[1]-c[1],den=x*v-y*u;if(Math.abs(den)<1e-8)return;const t=((c[0]-a[0])*v-(c[1]-a[1])*u)/den,s=((c[0]-a[0])*y-(c[1]-a[1])*x)/den;if(t>0&&t<1&&s>0&&s<1)return[t,s]; }
const crossings=[];
for(let i=0;i<curves.length;i++)for(let j=i+2;j<curves.length;j++){
  if(i===0&&j===curves.length-1)continue;
  for(let a=0;a<100;a++)for(let b=0;b<100;b++){
    const hit=intersection(at(curves[i],a/100),at(curves[i],(a+1)/100),at(curves[j],b/100),at(curves[j],(b+1)/100));
    if(hit)crossings.push({i,j,t:(a+hit[0])/100,u:(b+hit[1])/100,point:at(curves[i],(a+hit[0])/100)});
  }
}
console.log('Crossings:',JSON.stringify(crossings));
const cuts = new Map();
for(const crossing of crossings) {
  // Successive underpasses alternate along the continuous route.
  const boundaryCrossing=crossing.u>.95||crossing.u<.05;
  const index=boundaryCrossing?crossing.i:crossing.j, t=boundaryCrossing?crossing.t:crossing.u;
  const near0=at(curves[index],Math.max(0,t-.001)),near1=at(curves[index],Math.min(1,t+.001));
  const speed=Math.hypot(near1[0]-near0[0],near1[1]-near0[1])/.002;
  const half=14/speed;
  const list=cuts.get(index)||[]; list.push([Math.max(0,t-half),Math.min(1,t+half)]);cuts.set(index,list);
}
const fmt=p=>p.map(v=>Number(v.toFixed(3))).join(' ');
const pieces=[];
let lastEnd=null;
for(let i=0;i<curves.length;i++) {
  const intervals=(cuts.get(i)||[]).sort((a,b)=>a[0]-b[0]);let cursor=0;
  for(const [a,b] of [...intervals,[1,1]]) {
    if(a>cursor){
      const s=section(curves[i],cursor,a);
      const connected=lastEnd&&Math.hypot(lastEnd[0]-s[0][0],lastEnd[1]-s[0][1])<.001;
      pieces.push(`${connected?'':`M${fmt(s[0])} `}C${s.slice(1).map(fmt).join(' ')}`);
      lastEnd=s[3];
    }
    if(b>a)lastEnd=null;
    cursor=b;
  }
}
// Butt ends occur only inside crossings; all exposed loop joins are continuous.
const body=`<path d="${pieces.join(' ')}" fill="none" stroke="currentColor" stroke-width="16" stroke-linecap="butt" stroke-linejoin="round"/>`;
function svg(w,h,contents,attributes='') {return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" ${attributes}>${contents}</svg>`;}
const symbol=svg(512,532,body,'role="img" aria-label="OCTA — símbolo entrelaçado com laço superior ampliado"');
fs.writeFileSync(path.join(__dirname,'octa-symbol-source.svg'),symbol);
fs.writeFileSync(path.join(__dirname,'octa-symbol.svg'),symbol.replace('width="512" height="532" viewBox="0 0 512 532"','width="361" height="481" viewBox="77 26 361 481"'));
fs.writeFileSync(path.join(__dirname,'octa-symbol-white.svg'),symbol.replace('width="512" height="532" viewBox="0 0 512 532"','width="361" height="481" viewBox="77 26 361 481"').replace('stroke="currentColor"','stroke="#ffffff"'));
const print=(x,y,content,size=18,color='#152922')=>`<text x="${x}" y="${y}" font-family="Arial,sans-serif" font-size="${size}" fill="${color}">${content}</text>`;
const mark=(x,y,size,color)=>`<g transform="translate(${x} ${y}) scale(${size/512})" color="${color}">${body}</g>`;
const board=svg(1440,1000,
  '<rect width="1440" height="1000" fill="#f5f3eb"/>'+
  print(56,64,'OCTA / SÍMBOLO ENTRELAÇADO',24)+print(56,103,'Quatro laços. Cabeça ampliada. Construção vetorial.',16,'#63716a')+
  '<rect x="56" y="150" width="640" height="660" rx="6" fill="#ffffff"/>'+
  mark(116,181,520,'#152922')+
  '<rect x="724" y="150" width="660" height="660" rx="6" fill="#152922"/>'+
  mark(794,181,520,'#ffffff')+
  print(56,862,'LAÇO SUPERIOR',12,'#087f5b')+print(56,895,'Cabeça dominante; laterais e base compactas.',17)+
  print(56,926,'Traço uniforme de 16 unidades; cruzamentos vazados.',17)+
  print(790,862,'REDUÇÃO / 64 · 32 · 24 · 16 PX',12,'#087f5b')+
  mark(790,878,64,'#152922')+mark(887,894,32,'#152922')+mark(953,898,24,'#152922')+mark(1010,902,16,'#152922')+
  print(56,976,'Versão de refinamento 01 / Sem efeitos, imagens ou tipografia no símbolo.',12,'#63716a'));
fs.writeFileSync(path.join(__dirname,'octa-symbol-review.svg'),board);
sharp(Buffer.from(board)).png().toFile(path.join(__dirname,'octa-symbol-review.png'));
