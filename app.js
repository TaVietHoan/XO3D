/**
 * NEON ARENA - Core Logic & Three.js 3D Engine
 * Fully client-side orchestrated with Google Apps Script Smart Polling
 */

// ==========================================
// 1. GLOBAL STATE & CONFIG
// ==========================================
const DEFAULT_GAS_URL = "https://script.google.com/macros/s/AKfycbx6d9-j9LtLkcV4TfFEiVW73pHUS01cOgKEAPmFp8ldtgNXcouITfjg8xo9s2IWp78w/exec"; // Fallback URL mẫu

const STATE = {
  apiUrl: localStorage.getItem('neon_gas_url') || DEFAULT_GAS_URL,
  playerId: localStorage.getItem('neon_player_id') || ('usr_' + Math.random().toString(36).substring(2, 9)),
  nickname: localStorage.getItem('neon_nickname') || ('CyberPilot_' + Math.floor(Math.random() * 899 + 100)),
  currentRoomId: null,
  assignedRole: null, // 'X' hoặc 'O'
  currentTurn: 'X',
  boardSize: 15,
  boardData: Array(15).fill(null).map(() => Array(15).fill(null)),
  lastVersion: 0,
  isPolling: false,
  pollTimer: null,
  gameActive: false,
  myPendingMove: null, // { r, c, reqId } - Preview trước khi server xác nhận
  webGLAvailable: true,
  p1Stats: { name: 'Player X', wins: 0 },
  p2Stats: { name: 'Player O', wins: 0 }
};

localStorage.setItem('neon_player_id', STATE.playerId);
localStorage.setItem('neon_nickname', STATE.nickname);

// ==========================================
// 2. NETWORK ENGINE (Safe GAS Request)
// ==========================================
class NetworkClient {
  static async request(action, payload = {}) {
    if (!STATE.apiUrl || STATE.apiUrl.startsWith("https://script.google.com/macros/s/AKfycbwYyC15")) {
      // Thông báo người dùng thiết lập URL riêng nếu vẫn dùng URL placeholder
      console.warn("Đang sử dụng URL mặc định. Hãy cấu hình GAS Web App của bạn để chơi trực tuyến qua mạng.");
    }

    const bodyData = {
      action,
      playerId: STATE.playerId,
      nickname: STATE.nickname,
      roomId: STATE.currentRoomId,
      ...payload
    };

    try {
      // Kỹ thuật tránh CORS preflight OPTIONS: POST dạng text/plain
      const res = await fetch(STATE.apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(bodyData),
        redirect: 'follow'
      });

      if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);
      const json = await res.json();
      return json;
    } catch (err) {
      console.error(`[API Fail] Action: ${action}`, err);
      return { success: false, error: { message: err.message || "Network error" } };
    }
  }
}

// ==========================================
// 3. PROCEDURAL 3D CHARACTER ENGINE (Three.js)
// ==========================================
class CharacterSystem {
  constructor(scene) {
    this.scene = scene;
    this.nova = null; // Player X (Chibi Cyberpunk Nam)
    this.luna = null; // Player O (Chibi Cyberpunk Nữ)
    this.clock = new THREE.Clock();
    this.initCharacters();
  }

  initCharacters() {
    try {
      // Dựng Procedural NOVA (Bên trái bàn cờ)
      this.nova = this.buildProceduralCharacter({
        name: 'NOVA',
        isMale: true,
        primaryColor: 0x00f0ff, // Cyan
        jacketColor: 0x0f172a,
        hairColor: 0x1e293b,
        position: new THREE.Vector3(-9.5, 0, 0)
      });
      this.scene.add(this.nova.root);

      // Dựng Procedural LUNA (Bên phải bàn cờ)
      this.luna = this.buildProceduralCharacter({
        name: 'LUNA',
        isMale: false,
        primaryColor: 0xff007f, // Magenta
        jacketColor: 0x1e1b4b,
        hairColor: 0x8a2be2,
        position: new THREE.Vector3(9.5, 0, 0)
      });
      this.scene.add(this.luna.root);
    } catch (err) {
      console.error("Lỗi dựng procedural character. Kích hoạt Fallback Level 3:", err);
      this.buildMinimalFallback();
    }
  }

