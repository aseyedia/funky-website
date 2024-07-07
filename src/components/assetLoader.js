import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import * as THREE from 'three';
import { FontLoader } from 'three/addons/loaders/FontLoader.js';

class AssetLoader {
    constructor() {
        this.loadingManager = new THREE.LoadingManager();
        this.assets = {
            hdris: {},
            textures: {},
            audio: {},
            fonts: {}
        };
        this.rgbeLoader = new RGBELoader(this.loadingManager);
        this.textureLoader = new THREE.TextureLoader(this.loadingManager);
        this.audioLoader = new THREE.AudioLoader(this.loadingManager);
        this.fontLoader = new FontLoader(this.loadingManager);
    }

    preload(progressCallback, completionCallback) {
        const essentialAssets = [
            { type: 'textures', name: 'waterNormals', path: 'https://threejs.org/examples/textures/waternormals.jpg' },
            { type: 'audio', name: 'backgroundMusic', path: '/fresh_and_clean.mp3' },
            { type: 'fonts', name: 'helvetiker', path: 'https://threejs.org/examples/fonts/helvetiker_regular.typeface.json' }
        ];

        let loadedCount = 0;
        const totalCount = essentialAssets.length;

        essentialAssets.forEach(asset => {
            this.loadAsset(asset.type, asset.name, asset.path, () => {
                loadedCount++;
                const progress = (loadedCount / totalCount) * 100;
                if (progressCallback) progressCallback(progress);
                if (loadedCount === totalCount) {
                    console.log('Essential assets loaded');
                    if (completionCallback) completionCallback();
                }
            });
        });
    }

    loadAsset(type, name, path, callback) {
        let loader;
        switch (type) {
            case 'hdris':
                loader = this.rgbeLoader;
                break;
            case 'textures':
                loader = this.textureLoader;
                break;
            case 'audio':
                loader = this.audioLoader;
                break;
            case 'fonts':
                loader = this.fontLoader;
                break;
            default:
                console.error('Unknown asset type:', type);
                return;
        }

        loader.load(path, 
            (asset) => {
                console.log(`Loaded ${type} ${name}`);
                this.assets[type][name] = asset;
                if (callback) callback(asset);
            }, 
            undefined, 
            (error) => {
                console.error(`Error loading ${type} ${name}:`, error);
                if (callback) callback(null);
            }
        );
    }

    loadHDRI(name, path, callback) {
        if (this.assets.hdris[name]) {
            if (callback) callback(this.assets.hdris[name]);
            return;
        }

        console.log(`Attempting to load HDRI: ${path}`);
        this.rgbeLoader.load(
            path,
            (texture) => {
                console.log(`HDRI loaded successfully: ${name}`);
                this.assets.hdris[name] = texture;
                if (callback) callback(texture);
            },
            undefined,
            (error) => {
                console.error(`Error loading HDRI ${name} from ${path}:`, error);
                this.loadFallbackHDRI(callback);
            }
        );
    }

    loadFallbackHDRI(callback) {
        const fallbackPath = '/hdr/fallback.hdr'; // Replace with an actual fallback HDRI path
        console.log('Attempting to load fallback HDRI:', fallbackPath);
        this.rgbeLoader.load(
            fallbackPath,
            (texture) => {
                console.log('Fallback HDRI loaded successfully');
                if (callback) callback(texture);
            },
            undefined,
            (error) => {
                console.error('Failed to load fallback HDRI:', error);
                if (callback) callback(null);
            }
        );
    }

    getAsset(type, name) {
        return this.assets[type][name];
    }
}

export default new AssetLoader();