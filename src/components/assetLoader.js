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

    preload(callback) {
        // Preload essential assets only
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
                this.updateLoadingProgress(loadedCount, totalCount);
                if (loadedCount === totalCount) {
                    console.log('Essential assets loaded');
                    if (callback) callback();
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

        loader.load(path, (asset) => {
            this.assets[type][name] = asset;
            if (callback) callback(asset);
        }, undefined, (error) => {
            console.error(`Error loading ${type} ${name}:`, error);
        });
    }

    loadHDRI(name, path, callback) {
        if (this.assets.hdris[name]) {
            if (callback) callback(this.assets.hdris[name]);
            return;
        }

        this.loadAsset('hdris', name, path, callback);
    }

    getAsset(type, name) {
        return this.assets[type][name];
    }

    updateLoadingProgress(current, total) {
        const progress = (current / total) * 100;
        document.getElementById('loadingBar').style.width = `${progress}%`;
        document.getElementById('loadingText').innerText = `Loading... ${Math.round(progress)}%`;
    }
}

export default new AssetLoader();