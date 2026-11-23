/* ZONES OF THE MAP */ 

import {createHills, createAcid, createGround} from './world.js'; 
import {spawnCans, cans } from './items/cans.js'



/* Home Base */ 
export function baseZone(scene,x,z) {
    createGround(scene,x,z,300,400,0x008000)

}

/* Industrial Zone */
export function industrialZone(scene,x,z) {
    createGround(scene,x,z,300,400,0xB2BEB5)
}

/* Botanical Zone */
export function botanicalZone(scene, x, z, radius) {
    const hills = createHills(scene,x,z,radius); 
    const acid = createAcid(scene,x, z, radius); // { mesh, update }
    spawnCans(scene, x, z, radius, 300); 


    return {
        update: (t) => acid.update(t), // runs every frame
    };
}

/* Safe Zone */
export function safeZone(scene, x, z) {
    createGround(scene, x, z, 200, 200, 0x7a9ac8);
}

/* Danger Zone */
export function dangerZone(scene, x, z) {
    createGround(scene, x, z, 240, 240, 0xaa3333);
}