  buildProceduralCharacter(cfg) {
    const root = new THREE.Group();
    root.position.copy(cfg.position);
    root.rotation.y = cfg.isMale ? Math.PI / 3 : -Math.PI / 3;

    // Materials
    const skinMat = new THREE.MeshStandardMaterial({ color: 0xffdfc4, roughness: 0.6 });
    const primaryMat = new THREE.MeshStandardMaterial({ 
      color: cfg.primaryColor, 
      emissive: cfg.primaryColor, 
      emissiveIntensity: 0.35, 
      roughness: 0.3 
    });
    const jacketMat = new THREE.MeshStandardMaterial({ color: cfg.jacketColor, roughness: 0.5 });
    const hairMat = new THREE.MeshStandardMaterial({ color: cfg.hairColor, roughness: 0.7 });
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x050713 });

    // 1. Thân (Body / Jacket)
    const bodyGeo = new THREE.CylinderGeometry(0.5, 0.4, 1.2, 12);
    const body = new THREE.Mesh(bodyGeo, jacketMat);
    body.position.y = 1.3;
    body.castShadow = true;
    root.add(body);

    // Neon Accent Line trên áo
    const stripeGeo = new THREE.BoxGeometry(0.1, 0.9, 0.85);
    const stripe = new THREE.Mesh(stripeGeo, primaryMat);
    stripe.position.set(0, 1.3, 0.1);
    root.add(stripe);

    // 2. Đầu Chibi lớn (Head)
    const headPivot = new THREE.Group();
    headPivot.position.set(0, 2.3, 0);
    const headGeo = new THREE.SphereGeometry(0.75, 20, 20);
    const head = new THREE.Mesh(headGeo, skinMat);
    head.castShadow = true;
    headPivot.add(head);

    // Tóc cách điệu (Stylized Hair)
    if (cfg.isMale) {
      // Nova: Tóc vuốt cyberpunk nhọn
      const hairGeo = new THREE.ConeGeometry(0.85, 0.8, 6);
      const hair = new THREE.Mesh(hairGeo, hairMat);
      hair.position.set(0, 0.5, -0.1);
      hair.rotation.x = -0.3;
      headPivot.add(hair);
    } else {
      // Luna: Tóc bob / hai chỏm sci-fi
      const hairGeo = new THREE.SphereGeometry(0.85, 14, 14);
      const hair = new THREE.Mesh(hairGeo, hairMat);
      hair.position.set(0, 0.2, -0.15);
      headPivot.add(hair);

      // Búi tóc neon hai bên
      const bunGeo = new THREE.TorusGeometry(0.2, 0.08, 8, 16);
      const bunL = new THREE.Mesh(bunGeo, primaryMat);
      bunL.position.set(-0.7, 0.3, 0);
      headPivot.add(bunL);
      const bunR = bunL.clone();
      bunR.position.x = 0.7;
      headPivot.add(bunR);
    }

    // Mắt Chibi
    const eyeGeo = new THREE.SphereGeometry(0.09, 8, 8);
    const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
    eyeL.position.set(0.25, 0.05, 0.7);
    headPivot.add(eyeL);
    const eyeR = eyeL.clone();
    eyeR.position.x = -0.25;
    headPivot.add(eyeR);

    root.add(headPivot);

    // 3. Hai Tay (Pivots for animation)
    const armGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.8, 8);
    
    const leftArmPivot = new THREE.Group();
    leftArmPivot.position.set(0.65, 1.8, 0);
    const leftArm = new THREE.Mesh(armGeo, primaryMat);
    leftArm.position.y = -0.35;
    leftArmPivot.add(leftArm);
    root.add(leftArmPivot);

    const rightArmPivot = new THREE.Group();
    rightArmPivot.position.set(-0.65, 1.8, 0);
    const rightArm = new THREE.Mesh(armGeo, primaryMat);
    rightArm.position.y = -0.35;
    rightArmPivot.add(rightArm);
    root.add(rightArmPivot);

    // 4. Hai Chân
    const legGeo = new THREE.CylinderGeometry(0.15, 0.14, 0.9, 8);
    const leftLeg = new THREE.Mesh(legGeo, jacketMat);
    leftLeg.position.set(0.28, 0.45, 0);
    root.add(leftLeg);

    const rightLeg = new THREE.Mesh(legGeo, jacketMat);
    rightLeg.position.set(-0.28, 0.45, 0);
    root.add(rightLeg);

    return {
      root,
      headPivot,
      leftArmPivot,
      rightArmPivot,
      body,
      animState: 'idle',
      animTimer: 0,
      baseY: root.position.y
    };
  }

  // Fallback Level 3: Hình học tối giản vững chắc
  buildMinimalFallback() {
    const makeFallback = (color, x) => {
      const g = new THREE.Group();
      g.position.set(x, 0, 0);
      const m = new THREE.MeshStandardMaterial({ color });
      const b = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1), m);
      b.position.y = 1;
      const h = new THREE.Mesh(new THREE.SphereGeometry(0.6, 12, 12), m);
      h.position.y = 2.4;
      g.add(b, h);
      this.scene.add(g);
      return { root: g, headPivot: h, leftArmPivot: g, rightArmPivot: g, animState: 'idle', animTimer: 0, baseY: 0 };
    };
    this.nova = makeFallback(0x00f0ff, -9.5);
    this.luna = makeFallback(0xff007f, 9.5);
  }

  triggerAnimation(targetChar, animName, duration = 1.2) {
    const char = targetChar === 'X' ? this.nova : this.luna;
    if (!char) return;
    char.animState = animName;
    char.animTimer = duration;
  }

  update(delta) {
    const time = this.clock.getElapsedTime();
    [this.nova, this.luna].forEach((char) => {
      if (!char) return;

      if (char.animTimer > 0) {
        char.animTimer -= delta;
        if (char.animTimer <= 0) char.animState = 'idle';
      }

      // Procedural Animation States
      switch (char.animState) {
        case 'punch':
          char.rightArmPivot.rotation.x = -Math.PI / 2 + Math.sin(time * 25) * 0.5;
          char.root.position.y = char.baseY + Math.sin(time * 20) * 0.15;
          break;
        case 'taunt':
          char.leftArmPivot.rotation.z = Math.PI / 3 + Math.sin(time * 15) * 0.4;
          char.rightArmPivot.rotation.z = -Math.PI / 3 - Math.sin(time * 15) * 0.4;
          char.headPivot.rotation.y = Math.sin(time * 8) * 0.3;
          break;
        case 'victory':
          char.leftArmPivot.rotation.z = Math.PI * 0.8;
          char.rightArmPivot.rotation.z = -Math.PI * 0.8;
          char.root.position.y = char.baseY + Math.abs(Math.sin(time * 8)) * 0.5;
          break;
        case 'defeat':
          char.headPivot.rotation.x = 0.5;
          char.root.position.y = char.baseY - 0.2;
          break;
        case 'idle':
        default:
          // Breathing motion
          char.root.position.y = char.baseY + Math.sin(time * 2.5) * 0.05;
          char.headPivot.rotation.y = Math.sin(time * 1.5) * 0.08;
          char.leftArmPivot.rotation.x = Math.sin(time * 2.5) * 0.1;
          char.rightArmPivot.rotation.x = -Math.sin(time * 2.5) * 0.1;
          break;
      }
    });
  }
}

