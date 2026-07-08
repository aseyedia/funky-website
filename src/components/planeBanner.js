import * as THREE from 'three';

// A little prop plane that tows a visitor-count banner across the sky once
// on load and on demand (the "Summon Plane" button). Procedural low-poly
// geometry — same trick as the birds and cube toy, no model file needed.
// The banner's number is a canvas texture: flat cloth is the *correct*
// look for a tow banner, unlike the earlier 3D-name experiment.

// Tuned against the default camera (0,30,100 looking at origin, 40deg FOV):
// this altitude/distance keeps the plane clearly on-screen for the middle
// stretch of its pass while still entering/exiting off both edges.
const FLIGHT_ALTITUDE = 24;
const FLIGHT_Z = -60; // behind the main dancer/name action, clear of the water
const FLIGHT_X_START = -220;
const FLIGHT_X_END = 220;
const FLIGHT_DURATION_SECONDS = 10;
const PROP_SPIN_SPEED = 28; // radians/sec

const BANNER_WIDTH = 46;
const BANNER_HEIGHT = 14;
const BANNER_CANVAS_W = 1024;
const BANNER_CANVAS_H = Math.round(BANNER_CANVAS_W * (BANNER_HEIGHT / BANNER_WIDTH));

function buildPlaneMesh() {
    const group = new THREE.Group();

    const bodyPaint = new THREE.MeshStandardMaterial({ color: 0xd6402a, roughness: 0.4, metalness: 0.25 });
    const trimPaint = new THREE.MeshStandardMaterial({ color: 0xf6e27a, roughness: 0.4, metalness: 0.25 });
    const wingPaint = new THREE.MeshStandardMaterial({ color: 0xf4f1e8, roughness: 0.4, metalness: 0.25 });
    const glass = new THREE.MeshStandardMaterial({ color: 0x1c2b33, roughness: 0.15, metalness: 0.6 });
    const propMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.5, metalness: 0.4 });

    // Fuselage — a stretched cylinder along the direction of travel (+X),
    // capped with a cone nose. Cylinder's default long axis is Y, so rotate
    // it onto X.
    const fuselage = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.9, 12, 10), bodyPaint);
    fuselage.rotation.z = Math.PI / 2;
    group.add(fuselage);

    const nose = new THREE.Mesh(new THREE.ConeGeometry(1.6, 3, 10), trimPaint);
    nose.rotation.z = -Math.PI / 2;
    nose.position.x = 7.5;
    group.add(nose);

    // Cockpit bubble, slightly aft of the nose.
    const cockpit = new THREE.Mesh(new THREE.SphereGeometry(1.1, 8, 6), glass);
    cockpit.scale.set(1.3, 0.9, 0.9);
    cockpit.position.set(2.5, 1.4, 0);
    group.add(cockpit);

    // Wings, spanning Z.
    const wing = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.3, 20), wingPaint);
    wing.position.set(-0.5, 0, 0);
    group.add(wing);

    // Tail: vertical fin + horizontal stabilizer.
    const fin = new THREE.Mesh(new THREE.BoxGeometry(2.2, 3, 0.3), trimPaint);
    fin.position.set(-5.4, 1.6, 0);
    group.add(fin);

    const stabilizer = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.25, 7), wingPaint);
    stabilizer.position.set(-5.6, 0.2, 0);
    group.add(stabilizer);

    // Propeller — its own sub-group so it can spin independently.
    const propGroup = new THREE.Group();
    propGroup.position.set(9, 0, 0);
    const blade1 = new THREE.Mesh(new THREE.BoxGeometry(0.3, 4.2, 0.15), propMat);
    const blade2 = blade1.clone();
    blade2.rotation.x = Math.PI / 2;
    propGroup.add(blade1, blade2);
    group.add(propGroup);

    group.traverse((child) => { if (child.isMesh) child.castShadow = true; });

    return { group, propGroup };
}

function drawBannerTexture(canvas, label, value) {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = '#f6f1de';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#d6402a';
    ctx.lineWidth = 14;
    ctx.strokeRect(7, 7, canvas.width - 14, canvas.height - 14);

    ctx.fillStyle = '#1c2b33';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 150px Arial, sans-serif';
    ctx.fillText(value.toLocaleString('en-US'), canvas.width / 2, canvas.height * 0.42);
    ctx.font = 'bold 60px Arial, sans-serif';
    ctx.fillText(label, canvas.width / 2, canvas.height * 0.78);
}

