import * as THREE from 'three';
import { mulberry32 } from './world.js';
import { baseZone, industrialZone, botanicalZone, safeZone, dangerZone } from './zones.js';

/*
  ALGORITHM: tree-based "mission graph" generation + radial (ring) tree layout + rejection sampling.
  Sources: 
  - https://github.com/majidmanzarpour/threejs-procedural-dungeon
  - https://github.com/halftheopposite/graph-dungeon-generator

    1. GRAMMAR / TREE: build the room graph first, using the progression rules:
         base -> industrial -> botanical (dead end)
                            -> safe -> danger (dead end)
       every room only ever connects to its parent, so dead ends stay dead ends by construction
    2. RADIAL LAYOUT: base in the middle, each type on its own ring, children placed
       at roughly their parent's angle so branches grow outward
    3. REJECTION SAMPLING: random placements that overlap a room or cross another path are thrown away
       and retried

  paths are 40x40, except industrial -> botanical which are 20x20.
  every hallway reaches one block into the rooms at both ends, and hallways never touch each other
*/

// wALLS FUNCTION (declared at the end)
const texture = new THREE.TextureLoader().load('/media/facade.png');
texture.wrapS = THREE.RepeatWrapping;
texture.wrapT = THREE.RepeatWrapping;

// HOW MANY OF EACH (override: generateMap(scene, { counts: { industrial: 6, safe: 3 } }))
const DEFAULT_COUNTS = { industrial: 2, botanical: 3, safe: 2, danger: 2 };

// room footprint in world units [width (x), depth (z)]
const SIZES = {
  base:       [400, 400],
  industrial: [300, 400],
  botanical:  [500, 500],
  safe:       [400, 400],
  danger:     [240, 240],
};

const WIDE = 60;    // every path (Mae & Cyborg)
const NARROW = 40;  // except the ones leading to botanical zones (Mae only)

const RING = { industrial: 600, botanical: 1000, safe: 1300, danger: 1650 }; // distance from the base (r)
const GAP = 80;     // minimum empty space between rooms
const PATH_GAP = 10;       // minimum empty space between two different hallways
const EXTEND = 0.5;          // hallways reach this many blocks into each room (1 block = the hallway's width, ensures connection)
const OFFSETS = [0, 60, -60]; // a hallway can leave its parent from the center or a bit to either side
const LIMIT = 1900; // keep rooms inside the 4000x4000 map with 100 padding on each side
const TRIES = 200;  // placement attempts per room

const BUILD = { // sets base for building each zone  
  base:       (scene, x, z)    => baseZone(scene, x, z, SIZES.base[0],SIZES.base[1]),
  industrial: (scene, x, z)    => industrialZone(scene, x, z,SIZES.industrial[0],SIZES.industrial[1]),
  botanical:  (scene, x, z, r) => botanicalZone(scene, x, z, r), // returns { update }
  safe:       (scene, x, z)    => safeZone(scene, x, z,SIZES.safe[0], SIZES.safe[1]),
  danger:     (scene, x, z)    => dangerZone(scene, x, z, SIZES.danger[0], SIZES.danger[1]),
};

/*  small helpers  */
const hw = (room) => SIZES[room.type][0] / 2; // half width
const hd = (room) => SIZES[room.type][1] / 2; // half depth

// rectangle {x0, x1, z0, z1}, optionally grown by pad
const rectOf = (room, pad = 0) => ({
  x0: room.x - hw(room) - pad, x1: room.x + hw(room) + pad,
  z0: room.z - hd(room) - pad, z1: room.z + hd(room) + pad,
});
const hit = (a, b) => a.x0 < b.x1 && a.x1 > b.x0 && a.z0 < b.z1 && a.z1 > b.z0;

/*  paths */
const grow = (r, pad) => ({ x0: r.x0 - pad, x1: r.x1 + pad, z0: r.z0 - pad, z1: r.z1 + pad });

