// ══════════════════════════════════════════════════
// PRISM v2  —  ENGINE
// Bugs fixed: camera init, VHS chroma shift, pixel art
// offscreen canvas, duplicate RAF, thermal remap,
// particle canvas scaling, missing null guards,
// style rendering, stream mode, responsive layout
// ══════════════════════════════════════════════════

// Stream mode from URL
if(location.search.includes('stream')) document.body.classList.add('stream-mode');

// DOM
const video   = document.getElementById('videoEl');
const canvas  = document.getElementById('outputCanvas');
const ctx     = canvas.getContext('2d');
const pCanvas = document.getElementById('particleCanvas');
const pCtx    = pCanvas.getContext('2d');
const miniC   = document.getElementById('miniCanvas');
const miniCtx = miniC.getContext('2d');
const offC    = document.createElement('canvas'); // pixel art offscreen
const offCtx  = offC.getContext('2d');


// State object — single source of truth
const S = {
  style:'passthrough', scene:'none',
  overlays: new Set(['mesh', 'aura']),
  mirrored:true, intensity:.7,
  brightness:100, contrast:110, saturation:120,
  pRate:30, pSize:6, pColor:'rainbow',
  particles:[], frameCount:0, sceneF:0,
  emotions:{happy:0,surprise:0,anger:0,sad:0,neutral:100},
  smooth:{happy:0,surprise:0,anger:0,sad:0,neutral:100},
  lm:null,
  segmentationMask:null,
  rec:false, stream:null, mr:null, chunks:[], recStart:0, recInt:null,
  cams:[], camIdx:0, ovVisible:false, chromaMode:'none',
  rafRunning:false, fmInstance:null, ssInstance:null, pose:{pitch:0,yaw:0,roll:0}
};


// ── UTILS ──
function load(p,msg){document.getElementById('lbar').style.width=p+'%';document.getElementById('ltxt').textContent=msg;}
function toast(msg,type='err',dur=4000){
  const t=document.getElementById('toast');
  document.getElementById('toastMsg').textContent=msg;
  t.className='toast '+type+' show';
  setTimeout(()=>t.classList.remove('show'),dur);
}
function setStatus(txt,live){
  document.getElementById('statusTxt').textContent=txt;
  document.getElementById('statusPill').classList.toggle('live',live);
}
function setFaceStats(h){const e=document.getElementById('faceStats');if(e)e.innerHTML=h;}

// ── CANVAS SIZE SYNC ──
function syncParticleCanvas(){
  const w=document.getElementById('canvasWrap');
  pCanvas.width=w.clientWidth; pCanvas.height=w.clientHeight;
}
window.addEventListener('resize',syncParticleCanvas);
syncParticleCanvas();

// ── CAMERA ──
async function startCamera(){
  load(40,'Requesting camera access…');
  try {
    if(S.stream) S.stream.getTracks().forEach(t=>t.stop());
    const sel=document.getElementById('camSel');
    const devId=sel.value||null;

    // Better mobile handling: exact constraints often fail on mobile
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

    let constraints={
      video: devId
        ?{deviceId:{exact:devId}}
        :{facingMode:'user'},
      audio:false
    };

    // Add ideal resolution only if not on a strict mobile browser that might fail
    if(!isMobile) {
        if(constraints.video.deviceId) {
            constraints.video.width = {ideal:1280};
            constraints.video.height = {ideal:720};
        } else {
            constraints.video = {facingMode:'user', width:{ideal:1280}, height:{ideal:720}};
        }
    }

    try {
        S.stream = await navigator.mediaDevices.getUserMedia(constraints);
    } catch(err) {
        console.warn("Primary constraints failed, trying generic constraints", err);
        // Fallback for tricky mobile browsers
        S.stream = await navigator.mediaDevices.getUserMedia({video: true, audio: false});
    }

    video.srcObject = S.stream;
    video.play().catch(e => console.warn("Auto-play prevented", e));

    // Wait for video data — works on all browsers
    await new Promise((res,rej)=>{
      if(video.readyState>=2){res();return;}
      let done=false;
      const ok=()=>{if(!done){done=true;res();}};
      video.addEventListener('loadeddata',ok,{once:true});
      video.addEventListener('canplay',ok,{once:true});
      video.addEventListener('playing',ok,{once:true});
      setTimeout(()=>{if(!done){done=true;res();}},5000); // timeout fallback
    });
    const vw=video.videoWidth||640, vh=video.videoHeight||480;
    canvas.width=vw; canvas.height=vh;
    offC.width=vw; offC.height=vh;
    await enumCams();
    setStatus('LIVE',true);
    setFaceStats('Camera active — loading face tracking…');
    toast('Camera started!','ok',2000);
    load(70,'Initializing face tracking…');
    initFaceMesh();
    if(!S.rafRunning) startRAF();
  } catch(e){
    camError(e);
  }
}

function camError(e){
  const msgs={
    NotAllowedError:'Camera permission denied. Click the camera icon in your browser address bar → Allow, then try again.',
    PermissionDeniedError:'Camera permission denied. Please allow camera access in your browser settings.',
    NotFoundError:'No camera found. Connect a webcam or enable your device camera.',
    DevicesNotFoundError:'No camera devices found on this device.',
    NotReadableError:'Camera is in use by another app. Close other apps using the camera.',
    TrackStartError:'Could not start camera track. Try restarting your browser.',
    OverconstrainedError:'Camera does not support the requested settings. Trying fallback…'
  };
  const msg=msgs[e.name]||('Camera error: '+e.message+'. Try refreshing.');
  if(e.name==='OverconstrainedError'){fallbackCam();return;}
  toast(msg,'err',8000);
  setStatus('ERROR',false);
  load(0,'');
  setFaceStats(e.name+' — camera unavailable');
}

async function fallbackCam(){
  try{
    S.stream=await navigator.mediaDevices.getUserMedia({video:true,audio:false});
    video.srcObject=S.stream;
    await new Promise(res=>{
      if(video.readyState>=2){res();return;}
      video.addEventListener('canplay',res,{once:true});
      setTimeout(res,4000);
    });
    canvas.width=video.videoWidth||640; canvas.height=video.videoHeight||480;
    offC.width=canvas.width; offC.height=canvas.height;
    setStatus('LIVE',true);
    initFaceMesh();
    if(!S.rafRunning) startRAF();
    toast('Camera started (fallback mode)','ok',2500);
  }catch(e2){toast('Camera failed: '+e2.message,'err',6000);}
}