// ==========================================
// 4. THREE.JS 3D BOARD & INTERACTION
// ==========================================
class Board3D {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    this.boardGridGroup = new THREE.Group();
    this.stonesGroup = new THREE.Group();
    this.hoverIndicator = null;
    this.characterSystem = null;
    this.cellMeshes = [];
    this.winLineMesh = null;

    this.init();
  }

  init() {
    try {
      const w = window.innerWidth;
      const h = window.innerHeight;

      // 1. Scene & Lighting
      this.scene = new THREE.Scene();
      this.scene.background = new THREE.Color(0x050713);
      this.scene.fog = new THREE.FogExp2(0x050713, 0.035);

      const ambient = new THREE.AmbientLight(0xffffff, 0.7);
      const dirLight = new THREE.DirectionalLight(0xddeeff, 1.2);
      dirLight.position.set(10, 25, 15);
      dirLight.castShadow = true;
      this.scene.add(ambient, dirLight);

      // Cyber Lights (Cyan & Magenta)
      const lightCyan = new THREE.PointLight(0x00f0ff, 2, 20);
      lightCyan.position.set(-10, 5, 0);
      const lightMag = new THREE.PointLight(0xff007f, 2, 20);
      lightMag.position.set(10, 5, 0);
      this.scene.add(lightCyan, lightMag);

      // 2. Camera
      this.camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 100);
      this.resetCamera();

      // 3. Renderer
      this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
      this.renderer.setSize(w, h);
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      this.renderer.shadowMap.enabled = true;
      this.container.appendChild(this.renderer.domElement);

      // 4. Objects
      this.buildCyberBoard();
      this.scene.add(this.boardGridGroup);
      this.scene.add(this.stonesGroup);
      this.characterSystem = new CharacterSystem(this.scene);

      // 5. Events
      window.addEventListener('resize', () => this.onResize());
      this.renderer.domElement.addEventListener('pointermove', (e) => this.onPointerMove(e));
      this.renderer.domElement.addEventListener('pointerdown', (e) => this.onPointerDown(e));

      // Loop
      this.animate();
    } catch (e) {
      console.warn("WebGL initialization failed. Activating 2D Fallback:", e);
      STATE.webGLAvailable = false;
      document.getElementById('canvas-container').classList.add('hidden');
      document.getElementById('fallback-2d-board').classList.remove('hidden');
      document.getElementById('fallback-2d-board').classList.add('flex');
      initFallback2DBoard();
    }
  }

  resetCamera() {
    if (!this.camera) return;
    this.camera.position.set(0, 18, 14);
    this.camera.lookAt(0, 0, 1);
  }

  buildCyberBoard() {
    const size = STATE.boardSize;
    const spacing = 1.0;
    const boardWidth = size * spacing;

    // Mặt bàn carbon cyber
    const baseGeo = new THREE.BoxGeometry(boardWidth + 1.2, 0.4, boardWidth + 1.2);
    const baseMat = new THREE.MeshStandardMaterial({ color: 0x0a0f24, roughness: 0.4, metalness: 0.8 });
    const base = new THREE.Mesh(baseGeo, baseMat);
    base.position.y = -0.22;
    base.receiveShadow = true;
    this.boardGridGroup.add(base);

    // Neon Frame viền bàn
    const frameGeo = new THREE.BoxGeometry(boardWidth + 1.4, 0.1, boardWidth + 1.4);
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x8a2be2, emissive: 0x8a2be2, emissiveIntensity: 0.4 });
    const frame = new THREE.Mesh(frameGeo, frameMat);
    frame.position.y = -0.3;
    this.boardGridGroup.add(frame);

    // Cells & Grid lines
    const half = (size - 1) / 2;
    const cellGeo = new THREE.PlaneGeometry(0.92, 0.92);
    cellGeo.rotateX(-Math.PI / 2);

    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const cellMat = new THREE.MeshBasicMaterial({ 
          color: 0x111c38, 
          transparent: true, 
          opacity: 0.6 
        });
        const cell = new THREE.Mesh(cellGeo, cellMat);
        cell.position.set((c - half) * spacing, 0.01, (r - half) * spacing);
        cell.userData = { row: r, col: c };
        this.boardGridGroup.add(cell);
        this.cellMeshes.push(cell);
      }
    }

    // Hover indicator box
    const indGeo = new THREE.PlaneGeometry(0.9, 0.9);
    indGeo.rotateX(-Math.PI / 2);
    const indMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff, transparent: true, opacity: 0.4 });
    this.hoverIndicator = new THREE.Mesh(indGeo, indMat);
    this.hoverIndicator.position.y = 0.03;
    this.hoverIndicator.visible = false;
    this.scene.add(this.hoverIndicator);
  }

  onResize() {
    if (!this.renderer || !this.camera) return;
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  onPointerMove(e) {
    if (!STATE.gameActive) return;
    this.mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    this.mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.camera);
    const intersects = this.raycaster.intersectObjects(this.cellMeshes);

    if (intersects.length > 0) {
      const target = intersects[0].object;
      const { row, col } = target.userData;
      if (!STATE.boardData[row][col]) {
        this.hoverIndicator.position.x = target.position.x;
        this.hoverIndicator.position.z = target.position.z;
        this.hoverIndicator.material.color.setHex(STATE.assignedRole === 'X' ? 0x00f0ff : 0xff007f);
        this.hoverIndicator.visible = true;
        return;
      }
    }
    this.hoverIndicator.visible = false;
  }

  onPointerDown(e) {
    // Chỉ nhận click chuột trái hoặc chạm ngón tay
    if (e.button !== undefined && e.button !== 0) return;
    if (!STATE.gameActive || STATE.currentTurn !== STATE.assignedRole || STATE.myPendingMove) return;

    this.mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    this.mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
    this.raycaster.setFromCamera(this.mouse, this.camera);

    const intersects = this.raycaster.intersectObjects(this.cellMeshes);
    if (intersects.length > 0) {
      const { row, col } = intersects[0].object.userData;
      handleUserMove(row, col);
    }
  }

  addStoneVisual(row, col, role, isPending = false) {
    const spacing = 1.0;
    const half = (STATE.boardSize - 1) / 2;
    const x = (col - half) * spacing;
    const z = (row - half) * spacing;

    const stoneGroup = new THREE.Group();
    stoneGroup.position.set(x, 0.15, z);
    stoneGroup.userData = { row, col, isPending };

    const color = role === 'X' ? 0x00f0ff : 0xff007f;
    const mat = new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: isPending ? 0.9 : 0.4,
      roughness: 0.2,
      metalness: 0.8
    });

    if (role === 'X') {
      // 3D Cross Disc
      const g1 = new THREE.BoxGeometry(0.65, 0.22, 0.18);
      const g2 = new THREE.BoxGeometry(0.18, 0.22, 0.65);
      const m1 = new THREE.Mesh(g1, mat);
      const m2 = new THREE.Mesh(g2, mat);
      stoneGroup.add(m1, m2);
      stoneGroup.rotation.y = Math.PI / 4;
    } else {
      // 3D Ring/Sphere
      const torusGeo = new THREE.TorusGeometry(0.28, 0.1, 12, 24);
      torusGeo.rotateX(Math.PI / 2);
      const mesh = new THREE.Mesh(torusGeo, mat);
      stoneGroup.add(mesh);
    }

    this.stonesGroup.add(stoneGroup);
    return stoneGroup;
  }

  confirmPendingStone() {
    this.stonesGroup.children.forEach((obj) => {
      if (obj.userData.isPending) {
        obj.userData.isPending = false;
        obj.traverse((child) => {
          if (child.material) child.material.emissiveIntensity = 0.4;
        });
      }
    });
  }

  removePendingStone() {
    const pending = this.stonesGroup.children.find(o => o.userData.isPending);
    if (pending) this.stonesGroup.remove(pending);
  }

  clearBoard() {
    while (this.stonesGroup.children.length > 0) {
      this.stonesGroup.remove(this.stonesGroup.children[0]);
    }
    if (this.winLineMesh) {
      this.scene.remove(this.winLineMesh);
      this.winLineMesh = null;
    }
  }

  drawWinLine(winningCoords) {
    if (!winningCoords || winningCoords.length < 2) return;
    const spacing = 1.0;
    const half = (STATE.boardSize - 1) / 2;

    const start = winningCoords[0];
    const end = winningCoords[winningCoords.length - 1];

    const p1 = new THREE.Vector3((start.c - half) * spacing, 0.4, (start.r - half) * spacing);
    const p2 = new THREE.Vector3((end.c - half) * spacing, 0.4, (end.r - half) * spacing);

    const curve = new THREE.LineCurve3(p1, p2);
    const tubeGeo = new THREE.TubeGeometry(curve, 20, 0.12, 8, false);
    const tubeMat = new THREE.MeshBasicMaterial({ color: 0x00ff66 });
    this.winLineMesh = new THREE.Mesh(tubeGeo, tubeMat);
    this.scene.add(this.winLineMesh);
  }

  animate() {
    requestAnimationFrame(() => this.animate());
    const delta = 0.016;
    if (this.characterSystem) this.characterSystem.update(delta);
    if (this.renderer && this.scene && this.camera) {
      this.renderer.render(this.scene, this.camera);
    }
  }
}

