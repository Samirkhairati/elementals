from PIL import Image

img = Image.open('public/fonts/PokemonFont.png').convert('RGBA')
width, height = img.size
print(f"Image size: {width}x{height}")

# Find bounds
pixels = img.load()
chars = []

# Scan column by column to find where characters start and end
in_char = False
start_x = 0
for x in range(width):
    col_has_pixels = False
    for y in range(height):
        if pixels[x, y][3] > 0: # Alpha > 0
            col_has_pixels = True
            break
            
    if col_has_pixels and not in_char:
        in_char = True
        start_x = x
    elif not col_has_pixels and in_char:
        in_char = False
        # Found a character from start_x to x-1
        # Now find its y bounds
        min_y = height
        max_y = 0
        for cx in range(start_x, x):
            for cy in range(height):
                if pixels[cx, cy][3] > 0:
                    min_y = min(min_y, cy)
                    max_y = max(max_y, cy)
        chars.append((start_x, min_y, x - start_x, max_y - min_y + 1))

print(f"Found {len(chars)} characters on one line?")

if len(chars) < 20:
    # Maybe it's multi-line?
    # Scan row by row instead
    lines = []
    in_line = False
    start_y = 0
    for y in range(height):
        row_has_pixels = False
        for x in range(width):
            if pixels[x, y][3] > 0:
                row_has_pixels = True
                break
        if row_has_pixels and not in_line:
            in_line = True
            start_y = y
        elif not row_has_pixels and in_line:
            in_line = False
            lines.append((start_y, y - 1))
            
    print(f"Found {len(lines)} lines")
    
    chars = []
    for ly1, ly2 in lines:
        in_char = False
        start_x = 0
        for x in range(width):
            col_has_pixels = False
            for cy in range(ly1, ly2 + 1):
                if pixels[x, cy][3] > 0:
                    col_has_pixels = True
                    break
            if col_has_pixels and not in_char:
                in_char = True
                start_x = x
            elif not col_has_pixels and in_char:
                in_char = False
                chars.append((start_x, ly1, x - start_x, ly2 - ly1 + 1))
                
    print(f"Found {len(chars)} characters total across lines")
    print(f"First 10 widths: {[w for _,_,w,_ in chars[:10]]}")

