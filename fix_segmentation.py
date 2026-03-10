import re

with open('script.js', 'r') as f:
    content = f.read()

# Add Selfie Segmentation loading
boot_sequence_replacement = """
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
"""

content = re.sub(r'// ── BOOT SEQUENCE ──.*?}catch\(e\)\{console\.warn\(\'MediaPipe CDN load failed — camera-only mode:\',e\);\}', boot_sequence_replacement, content, flags=re.DOTALL)

# Add segmentation logic to S state
state_replacement = """
// State object — single source of truth
const S = {
  style:'passthrough', scene:'none',
  overlays: new Set(['mesh']),
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
  rafRunning:false, fmInstance:null, ssInstance:null
};
"""
content = re.sub(r'// State object — single source of truth.*?rafRunning:false, fmInstance:null\n};', state_replacement, content, flags=re.DOTALL)

# Add segmentation initialization
init_face_mesh_replacement = """
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
"""
content = re.sub(r'// ── FACE MESH ──\nfunction initFaceMesh\(\).*?\}\n\}', init_face_mesh_replacement, content, flags=re.DOTALL)

# Modify applyStyle to use segmentation mask
apply_style_start = """
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
    } else {
        if(S.mirrored){ctx.translate(W,0);ctx.scale(-1,1);}
    }

    ctx.filter=filter;
    ctx.drawImage(sourceVideo,0,0,W,H);
    ctx.filter='none';
    ctx.restore();
  };
"""

content = re.sub(r'// ── STYLE RENDERER \(all bugs fixed\) ──\nfunction applyStyle\(W,H\)\{.*?\};', apply_style_start, content, flags=re.DOTALL)

with open('script.js', 'w') as f:
    f.write(content)

print("script.js updated successfully")
