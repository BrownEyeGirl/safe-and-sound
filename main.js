import * as THREE from "https://unpkg.com/three@0.182.0/build/three.module.js";
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Water } from 'https://unpkg.com/three@0.182.0/examples/jsm/objects/Water.js';
import { BokehPass } from "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/postprocessing/BokehPass.js";
import { EffectComposer } from 'https://unpkg.com/three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'https://unpkg.com/three/examples/jsm/postprocessing/RenderPass.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js'; // for sky

//postprocessing
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { RGBShiftShader } from 'three/addons/shaders/RGBShiftShader.js';
import { DotScreenShader } from 'three/addons/shaders/DotScreenShader.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { FilmPass } from 'three/addons/postprocessing/FilmPass.js';
import { HalftonePass } from 'three/addons/postprocessing/HalftonePass.js';
import { LUTPass } from 'three/addons/postprocessing/LUTPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';


// imported functions 
import { heightAt } from './world.js'; // imports the hightAt function, gets Z at specific x,y
import { createHills, createAcid, createBase, generatePlants, generateWalls, createCloudAt } from './world.js';
import { createPlayer, updatePlayer } from './characters/player.js';
import { renderParticles } from './boids.js';
import { createCyborg, cyborgHeight, cyborgWidth } from './characters/cyborg.js'; 
import { attachCamera, moveMesh } from './cameraControls.js';

import { Can, checkCanCollection, spawnCans, cans } from './items/cans.js'; 
//import { Flower, checkFlowerCollection, flowers } from './items/flowers.js'; 

import { baseZone, industrialZone,botanicalZone } from './zones.js'; 


import * as COLORS from './style/colors.js'; 
///
let scene, renderer, controls, camera, player, cyborg,loc;
let flock; // global variable for the flock of birds
const clock = new THREE.Clock();

// move cyborg and player mesh 
let rig; // current camera rig, can be attached/detached when switchign meshes 
let cyborgGroundOffset = 0;
const playerWorld = new THREE.Vector3();
let mounted = false;

/* Items */ 
let trees = {
  scale: 1,
  seed: 69,
  count: 50,
  model: "media/pine_tree_low-poly/scene.gltf",
}

let dead_trees = {
  scale: 1.3,
  seed: 35,
  count: 10,
  model: "media/dead_tree/scene.gltf",
}

let bando1 = {
  x: -2000,
  y: 0,
  z: 500,
  model: "media/abandoned_building_lowpoly/scene.gltf",
  scale: 90,
}

let base = { 
  x: 0,
  y: -5,
  z: 0,
  model: "media/wooden_structure.glb",
  scale: 90,
}

let parking_garage = { 
  x: -800,
  y: 100,
  z: -800,
  model: "media/parking_garage.glb",
  scale: 60,
}

let dumpster = {
  x: -980,
  y: 0,
  z: 830,
  model: "media/dumpster_clean.glb",
  scale: 250,
}
let flower = {
  scale: 0.1,
  seed: 69,
  count: 50,
  model: "media/dead_tree/scene.gltf",
}


let the_fog = true; 
let birdsEyeView = true; // toggle for birds eye view camera


// scene
scene = new THREE.Scene();
scene.background = new THREE.Color(COLORS.backgroundFog)
//scene.fog = new THREE.Fog(COLORS.backgroundFog, 0, 2000); // new fog, darker, shorter range


// to see, ambient light 
const light = new THREE.AmbientLight( COLORS.ambientL, 0.8); // soft white light
light.distance = 1000; // size of perlin noise snowdrift map 
scene.add( light );

const sun = new THREE.DirectionalLight(0xffffff, 1);
sun.position.set(1000, 2000, 100);
sun.castShadow = true; 
scene.add(sun);


import { generateMap } from './genMap.js';

const map = generateMap(scene, { seed: 69 });
// create the player after this, e.g. player.position.set(map.spawn.x, 0, map.spawn.z)


//let botanical = botanicalZone(scene, 80, 0, 300); // x, z, radius
//let basez = baseZone(scene,300,200)

//loadAnimals(); // load the boids (birds) into the scene. add to animate:  flock.update(); // boids
//loadPlants(); // load the trees into the scene
//loadReplen(); 
//loadArchitecture(); // load the base and other architecture

//import { loadZones } from './zones.js';

//let zones;                 // with your other top-level lets
//zones = loadZones(scene);  // replaces loadReplen(); and the acid lines



  /* Renderer */
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.NoToneMapping; // try to make corners invisible
  renderer.shadowMap.enabled = true;
  document.body.appendChild(renderer.domElement);


  /* Birds eye view camera for map */
  if(birdsEyeView) {
    //const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);   // 0. Add ambient light to the scene
   // scene.add(ambientLight);
    const width = window.innerWidth;  // 1. Create a PerspectiveCamera or OrthographicCamera
    const height = window.innerHeight; 
    camera = new THREE.PerspectiveCamera(100, width / height, 1, 20000); // camera to make map 
    
    camera.position.set(0, 3000, 0); // X, Y (height), Z. 2. Position high up on the Y-axis looking straight down. 
    camera.lookAt(0, 0, 0);  // 3. Point the camera at the center of the scene (or use lookAt)
  }

  if(!birdsEyeView) {
    camera = new THREE.PerspectiveCamera(105, window.innerWidth / window.innerHeight, 0.4, 5000);
    
    cyborg = createCyborg(scene, camera); 
    player = createPlayer(scene);
    rig = attachCamera(mounted,camera, player);  

    /* Player Position Display */
    loc = document.createElement('div');
    loc.id = "info"; 
    document.body.appendChild(loc);
  }


/* Test zone functions */ 



