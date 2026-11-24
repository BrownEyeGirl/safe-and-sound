/* ZONES OF THE MAP */ 

import * as WORLD from './world.js';
import {spawnCans, cans } from './items/cans.js'
import * as THREE from 'three';
import * as ASSETS from './assets.js';
import * as COLORS from './style/colors.js';

/* Visible wireframe bounds for debugging zone footprints.*/
function showZoneBounds(scene, x, z, width, depth, color) {
    const box = new THREE.Box3(
        new THREE.Vector3(x - width / 2, 0, z - depth / 2),
        new THREE.Vector3(x + width / 2, 60, z + depth / 2)
    );
    const helper = new THREE.Box3Helper(box, color);
    scene.add(helper);
    return helper;
}



/* Home Base */ 
export function baseZone(scene,x,z,width,length) {
    WORLD.createGround(scene,x,z,width,length,COLORS.baseFloor)
    ASSETS.createLamppost(scene,x,z)
    showZoneBounds(scene, x, z, width, length, 0xffffff);

}

/* Fun Zone */
export function funZone(scene,x,z, width, length) {
    WORLD.createGround(scene,x,z,width,length,COLORS.funFloor)
    showZoneBounds(scene, x, z, width, length, 0xff8800);
}

/* Botanical Zone */
export function botanicalZone(scene, x, z, radius) {
    // The square is the circle's axis-aligned bounding box.
    showZoneBounds(scene, x, z, radius * 2, radius * 2, 0x04D9FF);
    const hills = WORLD.createHills(scene,x,z,radius);
    const acid = WORLD.createAcid(scene,x, z, radius); // { mesh, update }
    //const walls = createBotanicalWalls(scene,x,z,radius) // add to genMap so it accounts for entrance 
    spawnCans(scene, x, z, radius, 300); 


    return {
        update: (t) => acid.update(t), // runs every frame
    };
}

/* Safe Zone */
export function safeZone(scene, x, z, width, length) {
    WORLD.createGround(scene, x, z, width, length, COLORS.safeFloor);
    showZoneBounds(scene, x, z, width, length, 0x00ff00);
}

/* Danger Zone */
export function dangerZone(scene, x, z, width, length) {
    WORLD.createGround(scene, x, z, width, length, COLORS.dangerFloor);
    showZoneBounds(scene, x, z, width, length, 0xff0000);
}
