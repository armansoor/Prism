import re

with open('script.js', 'r') as f:
    content = f.read()

# Replace the specific applyStyle function block
apply_style_replacement = """// ── STYLE RENDERER (all bugs fixed) ──
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
  };"""

content = re.sub(r'// ── STYLE RENDERER \(all bugs fixed\) ──.*?ctx\.restore\(\);\n  \};\n', apply_style_replacement, content, flags=re.DOTALL)

with open('script.js', 'w') as f:
    f.write(content)

print("script.js updated successfully")