// ==========================================
// 5. 2D FALLBACK BOARD ENGINE (If WebGL Off)
// ==========================================
function initFallback2DBoard() {
  const container = document.getElementById('grid-2d');
  container.innerHTML = '';
  for (let r = 0; r < STATE.boardSize; r++) {
    for (let c = 0; c < STATE.boardSize; c++) {
      const btn = document.createElement('button');
      btn.className = "w-full h-full bg-slate-900 border border-slate-700/60 rounded flex items-center justify-center font-bold text-xs hover:bg-slate-800";
      btn.dataset.r = r;
      btn.dataset.c = c;
      btn.onclick = () => handleUserMove(r, c);
      container.appendChild(btn);
    }
  }
}

function update2DBoardCell(r, c, role) {
  const container = document.getElementById('grid-2d');
  const index = r * STATE.boardSize + c;
  const btn = container.children[index];
  if (btn) {
    btn.textContent = role;
    btn.className = `w-full h-full font-black text-sm flex items-center justify-center rounded ${role === 'X' ? 'text-cyber-cyan bg-cyan-950/40' : 'text-cyber-magenta bg-fuchsia-950/40'}`;
  }
}

// ==========================================
// 6. GAMEPLAY CONTROLLER & POLLING LOOP
// ==========================================
let board3DInstance = null;

