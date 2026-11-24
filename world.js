import * as THREE from 'three';
import { createNoise2D } from "https://cdn.skypack.dev/simplex-noise";
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as COLORS from './style/colors.js'; 


// Perlin noise: three.js addon, based on Ken Perlin's "Improved Noise" (2002).
// Docs:   https://threejs.org/docs/pages/ImprovedNoise.html
// Origin: https://cs.nyu.edu/~perlin/noise/
// Paper:  K. Perlin, "Improving Noise", ACM Trans. Graph. 21(3), 2002, pp. 681-682.
//         https://doi.org/10.1145/566654.566636
import { ImprovedNoise } from 'three/addons/math/ImprovedNoise.js';

const SEED = 69;           // shifts the noise field, so a new seed gives new hills
const MAX_HEIGHT = 50;     // height of the rolling hills
const FIELD_RADIUS = 6000; // distance from the center where the ground becomes flat

// Large hills: [x, z, height, radius, flat top radius]
const BIG_HILLS = [
  [1200, -800, 150, 2050, 100],
  [-1500, 400, 300, 950, 60],
  [600, 1500, 380, 600, 150],
];


/* Random Noise */ 
const noise = new ImprovedNoise();

// Noise in roughly -1..1. The z value is a fixed fractional offset: this noise
// returns 0 at whole-number coordinates, so we avoid sampling on the grid.
const perlin = (x, y) => noise.noise(x, y, SEED + 0.5);

/* Mulberry32 PRNG for consistent random numbers (https://www.4rknova.com/blog/2026/03/01/mulberry32-rng) */
export function mulberry32(a) {
    return function() {
      var t = a += 0x6D2B79F5;
      t = Math.imul(t ^ t >>> 15, t | 1);
      t ^= t + Math.imul(t ^ t >>> 7, t | 61);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    }
}

/* Helper GLTF */ 
export function loadGLTF(path) {
  return new Promise((resolve, reject) => {
    loader.load(
      path,
      (gltf) => {
        scene.add(gltf.scene);
        resolve(gltf.scene);
      },
      undefined,
      (error) => {
        reject(error);
      }
    );
  });
}


// Height added by the big hills at a point
/*function bigHillsAt(x, z) {
  let sum = 0;
  for (const [hx, hz, h, r, flat] of BIG_HILLS) {
    const dist = Math.hypot(x - hx, z - hz);
    const t = THREE.MathUtils.clamp((dist - flat) / (r - flat), 0, 1); // 0 on the flat top, 1 at the base
    sum += (1 - t) ** 2 * h;
  }
  return sum;
}*/

// Rolling hills: noise that fades to flat toward FIELD_RADIUS let hills = createHills(); scene.add(hills);
/*function hillsAt(x, z) {
  const n = (perlin(x * 0.02, z * 0.04) + 0.05 * perlin(x * 0.02, z * 0.06)) * 0.5;
  const d = Math.min(1, Math.hypot(x, z) / FIELD_RADIUS);
  const centerBoost = 1 - d * d * (3 - 2 * d);
  return n * centerBoost * MAX_HEIGHT;
}*/

// On big hills the rolling bumps are flattened to 1/5 (no water damage)
/*function heightFrom(x, z, big) {
  return big + hillsAt(x, z) * (big > 60 ? 0.2 : 1);
} */



/* Collisions */ 
/* Hill zones: [x, z, radius]. filled in by createHills() */
const HILL_ZONES = [];

// Hills only exist inside a zone: full height at the center, fading to flat at the edge
export function heightAt(x, z) {
  let fade = 0;
  for (const [hx, hz, r] of HILL_ZONES) {
    const t = Math.min(1, Math.hypot(x - hx, z - hz) / r);
    fade = Math.max(fade, 1 - t * t * (3 - 2 * t)); // smoothstep, 1 at center -> 0 at edge
  }
  if (fade === 0) return 0; // outside every zone: flat ground

  const n = (perlin(x * 0.02, z * 0.04) + 0.05 * perlin(x * 0.02, z * 0.06)) * 0.5;
  return n * fade * MAX_HEIGHT;
}


/* Fun Zone */
/* create Hills in a circle of radius r at x,z (add with scene.add(createHills(0, 800, 500)) */ 
export function createHills(scene,x = 0, z = 0, radius = 500, segments = 500) {
  HILL_ZONES.push([x, z, radius]); // register BEFORE building so heightAt knows about it

  const geo = new THREE.RingGeometry(0, radius, 128, segments); // circular, with rows going outward
  geo.rotateX(-Math.PI / 2); // lay it flat so y is up

  const [low, mid, high] = COLORS.hillColors.map((c) => new THREE.Color(c));
  const c = new THREE.Color(); // reused for every vertex

  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);

  for (let i = 0; i < pos.count; i++) {
    const wx = pos.getX(i) + x, wz = pos.getZ(i) + z; // world coords, so noise matches heightAt
    const h = heightAt(wx, wz);
    pos.setY(i, h);

    // Color by height: low -> mid -> high
    const t = THREE.MathUtils.clamp(h / (MAX_HEIGHT * 0.6), 0, 1);
    if (t < 0.5) c.copy(low).lerp(mid, t * 2);
    else c.copy(mid).lerp(high, (t - 0.5) * 2);

    c.toArray(colors, i * 3);
  }

  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();

  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true }));
  mesh.position.set(x, 0, z); // vertices are local, so move the patch into place
  scene.add(mesh); 
  return mesh;
}


