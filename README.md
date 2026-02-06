# 🎮 Spot the Fake - Automated Pipeline

Fully automated workflow for generating "Spot the Fake" image pairs. Fetches real nature photos from Unsplash, generates AI-modified versions with OpenAI, and organizes everything in Google Drive.

## 📋 What It Does

1. **Fetch** → Downloads horizontal nature/landscape images from Unsplash (none or few people)
2. **Store** → Saves originals to Google Drive `raw` folder
3. **Process** → Resizes (1280×720) and compresses via iLoveIMG API
4. **Distribute** → Uploads processed originals to `to_replicate` and `ready` folders 
5. **Generate** → Creates AI fakes using OpenAI (DALL-E 3) with subtle modifications
6. **Process** → Resizes and compresses the fakes
7. **Deliver** → Uploads fakes to `ready` folder as `fake_[id].jpeg`

### Output Structure

```
📁 Google Drive
├── 📁 raw/                    # Unprocessed Unsplash images
├── 📁 to_replicate/           # Processed originals (AI reference)
│   └── original_202602_001.jpeg
└── 📁 Ready/                  # Final game-ready pairs
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

### 3. Set Up Google Service Account

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or select existing)
3. Enable the **Google Drive API**
4. Create a **Service Account** (IAM & Admin → Service Accounts)
5. Create a JSON key and download it
6. Save as `credentials/service-account.json`
7. **Share your Drive folders** with the service account email

### 4. Run

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
| `OPENAI_API_KEY` | [OpenAI API](https://platform.openai.com/api-keys) key |
| `ILOVEIMG_PUBLIC_KEY` | [iLoveAPI](https://www.iloveapi.com/) public key |
| `ILOVEIMG_SECRET_KEY` | iLoveAPI secret key |
| `GDRIVE_FOLDER_RAW` | Google Drive folder ID for raw images |
| `GDRIVE_FOLDER_TO_REPLICATE` | Folder ID for AI reference images |
| `GDRIVE_FOLDER_READY` | Folder ID for final game-ready pairs |
| `BATCH_SIZE` | Images per run (default: 5) |
| `RESIZE_WIDTH` | Target width in pixels (default: 1280) |
| `RESIZE_HEIGHT` | Target height in pixels (default: 720) |

### Getting Folder IDs

From a Google Drive folder URL:
```
https://drive.google.com/drive/folders/1xL5FVoo9rrxXaxoKXfcjcqBPTgK1QbJj
                                       └─────────── This is the ID ───────────┘
```

## 🔑 API Setup Guides

### Unsplash

1. Go to [unsplash.com/developers](https://unsplash.com/developers)
2. Create a new application
3. Copy your **Access Key** and **Secret Key**
4. Free tier: 50 requests/hour

### OpenAI

1. Go to [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
2. Create a new API key
3. Ensure you have access to GPT-4o and DALL-E 3
4. Note: Image generation costs ~$0.04-0.08 per image

### iLoveIMG

1. Go to [iloveapi.com](https://www.iloveapi.com/)
2. Sign up and create a project
3. Copy your **Public Key** and **Secret Key**
4. Free tier: 250 files/month

### Google Drive

1. [Create a Google Cloud project](https://console.cloud.google.com/projectcreate)
2. [Enable Drive API](https://console.cloud.google.com/apis/library/drive.googleapis.com)
3. [Create Service Account](https://console.cloud.google.com/iam-admin/serviceaccounts/create)
4. Create JSON key → Download → Save as `credentials/service-account.json`
5. Share your Drive folders with the service account email (looks like: `name@project.iam.gserviceaccount.com`)

## 📁 Project Structure

```
spot-the-fake_auto/
├── src/
│   ├── index.js              # Main orchestrator
│   ├── config/
│   │   └── index.js          # Configuration loader
│   ├── services/
│   │   ├── unsplash.js       # Unsplash API integration
│   │   ├── gdrive.js         # Google Drive operations
│   │   ├── iloveimg.js       # Image processing
│   │   └── openai.js         # AI fake generation
│   └── utils/
│       └── helpers.js        # Utility functions
├── credentials/              # (gitignored) Service account keys
├── temp/                     # (gitignored) Temporary files
├── .env.example              # Environment template
├── .env                      # (gitignored) Your credentials
├── .gitignore
├── package.json
└── README.md
```

## 🎯 The AI Prompt

The fake generation uses this carefully crafted prompt:

> Create a pixel-perfect, 16:9 replica of the reference image. Match the original framing, composition, perspective, and proportions exactly. Precisely mimic the lighting direction, intensity, and color temperature. Reproduce all visible camera characteristics (lens distortion, depth of field, exposure). Preserve all micro-textures: skin pores, fabric weave, wood grain, natural noise, scratches, reflections, and imperfections. No added elements, stylization, illustration, CGI, text, watermarks, smoothing, or digital artifacts. **Remember, this is for a game where the player needs to guess which image is real and which is AI, so just make minor changes.**

This produces images that are very similar to the originals but with subtle AI-generated differences.

## 🔧 Customization

### Change the AI prompt

Edit `src/services/openai.js` and modify the `FAKE_GENERATION_PROMPT` constant.

### Adjust image processing

Edit `.env` to change `RESIZE_WIDTH`, `RESIZE_HEIGHT`, or modify `src/services/iloveimg.js` for more control.

### Add new image sources

Create a new service in `src/services/` following the pattern of `unsplash.js`.

## 🐛 Troubleshooting

### "Missing required environment variables"
→ Make sure you've copied `.env.example` to `.env` and filled in all values

### "Google Drive upload failed"
→ Check that the service account email has been shared with your folders (Editor access)

### "DALL-E rate limit exceeded"
→ The script has built-in retry logic, but you may need to wait or reduce batch size

### "iLoveIMG task failed"
→ Check your API quota at iloveapi.com dashboard

## 📄 License

MIT