async function handleUserMove(row, col) {
  if (STATE.boardData[row][col] || STATE.myPendingMove) return;

  const reqId = 'req_' + Math.random().toString(36).substring(2, 9);
  STATE.myPendingMove = { row, col, reqId };

  // Optimistic Preview
  STATE.boardData[row][col] = STATE.assignedRole;
  if (STATE.webGLAvailable && board3DInstance) {
    board3DInstance.addStoneVisual(row, col, STATE.assignedRole, true);
    board3DInstance.characterSystem.triggerAnimation(STATE.assignedRole, 'punch', 0.8);
  } else {
    update2DBoardCell(row, col, STATE.assignedRole);
  }

  showToast(`Đang xác thực nước đi (${row+1}, ${col+1})...`, 'info');

  const res = await NetworkClient.request('makeMove', {
    row,
    col,
    role: STATE.assignedRole,
    reqId,
    clientVersion: STATE.lastVersion
  });

  if (res.success) {
    STATE.myPendingMove = null;
    STATE.lastVersion = res.data.version;
    STATE.currentTurn = res.data.currentTurn;
    if (STATE.webGLAvailable && board3DInstance) {
      board3DInstance.confirmPendingStone();
    }
    updateHudTurn();

    if (res.data.status === 'FINISHED') {
      handleMatchFinish(res.data.winner, res.data.winningLine);
    }
  } else {
    // Rollback move nếu backend từ chối
    showToast(res.error?.message || "Nước đi không hợp lệ!", 'danger');
    STATE.boardData[row][col] = null;
    STATE.myPendingMove = null;
    if (STATE.webGLAvailable && board3DInstance) {
      board3DInstance.removePendingStone();
    } else {
      const idx = row * STATE.boardSize + col;
      document.getElementById('grid-2d').children[idx].textContent = '';
    }
  }
}

