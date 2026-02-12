# 🎮 Spot the Fake - Automated Pipeline

Fully automated workflow for generating "Spot the Fake" image pairs. Fetches real nature photos from Unsplash, generates AI-modified versions with Replicate (Stable Diffusion img2img), and organizes everything locally.

## 📋 What It Does

1. **Fetch** → Downloads horizontal nature/landscape images from Unsplash (none or few people)
2. **Store** → Saves originals to local `raw` folder
3. **Process** → Resizes and compresses using Sharp (fast local processing)
4. **Distribute** → Copies processed originals to `to_replicate` and `ready` folders
5. **Generate** → Creates AI fakes using Replicate Stable Diffusion img2img (uses original as reference!)
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
| `REPLICATE_API_KEY` | [Replicate API](https://replicate.com/account/api-tokens) token |
| `BATCH_SIZE` | Images per run (default: 2) |
| `RESIZE_WIDTH` | Target width in pixels (default: 1280) |
| `RESIZE_HEIGHT` | Target height in pixels (default: 720) |

## 🔑 API Setup Guides

### Unsplash

1. Go to [unsplash.com/developers](https://unsplash.com/developers)
2. Create a new application
3. Copy your **Access Key** and **Secret Key**
4. Free tier: 50 requests/hour

### Replicate (Affordable img2img Generation!)

1. Go to [replicate.com](https://replicate.com/) and sign up
2. Go to [replicate.com/account/api-tokens](https://replicate.com/account/api-tokens)
3. Click **"Create token"**
4. Copy the token (starts with `r8_...`)
5. Add to billing (optional): Get $5 free trial for 14 days
6. **Super cheap**: ~$0.002 per image = $0.04/month for 20 images!
7. **Perfect for your use case**: img2img uses your original image as reference

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

## 🤖 About Replicate & Stable Diffusion img2img

This project uses [Replicate](https://replicate.com/) with **Stable Diffusion XL img2img** for AI image generation - **super affordable** and **uses your original image as reference**!

### Why Replicate?

- **💰 Super Cheap** - Only ~$0.002 per image ($0.04/month for 20 images!)
- **🎯 img2img Support** - Uses your original image as reference (perfect for "spot the fake")
- **🚀 Fast** - Runs on high-performance GPUs in the cloud
- **🎨 High Quality** - Uses Stable Diffusion XL for photorealistic results
- **📊 Transparent Pricing** - Pay only for what you use, no hidden fees

### How It Works

1. **Image-to-Image Generation**: Sends your original image + prompt to Replicate
2. **Reference-Based**: Uses the original as a reference (80% similar, 20% AI-generated)
3. **Subtle Differences**: Perfect for "spot the fake" game - images are very similar but not identical
4. **Post-Processing**: Sharp resizes and optimizes the generated images

### Cost Breakdown

For your use case (20 images/month):
- **Per image**: ~$0.002
- **Per month**: ~$0.04
- **$5 credit lasts**: ~2,500 images = 125 months!

Compare to OpenAI DALL-E 3: $1.20/month (30x more expensive!)

### Model Used

- **stability-ai/sdxl**: Stable Diffusion XL with img2img support
- **prompt_strength: 0.8**: 80% of the original image preserved, 20% AI-generated differences
- **50 inference steps**: High-quality output
- **1024×576 resolution**: Perfect 16:9 aspect ratio

### Documentation

- **Replicate Platform**: [replicate.com](https://replicate.com/)
- **SDXL Model**: [replicate.com/stability-ai/sdxl](https://replicate.com/stability-ai/sdxl)
- **Pricing**: [replicate.com/pricing](https://replicate.com/pricing)
- **API Docs**: [replicate.com/docs](https://replicate.com/docs)

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
│   │   └── replicate.js      # AI fake generation (Stable Diffusion img2img)
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

This project uses **img2img** (image-to-image) generation, which means:

1. **Original as Reference**: Sends your Unsplash photo to Replicate
2. **Prompt + Image**: Combines the image with a prompt asking for a near-replica
3. **Subtle Changes**: The AI creates a very similar image with minor AI-generated differences
4. **Perfect for Game**: Players must spot the subtle differences between real and AI

**The Magic Prompt**:
> "Create a pixel-perfect replica of the reference image. Match the original framing, composition, perspective, and proportions exactly. Precisely mimic the lighting direction, intensity, and color temperature..."

**Generation Parameters**:
- **Size**: 1024×576 (16:9 aspect ratio)
- **Quality**: 50 inference steps for photorealism
- **Guidance**: 7.5 scale for prompt adherence
- **Prompt Strength**: 0.8 (80% original, 20% AI changes)
- **Negative prompt**: Filters out cartoons, illustrations, CGI artifacts

## 🔧 Customization

### Change the AI generation

Edit `src/services/replicate.js` and modify:
- `FAKE_GENERATION_PROMPT`: The main prompt for image generation
- `prompt_strength`: How much to transform the image (0.8 = 80% original, 20% new)
- Try different Replicate models (see [replicate.com/collections/text-to-image](https://replicate.com/collections/text-to-image))

### Adjust image processing

Edit `.env` to change `RESIZE_WIDTH`, `RESIZE_HEIGHT`, or modify `src/services/iloveimg.js` (which now uses Sharp) for more control over quality, format, and processing options.

### Add new image sources

Create a new service in `src/services/` following the pattern of `unsplash.js`.

## 🐛 Troubleshooting

### "Missing required environment variables"
→ Make sure you've copied `.env.example` to `.env` and filled in all values

### "Replicate API error 401 (unauthorized)"
→ Check your `REPLICATE_API_KEY` in `.env` is correct and starts with `r8_`

### "Replicate: Insufficient credits"
→ Add credits at [replicate.com/account/billing](https://replicate.com/account/billing) - $5 lasts 2,500 images!

### "Sharp processing failed"
→ Ensure you have enough disk space and the input images are valid JPEG/PNG files

### "Replicate model taking long time"
→ First generation can take 10-30 seconds (model cold start). Subsequent ones are faster

## 📄 License

MIT
