## Funky Website

I always wanted to make a funky website. You can view it [here](https://www.artaseyedian.com).

## Features

- **Dynamic HDR Environments**: Utilize high dynamic range imaging to create realistic lighting and reflections.
- **Interactive GUI**: Control various aspects of the website in real-time with an intuitive graphical user interface.
- **Responsive Design**: Ensures a seamless experience across different devices and screen sizes.
- **Lazy Loading**: Non-essential scripts are loaded lazily to improve the initial load time.

## Technologies Used

- [Three.js](https://threejs.org/): For rendering 3D graphics in the browser.
- [Vite](https://vitejs.dev/): As the build tool for fast development and production builds.
- [lil-gui](https://lil-gui.georgealways.com/) (bundled with three.js): For the interactive GUI elements.

## Architecture

- `src/` — application code (vanilla three.js, no framework).
- `src/public/` — static assets (HDRIs, FBX animations, audio, fonts, textures). Vite copies these into the build verbatim. Large binaries (`hdr/`, `Breakdance_Pack/`) are gitignored — track them with git-lfs if needed.
- `dist/` — build output. In production it is mounted at `/funky/` by the `professional-site` Express app (port 3000), which nginx proxies for artaseyedian.com.
- HDRIs are pre-downscaled to 1024x512 — the PMREM environment map is only a 256px cubemap, so larger sources are wasted bandwidth. Original 4k masters live outside the build.

Deploying = `npm run build` (output goes live immediately since `dist/` is served directly).

## Getting Started

To get started with the Funky Website project, follow these steps:

1. Clone the repository:

```sh
git clone https://github.com/aseyedia/funky-website.git
```

2. Install dependencies:

```sh
npm install
```

3. Start the development server:

```sh
npm run dev
```

4. To build the project for production, run:

```sh
npm run build
```

5. To preview the production build:

```sh
npm run serve
```

## Contributing

Contributions are welcome! Please feel free to submit a pull request or open an issue if you have any suggestions or find any bugs.

## License

I would honestly be quite flattered if anyone ever decided to use this.

## Acknowledgments
- HDRIs provided by [CGTuts](https://design.tutsplus.com/articles/freebie-8-awesome-ocean-hdris--cg-5684) and [Paul Debevec](https://www.pauldebevec.com/Research/HDR/).
