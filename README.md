# FrameKit Developer Studio - Web Panel

A premium, lightweight, light-themed admin editor and dashboard built using pure HTML, Vanilla CSS, and JavaScript. It provides full control over creating and editing FrameKit templates and pushing them directly to Google Cloud Firestore and Firebase Storage.

## Features

- **Home Dashboard**: Displays all current templates stored in Firestore.
- **Visual Canvas Editor (390×844)**: Shows a pixel-accurate virtual mockup matching the mobile app's screen layout.
- **Interactive Dragging**: Drag and position layers (text, shapes, mockups) directly using your mouse.
- **Layer Reordering System**: Easily stack, raise, or lower canvas elements to control z-index overlaps.
- **Customizable Layout Elements**:
  - **Background**: Solid colors, linear gradients, split color styles.
  - **Text**: Customize content, select Google Fonts (Outfit, Inter, Syne, Poppins, etc.), set sizes, letter spacing, line height, weights, and alignment.
  - **Shapes**: Create Vector shapes (circles, rects, rings, arcs, polygons, stars, blobs) with colors, corner radius, and stroke widths.
  - **Phone Mockups**: Render phone frames with selectable bezel notches (Dynamic Island, circle notch, wide notch, punch hole, flat bezel, or none) and customize frame colors, corner radius, and bevel thickness.
  - **Badges / Features**: Add pill labels and bullet point lists with custom emojis and background/foreground colors.
  - **Frosted Glass**: Blur panels using web backdrop filters.
- **Firestore & Storage Integration**: Renders the canvas, uploads the high-res screenshot directly as `thumbnailUrl` to Firebase Storage, and updates the template document schema in Firestore.

## Getting Started

### Local Development

To run the panel locally, serve the `web_panel` folder using any HTTP server:

**Using Python:**
```bash
python -m http.server 8000
```
Then visit `http://localhost:8000`.

**Using Node / npx:**
```bash
npx serve
```
Then visit `http://localhost:3000`.

### Vercel Deployment

Deploying to Vercel is extremely simple since the project contains only static files:

1. Install the Vercel CLI: `npm i -g vercel`
2. Run `vercel` from inside the `web_panel` directory:
   ```bash
   cd web_panel
   vercel
   ```
3. Follow the prompts to complete the deploy.

## Firebase Configuration

The panel is pre-configured to connect to your live Firebase project (`framekit-app`). To write to Firestore and Storage, authenticate using the prefilled admin email and password in the studio login screen.