// animate acid 
/*const acid = createAcid(scene,0,800,500);
const MIN = 1;
const MAX = 10;
const mid = (MAX + MIN) / 2;   // 10.5
const amp = (MAX - MIN) / 2;   // 9.5
const speed = 0.6; */              // radians per second

animate()
// check if mounted 
let mount_rad = 700
const CYBORG_SPEED = 60; // attempt to move cyborhg
const PLAYER_SPEED = 20; 

function animate() {

  let mount_rad = 700
const CYBORG_SPEED = 60; // attempt to move cyborhg
const PLAYER_SPEED = 30; 

  //if(!birdsEyeView) {updatePlayer(player, clock.getDelta());} // move the camera based on held keys (if not on birds eye view development mode)
  if(!birdsEyeView) {
    loc.textContent = 
    `x: ${player.position.x.toFixed(1)} \n
    z: ${player.position.z.toFixed(1)} \n
    y: ${player.position.y.toFixed(1)}`; // players location rounded to nearest int
    //sky.position.copy(player.position);

    // attemtp to move player and cyborg 
    player.getWorldPosition(playerWorld);

    const dt = clock.getDelta(); // only call once per frame
    if (mounted) {
      moveMesh(cyborg, dt, CYBORG_SPEED);
      cyborg.position.y = heightAt(cyborg.position.x, cyborg.position.z) + cyborgGroundOffset;
    } else {
      updatePlayer(player, dt, PLAYER_SPEED);
    }
    //updatePlayer(player, clock.getDelta(), PLAYER_SPEED);
    //const t = clock.getElapsedTime();
    //botanical.update(t);

    checkCanCollection(player, cans); 
    map.update(clock.getElapsedTime());
  }

  //zones.update(clock.getElapsedTime());
  
  //ƒcheckFlowerCollection(player, flowers); 

  requestAnimationFrame(animate);

  // animate acid in sine functino 
  //const t = clock.getElapsedTime();
  //acid.position.y = mid + amp * Math.sin(t * speed);

  renderer.render(scene, camera);

//composer.render(); 
  // Conditional rendering switch
    if (the_fog) {
        //composer.render();
        scene.background = new THREE.Color(COLORS.backgroundFog)
        //scene.fog = new THREE.Fog(0x000000, 0, 700); // new fog, darker, shorter range
    } else {
        //renderer.render(scene, camera);
        scene.background = new THREE.Color(COLORS.backgroundFog)
        //scene.fog = new THREE.Fog(lavender, 0, 300); // new fog, darker, shorter range
    }
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}










/* Archive of functions */ 

function loadArchitecture() {
  //scene.add(createBase()); // create the home base at 0,0
//  scene.add(loadBuilding(bando1)); 
  scene.add(loadBuilding(base)); 
  scene.add(loadBuilding(parking_garage));
  scene.add(loadBuilding(dumpster)); 

}

function loadAnimals() {
  // 100 white points, size 2, centered at (0, 50, 0) with radius 100
 flock = renderParticles(100, 0x000000, 2, 0, heightAt(0,0)+200, 0, 500);
scene.add(flock.points);
}

function loadPlants() {
  scene.add(generatePlants(trees)); // generate trees
  scene.add(generatePlants(dead_trees));
}


/* Loads in GLTF building */ 
 function loadBuilding(building) {

  const loader = new GLTFLoader();
  const group = new THREE.Group(); // makes it a 3d object somehow 
  let modelHeight = 0; 

  loader.load(building.model, (gltf) => {
    const b = gltf.scene;
    b.scale.set(building.scale, building.scale, building.scale);

    // get it to absorb light 
    b.traverse((child) => {
  if (child.isMesh) child.material = new THREE.MeshLambertMaterial({ map: child.material.map, color: child.material.color });
  
  /// 1. Create an empty Box3 bounding box
    const box = new THREE.Box3();

    // 2. Compute the bounding box of the glTF scene
    box.setFromObject(b);
    const boxH = new THREE.BoxHelper( b, 0xffff00 );


    // 3. Extract the size dimensions into a Vector3 target
    const size = new THREE.Vector3();
    box.getSize(size);

    // 4. Access the height via the 'y' property
     modelHeight = size.y;

    group.add(boxH);  
    boxH.visible = false; // hides bounding box 
    group.add(b); // appears in the scene once loaded

    const x = building.x;
    const z = building.z;
    group.position.set(x, heightAt(x, z)+modelHeight/2-30, z);
    console.log("2nd pass model height" + modelHeight)

  });    
});

   

  return group;
}






window.addEventListener('keydown', (e) => {
  if (e.code !== 'Space' || e.repeat) return;  // e.repeat stops hold-key retriggering

  if (!mounted) {
    if (player.position.distanceTo(cyborg.position) > mount_rad) return;
    mount();
  } else {
    dismount();
  }
});

function mount() {
  rig.detach();                          // camera + controls off the player
  cyborg.rotation.y = player.rotation.y; // so the view doesn't jump
  cyborg.add(player);                    // player rides as a child of the cyborg
  player.position.set(cyborgWidth/3, cyborgHeight, 0);
  player.rotation.copy(cyborg.rotation)
  cyborgGroundOffset = cyborg.position.y - heightAt(cyborg.position.x, cyborg.position.z);
  rig = attachCamera(mounted,camera, cyborg, document.body, {
    pivotHeight: cyborgHeight,
    //radius: cyborgHeight * 1.5,
  });
  mounted = true;
}
 
function dismount() {
  rig.detach();
  scene.attach(player); // keeps the player's world position
  c.x += 10;
  player.position.y = heightAt(player.position.x, player.position.z);
  player.rotation.copy(cyborg.rotation)
  rig = attachCamera(mounted,camera, player, document.body, {
    pivotHeight: 7,
    //radius: cyborgHeight * 1.5,
  });
  mounted = false;
}