// SMART POLLING: Đồng bộ Delta Event
async function pollRoomState() {
  if (!STATE.isPolling || !STATE.currentRoomId) return;

  try {
    const res = await NetworkClient.request('pollEvents', {
      lastVersion: STATE.lastVersion
    });

    if (res.success && res.data) {
      const data = res.data;

      // Cập nhật người chơi tham gia nếu đang đợi
      if (data.status === 'PLAYING' && !STATE.gameActive) {
        startGameSession(data);
      }

      // Xử lý các nước đi mới
      if (data.newMoves && data.newMoves.length > 0) {
        data.newMoves.forEach(mv => {
          if (!STATE.boardData[mv.row][mv.col]) {
            STATE.boardData[mv.row][mv.col] = mv.role;
            if (STATE.webGLAvailable && board3DInstance) {
              board3DInstance.addStoneVisual(mv.row, mv.col, mv.role, false);
              board3DInstance.characterSystem.triggerAnimation(mv.role, 'punch', 0.8);
            } else {
              update2DBoardCell(mv.row, mv.col, mv.role);
            }
          }
        });
      }

      // Nhận sticker / Emote
      if (data.newEvents && data.newEvents.length > 0) {
        data.newEvents.forEach(ev => {
          if (ev.type === 'EMOTE') displayEmotePopup(ev.senderRole, ev.payload);
          if (ev.type === 'COMBAT_TAUNT') {
            if (board3DInstance) board3DInstance.characterSystem.triggerAnimation(ev.senderRole, 'taunt', 1.5);
            showToast(`${ev.senderRole === 'X' ? 'NOVA' : 'LUNA'} tung chiêu khiêu khích!`, 'info');
          }
        });
      }

      STATE.currentTurn = data.currentTurn;
      STATE.lastVersion = data.version;
      updateHudTurn();

      if (data.status === 'FINISHED' && STATE.gameActive) {
        handleMatchFinish(data.winner, data.winningLine);
      }
    }
  } catch (err) {
    console.warn("Poll tick fail", err);
  } finally {
    if (STATE.isPolling) {
      const interval = document.hidden ? 4000 : 1200;
      STATE.pollTimer = setTimeout(pollRoomState, interval);
    }
  }
}

function startPolling() {
  STATE.isPolling = true;
  clearTimeout(STATE.pollTimer);
  pollRoomState();
}

function stopPolling() {
  STATE.isPolling = false;
  clearTimeout(STATE.pollTimer);
}

// Quản lý hiển thị lượt trên HUD
function updateHudTurn() {
  const isMyTurn = STATE.currentTurn === STATE.assignedRole;
  const badgeX = document.getElementById('turn-badge-x');
  const badgeO = document.getElementById('turn-badge-o');
  const announce = document.getElementById('turn-announcement');

  if (STATE.currentTurn === 'X') {
    badgeX.classList.remove('hidden');
    badgeO.classList.add('hidden');
  } else {
    badgeO.classList.remove('hidden');
    badgeX.classList.add('hidden');
  }

  if (isMyTurn) {
    announce.textContent = "LƯỢT CỦA BẠN";
    announce.className = "text-xs font-extrabold mt-1 text-cyber-cyan animate-pulse";
  } else {
    announce.textContent = "ĐỐI THỦ ĐANG SUY NGHĨ...";
    announce.className = "text-xs font-semibold mt-1 text-slate-400";
  }
}

function startGameSession(roomData) {
  STATE.gameActive = true;
  document.getElementById('modal-matchmaking').classList.add('hidden');
  document.getElementById('modal-lobby').classList.add('hidden');
  document.getElementById('game-hud').classList.remove('hidden');
  document.getElementById('ingame-actions').classList.remove('hidden');

  // Cập nhật tên
  STATE.p1Stats.name = roomData.playerXName || 'Player X';
  STATE.p2Stats.name = roomData.playerOName || 'Player O';
  document.getElementById('hud-p1-name').textContent = STATE.p1Stats.name;
  document.getElementById('hud-p2-name').textContent = STATE.p2Stats.name;

  showToast("Trận đấu bắt đầu! Chúc may mắn.", 'success');
  updateHudTurn();
}

