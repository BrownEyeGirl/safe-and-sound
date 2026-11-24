/** ASSETS
 * Here is where asset loading is handled. 
**/ 
import * as THREE from 'three'; 
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { heightAt } from './world.js'; 


/* Load GLTFs */ 


export function createLamppost(scene, x, z) {
    const loader = new GLTFLoader();
    const group = new THREE.Group(); // container for the lamppost + helper

    // settings
    const modelPath = 'media/lamppost.glb';
    const modelScale = 1;
    const yOffset = -30;

    loader.load(modelPath, (gltf) => {
        const b = gltf.scene;
        b.scale.set(modelScale, modelScale, modelScale);

        // make materials respond to light
        b.traverse((child) => {
            if (child.isMesh) {
                child.material = new THREE.MeshLambertMaterial({
                    map: child.material.map,
                    color: child.material.color,
                });
            }
        });

        // measure the model once, after scaling (outside traverse)
        const box = new THREE.Box3().setFromObject(b);
        const size = new THREE.Vector3();
        box.getSize(size);
        const modelHeight = size.y;

        // bounding box helper (hidden)
        const boxH = new THREE.BoxHelper(b, 0xffff00);
        boxH.visible = false;

        group.add(boxH);
        group.add(b);

        group.position.set(x, heightAt(x, z) + modelHeight / 2 + yOffset, z);
        console.log('model height: ' + modelHeight);
    });

    scene.add(group); // add right away; the model pops in once loaded
    return group;
}