async function enumCams(){
  try{
    const d=await navigator.mediaDevices.enumerateDevices();
    S.cams=d.filter(x=>x.kind==='videoinput');
    const s=document.getElementById('camSel');
    s.innerHTML='<option value="">— Auto detect —</option>';
    S.cams.forEach((c,i)=>{
      const o=document.createElement('option');
      o.value=c.deviceId;o.textContent=c.label||'Camera '+(i+1);
      s.appendChild(o);
    });
    document.getElementById('switchBtn').disabled=S.cams.length<2;
  }catch(e){}
}

function selectCam(sel){S.camIdx=S.cams.findIndex(c=>c.deviceId===sel.value);startCamera();}

async function switchCamera(){
  if(S.cams.length<2){toast('Only one camera found','err',2500);return;}
  S.camIdx=(S.camIdx+1)%S.cams.length;
  const s=document.getElementById('camSel');
  s.value=S.cams[S.camIdx]?.deviceId||'';
  await startCamera();
}


// ── FACE MESH & SEGMENTATION ──
function initFaceMesh(){
  if(S.fmInstance){try{S.fmInstance.close();}catch(e){}S.fmInstance=null;}
  if(S.ssInstance){try{S.ssInstance.close();}catch(e){}S.ssInstance=null;}
  if(typeof FaceMesh==='undefined'||typeof SelfieSegmentation==='undefined'||typeof Camera==='undefined'){
    load(100,'Ready (camera only — no face tracking)');
    hideLoad();
    setFaceStats('Face tracking unavailable (CDN issue). Camera-only mode.');
    return;
  }
  try{
    const fm=new FaceMesh({locateFile:f=>`https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@0.4/${f}`});
    fm.setOptions({maxNumFaces:1,refineLandmarks:true,minDetectionConfidence:0.5,minTrackingConfidence:0.5});
    fm.onResults(r=>{
      S.lm=(r.multiFaceLandmarks&&r.multiFaceLandmarks[0])||null;
      if(S.lm)analyzeEmotion();
    });
    S.fmInstance=fm;

    const ss=new SelfieSegmentation({locateFile:f=>`https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${f}`});
    ss.setOptions({modelSelection: 1}); // 1 is landscape (faster), 0 is general
    ss.onResults(r=>{
        S.segmentationMask = r.segmentationMask;
    });
    S.ssInstance=ss;

    const cam=new Camera(video,{
      onFrame:async()=>{
        if(S.ssInstance)await S.ssInstance.send({image:video});
        if(S.fmInstance)await S.fmInstance.send({image:video});
      },
      width:canvas.width,height:canvas.height
    });
    cam.start().then(()=>{load(100,'Ready!');hideLoad();setFaceStats('Face tracking active');}).catch(()=>{load(100,'Ready');hideLoad();});
  }catch(e){load(100,'Ready');hideLoad();console.warn('FaceMesh/Segmentation:',e);}
}


// ── EMOTION ENGINE ──
function analyzeEmotion(){
  const lm=S.lm;if(!lm||lm.length<470)return;
  const W=canvas.width,H=canvas.height;
  const g=i=>(lm[i]||{x:.5,y:.5,z:0});
  const mT=g(13),mB=g(14),lL=g(61),lR=g(291);
  const eT=g(159),eB=g(145),erT=g(386),erB=g(374);
  const bL=g(70);
  const mOpen=Math.abs(mT.y-mB.y)*H;
  const mW=Math.abs(lL.x-lR.x)*W;
  const mCY=(mT.y+mB.y)/2,cY=(lL.y+lR.y)/2;
  const smile=Math.max(0,(mCY-cY)*H*5);
  const bRaise=Math.max(0,(eT.y-bL.y)*H*2.5);
  const raw={
    happy:  Math.min(100,smile*3+(mW/W)*180),
    surprise:Math.min(100,mOpen*2.5+bRaise*1.8),
    anger:  Math.min(100,Math.max(0,28-bRaise)*1.8),
    sad:    Math.min(100,Math.max(0,(cY-mCY)*H*7))
  };
  raw.neutral=Math.max(0,100-(raw.happy+raw.surprise+raw.anger+raw.sad)/2.5);
  const k=.12;
  Object.keys(raw).forEach(n=>S.smooth[n]=S.smooth[n]*(1-k)+raw[n]*k);
  updateEmoUI();
  if(S.overlays.has('particles')){
    if(S.smooth.happy>55)spawn('happy',2);
    if(S.smooth.surprise>45)spawn('surprise',3);
  }
}

function updateEmoUI(){
  const E=S.smooth;
  ['happy','surprise','anger','sad','neutral'].forEach(k=>{
    const v=Math.min(100,E[k]);
    const b=document.getElementById('eb-'+k);
    const e=document.getElementById('ev-'+k);
    if(b)b.style.width=v+'%';
    if(e)e.textContent=Math.round(v)+'%';
  });
  const dom=Object.keys(E).reduce((a,b)=>E[a]>E[b]?a:b);
  const EM={happy:'😄',surprise:'😮',anger:'😡',sad:'😢',neutral:'😐'};
  const LM={happy:'HAPPY',surprise:'SURPRISED',anger:'ANGRY',sad:'SAD',neutral:'NEUTRAL'};
  document.getElementById('emoEmoji').textContent=EM[dom];
  document.getElementById('emoLbl').textContent=LM[dom];
}

// ── RENDER LOOP ──
function startRAF(){
  S.rafRunning=true;
  (function frame(){
    requestAnimationFrame(frame);
    S.frameCount++;S.sceneF++;
    drawFrame();
    if(S.ovVisible){
      const mw=miniC.offsetWidth||280,mh=miniC.offsetHeight||170;
      miniC.width=mw;miniC.height=mh;
      miniCtx.drawImage(canvas,0,0,mw,mh);
    }
  })();
}