function handleMatchFinish(winner, winningLine) {
  STATE.gameActive = false;
  stopPolling();

  const isWin = winner === STATE.assignedRole;
  if (isWin) {
    confetti({ particleCount: 150, spread: 80, origin: { y: 0.6 } });
    if (board3DInstance) board3DInstance.characterSystem.triggerAnimation(winner, 'victory', 5);
  } else {
    if (board3DInstance) board3DInstance.characterSystem.triggerAnimation(STATE.assignedRole, 'defeat', 5);
  }

  if (board3DInstance && winningLine) {
    board3DInstance.drawWinLine(winningLine);
  }

  setTimeout(() => {
    const modal = document.getElementById('modal-game-over');
    const title = document.getElementById('game-over-title');
    const desc = document.getElementById('game-over-desc');
    const icon = document.getElementById('game-over-icon');

    if (winner === 'DRAW') {
      title.textContent = "HÒA CỜ!";
      desc.textContent = "Bàn cờ đã đầy hoặc hai bên bất phân thắng bại.";
      icon.textContent = "🤝";
    } else {
      title.textContent = isWin ? "CHIẾN THẮNG!" : "THẤT BẠI!";
      title.className = `text-3xl font-extrabold uppercase tracking-wider ${isWin ? 'text-cyber-cyan' : 'text-cyber-magenta'}`;
      desc.textContent = isWin ? "Chiến thuật tuyệt vời! Bạn đã làm chủ đấu trường." : "Đừng nản chí! Hãy xem lại nước cờ và thử lại.";
      icon.textContent = isWin ? "👑" : "💀";
    }
    modal.classList.remove('hidden');
  }, 1200);
}

// ==========================================
// 7. UI EVENTS & DIALOG HANDLERS
// ==========================================
function setupUIEvents() {
  // Config Modal
  document.getElementById('btn-config-api').onclick = () => {
    document.getElementById('input-api-url').value = STATE.apiUrl;
    document.getElementById('modal-config').classList.remove('hidden');
  };
  document.getElementById('btn-close-config').onclick = () => {
    document.getElementById('modal-config').classList.add('hidden');
  };
  document.getElementById('btn-save-config').onclick = () => {
    const val = document.getElementById('input-api-url').value.trim();
    if (val) {
      STATE.apiUrl = val;
      localStorage.setItem('neon_gas_url', val);
      showToast("Đã lưu URL Apps Script thành công!", 'success');
      document.getElementById('modal-config').classList.add('hidden');
    }
  };

  // Camera Reset
  document.getElementById('btn-camera-reset').onclick = () => {
    if (board3DInstance) board3DInstance.resetCamera();
  };

  // Quick Match
  document.getElementById('btn-quick-match').onclick = async () => {
    const nick = document.getElementById('input-nickname').value.trim();
    if (nick) STATE.nickname = nick;

    document.getElementById('modal-matchmaking').classList.remove('hidden');
    document.getElementById('mm-title').textContent = "Đang tìm trận...";
    document.getElementById('private-room-share').classList.add('hidden');

    const res = await NetworkClient.request('findMatch');
    if (res.success) {
      STATE.currentRoomId = res.data.roomId;
      STATE.assignedRole = res.data.role;
      STATE.lastVersion = res.data.version || 0;

      if (res.data.status === 'PLAYING') {
        startGameSession(res.data);
      } else {
        startPolling();
      }
    } else {
      showToast(res.error?.message || "Lỗi ghép trận!", 'danger');
      document.getElementById('modal-matchmaking').classList.add('hidden');
    }
  };

  // Create Private Room
  document.getElementById('btn-create-room').onclick = async () => {
    const nick = document.getElementById('input-nickname').value.trim();
    if (nick) STATE.nickname = nick;

    const res = await NetworkClient.request('createRoom');
    if (res.success) {
      STATE.currentRoomId = res.data.roomId;
      STATE.assignedRole = 'X';
      STATE.lastVersion = res.data.version || 0;

      document.getElementById('modal-matchmaking').classList.remove('hidden');
      document.getElementById('mm-title').textContent = "Đang chờ đối thủ vào phòng...";
      document.getElementById('display-room-code').textContent = res.data.roomId;
      document.getElementById('private-room-share').classList.remove('hidden');

      startPolling();
    } else {
      showToast(res.error?.message || "Không thể tạo phòng!", 'danger');
    }
  };

  // Join Room Actions
  document.getElementById('btn-join-room-modal').onclick = () => {
    document.getElementById('modal-join-input').classList.remove('hidden');
  };
  document.getElementById('btn-cancel-join').onclick = () => {
    document.getElementById('modal-join-input').classList.add('hidden');
  };
  document.getElementById('btn-confirm-join').onclick = async () => {
    const code = document.getElementById('input-room-code').value.trim().toUpperCase();
    if (code.length < 4) {
      showToast("Mã phòng không hợp lệ!", 'danger');
      return;
    }
    const nick = document.getElementById('input-nickname').value.trim();
    if (nick) STATE.nickname = nick;

    const res = await NetworkClient.request('joinRoom', { roomId: code });
    if (res.success) {
      STATE.currentRoomId = res.data.roomId;
      STATE.assignedRole = 'O';
      STATE.lastVersion = res.data.version;
      document.getElementById('modal-join-input').classList.add('hidden');
      startGameSession(res.data);
      startPolling();
    } else {
      showToast(res.error?.message || "Không thể vào phòng!", 'danger');
    }
  };

  // Copy Code
  document.getElementById('btn-copy-code').onclick = () => {
    navigator.clipboard.writeText(STATE.currentRoomId || '');
    showToast("Đã chép mã phòng vào bộ nhớ tạm!", 'info');
  };

  // Cancel Matchmaking
  document.getElementById('btn-cancel-match').onclick = async () => {
    stopPolling();
    await NetworkClient.request('cancelMatchmaking');
    STATE.currentRoomId = null;
    document.getElementById('modal-matchmaking').classList.add('hidden');
    showToast("Đã hủy tìm trận.", 'info');
  };

  // Stickers Toggle & Selection
  document.getElementById('btn-toggle-stickers').onclick = () => {
    const drawer = document.getElementById('sticker-drawer');
    drawer.classList.toggle('hidden');
  };

  document.querySelectorAll('[data-sticker]').forEach(btn => {
    btn.onclick = async () => {
      const sticker = btn.dataset.sticker;
      document.getElementById('sticker-drawer').classList.add('hidden');
      displayEmotePopup(STATE.assignedRole, sticker);
      await NetworkClient.request('sendEmote', { sticker });
    };
  });

  // Combat Taunt Button
  document.getElementById('btn-combat-taunt').onclick = async () => {
    if (board3DInstance) board3DInstance.characterSystem.triggerAnimation(STATE.assignedRole, 'taunt', 1.5);
    await NetworkClient.request('sendEmote', { sticker: '⚔️ TAUNT', isCombat: true });
  };

  // Surrender
  document.getElementById('btn-surrender').onclick = async () => {
    if (!confirm("Bạn có chắc chắn muốn đầu hàng ván đấu này?")) return;
    await NetworkClient.request('resignMatch');
  };

  // Rematch & Leave
  document.getElementById('btn-rematch').onclick = async () => {
    showToast("Đã gửi yêu cầu tái đấu...", 'info');
    document.getElementById('modal-game-over').classList.add('hidden');
    resetBoardState();
    const res = await NetworkClient.request('requestRematch');
    if (res.success) {
      startPolling();
    }
  };

  document.getElementById('btn-leave-room').onclick = () => {
    document.getElementById('modal-game-over').classList.add('hidden');
    document.getElementById('game-hud').classList.add('hidden');
    document.getElementById('ingame-actions').classList.add('hidden');
    document.getElementById('modal-lobby').classList.remove('hidden');
    resetBoardState();
    NetworkClient.request('leaveRoom');
    STATE.currentRoomId = null;
  };

  // Tab visibility: tự động đồng bộ khi quay lại tab
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && STATE.gameActive) {
      pollRoomState();
    }
  });
}

