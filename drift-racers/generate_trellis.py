from gradio_client import Client, file
import sys

def generate_3d():
    print("Connecting to JeffreyXiang/TRELLIS...")
    try:
        client = Client("JeffreyXiang/TRELLIS")
        print("Endpoints:")
        print(client.view_api(return_format="dict"))
        
        # We need to know the exact api_name for generating 3D.
        # It's usually /preprocess_image, then /generate_marching_cubes, etc., or maybe a single pipeline.
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    generate_3d()