function drawFrame(){
  const W=canvas.width,H=canvas.height;
  ctx.clearRect(0,0,W,H);
  if(S.scene!=='none')drawScene(ctx,W,H);
  if(video.readyState>=2)applyStyle(W,H);
  if(S.lm){
    if(S.overlays.has('mesh'))drawMesh(W,H);
    if(S.overlays.has('avatar'))drawAvatar(W,H);
    if(S.overlays.has('aura'))drawAIAura(W,H);
    if(S.overlays.has('hud'))drawHUD(W,H);
  }
  drawParticles(W,H);
  if(S.lm&&S.frameCount%24===0)updateFaceStatsLive();
}


// ── STYLE RENDERER (all bugs fixed) ──
function applyStyle(W,H){
  const br=S.brightness,co=S.contrast,sa=S.saturation,ix=S.intensity;

  // Helper: apply mirrored video draw
  const drawVideo=(filter)=>{
    ctx.save();

    // Create offscreen canvas for masked video if we have a scene and mask
    let sourceVideo = video;
    if (S.scene !== 'none' && S.segmentationMask) {
        const tempC = document.createElement('canvas');
        tempC.width = W; tempC.height = H;
        const tempCtx = tempC.getContext('2d');
        tempCtx.save();
        if(S.mirrored){tempCtx.translate(W,0);tempCtx.scale(-1,1);}
        tempCtx.drawImage(S.segmentationMask, 0, 0, W, H);
        tempCtx.globalCompositeOperation = 'source-in';
        tempCtx.drawImage(video, 0, 0, W, H);
        tempCtx.restore();
        sourceVideo = tempC;

        ctx.filter=filter;
        ctx.drawImage(sourceVideo,0,0,W,H);
    } else {
        if(S.mirrored){ctx.translate(W,0);ctx.scale(-1,1);}
        ctx.filter=filter;
        ctx.drawImage(video,0,0,W,H);
    }

    ctx.filter='none';
    ctx.restore();
    return sourceVideo; // return in case it's needed by other effects
  };

  if(S.style==='passthrough'){
    drawVideo(`brightness(${br}%) contrast(${co}%) saturate(${sa}%)`);
  }
  else if(S.style==='anime'){
    drawVideo(`brightness(${br+8}%) contrast(${co+25}%) saturate(${sa+100}%)`);
    ctx.save();if(S.mirrored){ctx.translate(W,0);ctx.scale(-1,1);}
    ctx.globalCompositeOperation='screen';ctx.globalAlpha=ix*.22;
    ctx.filter=`brightness(180%) blur(3px) saturate(300%)`;
    ctx.drawImage(video,0,0,W,H);
    ctx.filter='none';ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';
    ctx.restore();
  }
  else if(S.style==='pixel'){
    // BUG FIX: Use offscreen canvas to avoid reading partially drawn output
    const px=Math.max(2,Math.round(10*ix));
    const sw=Math.max(1,W/px|0),sh=Math.max(1,H/px|0);
    offC.width=sw;offC.height=sh;
    offCtx.save();
    if(S.mirrored){offCtx.translate(sw,0);offCtx.scale(-1,1);}
    offCtx.filter=`brightness(${br}%) contrast(${co+20}%) saturate(${sa}%)`;
    offCtx.drawImage(video,0,0,sw,sh);
    offCtx.filter='none';
    offCtx.restore();
    ctx.imageSmoothingEnabled=false;
    ctx.drawImage(offC,0,0,W,H);
    ctx.imageSmoothingEnabled=true;
  }
  else if(S.style==='neon'){
    drawVideo(`brightness(${br+20}%) contrast(${co+30}%) saturate(300%) hue-rotate(${S.frameCount*.5%360}deg)`);
    ctx.save();if(S.mirrored){ctx.translate(W,0);ctx.scale(-1,1);}
    ctx.globalCompositeOperation='screen';ctx.globalAlpha=.28;
    ctx.filter=`brightness(220%) blur(4px) saturate(500%)`;
    ctx.drawImage(video,0,0,W,H);
    ctx.filter='none';ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';
    ctx.restore();
  }
  else if(S.style==='noir'){
    drawVideo(`brightness(${br-5}%) contrast(${co+35}%) grayscale(${ix*100}%)`);
  }
  else if(S.style==='vhs'){
    // Step 1: draw video
    drawVideo(`brightness(${br-5}%) contrast(${co-10}%) saturate(${Math.max(0,sa-50)}%) sepia(${ix*30}%)`);
    // Step 2: chromatic aberration — BUG FIX: properly write back shifted pixel data
    const shift=Math.round(Math.sin(S.frameCount*.15)*3+2);
    if(shift>0){
      const img=ctx.getImageData(0,0,W,H);
      const src=img.data, dst=new Uint8ClampedArray(src.length);
      for(let y=0;y<H;y++){
        for(let x=0;x<W;x++){
          const i=(y*W+x)*4;
          const rx=Math.min(W-1,x+shift), lx=Math.max(0,x-shift);
          const ri=(y*W+rx)*4, li=(y*W+lx)*4;
          dst[i]=src[ri];      // R shifted right
          dst[i+1]=src[i+1];   // G unchanged
          dst[i+2]=src[li+2];  // B shifted left
          dst[i+3]=src[i+3];
        }
      }
      ctx.putImageData(new ImageData(dst,W,H),0,0);
    }
    // Scan noise bar
    ctx.fillStyle=`rgba(255,255,255,${.03+Math.random()*.03})`;
    ctx.fillRect(0,(S.frameCount*2)%H,W,1+(Math.random()*2|0));
    // Scan lines
    ctx.fillStyle='rgba(0,0,0,0.04)';
    for(let y=0;y<H;y+=3)ctx.fillRect(0,y,W,1);
  }
  else if(S.style==='thermal'){
    // BUG FIX: draw grayscale first, THEN remap — correct order
    drawVideo(`grayscale(100%) brightness(${br}%) contrast(${co+30}%)`);
    const img=ctx.getImageData(0,0,W,H);
    const d=img.data;
    for(let i=0;i<d.length;i+=4){
      const n=d[i]/255;
      let r,g,b;
      if(n<.2){r=0;g=0;b=n*5*180|0;}
      else if(n<.4){r=0;g=(n-.2)*5*200|0;b=200-((n-.2)*5*200)|0;}
      else if(n<.6){r=(n-.4)*5*255|0;g=200;b=0;}
      else if(n<.8){r=255;g=255-((n-.6)*5*200)|0;b=0;}
      else{r=255;g=255;b=(n-.8)*5*255|0;}
      d[i]=Math.max(0,Math.min(255,r));
      d[i+1]=Math.max(0,Math.min(255,g));
      d[i+2]=Math.max(0,Math.min(255,b));
    }
    ctx.putImageData(img,0,0);
  }
  else if(S.style==='glitch'){
    drawVideo(`brightness(${br+15}%) contrast(${co+15}%) saturate(${sa+60}%)`);
    if(S.frameCount%6===0){
      for(let i=0;i<5;i++){
        const gy=Math.random()*H|0,gh=2+Math.random()*16|0;
        if(gy+gh>=H)continue;
        const slice=ctx.getImageData(0,gy,W,gh);
        ctx.putImageData(slice,(Math.random()-.5)*28|0,gy);
      }
      ctx.globalCompositeOperation='screen';
      ctx.fillStyle=`hsla(${Math.random()*360},100%,50%,.04)`;
      ctx.fillRect(0,0,W,H);
      ctx.globalCompositeOperation='source-over';
    }
  }
}

