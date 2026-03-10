import re

with open('script.js', 'r') as f:
    content = f.read()

# Add a unique "Mood Lighting & Dynamic AI Aura" feature
ai_feature_logic = """
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
      spawn(type, 1);
  }

  ctx.globalCompositeOperation='source-over';
  ctx.restore();
}
"""

content = re.sub(r'// ── AURA ──\nfunction drawAura\(W,H\)\{.*?\n\}', ai_feature_logic, content, flags=re.DOTALL)

# Enable Aura by default in S state
content = re.sub(r"overlays: new Set\(\['mesh'\]\)", "overlays: new Set(['mesh', 'aura'])", content)

# Change drawAura call to drawAIAura
content = re.sub(r"if\(S\.overlays\.has\('aura'\)\)drawAura\(W,H\);", "if(S.overlays.has('aura'))drawAIAura(W,H);", content)

with open('script.js', 'w') as f:
    f.write(content)

print("script.js updated successfully")
