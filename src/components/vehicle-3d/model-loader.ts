import { Asset } from 'expo-asset';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { logger } from '@/utils/logger';
import { HINGES, LIGHT_GROUPS, type LightGroup, type VehiclePart } from './articulation';

/**
 * Loads the articulated vehicle exactly once per app session.
 *
 * The parsed scene is kept module-level and every consumer gets a clone that
 * SHARES geometry — the expensive part — while getting its own copy of the
 * light materials, which are the only materials the app mutates. Home and
 * Controls therefore render the same model with the same mapping, and neither
 * can leave an emissive value behind for the other to inherit.
 */

/* eslint-disable @typescript-eslint/no-require-imports --
   Metro bundles binary assets through require(); an ESM import is not equivalent. */
const MODEL_MODULE = require('../../../assets/vehicle/vehicle.glb');

export type VehicleModel = {
  scene: THREE.Group;
  /** Hinge nodes, resolved once so no per-frame traversal is needed. */
  hinges: Partial<Record<VehiclePart, THREE.Object3D>>;
  /** Emissive materials per light group, cloned per instance. */
  lightMaterials: Record<LightGroup, THREE.MeshStandardMaterial[]>;
  /** Body paint materials, so the vehicle's colour can be applied. */
  paintMaterials: THREE.MeshStandardMaterial[];
  dispose: () => void;
};

export class ModelLoadError extends Error {
  constructor(message: string, override readonly cause?: unknown) {
    super(message);
    this.name = 'ModelLoadError';
  }
}

let sourcePromise: Promise<THREE.Group> | null = null;

const fetchArrayBuffer = async (): Promise<ArrayBuffer> => {
  const asset = Asset.fromModule(MODEL_MODULE);
  if (!asset.downloaded) await asset.downloadAsync();
  const uri = asset.localUri ?? asset.uri;
  if (!uri) throw new ModelLoadError('Vehicle model asset has no resolvable URI');
  const response = await fetch(uri);
  if (!response.ok) throw new ModelLoadError(`Vehicle model fetch failed (${response.status})`);
  return response.arrayBuffer();
};

const loadSource = (): Promise<THREE.Group> => {
  if (sourcePromise) return sourcePromise;
  sourcePromise = (async () => {
    const buffer = await fetchArrayBuffer();
    const loader = new GLTFLoader();
    const gltf = await loader.parseAsync(buffer, '');
    const scene = gltf.scene;
    // Frustum culling per-part is counter-productive here: the vehicle is always
    // wholly in frame, and culling costs a bounds test per node per frame.
    scene.traverse((node) => {
      node.frustumCulled = false;
      const mesh = node as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.castShadow = false;
        mesh.receiveShadow = false;
      }
    });
    return scene;
  })().catch((error) => {
    // Let the next attempt retry rather than caching a rejected promise forever.
    sourcePromise = null;
    logger.warn('Vehicle model failed to load', { error: String(error) });
    throw error instanceof ModelLoadError
      ? error
      : new ModelLoadError('Vehicle model could not be parsed', error);
  });
  return sourcePromise;
};

const LIGHT_NODE_TO_GROUP = new Map<string, LightGroup>();
(Object.keys(LIGHT_GROUPS) as LightGroup[]).forEach((group) => {
  LIGHT_GROUPS[group].forEach((node) => LIGHT_NODE_TO_GROUP.set(node, group));
});

/**
 * Builds a renderable instance.
 *
 * `THREE.Object3D.clone` shares geometry and materials, which is what we want
 * for the 30k-triangle body. Materials we intend to write to are then replaced
 * with per-instance clones.
 */
export const createVehicleModel = async (): Promise<VehicleModel> => {
  const source = await loadSource();
  const scene = source.clone(true);

  const hinges: Partial<Record<VehiclePart, THREE.Object3D>> = {};
  const byNodeName = new Map<string, VehiclePart>();
  (Object.keys(HINGES) as VehiclePart[]).forEach((part) => {
    byNodeName.set(HINGES[part].node, part);
  });

  const lightMaterials: Record<LightGroup, THREE.MeshStandardMaterial[]> = {
    headlights: [],
    daytimeRunning: [],
    taillights: [],
    indicators: [],
  };
  const paintMaterials: THREE.MeshStandardMaterial[] = [];
  const owned: THREE.Material[] = [];

  scene.traverse((node) => {
    const part = byNodeName.get(node.name);
    if (part) hinges[part] = node;

    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh) return;

    const group = LIGHT_NODE_TO_GROUP.get(node.name);
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const next = materials.map((material) => {
      const standard = material as THREE.MeshStandardMaterial;
      if (group) {
        // Cloned: emissive intensity is written every frame for this instance.
        const clone = standard.clone();
        clone.emissive = new THREE.Color(0x000000);
        clone.emissiveIntensity = 0;
        clone.toneMapped = false;
        owned.push(clone);
        lightMaterials[group].push(clone);
        return clone;
      }
      if (standard.name === 'paint') {
        const clone = standard.clone();
        owned.push(clone);
        paintMaterials.push(clone);
        return clone;
      }
      return standard;
    });
    mesh.material = next.length === 1 ? next[0]! : next;
  });

  const missing = (Object.keys(HINGES) as VehiclePart[]).filter((part) => !hinges[part]);
  if (missing.length) {
    // Surfaced rather than swallowed: a mapping that no longer matches the asset
    // is a real defect, not something to paper over with a static pose.
    logger.warn('Vehicle model is missing hinge nodes', { missing });
  }

  return {
    scene,
    hinges,
    lightMaterials,
    paintMaterials,
    dispose: () => {
      owned.forEach((material) => material.dispose());
      // Geometry and shared materials belong to the cached source and are
      // deliberately NOT disposed here — another screen may still need them.
    },
  };
};

/** Frees the cached source. Used when the whole 3D surface is torn down. */
export const disposeVehicleSource = () => {
  const pending = sourcePromise;
  sourcePromise = null;
  void pending
    ?.then((scene) => {
      scene.traverse((node) => {
        const mesh = node as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.geometry?.dispose();
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        materials.forEach((m) => m?.dispose());
      });
    })
    .catch(() => undefined);
};

export const MISSING_PARTS_MESSAGE =
  'The vehicle model is missing one or more articulated parts.';