/* flat ground for everywhere that isn't a hill zone (add with scene.add(createGround())) */
export function createGround(scene,x,z,width,length,color=0xB2BEB5) {
  const geo = new THREE.PlaneGeometry(width, length);
  geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color }));
  mesh.position.y = -0.1; // just under the hills so the two don't flicker
  mesh.position.x = x;
  mesh.position.z = z; 
  scene.add(mesh);
  return mesh;
}

/* Acid pool that bobs up and down in a sine wave.
   const acid = createAcid(scene, x, z, radius);
   in animate: acid.update(clock.getElapsedTime()); */
export function createAcid(scene, x, z, radius, { min = 1, max = 10, speed = 0.6 } = {}) {
  const geometry = new THREE.CircleGeometry(radius, 32);

  const material = new THREE.MeshPhysicalMaterial({
    color: COLORS.swamp,
    roughness: 0.1,
    metalness: 0.1,
    transmission: 0.6,
    ior: 1.5,
    emissive: 0x39FF14,
    emissiveIntensity: 1.5,
  });

  const circle = new THREE.Mesh(geometry, material);
  circle.rotation.x = -Math.PI / 2;
  circle.position.set(x, 0.5, z);
  scene.add(circle); 

  const mid = (max + min) / 2;
  const amp = (max - min) / 2;

  // call every frame with elapsed time in seconds
  function update(t) {
    circle.position.y = mid + amp * Math.sin(t * speed);
  }

  return { mesh: circle, update };
}



/* seeded perlin / simplex ? noise generator for plants */ 
export function generatePlants(item) { // 
  const rand = mulberry32(item.seed);
  const noise2D = createNoise2D(rand); // generate the perlin noise
  const loader = new GLTFLoader(); // loader for all of the gltf files 
  const items = new THREE.Group();

  loader.load(item.model, function(gltf) {
  const baseFlower = gltf.scene;
  //items.add(baseFlower);
    //baseFlower.scale.set(10,10,10); // scale the flower model
    items.scale.set(item.scale,item.scale,item.scale); 

  const center = 2000;

  // increase this for density
  for (let i = 0; i < item.count; i++) {

  // square distribution (same every load)
  const x = (rand() - 0.5) * center + 500;
  const z = (rand() - 0.5) * center + 1000;

  // noise filter (controls clustering)
  const n = noise2D(x * 0.001, z * 0.001);

    if (n > 0.1) { // lower threshold = more flowers, dont generate if on the car
      const flower = baseFlower.clone(true); // 
      flower.position.set(x, heightAt(x,z)-100, z);

      // variation (makes it look natural)
      //const s = 15 + Math.random() * 10;
      //flower.scale.set(s, s, s);

      flower.rotation.y = Math.random() * Math.PI * 2;
      flower.castShadow = true; 

      items.add(flower);
    }
   
  }
  }); 
  return items;

}

/* Wall of buildings pngs */
export function createBotanicalWalls(scene,cx = 0, cz = 0, radius = 3000, count = 20) {
  const loader = new THREE.TextureLoader();
  const walls = new THREE.Group();

  const width = 2 * radius * Math.tan(Math.PI / count);

  // Load the texture and build the geometry ONCE, then reuse them
  const texture = loader.load('media/buildings_imgs/wall1.jpg');
  const geometryImg = new THREE.PlaneGeometry(width, width);
  const materialImg = new THREE.MeshStandardMaterial({
  map: texture,
  roughness: 1,      // fully matte, no shiny highlights
  metalness: 0,      // non-metal
  side: THREE.DoubleSide
});


  for (let i = 0; i < count; i++) {
    const radians = (i / count) * Math.PI * 2;   // angle only, no cx here

    // offset from the circle's center
    const x = cx + radius * Math.cos(radians);
    const z = cz + radius * Math.sin(radians);
    const y = heightAt(x,z)+50;

    const wall = new THREE.Mesh(geometryImg, materialImg);
    wall.position.set(x, y, z);
    wall.lookAt(cx, y, cz);                      // face the NEW center
    walls.add(wall);
  }
  scene.add(walls)

  return walls;
}


/* Create a cloud. code: 
const myCloud = createCloudAt(120, -85, 60, 30);
scene.add(myCloud);*/ 
export function createCloudAt(scene, x, z, y = 50, s) {
  const cloudGroup = new THREE.Group();
  
  // Load a soft, radial cloud PNG texture
  const textureLoader = new THREE.TextureLoader();
  const cloudTexture = textureLoader.load('cloud.png');

  const material = new THREE.SpriteMaterial({
    map: cloudTexture,
    transparent: true,
    opacity: 0.6,
    depthWrite: false // Prevents ugly square borders overlapping
  });

  // Cluster 5 to 8 puffs together to form one cloud
  const puffCount = 6;
  for (let i = 0; i < puffCount; i++) {
    const sprite = new THREE.Sprite(material);
    
    // Randomize puff offsets around the center of the cloud
    sprite.position.set(
      (Math.random() - 0.5) * 15,
      (Math.random() - 0.5) * 4,
      (Math.random() - 0.5) * 15
    );

    
    // Vary puff sizes
    const scale = 15 + Math.random() * 10 *s ;
    
    cloudGroup.add(sprite);
  }

  // Position the entire cloud at your target X and Z
  cloudGroup.position.set(x, y, z);
  return cloudGroup;
  // Usage:

}



/* ZONES */ 
/* Loads replenish  room with cans and acid 
in main: 
let replen;              // top-level, with your other lets
replen = loadReplen(scene);

in animate:
const t = clock.getElapsedTime();
replen.update(t);
*/ 
