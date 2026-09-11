from PIL import Image

img = Image.open('public/fonts/PokemonFont.png').convert('RGBA')
width, height = img.size

char_w = 30
char_h = 30
cols = 19
rows = 5

xml_out = '<?xml version="1.0"?>\n'
xml_out += '<font>\n'
xml_out += '  <info face="PokemonFont" size="30" bold="0" italic="0" charset="" unicode="1" stretchH="100" smooth="0" aa="1" padding="0,0,0,0" spacing="0,0" outline="0"/>\n'
xml_out += '  <common lineHeight="30" base="26" scaleW="570" scaleH="150" pages="1" packed="0"/>\n'
xml_out += '  <pages>\n'
xml_out += '    <page id="0" file="PokemonFont.png"/>\n'
xml_out += '  </pages>\n'
xml_out += f'  <chars count="{cols*rows}">\n'

pixels = img.load()

# ASCII printable starts at 32 (space)
ascii_val = 32

for row in range(rows):
    for col in range(cols):
        x_start = col * char_w
        y_start = row * char_h
        
        # Find exact bounds of this character
        min_x = char_w
        max_x = -1
        
        for cy in range(y_start, y_start + char_h):
            for cx in range(x_start, x_start + char_w):
                if pixels[cx, cy][3] > 0:
                    min_x = min(min_x, cx - x_start)
                    max_x = max(max_x, cx - x_start)
                    
        if max_x == -1:
            # Empty character (like space)
            adv = 8
            cx = x_start
            cw = 0
            xoffset = 0
        else:
            # Add 2 pixels of spacing for xAdvance
            adv = (max_x - min_x + 1) + 2
            cx = x_start + min_x
            cw = max_x - min_x + 1
            xoffset = min_x
            
        xml_out += f'    <char id="{ascii_val}" x="{cx}" y="{y_start}" width="{cw}" height="{char_h}" xoffset="{xoffset}" yoffset="0" xadvance="{adv}" page="0" chnl="15"/>\n'
        
        ascii_val += 1

xml_out += '  </chars>\n'
xml_out += '</font>\n'

with open('public/fonts/PokemonFont.xml', 'w') as f:
    f.write(xml_out)

print("BMFont XML generated at public/fonts/PokemonFont.xml")
