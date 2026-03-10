import re

with open('script.js', 'r') as f:
    content = f.read()

# Add a check for spawn function
content = re.sub(r"spawn\(type, 1\);", "if(typeof spawn === 'function') spawn(type, 1);", content)

with open('script.js', 'w') as f:
    f.write(content)
