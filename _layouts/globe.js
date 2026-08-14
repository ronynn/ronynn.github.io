(function() {
"use strict";

/* ================= tiny mat4/vec3 lib ================= */
var TAU=Math.PI*2;
function sub(a,b){return[a[0]-b[0],a[1]-b[1],a[2]-b[2]];}
function dot3(a,b){return a[0]*b[0]+a[1]*b[1]+a[2]*b[2];}
function cross(a,b){return[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];}
function norm(a){var l=Math.hypot(a[0],a[1],a[2])||1;return[a[0]/l,a[1]/l,a[2]/l];}
function persp(fov,asp,n,f){var t=1/Math.tan(fov/2),nf=1/(n-f);
  return[t/asp,0,0,0,0,t,0,0,0,0,(f+n)*nf,-1,0,0,2*f*n*nf,0];}
function lookAt(e,c,up){var z=norm(sub(e,c)),x=norm(cross(up,z)),y=cross(z,x);
  return[x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,-dot3(x,e),-dot3(y,e),-dot3(z,e),1];}
function mul(a,b){var o=new Array(16);
  for(var c=0;c<4;c++)for(var r=0;r<4;r++)
    o[c*4+r]=a[r]*b[c*4]+a[4+r]*b[c*4+1]+a[8+r]*b[c*4+2]+a[12+r]*b[c*4+3];
  return o;}
function rotX(a){var c=Math.cos(a),s=Math.sin(a);return[1,0,0,0,0,c,s,0,0,-s,c,0,0,0,0,1];}
function rotY(a){var c=Math.cos(a),s=Math.sin(a);return[c,0,-s,0,0,1,0,0,s,0,c,0,0,0,0,1];}
function rotZ(a){var c=Math.cos(a),s=Math.sin(a);return[c,s,0,0,-s,c,0,0,0,0,1,0,0,0,0,1];}
function trans(x,y,z){return[1,0,0,0,0,1,0,0,0,0,1,0,x,y,z,1];}
function toRGB(c){if(typeof c==='string')c=parseInt(c.replace('#',''),16)||0;
  return[(c>>16&255)/255,(c>>8&255)/255,(c&255)/255];}
function cssHex(c){var n=typeof c==='number'?c:parseInt(String(c).replace('#',''),16);
  return('#000000'+n.toString(16)).slice(-6);}

var VS=
'attribute vec3 aPos;attribute vec3 aColor;'+
'uniform mat4 uProj,uView,uModel;uniform float uPointScale,uIsPoint;'+
'varying vec3 vColor;'+
'void main(){vec4 mv=uView*uModel*vec4(aPos,1.0);gl_Position=uProj*mv;'+
'gl_PointSize=uIsPoint>0.5?clamp(uPointScale/max(1.0,-mv.z),2.0,30.0):1.0;vColor=aColor;}';
var FS=
'precision mediump float;uniform float uIsPoint;varying vec3 vColor;'+
'void main(){float a=1.0;'+
'if(uIsPoint>0.5){vec2 c=gl_PointCoord-vec2(0.5);float d=length(c);'+
'if(d>0.5)discard;a=smoothstep(0.5,0.1,d);}'+
'gl_FragColor=vec4(vColor*a,1.0);}';

/* ================= Vanta-compatible GLOBE ================= */
function GlobeEffect(opts){
  var o=this.options=Object.assign({
    el:'#bg',color:0xff8c5a,color2:0xffffff,backgroundColor:0x0e3d3d,
    size:1,points:12,maxDistance:15.5,spacing:11,showDots:true,
    speed:1,mouseControls:true,gyroControls:true
  },opts||{});
  if(typeof o.el==='string')o.el=document.querySelector(o.el);
  this.t=0;this.prev=0;this.theta=1.2;this.phi=0.55;this.lastLi=0;this.frames=0;
  this.BASE_TH=1.2;this.BASE_PH=0.55;this.mouseTh=0;this.mousePh=0;this.gyroX=0;this.gyroY=0;
  this.hud=document.getElementById('hud');
  this._init();
}
GlobeEffect.prototype._init=function(){
  var self=this,o=this.options;
  this.canvas=document.createElement('canvas');
  o.el.innerHTML='';o.el.appendChild(this.canvas);
  try{ this._initGL(); this.mode='WEBGL'; }
  catch(err){ /* canvas is "used" by a failed gl context → fresh canvas for 2D */
    this.canvas.remove();
    this.canvas=document.createElement('canvas');
    o.el.appendChild(this.canvas);
    this.gl=null; this._init2D(); this.mode='CANVAS2D';
  }
  this._bindEvents();
  this._layout();
  var hudTick=setInterval(function(){
    if(!self.canvas)return clearInterval(hudTick);
    if(self.hud) self.hud.textContent=self.mode+' • '+(self.frames*2)+' fps • '+self.lastLi+' links';
    self.frames=0;
  },500);
  this.raf=requestAnimationFrame(function(n){self._frame(n);});
};
GlobeEffect.prototype._initGL=function(){
  var gl=this.canvas.getContext('webgl',{antialias:true,alpha:false})
        ||this.canvas.getContext('experimental-webgl');
  if(!gl)throw new Error('no webgl');
  this.gl=gl;
  function sh(t,s){var x=gl.createShader(t);gl.shaderSource(x,s);gl.compileShader(x);
    if(!gl.getShaderParameter(x,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(x));return x;}
  var prog=this.prog=gl.createProgram();
  gl.attachShader(prog,sh(gl.VERTEX_SHADER,VS));
  gl.attachShader(prog,sh(gl.FRAGMENT_SHADER,FS));
  gl.linkProgram(prog);
  if(!gl.getProgramParameter(prog,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(prog));
  gl.useProgram(prog);
  this.A={pos:gl.getAttribLocation(prog,'aPos'),col:gl.getAttribLocation(prog,'aColor')};
  this.U={proj:gl.getUniformLocation(prog,'uProj'),view:gl.getUniformLocation(prog,'uView'),
    model:gl.getUniformLocation(prog,'uModel'),pts:gl.getUniformLocation(prog,'uPointScale'),
    isPoint:gl.getUniformLocation(prog,'uIsPoint')};
  gl.disable(gl.DEPTH_TEST);gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE);
  this._build();this._applyColors();
};
GlobeEffect.prototype._init2D=function(){ this.ctx=this.canvas.getContext('2d'); this._build(); this._applyColors(); };
GlobeEffect.prototype._bindEvents=function(){
  var self=this,o=this.options;
  this._onResize=function(){self._layout();};
  this._onMouse=function(e){if(o.mouseControls){
    self.mouseTh=(e.clientX/innerWidth-0.5)*1.6;self.mousePh=(e.clientY/innerHeight-0.5)*0.9;}};
  this._onTouch=function(e){var p=e.touches[0];if(p&&o.mouseControls){
    self.mouseTh=(p.clientX/innerWidth-0.5)*1.6;self.mousePh=(p.clientY/innerHeight-0.5)*0.9;}};
  this._onGyro=function(e){if(e.beta!=null&&o.gyroControls){
    self.gyroX=Math.max(-1,Math.min(1,(e.gamma||0)/45));
    self.gyroY=Math.max(-1,Math.min(1,((e.beta||0)-45)/45));}};
  addEventListener('resize',this._onResize);
  addEventListener('mousemove',this._onMouse);
  addEventListener('touchmove',this._onTouch);
  if(o.gyroControls&&window.DeviceOrientationEvent){
    if(typeof DeviceOrientationEvent.requestPermission==='function'){
      this._perm=function(){DeviceOrientationEvent.requestPermission()
        .then(function(r){if(r==='granted')addEventListener('deviceorientation',self._onGyro);})
        .catch(function(){});removeEventListener('touchend',self._perm);};
      addEventListener('touchend',this._perm);   /* iOS: motion needs one tap */
    }else addEventListener('deviceorientation',this._onGyro);
  }
};
GlobeEffect.prototype._mkBuf=function(a){var gl=this.gl,b=gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,a,gl.STATIC_DRAW);return b;};
GlobeEffect.prototype._group=function(arr){var gl=this.gl,
  g={n:arr.length/3,cArr:new Float32Array(arr.length),
     pBuf:this._mkBuf(new Float32Array(arr)),cBuf:gl.createBuffer()};
  gl.bindBuffer(gl.ARRAY_BUFFER,g.cBuf);gl.bufferData(gl.ARRAY_BUFFER,g.cArr,gl.STATIC_DRAW);
  return g;};
GlobeEffect.prototype._build=function(){
  var o=this.options,R=24*(o.size||1);
  function push(a,p,q){a.push(p[0],p[1],p[2],q[0],q[1],q[2]);}
  var sp=[],W=22,H=15,P=[],iy,ix;
  for(iy=0;iy<=H;iy++){P[iy]=[];for(ix=0;ix<=W;ix++){
    var th=iy/H*Math.PI,ph=ix/W*TAU;
    P[iy][ix]=[R*Math.sin(th)*Math.cos(ph),R*Math.cos(th),R*Math.sin(th)*Math.sin(ph)];}}
  for(iy=0;iy<H;iy++)for(ix=0;ix<W;ix++){
    push(sp,P[iy][ix],P[iy][ix+1]);push(sp,P[iy][ix],P[iy+1][ix]);push(sp,P[iy][ix],P[iy+1][ix+1]);}
  var orb=[];
  function rXv(p,a){var c=Math.cos(a),s=Math.sin(a);return[p[0],p[1]*c-p[2]*s,p[1]*s+p[2]*c];}
  function rZv(p,a){var c=Math.cos(a),s=Math.sin(a);return[p[0]*c-p[1]*s,p[0]*s+p[1]*c,p[2]];}
  function ring(Rr,tx,tz){for(var i=0;i<120;i++){var a1=i/120*TAU,a2=(i+1)/120*TAU;
    push(orb,rZv(rXv([Math.cos(a1)*Rr,0,Math.sin(a1)*Rr],tx),tz),
             rZv(rXv([Math.cos(a2)*Rr,0,Math.sin(a2)*Rr],tx),tz));}}
  ring(R*1.4,1.9,0.5);ring(R*1.75,1.2,-0.7);ring(R*2.1,0.5,1.2);
  for(var i=0;i<80;i++){var r1=R+2+Math.random()*6,r2=r1+2+Math.random()*6,
    u=Math.random()*2-1,t2=Math.random()*TAU,s=Math.sqrt(1-u*u),d=[s*Math.cos(t2),u,s*Math.sin(t2)];
    push(orb,[d[0]*r1,d[1]*r1,d[2]*r1],[d[0]*r2,d[1]*r2,d[2]*r2]);}
  var cage=[0,R*1.6,0,0,-R*1.6,0];
  [17.9,12,8,5,3,2,1.5,1.1,.8,.6,.45,.3,.2,.1,.05,.03,.02,.01].forEach(function(oo,idx){
    var n=6*(idx+1)*1.3;
    for(var a=0;a<4;a++){var dx=Math.cos(a/4*TAU)*0.15,dz=Math.sin(a/4*TAU)*0.15;
      cage.push(dx*n,oo*1.3,dz*n,dx*n,-oo*1.3,dz*n);}});
  var cr=[0,-R*2.3,0,0,R*2.3,0,-R*3.1,0,0,R*3.1,0,0];
  var N=(o.points|0)+1,S=o.spacing;this.pts=[];
  for(ix=0;ix<N;ix++)for(var iz=0;iz<N;iz++)
    this.pts.push({ox:(ix-(N-1)/2)*S,oz:(iz-(N-1)/2)*S,y:0});
  this.dotPos=new Float32Array(this.pts.length*3);
  this.linePos=new Float32Array(2048*6);this.lineCol=new Float32Array(2048*6);
  this.raw={globe:sp,orbit:orb,cage:cage,cross:cr};          /* for 2D fallback */
  if(this.gl){
    this.gGlobe=this._group(sp);this.gOrbit=this._group(orb);
    this.gCage=this._group(cage);this.gCross=this._group(cr);
    this.gDots={n:this.pts.length,cArr:new Float32Array(this.pts.length*3),
      pBuf:this._mkBuf(this.dotPos),cBuf:this.gl.createBuffer()};
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER,this.gDots.cBuf);
    this.gl.bufferData(this.gl.ARRAY_BUFFER,this.gDots.cArr,this.gl.STATIC_DRAW);
    this.gLines={cArr:this.lineCol,pBuf:this._mkBuf(this.linePos),cBuf:this.gl.createBuffer()};
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER,this.gLines.cBuf);
    this.gl.bufferData(this.gl.ARRAY_BUFFER,this.lineCol,this.gl.STATIC_DRAW);
  }
};
GlobeEffect.prototype._applyColors=function(){
  var o=this.options,col=toRGB(o.color),col2=toRGB(o.color2),bg=toRGB(o.backgroundColor);
  this.colRGB=col;this.col2RGB=col2;this.bgRGB=bg;
  if(this.gl){
    var gl=this.gl;
    var fill=function(g,rgb,k){var a=g.cArr;
      for(var i=0;i<a.length;i+=3){a[i]=rgb[0]*k;a[i+1]=rgb[1]*k;a[i+2]=rgb[2]*k;}
      gl.bindBuffer(gl.ARRAY_BUFFER,g.cBuf);gl.bufferSubData(gl.ARRAY_BUFFER,0,a);};
    fill(this.gGlobe,col,0.9);fill(this.gOrbit,col2,0.55);
    fill(this.gCage,col2,0.45);fill(this.gCross,col2,0.8);
    var d=this.gDots.cArr;
    for(var i=0;i<d.length;i+=3){d[i]=(col[0]+0.4)*0.7;d[i+1]=(col[1]+0.4)*0.7;d[i+2]=(col[2]+0.4)*0.7;}
    gl.bindBuffer(gl.ARRAY_BUFFER,this.gDots.cBuf);gl.bufferSubData(gl.ARRAY_BUFFER,0,d);
    gl.clearColor(bg[0],bg[1],bg[2],1);
  }
  document.body.style.background='#'+cssHex(o.backgroundColor);
};
GlobeEffect.prototype._layout=function(){
  var w=innerWidth,h=innerHeight,dpr=Math.min(devicePixelRatio||1,this.gl?2:1.5);
  this.canvas.width=Math.round(w*dpr);this.canvas.height=Math.round(h*dpr);
  this.lookX=(w>h)?-34:-14;                                  /* landscape → globe right */
  this.camDist=175*((w<720||Math.min(w,h)<480)?1.3:1);       /* mobile → zoom out */
  this.projArr=persp(25*Math.PI/180,w/h,1,2000);
  if(this.gl){
    this.gl.viewport(0,0,this.canvas.width,this.canvas.height);
    this.gl.uniformMatrix4fv(this.U.proj,false,new Float32Array(this.projArr));
    this.gl.uniform1f(this.U.pts,this.canvas.height/(2*Math.tan(12.5*Math.PI/180))*0.8);
  }
};
GlobeEffect.prototype._draw=function(bp,bc,n,mode,model,isPoint){
  var gl=this.gl;
  gl.uniformMatrix4fv(this.U.model,false,new Float32Array(model));
  gl.uniform1f(this.U.isPoint,isPoint?1:0);
  gl.bindBuffer(gl.ARRAY_BUFFER,bp);gl.enableVertexAttribArray(this.A.pos);
  gl.vertexAttribPointer(this.A.pos,3,gl.FLOAT,false,0,0);
  gl.bindBuffer(gl.ARRAY_BUFFER,bc);gl.enableVertexAttribArray(this.A.col);
  gl.vertexAttribPointer(this.A.col,3,gl.FLOAT,false,0,0);
  gl.drawArrays(mode,0,n);
};
GlobeEffect.prototype._frame=function(now){
  var self=this;this.raf=requestAnimationFrame(function(n){self._frame(n);});
  var o=this.options;
  var dt=Math.min(0.05,(now-this.prev)/1000||0.016);this.prev=now;
  this.t+=dt*(o.speed||1);var t=this.t;
  var thT=this.BASE_TH+this.mouseTh+this.gyroX*0.6;
  var phT=this.BASE_PH+this.mousePh+this.gyroY*0.4;
  this.theta+=(thT-this.theta)*0.04;this.phi+=(phT-this.phi)*0.04;
  var e=this.camDist;
  var eye=[Math.cos(this.phi)*Math.sin(this.theta)*e,Math.sin(this.phi)*e,
           Math.cos(this.phi)*Math.cos(this.theta)*e];
  this.viewArr=lookAt(eye,[this.lookX,0,0],[0,1,0]);
  /* --- simulation: wave + proximity links (Vanta's math) --- */
  var i,j;
  for(i=0;i<this.pts.length;i++){var p=this.pts[i];
    p.y=2.6*Math.sin(p.ox*0.09+t*1.1+p.oz*0.045);
    this.dotPos[i*3]=p.ox;this.dotPos[i*3+1]=p.y;this.dotPos[i*3+2]=p.oz;}
  var li=0,c=this.colRGB;
  for(i=0;i<this.pts.length;i++){var a=this.pts[i];
    for(j=i+1;j<this.pts.length;j++){var b=this.pts[j];
      var dx=a.ox-b.ox;if(dx>o.maxDistance||dx<-o.maxDistance)continue;
      var dz=a.oz-b.oz;if(dz>o.maxDistance||dz<-o.maxDistance)continue;
      var dy=a.y-b.y,dd=Math.sqrt(dx*dx+dy*dy+dz*dz);
      if(dd<o.maxDistance&&li<2048){var f=(1-dd/o.maxDistance)*0.7;
        this.linePos.set([a.ox,a.y,a.oz,b.ox,b.y,b.oz],li*6);
        this.lineCol.set([f*c[0],f*c[1],f*c[2],f*c[0],f*c[1],f*c[2]],li*6);li++;}}}
  this.lastLi=li;this.frames++;
  var R=24*(o.size||1),netM=trans(-40,-R*0.66,0);
  this.models={net:netM,
    globe:mul(trans(0,4,0),rotY(t*0.15)),
    orbit:mul(trans(0,4,0),mul(rotZ(t*0.12),rotX(t*0.05))),
    cage:mul(trans(0,4,0),rotY(-t*0.2)),
    cross:trans(0,0,0)};
  if(this.gl)this._renderGL(li);else this._render2D(li);
};
GlobeEffect.prototype._renderGL=function(li){
  var gl=this.gl,M=this.models;
  gl.uniformMatrix4fv(this.U.view,false,new Float32Array(this.viewArr));
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.bindBuffer(gl.ARRAY_BUFFER,this.gDots.pBuf);gl.bufferSubData(gl.ARRAY_BUFFER,0,this.dotPos);
  gl.bindBuffer(gl.ARRAY_BUFFER,this.gLines.pBuf);gl.bufferSubData(gl.ARRAY_BUFFER,0,this.linePos.subarray(0,li*6));
  gl.bindBuffer(gl.ARRAY_BUFFER,this.gLines.cBuf);gl.bufferSubData(gl.ARRAY_BUFFER,0,this.lineCol.subarray(0,li*6));
  this._draw(this.gLines.pBuf,this.gLines.cBuf,li*2,gl.LINES,M.net,false);
  if(this.options.showDots)
    this._draw(this.gDots.pBuf,this.gDots.cBuf,this.gDots.n,gl.POINTS,M.net,true);
  this._draw(this.gGlobe.pBuf,this.gGlobe.cBuf,this.gGlobe.n,gl.LINES,M.globe,false);
  this._draw(this.gOrbit.pBuf,this.gOrbit.cBuf,this.gOrbit.n,gl.LINES,M.orbit,false);
  this._draw(this.gCage.pBuf,this.gCage.cBuf,this.gCage.n,gl.LINES,M.cage,false);
  this._draw(this.gCross.pBuf,this.gCross.cBuf,4,gl.LINES,M.cross,false);
};
GlobeEffect.prototype._render2D=function(li){   /* bulletproof fallback, same math */
  var ctx=this.ctx,w=this.canvas.width,h=this.canvas.height,bg=this.bgRGB,o=this.options;
  ctx.globalCompositeOperation='source-over';
  ctx.fillStyle='rgb('+(bg[0]*255|0)+','+(bg[1]*255|0)+','+(bg[2]*255|0)+')';
  ctx.fillRect(0,0,w,h);
  ctx.globalCompositeOperation='lighter';
  ctx.lineWidth=Math.max(1,h/900);
  var proj=this.projArr,view=this.viewArr;
  function prj(m,x,y,z){
    var cx=m[0]*x+m[4]*y+m[8]*z+m[12],cy=m[1]*x+m[5]*y+m[9]*z+m[13],
        cw=m[3]*x+m[7]*y+m[11]*z+m[15];
    if(cw<=0)return null;
    return[(cx/cw*0.5+0.5)*w,(1-(cy/cw*0.5+0.5))*h];}
  var self=this;
  function stroke(arr,model,rgb,k){
    var m=mul(proj,mul(view,model));
    ctx.strokeStyle='rgba('+(rgb[0]*255|0)+','+(rgb[1]*255|0)+','+(rgb[2]*255|0)+','+k+')';
    ctx.beginPath();
    for(var i=0;i<arr.length;i+=6){
      var a=prj(m,arr[i],arr[i+1],arr[i+2]),b=prj(m,arr[i+3],arr[i+4],arr[i+5]);
      if(!a||!b)continue;
      ctx.moveTo(a[0],a[1]);ctx.lineTo(b[0],b[1]);}
    ctx.stroke();}
  var c=this.colRGB,c2=this.col2RGB,M=this.models,i;
  for(i=0;i<li*6;i+=6){ /* net links, faded */
    var m=mul(proj,mul(view,M.net)),f=this.lineCol[i];
    if(f<=0)continue;
    var a=prj(m,this.linePos[i],this.linePos[i+1],this.linePos[i+2]),
        b=prj(m,this.linePos[i+3],this.linePos[i+4],this.linePos[i+5]);
    if(!a||!b)continue;
    ctx.strokeStyle='rgba('+(c[0]*255|0)+','+(c[1]*255|0)+','+(c[2]*255|0)+','+f+')';
    ctx.beginPath();ctx.moveTo(a[0],a[1]);ctx.lineTo(b[0],b[1]);ctx.stroke();}
  if(o.showDots){
    var md=mul(proj,mul(view,M.net));
    ctx.fillStyle='rgba('+(Math.min(255,(c[0]+0.4)*0.7*255)|0)+','+(Math.min(255,(c[1]+0.4)*0.7*255)|0)+','+(Math.min(255,(c[2]+0.4)*0.7*255)|0)+',0.95)';
    for(i=0;i<this.pts.length;i++){
      var q=prj(md,this.dotPos[i*3],this.dotPos[i*3+1],this.dotPos[i*3+2]);
      if(!q)continue;
      ctx.beginPath();ctx.arc(q[0],q[1],Math.max(1.5,h/450),0,TAU);ctx.fill();}}
  stroke(this.raw.globe,M.globe,c,0.9);
  stroke(this.raw.orbit,M.orbit,c2,0.55);
  stroke(this.raw.cage,M.cage,c2,0.45);
  stroke(this.raw.cross,M.cross,c2,0.8);
};
/* ---- Vanta-style public API ---- */
GlobeEffect.prototype.setOptions=function(o){
  var structural=['points','spacing','size'].some(function(k){return k in o;});
  Object.assign(this.options,o);
  if(structural)return this.restart();
  this._applyColors();this._layout();
};
GlobeEffect.prototype.restart=function(){this.destroy();this._init();};
GlobeEffect.prototype.destroy=function(){
  cancelAnimationFrame(this.raf);
  removeEventListener('resize',this._onResize);removeEventListener('mousemove',this._onMouse);
  removeEventListener('touchmove',this._onTouch);removeEventListener('deviceorientation',this._onGyro);
  if(this._perm)removeEventListener('touchend',this._perm);
  if(this.canvas)this.canvas.remove();
};

window.VANTA=window.VANTA||{};
VANTA.register=function(n,c){VANTA[n]=function(o){return new c(o);};};
VANTA.register('GLOBE',GlobeEffect);

})();