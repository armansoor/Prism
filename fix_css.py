import re

with open('style.css', 'r') as f:
    content = f.read()

# Make canvas responsive and keep aspect ratio inside workspace
# Fix scroll issues on panels and drawer
responsive_fixes = """
/* RESPONSIVE */
@media(max-width:900px){.lpanel{width:185px}.rpanel{width:205px}.logo-sub{display:none}}
@media(max-width:700px){
  .lpanel,.rpanel{position:fixed!important;top:var(--topbar);bottom:48px;z-index:400;width:220px!important;transform:translateX(-110%);border:1px solid var(--border)}
  .rpanel{right:0;left:auto;transform:translateX(110%)}
  .lpanel.mob-open,.rpanel.mob-open{transform:translateX(0)}
  .mob-tabs{display:flex}
  .mob-drawer{display:block}
  .stage-bar{gap:4px; flex-wrap:nowrap; overflow-x: auto; padding: 0 5px;}
  .stage-bar .btn{padding:6px 9px;font-size:9px; flex-shrink: 0;}
  .topbar{padding:0 10px}
  .logo{font-size:17px}
  .topbar-mid{display:none}

  /* Make canvas scale to fit on mobile */
  #outputCanvas, #particleCanvas {
      width: 100%;
      height: 100%;
      object-fit: contain;
  }
}
@media(max-width:400px){
  .topbar-right .btn:not(.danger){display:none}
}

/* Base canvas sizing */
#outputCanvas {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  position: relative;
  z-index: 5;
  display: block;
}
#particleCanvas {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 15;
  width: 100%;
  height: 100%;
}
"""

content = re.sub(r'/\* RESPONSIVE \*/.*?\}', responsive_fixes, content, flags=re.DOTALL)

with open('style.css', 'w') as f:
    f.write(content)

print("style.css updated successfully")
