import sys
from gradio_client import Client, file

def generate_3d():
    print("Connecting to Trellis...")
    try:
        client = Client("JeffreyXiang/TRELLIS")
        print("Uploading image...")
        result = client.predict(
            image=file('images/crystal_tex.png'),
            ss_guidance_strength=5,
            ss_sampling_steps=12,
            slat_guidance_strength=3,
            slat_sampling_steps=12,
            api_name="/image_to_3d"
        )
        print("Generated GLB:", result)
        import shutil
        shutil.copy(result, "images/crystal.glb")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    generate_3d()
