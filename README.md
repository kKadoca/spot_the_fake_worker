# 🎮 Spot the Fake - Automated Pipeline

Fully automated workflow for generating "Spot the Fake" image pairs. Fetches real nature photos from Unsplash, generates AI-modified versions with Hugging Face (Stable Diffusion), and organizes everything locally.

## 📋 What It Does

1. **Fetch** → Downloads horizontal nature/landscape images from Unsplash (none or few people)
2. **Store** → Saves originals to local `raw` folder
3. **Process** → Resizes and compresses using Sharp (fast local processing)
4. **Distribute** → Copies processed originals to `to_replicate` and `ready` folders
5. **Generate** → Creates AI fakes using Hugging Face Stable Diffusion (FREE!)
6. **Process** → Resizes and compresses the fakes using Sharp
7. **Deliver** → Saves fakes to `ready` folder as `fake_[id].jpeg`

### Output Structure

```
📁 temp/                       # Local temporary storage
├── 📁 raw/                    # Unprocessed Unsplash images
├── 📁 to_replicate/           # Processed originals (AI reference)
│   └── original_202602_001.jpeg
└── 📁 ready/                  # Final game-ready pairs
    ├── original_202602_001.jpeg
    └── fake_202602_001.jpeg
```

## 🚀 Quick Start

### 1. Clone & Install

```bash
cd C:\projetos\firecode\spot-the-fake_auto
npm install
```

### 2. Configure Environment

```bash
# Copy the example file
cp .env.example .env

# Edit with your credentials
notepad .env  # Windows
# or: code .env  # VS Code
```

### 3. Run

```bash
# Full pipeline
npm start

# Or run specific steps
npm run fetch      # Only download from Unsplash
npm run process    # Only resize/compress
npm run generate   # Only create AI fakes

# With options
npm start -- --count 3        # Process 3 images
npm start -- --no-cleanup     # Keep temp files
```

## ⚙️ Configuration

All settings are in `.env`:

