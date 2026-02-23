import os
import sys

def main():
    print("=== Trellis 3D Generation via Replicate API ===")
    print("To generate the highest quality 3D models from our AI textures, we will use Trellis.")
    print("Since local Gradio limits programmatic access, the best and most reliable way is via the Replicate API.")
    print("Please install replicate: pip install replicate")
    print("Then set your environment variable: set REPLICATE_API_TOKEN=your_token_here")
    print("\nScript execution:")
    
    token = os.environ.get("REPLICATE_API_TOKEN")
    if not token:
        print("ERROR: REPLICATE_API_TOKEN not found in environment variables.")
        print("Please provide the token to the AI assistant, or run this script manually after setting the token.")
        sys.exit(1)
        
    try:
        import replicate
    except ImportError:
        print("ERROR: 'replicate' library not installed. Please run: pip install replicate")
        sys.exit(1)
        
    print("Token found! Initiating 3D generation for Crystal Texture...")
    
    try:
        # Example call to JeffreyXiang/Trellis on replicate (assuming it exists or using similar 3D generation model like CSM)
        # For actual Trellis on replicate: replicate.run("jeffreyxiang/trellis:...", input={"image": open("images/crystal_tex.png", "rb")})
        output = replicate.run(
            "jeffreyxiang/trellis", 
            input={
                "image": open("images/crystal_tex.png", "rb"),
                "texture_size": 1024
            }
        )
        print("Generation successful!", output)
    except Exception as e:
        print("API Error:", e)

if __name__ == "__main__":
    main()