// ── SCENE BACKGROUNDS ──
function drawScene(c,W,H){
  const f=S.sceneF;
  if(S.scene==='space'){
    const g=c.createRadialGradient(W/2,H/2,0,W/2,H/2,Math.max(W,H));
    g.addColorStop(0,'#0a0020');g.addColorStop(1,'#000');
    c.fillStyle=g;c.fillRect(0,0,W,H);
    for(let i=0;i<100;i++){
      const sx=(Math.sin(i*2.3+f*.0008)*.5+.5)*W;
      const sy=(Math.cos(i*1.7)*.5+.5)*H;
      const sz=Math.abs(Math.sin(i+f*.015))*1.8;
      c.globalAlpha=.4+Math.sin(f*.04+i)*.35;
      c.fillStyle='#fff';c.beginPath();c.arc(sx,sy,sz,0,6.28);c.fill();
    }
    c.globalAlpha=1;
  }else if(S.scene==='city'){
    const g=c.createLinearGradient(0,0,0,H);
    g.addColorStop(0,'#000a18');g.addColorStop(.6,'#001440');g.addColorStop(1,'#002060');
    c.fillStyle=g;c.fillRect(0,0,W,H);
    for(let i=0;i<18;i++){
      const bw=W/14,bh=H*.2+(i%5)*H*.12,bx=(i/18)*W+(i%3)*8;
      c.fillStyle='#000c22';c.fillRect(bx,H-bh,bw*.85,bh);
      for(let wy=H-bh+8;wy<H-10;wy+=16){
        for(let wx=bx+4;wx<bx+bw*.85-4;wx+=11){
          if(Math.sin(wx*wy*.008+f*.002)>.15){c.fillStyle='rgba(255,220,80,.55)';c.fillRect(wx,wy,5,7);}
        }
      }
      c.fillStyle='transparent';
    }
  }else if(S.scene==='forest'){
    const g=c.createLinearGradient(0,0,0,H);g.addColorStop(0,'#001208');g.addColorStop(1,'#002a14');
    c.fillStyle=g;c.fillRect(0,0,W,H);
    for(let i=0;i<16;i++){
      const tx=(i/16)*W,th=H*.35+(i%4)*H*.1;
      c.fillStyle=`hsl(${128+i*4},${35+i%18}%,${9+i%7}%)`;
      c.beginPath();c.moveTo(tx,H);c.lineTo(tx+W/20,H-th);c.lineTo(tx+W/10,H);c.fill();
    }
    for(let i=0;i<18;i++){
      const fx=(Math.sin(i*3.1+f*.018)*.5+.5)*W;
      const fy=(Math.cos(i*2.7+f*.013)*.5+.5)*H*.6+H*.05;
      c.globalAlpha=(Math.sin(f*.09+i)*.5+.5)*.75;
      c.fillStyle='#88ff66';c.beginPath();c.arc(fx,fy,2,0,6.28);c.fill();
    }
    c.globalAlpha=1;
  }else if(S.scene==='sunset'){
    const g=c.createLinearGradient(0,0,0,H);
    g.addColorStop(0,'#18000a');g.addColorStop(.5,'#600020');g.addColorStop(1,'#c04000');
    c.fillStyle=g;c.fillRect(0,0,W,H);
    const sy=H*.52+Math.sin(f*.004)*6;
    const sg=c.createRadialGradient(W/2,sy,0,W/2,sy,W*.18);
    sg.addColorStop(0,'#fff');sg.addColorStop(.3,'#ffcc44');sg.addColorStop(1,'transparent');
    c.fillStyle=sg;c.fillRect(0,0,W,H);
  }else if(S.scene==='matrix'){
    c.fillStyle='rgba(0,8,0,.35)';c.fillRect(0,0,W,H);
    c.fillStyle='#00ff44';c.font=`${H/28|0}px monospace`;
    for(let i=0;i<32;i++){
      const mx=(i/32)*W;
      const my=((f*2+i*41)%(H+40))-20;
      c.fillText(String.fromCharCode(33+((Math.abs(Math.sin(i+f*.08))*94)|0)),mx,my);
    }
  }
}

// ── FACE MESH ──
const EDGES=[
  [10,338],[338,297],[297,332],[332,284],[284,251],[251,389],[389,356],[356,454],[454,323],[323,361],[361,288],[288,397],[397,365],[365,379],[379,378],[378,400],[400,377],[377,152],[152,148],[148,176],[176,149],[149,150],[150,136],[136,172],[172,58],[58,132],[132,93],[93,234],[234,127],[127,162],[162,21],[21,54],[54,103],[103,67],[67,109],[109,10],
  [33,7],[7,163],[163,144],[144,145],[145,153],[153,154],[154,155],[155,133],[133,33],
  [362,398],[398,384],[384,385],[385,386],[386,387],[387,388],[388,466],[466,362],
  [61,185],[185,40],[40,39],[39,37],[37,0],[0,267],[267,269],[269,270],[270,409],[409,291],[291,375],[375,321],[321,405],[405,314],[314,17],[17,84],[84,181],[181,91],[91,146],[146,61]
];
function drawMesh(W,H){
  const lm=S.lm;
  ctx.save();if(S.mirrored){ctx.translate(W,0);ctx.scale(-1,1);}
  ctx.strokeStyle='rgba(108,255,212,.32)';ctx.lineWidth=.7;
  EDGES.forEach(([a,b])=>{
    if(!lm[a]||!lm[b])return;
    ctx.beginPath();ctx.moveTo(lm[a].x*W,lm[a].y*H);ctx.lineTo(lm[b].x*W,lm[b].y*H);ctx.stroke();
  });
  ctx.fillStyle='rgba(176,108,255,.8)';
  [33,133,362,466,61,291,4,152,10].forEach(i=>{
    if(!lm[i])return;
    ctx.beginPath();ctx.arc(lm[i].x*W,lm[i].y*H,2,0,6.28);ctx.fill();
  });
  ctx.restore();
}

