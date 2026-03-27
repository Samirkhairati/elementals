import os
from PIL import Image

INPUT_DIR = "images"
OUTPUT_DIR = "output"

# Create output folder if it doesn't exist
os.makedirs(OUTPUT_DIR, exist_ok=True)

def scale_image_half(input_path, output_path):
    with Image.open(input_path) as img:
        width, height = img.size

        # Ensure even dimensions (important for clean halving)
        new_width = width // 2
        new_height = height // 2

        # Resize using NEAREST for pixel-perfect scaling
        resized = img.resize((new_width, new_height), Image.NEAREST)

        resized.save(output_path)
        print(f"Scaled: {input_path} -> {output_path}")

def process_all_images():
    for filename in os.listdir(INPUT_DIR):
        if filename.lower().endswith((".png", ".jpg", ".jpeg", ".bmp", ".gif")):
            input_path = os.path.join(INPUT_DIR, filename)
            output_path = os.path.join(OUTPUT_DIR, filename)

            scale_image_half(input_path, output_path)

if __name__ == "__main__":
    process_all_images()