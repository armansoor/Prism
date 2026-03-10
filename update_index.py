import re

with open('original_index.html', 'r') as f:
    content = f.read()

# Replace style block with link
content = re.sub(r'<style>.*?</style>', '<link rel="stylesheet" href="style.css">', content, flags=re.DOTALL)

# Replace script block with link
content = re.sub(r'<script>.*?</script>', '<script src="script.js"></script>', content, flags=re.DOTALL)

with open('index.html', 'w') as f:
    f.write(content)

print("index.html updated successfully")
