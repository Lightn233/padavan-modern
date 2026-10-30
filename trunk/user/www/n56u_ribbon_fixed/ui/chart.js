/* 轻量时间序列图：保留时段选择、图例、悬停数值及拖动缩放，不依赖旧图表库。 */
(function(root){
 'use strict';
 var colors=['#286cdb','#13a18e','#e5a436','#9a6cd5','#db6383'],defaults={};
 function elem(tag,cls,text){var n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;}
 function button(text,fn){var b=elem('button','btn btn-small',text);b.type='button';b.onclick=fn;return b;}
 function validPoint(p){return Array.isArray(p)&&p[0]!=null&&p[1]!=null&&Number.isFinite(+p[0])&&Number.isFinite(+p[1]);}
 function clean(points){return (points||[]).filter(validPoint).map(function(p){return [+p[0],+p[1]];}).sort(function(a,b){return a[0]-b[0];}).slice(-43200);}
 function Chart(options){
  var self=this;this.options=options;this.host=document.getElementById(options.chart.renderTo);if(!this.host)throw new Error('找不到图表容器');
  this.host.classList.add('ui-chart');this.host.replaceChildren();this.host.style.minHeight='320px';this.host.style.height='auto';this.range=null;this.zoom=null;
  this.heading=elem('h3','',options.title&&options.title.text||'');this.tools=elem('div','ui-chart-tools');this.legend=elem('div','ui-chart-legend');this.canvas=elem('canvas');this.canvas.setAttribute('role','img');this.canvas.setAttribute('aria-label',this.heading.textContent);this.canvas.tabIndex=0;
  this.canvas.style.cssText='display:block;width:100%;height:270px;touch-action:pan-y';this.tip=elem('div','ui-chart-tip');this.tip.setAttribute('role','status');this.tip.textContent='移动指针查看数值，拖动选择时间范围。';
  var ranges=options.rangeSelector||{},buttons=ranges.buttons||[{type:'all',text:'全部'}];
  buttons.forEach(function(r,i){var b=button(r.text==='All'?'全部':r.text,function(){self.zoom=null;self.range=r.type==='all'?null:r.count*(r.type==='hour'?3600000:r.type==='minute'?60000:1000);Array.from(self.tools.querySelectorAll('button')).forEach(function(x){x.classList.toggle('active',x===b);x.setAttribute('aria-pressed',String(x===b));});self.redraw();});b.setAttribute('aria-pressed',String(i===(ranges.selected||0)));b.classList.toggle('active',i===(ranges.selected||0));self.tools.appendChild(b);if(i===(ranges.selected||0))self.range=r.type==='all'?null:r.count*(r.type==='hour'?3600000:r.type==='minute'?60000:1000);});
  this.reset=button('重置缩放',function(){self.zoom=null;self.redraw();});this.reset.hidden=true;this.tools.appendChild(this.reset);
  this.series=(options.series||[]).map(function(s,index){var item={name:s.name||'',color:s.color||colors[index%colors.length],data:clean(s.data),visible:true};item.setData=function(p,redraw){item.data=clean(p);if(redraw!==false)self.redraw();};item.addPoint=function(p,redraw,shift){if(validPoint(p)){item.data.push([+p[0],+p[1]]);if(shift||item.data.length>43200)item.data.shift();}if(redraw!==false)self.redraw();};var b=button(item.name,function(){item.visible=!item.visible;b.setAttribute('aria-pressed',String(item.visible));b.style.opacity=item.visible?'1':'.45';self.redraw();});b.style.borderLeft='4px solid '+item.color;b.setAttribute('aria-pressed','true');self.legend.appendChild(b);return item;});
  this.limits={min:options.yAxis&&options.yAxis.min,max:options.yAxis&&options.yAxis.max};this.yAxis=[{setExtremes:function(min,max,redraw){self.limits={min:+min,max:+max};if(redraw!==false)self.redraw();}}];
  this.timeline=elem('div','ui-chart-timeline');this.bounds=[];
  ['范围起点','范围终点'].forEach(function(text,index){var label=elem('label','',text),input=elem('input');input.type='range';input.min=0;input.max=1000;input.value=index?1000:0;input.setAttribute('aria-label',text);input.oninput=function(){if(!self.fullExtent)return;var range=self.fullExtent.max-self.fullExtent.min,a=self.fullExtent.min+range*(+self.bounds[0].value)/1000,b=self.fullExtent.min+range*(+self.bounds[1].value)/1000;self.setWindow(a,b);};label.appendChild(input);self.bounds.push(input);self.timeline.appendChild(label);});
  this.tools.append(button('前移',function(){self.pan(-1);}),button('后移',function(){self.pan(1);}));
  this.host.append(this.heading,this.tools,this.legend,this.canvas,this.timeline,this.tip);
  this.canvas.addEventListener('pointermove',function(e){self.inspect(e.clientX);});this.canvas.addEventListener('pointerdown',function(e){if(e.button!==0)return;self.drag=e.clientX;self.canvas.setPointerCapture(e.pointerId);});
  this.canvas.addEventListener('pointerup',function(e){if(self.drag!==undefined&&Math.abs(e.clientX-self.drag)>12&&self.extent){var a=self.timeAt(self.drag),b=self.timeAt(e.clientX);if(b!==a)self.setWindow(Math.min(a,b),Math.max(a,b));}self.drag=undefined;});
  this.canvas.addEventListener('pointercancel',function(){self.drag=undefined;});
  this.canvas.addEventListener('keydown',function(e){if((e.key==='ArrowLeft'||e.key==='ArrowRight')&&self.extent){e.preventDefault();var r=self.canvas.getBoundingClientRect();self.keyX=Math.max(50,Math.min(r.width-15,(self.keyX||50)+(e.key==='ArrowLeft'?-15:15)));self.inspect(r.left+self.keyX);}});
  this.resize=function(){self.redraw();};root.addEventListener('resize',this.resize);if(root.ResizeObserver){this.observer=new ResizeObserver(this.resize);this.observer.observe(this.host);}
  root.addEventListener('pagehide',function(e){if(!e.persisted)self.destroy();});this.redraw();
 }
 Chart.prototype.timeAt=function(clientX){var r=this.canvas.getBoundingClientRect(),x=Math.max(50,Math.min(r.width-15,clientX-r.left));return this.extent.min+(x-50)/(r.width-65)*(this.extent.max-this.extent.min);};
 Chart.prototype.inspect=function(clientX){if(!this.extent)return;var t=this.timeAt(clientX),values=[],options=this.options,tooltip=options.tooltip||{},decimals=tooltip.valueDecimals==null?1:tooltip.valueDecimals;this.series.forEach(function(s){if(!s.visible||!s.data.length)return;var lo=0,hi=s.data.length;while(lo<hi){var mid=(lo+hi)>>>1;if(s.data[mid][0]<t)lo=mid+1;else hi=mid;}var best=s.data[Math.min(lo,s.data.length-1)];if(lo>0&&Math.abs(s.data[lo-1][0]-t)<Math.abs(best[0]-t))best=s.data[lo-1];values.push(s.name+' '+best[1].toFixed(decimals)+(tooltip.valueSuffix||''));});this.tip.textContent=new Date(t).toLocaleTimeString()+' · '+values.join(' · ');};
 Chart.prototype.setWindow=function(a,b){if(!this.fullExtent)return;var f=this.fullExtent,minRange=this.options.xAxis&&this.options.xAxis.minRange||1000;if(!Number.isFinite(a)||!Number.isFinite(b))return;a=Math.max(f.min,Math.min(a,f.max));b=Math.max(a+Math.min(minRange,f.max-f.min),Math.min(b,f.max));if(b>f.max){a=Math.max(f.min,a-(b-f.max));b=f.max;}this.zoom=[a,b];this.redraw();};
 Chart.prototype.pan=function(direction){if(!this.extent||!this.fullExtent)return;var width=this.extent.max-this.extent.min,delta=width*0.5*direction,a=Math.max(this.fullExtent.min,Math.min(this.extent.min+delta,this.fullExtent.max-width));this.setWindow(a,a+width);};
 Chart.prototype.setTitle=function(title,subtitle,redraw){this.heading.textContent=title.text||'';this.canvas.setAttribute('aria-label',this.heading.textContent);if(redraw!==false)this.redraw();};
 Chart.prototype.reflow=function(){this.redraw();};
 Chart.prototype.destroy=function(){root.removeEventListener('resize',this.resize);if(this.observer)this.observer.disconnect();};
 Chart.prototype.redraw=function(){
  var width=this.host.clientWidth;if(width<80)return;var height=270,ratio=root.devicePixelRatio||1,c=this.canvas,ctx=c.getContext('2d');c.width=Math.round(width*ratio);c.height=Math.round(height*ratio);ctx.setTransform(ratio,0,0,ratio,0,0);ctx.clearRect(0,0,width,height);
  var all=[];this.series.forEach(function(s){if(s.visible)all=all.concat(s.data);});if(!all.length){ctx.fillStyle='#697789';ctx.fillText('暂无数据',50,125);return;}
  var min=Infinity,max=-Infinity;all.forEach(function(p){min=Math.min(min,p[0]);max=Math.max(max,p[0]);});this.fullExtent={min:min,max:max};if(this.range)min=Math.max(min,max-this.range);if(this.zoom){min=this.zoom[0];max=this.zoom[1];}if(max<=min)max=min+1000;this.extent={min:min,max:max};this.reset.hidden=!this.zoom;
  var fullWidth=this.fullExtent.max-this.fullExtent.min;this.bounds.forEach(function(input,index){input.disabled=fullWidth<=0;input.value=fullWidth>0?Math.round(((index?max:min)-this.fullExtent.min)/fullWidth*1000):(index?1000:0);},this);
  var points=all.filter(function(p){return p[0]>=min&&p[0]<=max;}),low=Number.isFinite(this.limits.min)?this.limits.min:0,high=Number.isFinite(this.limits.max)?this.limits.max:points.reduce(function(m,p){return Math.max(m,p[1]);},1)*1.12;if(high<=low)high=low+1;
  var left=50,right=width-15,top=15,bottom=235;function x(t){return left+(t-min)/(max-min)*(right-left);}function y(v){return bottom-(v-low)/(high-low)*(bottom-top);}
  ctx.font='11px system-ui,sans-serif';ctx.lineWidth=1;ctx.textBaseline='middle';
  for(var i=0;i<=4;i++){var yy=top+(bottom-top)*i/4;ctx.strokeStyle='#e5eaf1';ctx.beginPath();ctx.moveTo(left,yy);ctx.lineTo(right,yy);ctx.stroke();ctx.fillStyle='#738197';ctx.textAlign='right';ctx.fillText((high-(high-low)*i/4).toFixed(high<10?1:0),left-9,yy);}
  for(var j=0;j<=3;j++){var t=min+(max-min)*j/3;ctx.textAlign=j===0?'left':j===3?'right':'center';ctx.fillText(new Date(t).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}),x(t),bottom+19);}
  ctx.save();ctx.beginPath();ctx.rect(left,top,right-left,bottom-top);ctx.clip();this.series.forEach(function(s){if(!s.visible)return;var p=s.data.filter(function(a){return a[0]>=min&&a[0]<=max;});ctx.beginPath();ctx.strokeStyle=s.color;ctx.lineWidth=1.7;p.forEach(function(a,k){if(k)ctx.lineTo(x(a[0]),y(a[1]));else ctx.moveTo(x(a[0]),y(a[1]));});ctx.stroke();});ctx.restore();
 };
 root.RouterChart={Chart:Chart,setOptions:function(o){defaults=o;},getOptions:function(){return {colors:colors,lang:defaults.lang||{}};}};
})(window);