export class PlaneBanner {
    constructor() {
        this.flying = false;
        this.progress = 0;
        this.stats = null;
        this.statIndex = 0;

        this.group = new THREE.Group();
        this.group.visible = false;

        const { group: planeMesh, propGroup } = buildPlaneMesh();
        this.propGroup = propGroup;
        this.group.add(planeMesh);

        this.bannerCanvas = document.createElement('canvas');
        this.bannerCanvas.width = BANNER_CANVAS_W;
        this.bannerCanvas.height = BANNER_CANVAS_H;
        this.bannerTexture = new THREE.CanvasTexture(this.bannerCanvas);
        this.bannerTexture.colorSpace = THREE.SRGBColorSpace;

        const bannerMat = new THREE.MeshStandardMaterial({
            map: this.bannerTexture,
            roughness: 0.8,
            metalness: 0,
            side: THREE.DoubleSide,
        });
        this.bannerMesh = new THREE.Mesh(new THREE.PlaneGeometry(BANNER_WIDTH, BANNER_HEIGHT), bannerMat);
        this.bannerMesh.position.set(-BANNER_WIDTH / 2 - 12, -1, 0);
        this.group.add(this.bannerMesh);

        const towLine = new THREE.Mesh(
            new THREE.CylinderGeometry(0.08, 0.08, 12, 4),
            new THREE.MeshBasicMaterial({ color: 0x333333 })
        );
        towLine.rotation.z = Math.PI / 2;
        towLine.position.set(-12, -0.5, 0);
        this.group.add(towLine);

        // Generous invisible hitbox — the plane's real silhouette is tiny
        // against the whole sky, same reasoning as the dancers' hitZone.
        this.hitZone = new THREE.Mesh(
            new THREE.BoxGeometry(BANNER_WIDTH + 30, 22, 8),
            new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
        );
        this.hitZone.position.set(-BANNER_WIDTH / 2 - 6, 0, 0);
        this.group.add(this.hitZone);

        this._highlightTargets = [planeMesh, this.bannerMesh];
    }

    setStats(stats) {
        this.stats = stats;
        this._redrawBanner();
    }

    cycleStat() {
        if (!this.stats) return;
        this.statIndex = (this.statIndex + 1) % 3;
        this._redrawBanner();
    }

    _redrawBanner() {
        if (!this.stats) return;
        const variants = [
            ['VISITOR #', this.stats.lifetimeUnique],
            ['VISITORS TODAY', this.stats.dailyUnique],
            ['TOTAL VISITS', this.stats.totalLoads],
        ];
        const [label, value] = variants[this.statIndex];
        drawBannerTexture(this.bannerCanvas, label, value);
        this.bannerTexture.needsUpdate = true;
    }

    setHighlight(on) {
        this._highlightTargets.forEach((mesh) => {
            mesh.traverse((child) => {
                if (!child.isMesh || !child.material.emissive) return;
                child.material.emissive.setHex(on ? 0xffdd55 : 0x000000);
                child.material.emissiveIntensity = on ? 0.5 : 0;
            });
        });
    }

    fly() {
        if (this.flying || !this.stats) return;
        this.flying = true;
        this.progress = 0;
        this.statIndex = 0;
        this._redrawBanner();
        this.group.visible = true;
        this.group.position.set(FLIGHT_X_START, FLIGHT_ALTITUDE, FLIGHT_Z);
        this.group.rotation.y = 0;
    }

    update(dt) {
        if (this.propGroup) this.propGroup.rotation.x += dt * PROP_SPIN_SPEED;
        if (!this.flying) return;

        this.progress += dt / FLIGHT_DURATION_SECONDS;
        if (this.progress >= 1) {
            this.flying = false;
            this.group.visible = false;
            return;
        }
        const x = THREE.MathUtils.lerp(FLIGHT_X_START, FLIGHT_X_END, this.progress);
        this.group.position.x = x;
        this.group.position.y = FLIGHT_ALTITUDE + Math.sin(this.progress * Math.PI * 2) * 4;
    }
}