// ── ANIME AVATAR ──
function drawAvatar(W,H){
  const lm=S.lm;if(!lm)return;
  const g=i=>lm[i]||{x:.5,y:.5};
  const mx=x=>S.mirrored?W-x*W:x*W,my=y=>y*H;
  const eL={x:mx(g(33).x),y:my(g(33).y)},eR={x:mx(g(263).x),y:my(g(263).y)};
  const ed=Math.abs(eR.x-eL.x);if(ed<8)return;
  ctx.save();
  const drawEye=(ex,ey,dir,open)=>{
    const r=ed*.27;
    if(!open){ctx.beginPath();ctx.moveTo(ex-r,ey);ctx.lineTo(ex+r,ey);ctx.strokeStyle='#111';ctx.lineWidth=3;ctx.stroke();return;}
    ctx.beginPath();ctx.ellipse(ex,ey,r,r*.75,0,0,6.28);ctx.fillStyle='#fff';ctx.fill();
    const ig=ctx.createRadialGradient(ex+dir*2,ey-r*.1,0,ex+dir*2,ey,r*.62);
    ig.addColorStop(0,'#c080ff');ig.addColorStop(.5,'#5030b0');ig.addColorStop(1,'#000');
    ctx.beginPath();ctx.ellipse(ex+dir*2,ey,r*.62,r*.72,0,0,6.28);ctx.fillStyle=ig;ctx.fill();
    ctx.beginPath();ctx.ellipse(ex+dir*2,ey+2,r*.27,r*.34,0,0,6.28);ctx.fillStyle='#000';ctx.fill();
    ctx.beginPath();ctx.arc(ex+dir*3-r*.18,ey-r*.18,r*.14,0,6.28);ctx.fillStyle='rgba(255,255,255,.92)';ctx.fill();
    ctx.beginPath();ctx.ellipse(ex,ey,r,r*.75,0,0,6.28);ctx.strokeStyle='#111';ctx.lineWidth=2;ctx.stroke();
  };
  const eLoOpen=Math.abs((g(159).y-g(145).y)*H)>3.5;
  const eRoOpen=Math.abs((g(386).y-g(374).y)*H)>3.5;
  drawEye(eL.x,eL.y,-1,eLoOpen);drawEye(eR.x,eR.y,1,eRoOpen);
  const mL={x:mx(g(61).x),y:my(g(61).y)},mR={x:mx(g(291).x),y:my(g(291).y)};
  const mT={x:mx(g(13).x),y:my(g(13).y)},mB={x:mx(g(14).x),y:my(g(14).y)};
  const mo=mB.y-mT.y;
  if(mo>7){
    ctx.beginPath();ctx.ellipse((mL.x+mR.x)/2,(mT.y+mB.y)/2,(mR.x-mL.x)/2,mo/2,0,0,6.28);
    ctx.fillStyle='#cc3366';ctx.fill();ctx.strokeStyle='#111';ctx.lineWidth=1.5;ctx.stroke();
  }else{
    ctx.beginPath();ctx.moveTo(mL.x,mL.y);ctx.quadraticCurveTo((mL.x+mR.x)/2,mB.y+5,mR.x,mR.y);
    ctx.strokeStyle='#cc3366';ctx.lineWidth=3;ctx.stroke();
  }
  ctx.restore();
}


// ── AI MOOD LIGHTING & AURA ──
function drawAIAura(W,H){
  const lm=S.lm;if(!lm)return;
  const g=i=>lm[i]||{x:.5,y:.5};

  // Center is between the eyes, influenced by pitch/yaw
  const cx=S.mirrored?W-g(4).x*W:g(4).x*W,cy=g(4).y*H;
  const r=Math.abs(g(33).x-g(263).x)*W*1.5;

  // Find the dominant emotion
  const dom=Object.keys(S.smooth).reduce((a,b)=>S.smooth[a]>S.smooth[b]?a:b);

  // Core colors based on AI emotion detection
  const cols={
      happy: {r: 255, g: 220, b: 100}, // Gold/Yellow
      surprise: {r: 100, g: 200, b: 255}, // Cyan
      anger: {r: 255, g: 80, b: 80}, // Red
      sad: {r: 80, g: 120, b: 255}, // Deep Blue
      neutral: {r: 176, g: 108, b: 255} // Purple
  };

  const targetCol = cols[dom] || cols.neutral;

  // Calculate dynamic glow size based on emotion intensity and head roll
  const emotionIntensity = S.smooth[dom] / 100;
  const rollInfluence = Math.abs(S.pose.roll || 0) * 0.01;
  const throb = Math.sin(Date.now() * 0.003) * 0.15;
  const glowMultiplier = 1.8 + (emotionIntensity * 0.8) + rollInfluence + throb;

  ctx.save();
  const gr=ctx.createRadialGradient(cx,cy,0,cx,cy,r*glowMultiplier);

  // Draw the aura
  const colorString = `${targetCol.r},${targetCol.g},${targetCol.b}`;
  gr.addColorStop(0,`rgba(${colorString},0)`);

  // Aura shifts slightly based on pitch/yaw
  const outerAlpha = 0.15 + (Math.abs(S.pose.pitch || 0) * 0.002);
  gr.addColorStop(1,`rgba(${colorString},${outerAlpha})`);

  ctx.fillStyle=gr;
  ctx.globalCompositeOperation='screen';
  ctx.beginPath();
  ctx.arc(cx,cy,r*glowMultiplier,0,6.28);
  ctx.fill();

  // Dynamic particle generation based on AI mood
  if(S.frameCount % (Math.max(5, 30 - emotionIntensity * 20) | 0) === 0) {
      // Spawn particles that match the current mood
      const type = dom === 'neutral' ? 'rainbow' : dom;
      if(typeof spawn === 'function') spawn(type, 1);
  }

  ctx.globalCompositeOperation='source-over';
  ctx.restore();
}