// every way to walk from parent p to child c: straight, or an L bending either way.
// off shifts where the hallway leaves the parent. each option is a list of rectangles that
// reach EXTEND blocks into both rooms, and the two halves of an L meet at the corner without overlapping
function routes(p, c, w, off) {
  const ext = w * EXTEND;
  const out = [];

  const seg = (axis, fixed, from, to) => axis === 'x'
    ? { x0: Math.min(from, to), x1: Math.max(from, to), z0: fixed - w / 2, z1: fixed + w / 2 }
    : { x0: fixed - w / 2, x1: fixed + w / 2, z0: Math.min(from, to), z1: Math.max(from, to) };

  const z0 = p.z + off; // line a sideways hallway leaves on
  const x0 = p.x + off; // line an up-down hallway leaves on
  const dx = c.x - p.x, dz = c.z - p.z;
  const sx = Math.sign(dx), sz = Math.sign(dz);
  const dz0 = c.z - z0, dx0 = c.x - x0; // distance from the exit line to the child
  const tz = Math.sign(dz0), tx = Math.sign(dx0);

  const sideOk = Math.abs(off) <= hd(p) - w / 2;  // sideways exit stays inside the parent's side
  const topOk = Math.abs(off) <= hw(p) - w / 2;   // up-down exit stays inside the parent's side

  // straight sideways / straight up-down (rooms line up)
  if (sideOk && Math.abs(dx) > hw(p) + hw(c) && Math.abs(dz0) < hd(c) - w / 2)
    out.push([seg('x', z0, p.x + sx * (hw(p) - ext), c.x - sx * (hw(c) - ext))]);
  if (topOk && Math.abs(dz) > hd(p) + hd(c) && Math.abs(dx0) < hw(c) - w / 2)
    out.push([seg('z', x0, p.z + sz * (hd(p) - ext), c.z - sz * (hd(c) - ext))]);

  // L shape: sideways first, then up-down
  if (sideOk && Math.abs(dx) > hw(p) + w && Math.abs(dz0) > hd(c) + w)
    out.push([
      seg('x', z0, p.x + sx * (hw(p) - ext), c.x + sx * w / 2),
      seg('z', c.x, z0 + tz * w / 2, c.z - tz * (hd(c) - ext)),
    ]);

  // L shape: up-down first, then sideways
  if (topOk && Math.abs(dz) > hd(p) + w && Math.abs(dx0) > hw(c) + w)
    out.push([
      seg('z', x0, p.z + sz * (hd(p) - ext), c.z + sz * w / 2),
      seg('x', c.z, x0 + tx * w / 2, c.x - tx * (hw(c) - ext)),
    ]);

  return out;
}

/*  MAIN  */

