import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
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
        this.gltfLoader = new GLTFLoader(this.loadingManager);
        this.gltfLoader.setMeshoptDecoder(MeshoptDecoder);
        this.characterPromise = null;
    }

    preload(completionCallback) {
        const essentialAssets = [
            { type: 'textures', name: 'waterNormals', path: `${import.meta.env.BASE_URL}textures/waternormals.jpg` },
            { type: 'fonts', name: 'helvetiker', path: `${import.meta.env.BASE_URL}fonts/helvetiker_regular.typeface.json` },
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
                loader = this.gltfLoader;
                break;
            default:
                console.error('Unknown asset type:', type);
                return;
        }

        loader.load(path,
            (asset) => {
                console.log(`Loaded ${type} ${name}`);
                if (type === 'models') {
                    this.processModel(asset.scene);
                    this.assets[type][name] = asset.scene;
                } else if (type === 'animations') {
                    this.processAnimation(name, asset);
                    // processAnimation already stored the clip — don't overwrite with full glTF
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
        // glTF is in meters (~1.76m tall); scene works in the old FBX-derived scale (~17.6 units)
        model.scale.setScalar(10);
        model.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });
    }

    processAnimation(name, gltf) {
        this.assets.animations[name] = (gltf.animations && gltf.animations.length > 0)
            ? gltf.animations[0]
            : null;
    }

    loadHDRI(name, path, callback) {
        console.log(`Attempting to load HDRI: ${path}`);
        this.rgbeLoader.load(
            path,
            (texture) => {
                console.log(`HDRI loaded successfully: ${name}`);
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

    // Loads the character once, then hands out skeleton-aware clones (one per dancer).
    loadCharacterModel(callback) {
        if (!this.characterPromise) {
            const path = `${import.meta.env.BASE_URL}models/dancer.glb`;
            this.characterPromise = new Promise((resolve) => {
                this.gltfLoader.load(path, (gltf) => {
                    this.processModel(gltf.scene);
                    resolve(gltf.scene);
                }, undefined, (err) => {
                    console.error('Failed to load character model:', err);
                    resolve(null);
                });
            });
        }
        this.characterPromise.then((base) => {
            callback(base ? SkeletonUtils.clone(base) : null);
        });
    }
}

export default new AssetLoader();