function resetBoardState() {
  STATE.boardData = Array(15).fill(null).map(() => Array(15).fill(null));
  STATE.myPendingMove = null;
  if (board3DInstance) board3DInstance.clearBoard();
  if (!STATE.webGLAvailable) initFallback2DBoard();
}

function displayEmotePopup(role, text) {
  const area = document.getElementById('emote-popups');
  const badge = document.createElement('div');
  const isX = role === 'X';
  badge.className = `px-3 py-1 rounded-full text-xs font-extrabold shadow-lg animate-bounce transition ${
    isX ? 'bg-cyan-500 text-black shadow-neon-cyan' : 'bg-magenta-500 text-white shadow-neon-magenta'
  }`;
  badge.textContent = `${isX ? 'NOVA' : 'LUNA'}: ${text}`;
  area.innerHTML = '';
  area.appendChild(badge);
  setTimeout(() => badge.remove(), 2500);
}

function showToast(msg, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  const color = type === 'success' ? 'border-cyber-success text-cyber-success' : 
                type === 'danger' ? 'border-cyber-danger text-cyber-danger' : 'border-cyber-cyan text-cyber-cyan';
  
  toast.className = `glass-panel px-4 py-2.5 rounded-xl border ${color} text-xs font-semibold shadow-glass transition transform duration-300 translate-y-2`;
  toast.textContent = msg;
  container.appendChild(toast);
  setTimeout(() => toast.classList.remove('translate-y-2'), 10);
  setTimeout(() => {
    toast.classList.add('opacity-0', 'translate-y-2');
    setTimeout(() => toast.remove(), 300);
  }, 3200);
}

// ==========================================
// 8. LIFECYCLE INITIALIZER
// ==========================================
window.addEventListener('DOMContentLoaded', () => {
  document.getElementById('input-nickname').value = STATE.nickname;
  setupUIEvents();
  board3DInstance = new Board3D('canvas-container');
});