// ── HUD ──
function drawHUD(W,H){
  const lm=S.lm;if(!lm)return;
  const g=i=>lm[i]||{x:.5,y:.5};
  const cx=S.mirrored?W-g(4).x*W:g(4).x*W,cy=g(4).y*H;
  ctx.save();
  ctx.strokeStyle='rgba(108,255,212,.4)';ctx.lineWidth=.7;ctx.setLineDash([4,9]);
  ctx.beginPath();ctx.moveTo(0,cy);ctx.lineTo(W,cy);ctx.stroke();
  ctx.beginPath();ctx.moveTo(cx,0);ctx.lineTo(cx,H);ctx.stroke();
  ctx.setLineDash([]);
  const bx=cx-65,by=cy-90,bw=130,bh=180,bl=18;
  ctx.strokeStyle='rgba(108,255,212,.75)';ctx.lineWidth=1.5;
  [[bx,by,1,1],[bx+bw,by,-1,1],[bx,by+bh,1,-1],[bx+bw,by+bh,-1,-1]].forEach(([x,y,sx,sy])=>{
    ctx.beginPath();ctx.moveTo(x+sx*bl,y);ctx.lineTo(x,y);ctx.lineTo(x,y+sy*bl);ctx.stroke();
  });
  ctx.fillStyle='rgba(108,255,212,.65)';ctx.font='9px monospace';
  ctx.fillText('FACE_LOCK',bx,by-6);
  ctx.fillText(`${cx|0},${cy|0}`,bx+bw-52,by-6);
  ctx.restore();
}

// ── PARTICLES ──
const PCOLS={rainbow:null,fire:['#ff6600','#ff4400','#ffcc00','#ff8800'],ice:['#88ddff','#aaeeff','#fff','#44ccff'],gold:['#ffd700','#ffcc44','#ffffaa'],happy:['#ffdd44','#ffaa44','#ff88aa'],surprise:['#44ddff','#44ffaa','#fff']};

function spawn(type,count){
  const W=canvas.width,H=canvas.height;
  const lm=S.lm;
  const cx=lm?(S.mirrored?W-lm[4].x*W:lm[4].x*W):W/2;
  const cy=lm?lm[4].y*H:H/2;
  for(let i=0;i<count;i++){
    const a=Math.random()*6.28,sp=1+Math.random()*3;
    const pal=PCOLS[S.pColor]||PCOLS[type];
    const col=pal?pal[pal.length*Math.random()|0]:`hsl(${Math.random()*360},100%,70%)`;
    S.particles.push({x:cx+(Math.random()-.5)*70,y:cy+(Math.random()-.5)*70,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp-1.2,life:1,dec:.012+Math.random()*.018,sz:S.pSize*(.4+Math.random()*.8),col});
  }
}

function drawParticles(W,H){
  if(S.overlays.has('particles')&&S.lm&&Math.random()*100<S.pRate*.25)spawn('neutral',1);
  pCtx.clearRect(0,0,pCanvas.width,pCanvas.height);
  const sx=pCanvas.width/W,sy=pCanvas.height/H;
  S.particles=S.particles.filter(p=>{
    p.x+=p.vx;p.y+=p.vy;p.vy-=.06;p.life-=p.dec;
    if(p.life<=0)return false;
    pCtx.save();
    pCtx.globalAlpha=p.life;pCtx.fillStyle=p.col;
    pCtx.shadowColor=p.col;pCtx.shadowBlur=10;
    pCtx.beginPath();pCtx.arc(p.x*sx,p.y*sy,p.sz*p.life,0,6.28);pCtx.fill();
    pCtx.restore();
    return true;
  });
}

function triggerBurst(){for(let i=0;i<70;i++)setTimeout(()=>spawn('rainbow',3),i*12);}

// ── FACE STATS ──
function updateFaceStatsLive(){
  const lm=S.lm;if(!lm)return;
  const W=canvas.width,H=canvas.height;
  const g=i=>lm[i]||{x:.5,y:.5,z:0};
  const ed=Math.round(Math.abs(g(33).x-g(263).x)*W);

  // Advanced head pose tracking
  const nose = g(1);
  const leftEye = g(33);
  const rightEye = g(263);
  const topLip = g(13);
  const bottomLip = g(14);

  // Calculate Pitch (up/down)
  const pitch=Math.round((nose.y - .5) * 180);

  // Calculate Yaw (left/right)
  const yaw=Math.round((nose.x - .5) * -180);

  // Calculate Roll (tilt)
  const dx = rightEye.x - leftEye.x;
  const dy = rightEye.y - leftEye.y;
  const roll = Math.round(Math.atan2(dy, dx) * 180 / Math.PI);

  const mo=Math.round(Math.abs(topLip.y-bottomLip.y)*H);

  // Check for Iris tracking (points 468-477)
  const hasIris = lm.length > 468;
  const pointsCount = lm.length;

  // Iris specific stats (offset from eye center)
  let irisInfo = "";
  if (hasIris) {
      const leftIris = g(468);
      const rightIris = g(473);
      // Rough gaze calculation
      const leftGazeX = Math.round((leftIris.x - leftEye.x) / (rightEye.x - leftEye.x) * 100);
      irisInfo = `<br><span style="color:var(--accent3)">Gaze:</span> ${leftGazeX}%`;
  }

  setFaceStats(`<span style="color:var(--accent3)">Eye Dist:</span> ${ed}px<br><span style="color:var(--accent3)">Pitch:</span> ${pitch>0?'+':''}${pitch}°<br><span style="color:var(--accent3)">Yaw:</span> ${yaw>0?'+':''}${yaw}°<br><span style="color:var(--accent3)">Roll:</span> ${roll>0?'+':''}${roll}°<br><span style="color:var(--accent3)">Mouth:</span> ${mo}px<br><span style="color:var(--accent3)">Points:</span> ${pointsCount}${irisInfo}`);

  // Update state with pose for AI features later
  S.pose = { pitch, yaw, roll };
}
// ── CONTROLS ──
function setStyle(el){S.style=el.dataset.style;document.querySelectorAll('.sc').forEach(c=>c.classList.toggle('active',c===el));}
function setScene(el){S.scene=el.dataset.scene;document.querySelectorAll('.bg-card').forEach(c=>c.classList.toggle('active',c===el));}
function toggleOvChip(el){const k=el.dataset.ov;S.overlays.has(k)?S.overlays.delete(k):S.overlays.add(k);el.classList.toggle('active',S.overlays.has(k));if(k==='mesh')document.getElementById('meshBtn').classList.toggle('active',S.overlays.has('mesh'));}
function toggleMirror(){S.mirrored=!S.mirrored;document.getElementById('mirrorBtn').classList.toggle('active',S.mirrored);}
function toggleMeshBtn(){const el=document.querySelector('[data-ov="mesh"]');if(el)toggleOvChip(el);}
function cycleStyle(){const styles=['passthrough','anime','pixel','neon','noir','vhs','thermal','glitch'];const el=document.querySelector(`[data-style="${styles[(styles.indexOf(S.style)+1)%styles.length]}"]`);if(el)setStyle(el);}
function sliderSet(key,val,el){S[key]=val;const v=document.getElementById('sv-'+key);if(v)v.textContent=el.value;}

