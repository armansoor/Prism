import re

with open('script.js', 'r') as f:
    content = f.read()

camera_replacement = """async function startCamera(){
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
}"""

content = re.sub(r'async function startCamera\(\).*?catch\(e\)\{\n    camError\(e\);\n  \}\n\}', camera_replacement, content, flags=re.DOTALL)

with open('script.js', 'w') as f:
    f.write(content)

print("script.js updated successfully")
