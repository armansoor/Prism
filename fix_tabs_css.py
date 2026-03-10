import re

with open('style.css', 'r') as f:
    content = f.read()

# Fix mobile tabs alignment
content = re.sub(
    r'\.mob-tabs-inner\{display:flex;height:100%\}',
    r'.mob-tabs-inner{display:flex;height:100%;width:100%;justify-content:space-around;padding:0 5px}',
    content
)

# Fix drawer height issue if any
content = re.sub(
    r'\.mob-drawer\{display:none;position:fixed;',
    r'.mob-drawer{display:none;position:fixed;',
    content
)

with open('style.css', 'w') as f:
    f.write(content)

print("style.css updated successfully")