// ── RECORDING ──
function toggleRecord(){S.rec?stopRec():startRec();}
function startRec(){
  try{
    const out=canvas.captureStream(30);
    if(S.stream){const a=S.stream.getAudioTracks()[0];if(a)out.addTrack(a);}
    S.chunks=[];
    const mime=MediaRecorder.isTypeSupported('video/webm;codecs=vp9')?'video/webm;codecs=vp9':'video/webm';
    S.mr=new MediaRecorder(out,{mimeType:mime});
    S.mr.ondataavailable=e=>{if(e.data.size>0)S.chunks.push(e.data);};
    S.mr.onstop=()=>{
      const blob=new Blob(S.chunks,{type:'video/webm'});
      const url=URL.createObjectURL(blob);
      const a=document.createElement('a');a.href=url;a.download='prism-'+Date.now()+'.webm';a.click();
      URL.revokeObjectURL(url);toast('Recording saved!','ok',2500);
    };
    S.mr.start(100);S.rec=true;S.recStart=Date.now();
    document.getElementById('recBtn').classList.add('active');
    document.getElementById('recTimer').classList.add('show');
    S.recInt=setInterval(()=>{
      const e=Math.floor((Date.now()-S.recStart)/1000);
      document.getElementById('recTime').textContent=String(e/60|0).padStart(2,'0')+':'+String(e%60).padStart(2,'0');
    },1000);
  }catch(e){toast('Recording error: '+e.message,'err',5000);}
}
function stopRec(){if(S.mr)S.mr.stop();S.rec=false;clearInterval(S.recInt);document.getElementById('recBtn').classList.remove('active');document.getElementById('recTimer').classList.remove('show');}
function captureSnap(){const a=document.createElement('a');a.href=canvas.toDataURL('image/png');a.download='prism-snap-'+Date.now()+'.png';a.click();toast('Snapshot saved!','ok',2000);}

// ── GAME OVERLAY ──
function toggleOv_float(){S.ovVisible=!S.ovVisible;document.getElementById('overlayFloat').classList.toggle('show',S.ovVisible);}
function closeOv(){S.ovVisible=false;document.getElementById('overlayFloat').classList.remove('show');}
function resizeOv(sz){const el=document.getElementById('overlayFloat');const s={sm:[190,145],md:[280,220],lg:[400,310]}[sz]||[280,220];el.style.width=s[0]+'px';el.style.height=s[1]+'px';}
function setChroma(m){
  S.chromaMode=m;const fl=document.getElementById('overlayFloat');
  fl.classList.remove('cg','cb');miniC.style.background='';miniC.style.opacity='1';
  document.querySelectorAll('.oc-chip').forEach(c=>c.classList.remove('active'));
  document.getElementById('oc-'+m)?.classList.add('active');
  if(m==='green'){fl.classList.add('cg');miniC.style.background='#00ff00';}
  else if(m==='blue'){fl.classList.add('cb');miniC.style.background='#0000ff';}
  else if(m==='trans')miniC.style.opacity='.8';
}
// Drag overlay
(()=>{
  const h=document.getElementById('overlayHandle'),fl=document.getElementById('overlayFloat');
  let ox=0,oy=0,drag=false;
  const s=e=>{drag=true;const p=e.touches?e.touches[0]:e,r=fl.getBoundingClientRect();ox=p.clientX-r.left;oy=p.clientY-r.top;e.preventDefault();};
  const d=e=>{if(!drag)return;const p=e.touches?e.touches[0]:e;fl.style.left=(p.clientX-ox)+'px';fl.style.top=(p.clientY-oy)+'px';fl.style.right='auto';fl.style.bottom='auto';};
  const en=()=>drag=false;
  h.addEventListener('mousedown',s);h.addEventListener('touchstart',s,{passive:false});
  document.addEventListener('mousemove',d);document.addEventListener('touchmove',d,{passive:false});
  document.addEventListener('mouseup',en);document.addEventListener('touchend',en);
})();

// ── MODAL ──
function openModal(id){document.getElementById(id).classList.add('open');}
function closeModal(id){document.getElementById(id).classList.remove('open');}
document.querySelectorAll('.modal-bg').forEach(m=>m.addEventListener('click',e=>{if(e.target===m)m.classList.remove('open');}));
function switchTab(n){
  const tabs=['obs','streamlabs','youtube','vcam','other'];
  document.querySelectorAll('.tab-btn').forEach((b,i)=>b.classList.toggle('active',tabs[i]===n));
  document.querySelectorAll('.tab-content').forEach(t=>t.classList.toggle('show',t.id==='tab-'+n));
}

