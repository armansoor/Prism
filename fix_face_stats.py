import re

with open('script.js', 'r') as f:
    content = f.read()

# Enhance face stats tracking
face_stats_replacement = """// ── FACE STATS ──
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
}"""

content = re.sub(r'// ── FACE STATS ──.*?\}\n', face_stats_replacement, content, flags=re.DOTALL)

with open('script.js', 'w') as f:
    f.write(content)

print("script.js updated successfully")