| Variable | Description |
|----------|-------------|
| `UNSPLASH_ACCESS_KEY` | [Unsplash API](https://unsplash.com/developers) access key |
| `HUGGINGFACE_API_KEY` | [Hugging Face API](https://huggingface.co/settings/tokens) token (FREE!) |
| `HUGGINGFACE_MODEL` | Model to use (default: `stabilityai/stable-diffusion-xl-base-1.0`) |
| `BATCH_SIZE` | Images per run (default: 2) |
| `RESIZE_WIDTH` | Target width in pixels (default: 1280) |
| `RESIZE_HEIGHT` | Target height in pixels (default: 720) |

## 🔑 API Setup Guides

### Unsplash

1. Go to [unsplash.com/developers](https://unsplash.com/developers)
2. Create a new application
3. Copy your **Access Key** and **Secret Key**
4. Free tier: 50 requests/hour

### Hugging Face (FREE Image Generation!)

1. Go to [huggingface.co/settings/tokens](https://huggingface.co/settings/tokens)
2. Click **"New token"**
3. Give it a name (e.g., "spot-the-fake")
4. Select **"Read"** permission (default)
5. Click **"Generate token"**
6. Copy the token (starts with `hf_...`)
7. **Completely FREE** - No credit card required!
8. Free tier: Generous limits for personal projects (a few hundred requests/hour)

## About Sharp

This project uses [Sharp](https://sharp.pixelplumbing.com/) for high-performance image processing. Sharp is:

- **Fast** - Uses libvips library, 4-5x faster than ImageMagick or GraphicsMagick
- **Local** - No API keys needed, processes images on your machine
- **Reliable** - Battle-tested in production environments worldwide
- **Memory efficient** - Streams images without loading entire files into memory
- **Feature-rich** - Supports resize, crop, rotate, compress, watermark, and more

### Key Features Used

- **Resize**: Converts images to exact dimensions (1280×720) with smart fitting
- **Compress**: JPEG quality optimization (low: 90, recommended: 85, extreme: 70)
- **Format conversion**: Handles JPEG, PNG, WebP, AVIF, TIFF
- **Metadata preservation**: Maintains EXIF data when needed

### Documentation

- **Official docs**: [sharp.pixelplumbing.com](https://sharp.pixelplumbing.com/)
- **GitHub**: [github.com/lovell/sharp](https://github.com/lovell/sharp)
- **API Reference**: [sharp.pixelplumbing.com/api-constructor](https://sharp.pixelplumbing.com/api-constructor)

## 🤖 About Hugging Face & Stable Diffusion

This project uses [Hugging Face](https://huggingface.co/) Inference API with **Stable Diffusion** for AI image generation - completely **FREE**!

### Why Hugging Face?

- **💯 100% Free** - No credit card required, generous free tier
- **🚀 Fast** - Runs on Hugging Face's GPU infrastructure
- **🎨 High Quality** - Uses Stable Diffusion XL for photorealistic results
- **🔓 No Limits** - Perfect for low-volume usage (1-20 images/day)
- **🌍 Open Source** - Built on open-source AI models

### How It Works

1. **Text-to-Image Generation**: Since we're using the free tier, we generate new nature scenes using text prompts
2. **Scene Variety**: The script cycles through different scene types (forest, mountain, beach, lake, sunset, desert)
3. **Photorealistic Output**: Stable Diffusion XL creates high-quality, realistic images
4. **Post-Processing**: Sharp resizes and optimizes the generated images

### Models Available

The default model is `stabilityai/stable-diffusion-xl-base-1.0`, but you can use others:

- **Stable Diffusion XL** (default): Best quality, photorealistic
- **Stable Diffusion v1-5**: Faster, lighter weight
- Check [Hugging Face Models](https://huggingface.co/models?pipeline_tag=text-to-image) for more options

### Rate Limits

- **Free tier**: A few hundred requests per hour
- **Perfect for**: 1-20 images per day (your use case!)
- **No monthly cap**: Unlike paid APIs, you won't run out of credits

### Documentation

- **Hugging Face Hub**: [huggingface.co](https://huggingface.co/)
- **Inference API Docs**: [huggingface.co/docs/api-inference](https://huggingface.co/docs/api-inference)
- **Stable Diffusion**: [huggingface.co/stabilityai/stable-diffusion-xl-base-1.0](https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0)

## 📁 Project Structure

```
spot-the-fake_auto/
├── src/
│   ├── index.js              # Main orchestrator
│   ├── config/
│   │   └── index.js          # Configuration loader
│   ├── services/
│   │   ├── unsplash.js       # Unsplash API integration
│   │   ├── iloveimg.js       # Image processing (Sharp)
│   │   └── huggingface.js    # AI fake generation (Stable Diffusion)
│   └── utils/
│       └── helpers.js        # Utility functions
├── temp/                     # (gitignored) Temporary files
├── .env.example              # Environment template
├── .env                      # (gitignored) Your credentials
├── .gitignore
├── package.json
└── README.md
```

## 🎯 How Image Generation Works

Since we're using Stable Diffusion (text-to-image), the script generates new nature scenes that look realistic but are clearly AI-generated:

**Scene Types** (rotates through variety):
- Forest landscapes with trees and foliage
- Mountain scenes with peaks and valleys
- Beach scenes with ocean and sand
- Lake views with reflections
- Sunset/golden hour landscapes
- Desert environments
- General natural landscapes

**Generation Parameters**:
- **Size**: 1024×576 (16:9 aspect ratio)
- **Quality**: 50 inference steps for photorealism
- **Guidance**: 7.5 scale for prompt adherence
- **Negative prompt**: Filters out cartoons, illustrations, CGI artifacts

## 🔧 Customization

### Change the AI generation

Edit `src/services/huggingface.js` and modify:
- `FAKE_GENERATION_PROMPT`: The main prompt for image generation
- `scenePrompts`: The different scene types (forest, mountain, beach, etc.)
- Or set `HUGGINGFACE_MODEL` in `.env` to use a different Stable Diffusion model

### Adjust image processing

Edit `.env` to change `RESIZE_WIDTH`, `RESIZE_HEIGHT`, or modify `src/services/iloveimg.js` (which now uses Sharp) for more control over quality, format, and processing options.

### Add new image sources

Create a new service in `src/services/` following the pattern of `unsplash.js`.

## 🐛 Troubleshooting

### "Missing required environment variables"
→ Make sure you've copied `.env.example` to `.env` and filled in all values

### "Hugging Face API error 429 (rate limit)"
→ The free tier has rate limits. Wait a few minutes and try again, or reduce batch size

### "Hugging Face API error 401 (unauthorized)"
→ Check your `HUGGINGFACE_API_KEY` in `.env` is correct and starts with `hf_`

### "Sharp processing failed"
→ Ensure you have enough disk space and the input images are valid JPEG/PNG files

### "Model loading error" from Hugging Face
→ The model might be loading (cold start). Wait 30-60 seconds and try again

## 📄 License

MIT
