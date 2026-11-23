import * as THREE from 'three';

/**
 * Generates an optional studio-proportioned procedural short-sleeve polo shirt
 * matching the exact 11 material names (Front, Back, Collar, Button, Pocket,
 * Upper_Left, Upper_Right, Lower_Left, Lower_Right, PT_FABRIC, Material115145)
 * across 17 meshes. Used ONLY if the user explicitly clicks "Preview with demo polo"
 * when they don't have a .glb handy — zero .glb files are bundled.
 */
export function createProceduralStudioPolo(): THREE.Group {
  const root = new THREE.Group();
  root.name = 'Procedural_Studio_Polo';

  const makeMat = (name: string, hex: number) =>
    new THREE.MeshStandardMaterial({ name, color: hex, side: THREE.DoubleSide });

  const matFront = makeMat('Front', 0xcccccc);
  const matBack = makeMat('Back', 0xcccccc);
  const matCollar = makeMat('Collar', 0xbbbbbb);
  const matButton = makeMat('Button', 0x333333);
  const matPocket = makeMat('Pocket', 0xc6c6c6);
  const matUpperLeft = makeMat('Upper_Left', 0xc9c9c9);
  const matUpperRight = makeMat('Upper_Right', 0xc9c9c9);
  const matLowerLeft = makeMat('Lower_Left', 0xc8c8c8);
  const matLowerRight = makeMat('Lower_Right', 0xc8c8c8);
  const matPlacket = makeMat('PT_FABRIC', 0xc2c2c2);
  const matYoke = makeMat('Material115145', 0xc4c4c4);

  // Helper to build a tailored organic torso panel (Front or Back) with realistic chest/waist drape
  const buildTorsoPanel = (
    zSign: 1 | -1,
    uStart: number,
    uEnd: number,
    yMin: number,
    yMax: number,
    segsU = 36,
    segsV = 36
  ): THREE.BufferGeometry => {
    const geo = new THREE.BufferGeometry();
    const positions: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];

    for (let iv = 0; iv <= segsV; iv++) {
      const v = iv / segsV; // 0 = bottom hem, 1 = shoulder/neck
      const y = THREE.MathUtils.lerp(yMin, yMax, v);

      // Tailored polo silhouette: subtle taper at waist, broader at chest/shoulders
      const widthProfile =
        0.245 +
        Math.sin(v * Math.PI) * 0.018 +
        THREE.MathUtils.smoothstep(v, 0.55, 0.92) * 0.025 -
        THREE.MathUtils.smoothstep(v, 0.9, 1.0) * 0.055;

      const depthProfile =
        0.118 +
        Math.sin(v * Math.PI * 0.85) * 0.024 -
        THREE.MathUtils.smoothstep(v, 0.82, 1.0) * 0.048;

      // Natural shoulder slope at top
      for (let iu = 0; iu <= segsU; iu++) {
        const uFrac = iu / segsU;
        const angle = THREE.MathUtils.lerp(uStart, uEnd, uFrac);
        const x = Math.cos(angle) * widthProfile;
        let z = Math.sin(angle) * depthProfile;

        // Subtle organic fabric drape wave near lower hem
        const drape =
          Math.sin(angle * 4.0) * 0.0055 * (1 - v) * (1 - v);
        z += zSign * drape;

        // Slight chest contour on front
        if (zSign === 1) {
          const chest =
            Math.exp(-Math.pow((v - 0.68) / 0.22, 2)) *
            Math.max(0, Math.sin(angle)) *
            0.016;
          z += chest;
        }

        // Shoulder slope down toward armholes + neckline scoop
        let yAdj = y;
        const absX = Math.abs(x) / Math.max(0.01, widthProfile);
        if (v > 0.78) {
          const topT = (v - 0.78) / 0.22;
          // Neck scoop at center
          const neckFactor = Math.exp(-Math.pow(absX / 0.42, 2));
          yAdj -= neckFactor * topT * (zSign === 1 ? 0.062 : 0.024);
          // Shoulder slope at outer edges
          yAdj -= Math.pow(absX, 1.6) * topT * 0.042;
        }

        positions.push(x, yAdj, z);
        uvs.push(uFrac, v);
      }
    }

    const rowLen = segsU + 1;
    for (let iv = 0; iv < segsV; iv++) {
      for (let iu = 0; iu < segsU; iu++) {
        const a = iv * rowLen + iu;
        const b = a + 1;
        const c = a + rowLen;
        const d = c + 1;
        indices.push(a, d, b, a, c, d);
      }
    }

    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return geo;
  };

  // 1. Front torso panel (Front)
  const frontMesh = new THREE.Mesh(
    buildTorsoPanel(1, Math.PI * 0.14, Math.PI * 0.86, 0.0, 0.78, 40, 40),
    matFront
  );
  frontMesh.name = 'Front_Panel';
  root.add(frontMesh);

  // 2. Back torso panel (Back)
  const backMesh = new THREE.Mesh(
    buildTorsoPanel(-1, Math.PI * 1.14, Math.PI * 1.86, 0.0, 0.78, 40, 40),
    matBack
  );
  backMesh.name = 'Back_Panel';
  root.add(backMesh);

  // 3 & 4. Lower side gussets (Lower_Left, Lower_Right)
  const lowerLeftMesh = new THREE.Mesh(
    buildTorsoPanel(1, -Math.PI * 0.14, Math.PI * 0.14, 0.0, 0.52, 14, 24),
    matLowerLeft
  );
  lowerLeftMesh.name = 'Lower_Left_Side';
  root.add(lowerLeftMesh);

  const lowerRightMesh = new THREE.Mesh(
    buildTorsoPanel(1, Math.PI * 0.86, Math.PI * 1.14, 0.0, 0.52, 14, 24),
    matLowerRight
  );
  lowerRightMesh.name = 'Lower_Right_Side';
  root.add(lowerRightMesh);

  // 5 & 6. Short Sleeves (Upper_Left at +X, Upper_Right at -X) + 7 & 8 Sleeve Cuffs
  const buildSleeve = (sideSign: 1 | -1, mat: THREE.Material, namePrefix: string) => {
    const sleeveLen = 0.255;
    const radTop = 0.115;
    const radCuff = 0.084;
    const geo = new THREE.CylinderGeometry(radTop, radCuff, sleeveLen, 28, 12, true);
    // Subtle oval shaping for natural arm drape
    const pos = geo.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      const z = pos.getZ(i);
      pos.setZ(i, z * 0.9);
    }
    geo.computeVertexNormals();

    const sleeve = new THREE.Mesh(geo, mat);
    sleeve.name = `${namePrefix}_Sleeve`;
    sleeve.position.set(sideSign * 0.315, 0.585, 0.002);
    sleeve.rotation.z = sideSign * 0.64;
    root.add(sleeve);

    // Ribbed cuff band at the bottom of the sleeve
    const cuffGeo = new THREE.CylinderGeometry(radCuff * 1.015, radCuff * 0.99, 0.032, 28, 2, true);
    const cPos = cuffGeo.getAttribute('position');
    for (let i = 0; i < cPos.count; i++) {
      cPos.setZ(i, cPos.getZ(i) * 0.9);
    }
    cuffGeo.computeVertexNormals();
    const cuff = new THREE.Mesh(cuffGeo, mat);
    cuff.name = `${namePrefix}_Cuff`;
    const offsetDir = new THREE.Vector3(
      Math.sin(sideSign * 0.64),
      -Math.cos(sideSign * 0.64),
      0
    );
    cuff.position.copy(sleeve.position).addScaledVector(offsetDir, sleeveLen * 0.5 + 0.012);
    cuff.rotation.z = sideSign * 0.64;
    root.add(cuff);
  };

  buildSleeve(1, matUpperLeft, 'Upper_Left');
  buildSleeve(-1, matUpperRight, 'Upper_Right');

  // 9 & 10. Structured Spread Polo Collar (stand + folded leaf)
  const collarStandGeo = new THREE.CylinderGeometry(0.095, 0.108, 0.042, 36, 4, true, -Math.PI * 0.85, Math.PI * 1.7);
  const collarStand = new THREE.Mesh(collarStandGeo, matCollar);
  collarStand.name = 'Collar_Stand';
  collarStand.position.set(0, 0.742, -0.005);
  collarStand.rotation.y = Math.PI;
  root.add(collarStand);

  const collarLeafPts = [
    new THREE.Vector2(0.095, 0.764),
    new THREE.Vector2(0.118, 0.762),
    new THREE.Vector2(0.145, 0.736),
    new THREE.Vector2(0.158, 0.706),
  ];
  const collarLeafGeo = new THREE.LatheGeometry(collarLeafPts, 40, -Math.PI * 0.82, Math.PI * 1.64);
  const clPos = collarLeafGeo.getAttribute('position');
  for (let i = 0; i < clPos.count; i++) {
    const z = clPos.getZ(i);
    clPos.setZ(i, z * 0.95);
  }
  collarLeafGeo.computeVertexNormals();
  const collarLeaf = new THREE.Mesh(collarLeafGeo, matCollar);
  collarLeaf.name = 'Collar_Leaf';
  collarLeaf.position.set(0, 0, -0.005);
  collarLeaf.rotation.y = Math.PI;
  root.add(collarLeaf);

  // 11. Front Placket (PT_FABRIC)
  const placketGeo = new THREE.BoxGeometry(0.042, 0.168, 0.012, 4, 8, 1);
  const placket = new THREE.Mesh(placketGeo, matPlacket);
  placket.name = 'Front_Placket';
  placket.position.set(0, 0.625, 0.117);
  placket.rotation.x = -0.14;
  root.add(placket);

  // 12. Inner Neck Yoke / Reinforcement Band (Material115145)
  const yokeGeo = new THREE.CylinderGeometry(0.104, 0.112, 0.038, 28, 2, true, Math.PI * 0.25, Math.PI * 0.5);
  const yoke = new THREE.Mesh(yokeGeo, matYoke);
  yoke.name = 'Inner_Back_Yoke';
  yoke.position.set(0, 0.728, -0.006);
  yoke.rotation.y = Math.PI;
  root.add(yoke);

  // 13, 14, 15. Three Polo Buttons (Button)
  const buttonGeo = new THREE.CylinderGeometry(0.0085, 0.0085, 0.004, 20);
  buttonGeo.rotateX(Math.PI / 2);
  [0.678, 0.628, 0.578].forEach((by, i) => {
    const btn = new THREE.Mesh(buttonGeo, matButton);
    btn.name = `Placket_Button_${i + 1}`;
    btn.position.set(0, by, 0.126 - (0.678 - by) * 0.08);
    root.add(btn);
  });

  // 16. Left Chest Pocket (Pocket) - curved to sit flush on wearer's left chest (+X)
  const pocketShape = new THREE.Shape();
  const pw = 0.056;
  const ph = 0.068;
  pocketShape.moveTo(-pw, ph);
  pocketShape.lineTo(pw, ph);
  pocketShape.lineTo(pw, -ph * 0.65);
  pocketShape.lineTo(0, -ph);
  pocketShape.lineTo(-pw, -ph * 0.65);
  pocketShape.closePath();

  const pocketGeo = new THREE.ExtrudeGeometry(pocketShape, {
    depth: 0.004,
    bevelEnabled: true,
    bevelThickness: 0.0015,
    bevelSize: 0.0015,
    bevelSegments: 2,
  });
  const pocketMesh = new THREE.Mesh(pocketGeo, matPocket);
  pocketMesh.name = 'Chest_Pocket';
  pocketMesh.position.set(0.108, 0.525, 0.128);
  pocketMesh.rotation.y = 0.34;
  pocketMesh.rotation.x = -0.06;
  root.add(pocketMesh);

  // 17. Bottom Hem Trim Band (Front)
  const hemGeo = new THREE.CylinderGeometry(0.246, 0.248, 0.022, 48, 1, true);
  const hPos = hemGeo.getAttribute('position');
  for (let i = 0; i < hPos.count; i++) {
    hPos.setZ(i, hPos.getZ(i) * 0.48);
  }
  hemGeo.computeVertexNormals();
  const hemMesh = new THREE.Mesh(hemGeo, matFront);
  hemMesh.name = 'Bottom_Hem_Trim';
  hemMesh.position.set(0, 0.011, 0);
  root.add(hemMesh);

  return root;
}
