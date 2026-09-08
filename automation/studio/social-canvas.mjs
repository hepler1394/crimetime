export async function drawSlide(canvas,slide,{assets,account='crimetimesnacks',guides=false,index=0,count=1,logo=null}={}){
 const width=1080,height=1350,ctx=canvas.getContext('2d');canvas.width=width;canvas.height=height;ctx.fillStyle='#080809';ctx.fillRect(0,0,width,height);
 const asset=assets.find(a=>a.key===slide.image);if(asset){const img=new Image();img.src=asset.url;await img.decode();const contain=slide.fit!=='cover',scale=contain?Math.min(width/img.width,height/img.height):Math.max(width/img.width,height/img.height),w=img.width*scale,h=img.height*scale,x=(width-w)*(Number(slide.cropX??50)/100),y=(height-h)*(Number(slide.cropY??50)/100);ctx.drawImage(img,x,y,w,h);}
 const inset=72,bottom=height-110;let overflow=false;
 if(slide.mode!=='cover'){
   if(asset){ctx.fillStyle='rgba(8,8,9,.84)';ctx.fillRect(0,Math.round(height*.48),width,height);}
   ctx.fillStyle='#e50914';ctx.fillRect(inset,asset?710:200,72,6);ctx.fillStyle='#f7f7f8';ctx.font='28px "IBM Plex Mono", monospace';ctx.fillText('CRIME TIME SNACKS',inset,110);
   const logoAsset=assets.find(a=>a.key===logo);if(logoAsset){const logoImage=new Image();logoImage.src=logoAsset.url;await logoImage.decode();const k=Math.min(110/logoImage.width,110/logoImage.height);ctx.drawImage(logoImage,width-190,50,logoImage.width*k,logoImage.height*k);}
   const font=Math.max(24,Math.min(120,Number(slide.fontSize)||64));ctx.font=`${font}px "${slide.font||'Bebas Neue'}", "Arial Narrow", sans-serif`;let y=asset?790:300;const lineHeight=font*1.2;
   for(const paragraph of String(slide.text||'').split('\n')){let line='';for(const word of paragraph.split(/\s+/)){if(ctx.measureText(word).width>width-inset*2)overflow=true;const test=line?line+' '+word:word;if(ctx.measureText(test).width>width-inset*2&&line){if(y>bottom-lineHeight)overflow=true;ctx.fillText(line,inset,y);y+=lineHeight;line=word;}else line=test;}if(y>bottom-lineHeight)overflow=true;ctx.fillText(line,inset,y);y+=lineHeight;}
   ctx.font='23px "IBM Plex Mono", monospace';ctx.fillStyle='#b4b4bd';ctx.fillText('@'+account.replace(/^@/,''),inset,height-55);ctx.textAlign='right';ctx.fillText(`${index+1} / ${count}`,width-inset,height-55);ctx.textAlign='left';
 }
 if(guides){ctx.strokeStyle='#f4c20d';ctx.setLineDash([12,10]);ctx.strokeRect(inset,inset,width-inset*2,height-inset*2);ctx.setLineDash([]);}
 return{overflow,width,height};
}