/* in main (BEFORE creating the player or anything that reads heightAt):
     const map = generateMap(scene, { seed: 69 });
     player.position.set(map.spawn.x, 0, map.spawn.z);

   in animate:
     map.update(clock.getElapsedTime());
*/
export function generateMap(scene, { seed = 69, counts = {} } = {}) {
  const rand = mulberry32(seed);
  const want = { ...DEFAULT_COUNTS, ...counts };

  const base = { type: 'base', x: 0, z: 0, angle: 0, placed: true };
  const rooms = [base]; // rooms that have been placed
  const paths = [];     // { from, to, width, rects }

  /* 1. THE TREE: who connects to who. parents are handed out round-robin so branches spread evenly */
  const make = (type, n, parents) =>
    parents.length ? Array.from({ length: n }, (_, i) => ({ type, parent: parents[i % parents.length] })) : [];

  const industrial = make('industrial', want.industrial, [base]);
  const botanical = make('botanical', want.botanical, industrial);   // dead ends
  const safe = make('safe', want.safe, industrial);
  const danger = make('danger', want.danger, safe);                  // dead ends
  if (want.danger && !safe.length) console.warn('danger zones need at least one safe zone');

  const tree = [...industrial, ...botanical, ...safe, ...danger]; // parents always come before children

  /* 2 + 3. PLACE EACH ROOM: random spot on its ring near its parent, keep it if everything fits */
  const wedge = (2 * Math.PI) / Math.max(1, want.industrial); // angle owned by each industrial branch

  const roomFits = (room) =>
    Math.abs(room.x) + hw(room) <= LIMIT &&
    Math.abs(room.z) + hd(room) <= LIMIT &&
    !rooms.some((o) => hit(rectOf(room, GAP), rectOf(o))) &&
    !paths.some((q) => q.rects.some((r) => hit(rectOf(room, 20), r)));

  // a path is fine if it stays off every other room and keeps a gap from every other hallway
  const pathFits = (rects, parent, child) => rects.every((r) =>
    !rooms.some((o) => o !== parent && o !== child && hit(r, rectOf(o, 20))) &&
    !paths.some((q) => q.rects.some((s) => hit(grow(r, PATH_GAP), s)))
  );

  for (const room of tree) {
    const parent = room.parent;
    if (!parent.placed) continue; // its parent never fit, so it can't exist either

    const width = (room.type === 'botanical' || room.type === 'danger') ? NARROW : WIDE; // if condition room.type is true, use narrow; otherwise use wide
    const spread = wedge * (room.type === 'danger' ? 0.3 : 0.7); // determines how short hallways are using spead - danger is closer than the other rooms, less spead.
    const center = room.type === 'industrial' ? (industrial.indexOf(room) + 0.5) * wedge : parent.angle;

    for (let t = 0; t < TRIES; t++) {
      const angle = center + (rand() - 0.5) * spread;
      const dist = RING[room.type] + (rand() - 0.5);
      room.x = Math.floor(Math.cos(angle) * dist);
      room.z = Math.floor(Math.sin(angle) * dist);
      room.angle = angle;
      if (!roomFits(room)) continue;

      const options = OFFSETS.flatMap((off) => routes(parent, room, width, off));
      const rects = options.find((option) => pathFits(option, parent, room));
      if (!rects) continue;

      room.placed = true;
      rooms.push(room); // add room
      paths.push({ from: parent, to: room, width, rects }); // makes hlalways
      break;
    }
    if (!room.placed) console.warn(`couldn't place a ${room.type} zone`);
  }



  /* BUILD IT IN THE WORLD */
  const updaters = [];
  for (const room of rooms) {
    const zone = BUILD[room.type](scene, room.x, room.z, hw(room));
    if (zone?.update) updaters.push(zone.update);
  }

  // path floors: wide ones sit a hair lower so overlaps at corners don't z-fight (ground is y = 0)
  const mats = {
    [WIDE]:   new THREE.MeshStandardMaterial({ color: 0x7d8087, roughness: 0.9 }), // hallway ground colours
    [NARROW]: new THREE.MeshStandardMaterial({ color: 0x5f7f5a, roughness: 0.9 }),
  };
  for (const path of paths) {
    const top = path.width === WIDE ? 0.1 : 0.2;
    for (const r of path.rects) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(r.x1 - r.x0, 2, r.z1 - r.z0), mats[path.width]);
      mesh.position.set((r.x0 + r.x1) / 2, top - 1, (r.z0 + r.z1) / 2);
      mesh.receiveShadow = true;
      scene.add(mesh);

      const bounds = new THREE.Box3( // bounding box helper for the bounds of each hallway 
        new THREE.Vector3(r.x0, 0, r.z0),
        new THREE.Vector3(r.x1, 60, r.z1)
      );
      scene.add(new THREE.Box3Helper(bounds, 0xffff00));
    }
  }

    //debugging 
  console.log(rooms)
  console.log(paths)


  return {
    rooms,
    paths,
    spawn: new THREE.Vector3(base.x, 0, base.z),
    getZoneAt(x, z) {
      return rooms.find((room) => {
        if (room.type === 'botanical') {
          return Math.hypot(x - room.x, z - room.z) <= hw(room);
        }
        return Math.abs(x - room.x) <= hw(room) &&
          Math.abs(z - room.z) <= hd(room);
      }) ?? null;
    },
    canOccupy(x, z) { // checks whether a world position is inside a traversable footprint
      const insideRoom = rooms.some((room) => // checks every room footprint
        Math.abs(x - room.x) <= hw(room) && // checks the room's horizontal bounds
        Math.abs(z - room.z) <= hd(room) // checks the room's depth bounds
      ); // finishes the room footprint check
      const insideHallway = paths.some((path) => path.rects.some((rect) => // checks each hallway segment
        x >= rect.x0 && x <= rect.x1 && z >= rect.z0 && z <= rect.z1 // checks the segment bounds
      )); // finishes the hallway footprint check
      return insideRoom || insideHallway; // allows movement inside either kind of footprint
    }, // finishes the map boundary check
    /* sets random fog color for each zone to test */ 
    setZoneFog(zone) {
      if (!zone) {
        scene.fog = null;
        return;
      }

      const color = new THREE.Color(Math.random(), Math.random(), Math.random());
      scene.fog = new THREE.FogExp2(color, 0.02);
    },
    update: (t) => updaters.forEach((fn) => fn(t)),
  };
}


/* Generate walls */ 
function addWall(scene, x, z, rotation = 0) {
    const wall = new THREE.Mesh(
        new THREE.PlaneGeometry(40, 80),
        new THREE.MeshStandardMaterial({ map: texture, side: THREE.DoubleSide })
    );

    wall.position.set(x, 40, z);
    wall.rotation.y = rotation;
    scene.add(wall);
}