// ── MOBILE ──
const MOB={
  styles(){return `<div class="plabel">Face Style</div><div class="style-grid">${['passthrough','anime','pixel','neon','noir','vhs','thermal','glitch'].map(s=>`<div class="sc${s==='passthrough'?' active':''}" data-style="${s}" onclick="setStyle(this);closeMobDrawer()">${({passthrough:'🎭 Normal',anime:'✨ Anime',pixel:'🕹️ Pixel',neon:'🌈 Neon',noir:'🎬 Noir',vhs:'📼 VHS',thermal:'🌡️ Thermal',glitch:'⚡ Glitch'})[s]}</div>`).join('')}</div>`;},
  scene(){return `<div class="plabel">Background</div><div class="scene-grid">${[{s:'none',e:'🚫',bg:'#111'},{s:'space',e:'🌌',bg:'linear-gradient(135deg,#0a0020,#200060)'},{s:'city',e:'🌃',bg:'linear-gradient(135deg,#001030,#003060)'},{s:'forest',e:'🌿',bg:'linear-gradient(135deg,#002010,#004020)'},{s:'sunset',e:'🌅',bg:'linear-gradient(135deg,#300010,#800040)'},{s:'matrix',e:'💻',bg:'#001000'}].map(x=>`<div class="bg-card" data-scene="${x.s}" onclick="setScene(this);closeMobDrawer()" style="background:${x.bg}">${x.e}</div>`).join('')}</div>`;},
  fx(){return `<div class="plabel">Particle FX</div><div class="sl-row"><span class="sl-lbl">Rate</span><input type="range" min="0" max="100" value="${S.pRate}" oninput="sliderSet('pRate',+this.value,this)"><span class="sl-val">${S.pRate}</span></div><div class="sl-row"><span class="sl-lbl">Size</span><input type="range" min="2" max="20" value="${S.pSize}" oninput="sliderSet('pSize',+this.value,this)"><span class="sl-val">${S.pSize}</span></div><div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:10px"><button class="btn sm" onclick="S.pColor='rainbow'">🌈 Rain</button><button class="btn sm" onclick="S.pColor='fire'">🔥 Fire</button><button class="btn sm" onclick="S.pColor='ice'">❄️ Ice</button><button class="btn sm" onclick="S.pColor='gold'">⭐ Gold</button></div><button class="btn acc3" style="width:100%;margin-top:10px" onclick="triggerBurst()">✨ FX Burst</button>`;},
  emo(){return `<div class="plabel">Live Emotions</div><div class="emo-meters"><div class="er"><span class="en">😄 Happy</span><div class="eb-wrap"><div class="eb" style="background:#6cff8a;width:${S.smooth.happy}%"></div></div><span class="ev">${S.smooth.happy|0}%</span></div><div class="er"><span class="en">😮 Surprise</span><div class="eb-wrap"><div class="eb" style="background:#ffd96c;width:${S.smooth.surprise}%"></div></div><span class="ev">${S.smooth.surprise|0}%</span></div><div class="er"><span class="en">😡 Anger</span><div class="eb-wrap"><div class="eb" style="background:#ff6c6c;width:${S.smooth.anger}%"></div></div><span class="ev">${S.smooth.anger|0}%</span></div></div>`;},
  cam(){return `<div class="plabel">Camera</div><div style="display:flex;flex-direction:column;gap:8px"><button class="btn" style="width:100%" onclick="startCamera();closeMobDrawer()">📷 Start Camera</button><button class="btn" style="width:100%" onclick="switchCamera()">🔄 Switch</button><button class="btn acc2" style="width:100%" onclick="captureSnap()">📸 Snapshot</button><button class="btn danger" style="width:100%" onclick="toggleRecord()">${S.rec?'⏹ Stop Rec':'⏺ Record'}</button></div>`;}
};
let lastMobTab='';
function mobOpen(name){
  const dr=document.getElementById('mobDrawer');
  if(dr.classList.contains('open')&&lastMobTab===name){closeMobDrawer();return;}
  lastMobTab=name;
  document.getElementById('mobDrawerInner').innerHTML=(MOB[name]&&MOB[name]())||'';
  dr.classList.add('open');
}
function closeMobDrawer(){document.getElementById('mobDrawer').classList.remove('open');}
// Swipe down to close
let tsy=0;
const md=document.getElementById('mobDrawer');
md.addEventListener('touchstart',e=>tsy=e.touches[0].clientY,{passive:true});
md.addEventListener('touchend',e=>{if(e.changedTouches[0].clientY-tsy>60)closeMobDrawer();},{passive:true});

// ── LOAD SCREEN ──
function hideLoad(){setTimeout(()=>{const l=document.getElementById('loadScreen');l.classList.add('gone');setTimeout(()=>{try{l.remove();}catch(e){}},600);},500);}

// ── KEYBOARD ──
document.addEventListener('keydown',e=>{
  if(e.target.tagName==='INPUT'||e.target.tagName==='SELECT')return;
  const k=e.key;
  if(k==='m'||k==='M')toggleMirror();
  else if(k==='r'||k==='R')toggleRecord();
  else if(k==='s'||k==='S')captureSnap();
  else if(k===' '){e.preventDefault();triggerBurst();}
  else if(k==='g'||k==='G')toggleOv_float();
  else if(k>='1'&&k<='8'){const el=document.querySelector(`[data-style="${['passthrough','anime','pixel','neon','noir','vhs','thermal','glitch'][+k-1]}"]`);if(el)setStyle(el);}
});


// ── BOOT SEQUENCE ──
load(15,'Loading tracking libraries…');
(async()=>{
  const loadScript=src=>new Promise((res,rej)=>{const s=document.createElement('script');s.src=src;s.onload=res;s.onerror=rej;document.head.appendChild(s);});
  try{
    await loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js');
    load(30,'Camera utilities loaded…');
    await loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/face_mesh.js');
    load(50,'Face mesh loaded…');
    await loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/selfie_segmentation.js');
    load(65,'Selfie segmentation loaded…');
  }catch(e){console.warn('MediaPipe CDN load failed — camera-only mode:',e);}

  load(80,'Requesting camera…');
  setTimeout(()=>{
    startCamera();
    if(!S.rafRunning)startRAF(); // Start render loop even before camera (shows animated backgrounds)
  },200);
})();
