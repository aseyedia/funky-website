import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader';
import * as THREE from 'three';
import { FontLoader } from 'three/addons/loaders/FontLoader.js';

class AssetLoader {
    constructor() {
        this.loadingManager = new THREE.LoadingManager();
        this.assets = {
            hdris: {},
            textures: {},
            audio: {},
            fonts: {},
            models: {},
            animations: {}
        };
        this.rgbeLoader = new RGBELoader(this.loadingManager);
        this.textureLoader = new THREE.TextureLoader(this.loadingManager);
        this.audioLoader = new THREE.AudioLoader(this.loadingManager);
        this.fontLoader = new FontLoader(this.loadingManager);
        this.fbxLoader = new FBXLoader(this.loadingManager);
    }

    preload(completionCallback) {
        const essentialAssets = [
            { type: 'textures', name: 'waterNormals', path: 'https://threejs.org/examples/textures/waternormals.jpg' },
            { type: 'fonts', name: 'helvetiker', path: 'https://threejs.org/examples/fonts/helvetiker_regular.typeface.json' },
        ];

        let loadedCount = 0;
        const totalCount = essentialAssets.length;

        essentialAssets.forEach(asset => {
            this.loadAsset(asset.type, asset.name, asset.path, () => {
                loadedCount++;
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
            case 'models':
            case 'animations':
                loader = this.fbxLoader;
                break;
            default:
                console.error('Unknown asset type:', type);
                return;
        }

        loader.load(path,
            (asset) => {
                console.log(`Loaded ${type} ${name}`);
                if (type === 'models') {
                    this.processModel(asset);
                    this.assets[type][name] = asset;
                } else if (type === 'animations') {
                    this.processAnimation(name, asset);
                    // processAnimation already stored the clip — don't overwrite with full FBX
                } else {
                    this.assets[type][name] = asset;
                }
                if (callback) callback(this.assets[type][name]);
            },
            undefined,
            (error) => {
                console.error(`Error loading ${type} ${name}:`, error);
                if (callback) callback(null);
            }
        );
    }

    processModel(model) {
        model.scale.setScalar(0.1);
        model.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });
    }

    processAnimation(name, object) {
        this.assets.animations[name] = (object.animations && object.animations.length > 0)
            ? object.animations[0]
            : null;
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
        const fallbackPath = `${import.meta.env.BASE_URL}hdr/fallback.hdr`;
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

    loadNextAnimation(animationPath, callback) {
        const name = animationPath.split('/').pop();
        if (name in this.assets.animations) {
            callback(this.assets.animations[name]);
            return;
        }
        this.loadAsset('animations', name, animationPath, (clip) => {
            callback(clip);
        });
    }

    loadCharacterModel(callback) {
        const path = `${import.meta.env.BASE_URL}Breakdance_Pack/Ch32_nonPBR.fbx`;
        const fbxLoader = new FBXLoader();
        fbxLoader.load(path, (fbx) => {
            this.processModel(fbx);
            callback(fbx);
        }, undefined, (err) => {
            console.error('Failed to load character model:', err);
            callback(null);
        });
    }
}

export default new AssetLoader();
