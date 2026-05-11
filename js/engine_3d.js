import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// ==========================================
// 🚀 SISTEMAS CORE & GERENCIADORES
// ==========================================

/**
 * Sistema de partículas baseado em Shaders para máxima performance em dispositivos móveis.
 * Utiliza BufferAttributes para evitar alocações de memória durante a execução.
 */
class ShaderParticleSystem {
    constructor(scene, count = 1000) {
        this.scene = scene;
        this.particleCount = count;
        
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(this.particleCount * 3);
        const randoms = new Float32Array(this.particleCount * 3); // x: delay, y: speed, z: lifetime
        const offsets = new Float32Array(this.particleCount * 3); // base positions

        for (let i = 0; i < this.particleCount; i++) {
            // Initialize at infinity to hide until emitted
            offsets[i * 3 + 0] = 9999;
            offsets[i * 3 + 1] = 9999;
            offsets[i * 3 + 2] = 9999;

            randoms[i * 3 + 0] = Math.random(); 
            randoms[i * 3 + 1] = 0.5 + Math.random() * 1.5; 
            randoms[i * 3 + 2] = 1.0 + Math.random(); 
        }

        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('aOffset', new THREE.BufferAttribute(offsets, 3));
        geometry.setAttribute('aRandom', new THREE.BufferAttribute(randoms, 3));

        const material = new THREE.ShaderMaterial({
            uniforms: {
                uTime: { value: 0 },
                uGlobalZ: { value: 0 }, // OTIMIZAÇÃO
                uColor: { value: new THREE.Color(0xffcc00) }, // Aesthetic: Strong Gold
                uSize: { value: 35.0 } // Partículas maiores e mais suaves para efeito bokeh no mobile
            },
            vertexShader: `
                uniform float uTime;
                uniform float uSize;
                uniform float uGlobalZ; // OTIMIZAÇÃO: Movimento global via Shader
                attribute vec3 aOffset;
                attribute vec3 aRandom;
                varying float vAlpha;
                
                void main() {
                    float delay = aRandom.x;
                    float speed = aRandom.y;
                    float lifetime = aRandom.z;
                    
                    float t = mod(uTime * speed + delay * 10.0, lifetime);
                    
                    vec3 pos = aOffset;
                    pos.z += uGlobalZ; // Move com o mundo
                    
                    // Se estiver atrás da câmera (Z > 50), escondemos via escala
                    float hide = step(pos.z, 50.0); 
                    
                    pos.y += t * 15.0;
                    pos.x += sin(uTime * 2.0 + delay * 10.0) * t * 2.0;
                    
                    vAlpha = (1.0 - (t / lifetime)) * hide;
                    
                    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
                    gl_PointSize = uSize * (30.0 / -mvPosition.z) * vAlpha;
                    gl_Position = projectionMatrix * mvPosition;
                }
            `,
            fragmentShader: `
                uniform vec3 uColor;
                varying float vAlpha;
                void main() {
                    // Soft circular particle without branch/discard for mobile performance
                    vec2 coord = gl_PointCoord - vec2(0.5);
                    float distSq = dot(coord, coord);
                    float shapeAlpha = max(0.0, 1.0 - (distSq * 4.0)); // 0.25 * 4 = 1.0
                    
                    gl_FragColor = vec4(uColor, vAlpha * shapeAlpha * 0.8);
                }
            `,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });

        this.points = new THREE.Points(geometry, material);
        this.points.frustumCulled = false;
        this.scene.add(this.points);

        this.currentIndex = 0;
    }

    emit(x, y, z, amount = 10) {
        const offsets = this.points.geometry.attributes.aOffset;
        const currentGlobalZ = this.points.material.uniforms.uGlobalZ.value;
        for (let i = 0; i < amount; i++) {
            let idx = this.currentIndex * 3;
            offsets.array[idx + 0] = x + (Math.random() - 0.5) * 8;
            offsets.array[idx + 1] = y + Math.random() * 2;
            offsets.array[idx + 2] = z - currentGlobalZ + (Math.random() - 0.5) * 8; // Ajuste compensatório
            
            this.currentIndex = (this.currentIndex + 1) % this.particleCount;
        }
        offsets.needsUpdate = true;
    }

    update(dt, scrollDist) {
        this.points.material.uniforms.uTime.value += dt;
        this.points.material.uniforms.uGlobalZ.value += scrollDist;
    }
}

/**
 * Sistema de Fumaça Volumétrica usando Shaders.
 * Cria o efeito de poluição e profundidade urbana sem sobrecarregar a CPU.
 */
class SmokeSystem {
    constructor(scene, count = 120) {
        this.scene = scene;
        this.count = count;
        
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(count * 3);
        const randoms = new Float32Array(count * 3);
        
        for (let i = 0; i < count; i++) {
            // Concentrando a fumaça nas laterais para parecer que está saindo agressivamente dos prédios (-45 ou +45 no eixo X)
            const isRight = Math.random() > 0.5;
            const baseX = isRight ? 45.0 : -45.0;
            positions[i*3] = baseX + (Math.random() - 0.5) * 30.0; 
            positions[i*3+1] = Math.random() * 60; // Altura variada
            positions[i*3+2] = -Math.random() * 550; // Profundidade cobrindo todo o corredor de visão
            
            randoms[i*3] = Math.random(); 
            randoms[i*3+1] = Math.random(); 
            randoms[i*3+2] = Math.random();
        }
        
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('aRandom', new THREE.BufferAttribute(randoms, 3));
        
        const material = new THREE.ShaderMaterial({
            uniforms: {
                uTime: { value: 0 },
                uGlobalZ: { value: 0 },
                uColor: { value: new THREE.Color(0x333333) } // Cinza escuro/neblina poluição urbana
            },
            vertexShader: `
                uniform float uTime;
                uniform float uGlobalZ;
                attribute vec3 aRandom;
                varying float vAlpha;
                void main() {
                    vec3 pos = position;
                    pos.z += uGlobalZ;
                    
                    // Efeito de looping infinito no shader (OTIMIZAÇÃO)
                    pos.z = mod(pos.z + 550.0, 600.0) - 550.0;
                    
                    pos.y += mod(uTime * (2.0 + aRandom.y * 5.0) + aRandom.x * 100.0, 80.0) - 10.0;
                    pos.x += sin(uTime * 0.5 + aRandom.z * 10.0) * 10.0;
                    
                    vAlpha = smoothstep(70.0, 30.0, pos.y) * smoothstep(-10.0, 10.0, pos.y);
                    
                    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
                    gl_PointSize = (250.0 + aRandom.x * 150.0) * (50.0 / -mvPosition.z);
                    gl_Position = projectionMatrix * mvPosition;
                }
            `,
            fragmentShader: `
                uniform vec3 uColor;
                varying float vAlpha;
                void main() {
                    vec2 coord = gl_PointCoord - vec2(0.5);
                    float dist = length(coord);
                    // Bordas esféricas ultrassuaves
                    float alpha = smoothstep(0.5, 0.1, dist) * 0.3 * vAlpha;
                    gl_FragColor = vec4(uColor, alpha);
                }
            `,
            transparent: true,
            blending: THREE.NormalBlending,
            depthWrite: false
        });
        
        this.points = new THREE.Points(geometry, material);
        this.scene.add(this.points);
    }
    
    update(dt, scrollDist) {
        this.points.material.uniforms.uTime.value += dt;
        this.points.material.uniforms.uGlobalZ.value += scrollDist;
    }
}

/**
 * Controlador do Personagem Jogador.
 * Gerencia física de pulo, animação de atlas de textura e efeitos de deformação (Squash & Stretch).
 */
class PlayerController {
    constructor(scene, textureMap, charId = 'massau') {
        this.scene = scene;
        this.y = 0;
        this.vy = 0;
        this.charId = charId;
        this.gravity = -120; // Was -180. Lower gravity for smoother, floatier jump
        this.jumpForce = 45; // Was 55
        this.baseY = 5.5;
        this.isJumping = false;
        this.isGhost = false;
        this.ghostCycle = 0;

        if (charId === 'priscilla') {
            this.gravity = -75; // Salto tático: queda muito mais lenta (efeito lunar)
            this.jumpForce = 52; // Salto tático: alcança alturas maiores
        }
        
        // Animation variables for Squash & Stretch
        this.scaleX = 9;
        this.scaleY = 12;

        // Texture Atlas creation for zero-flicker animation
        this.atlas = this._createTextureAtlas(textureMap, charId);
        this.material = new THREE.SpriteMaterial({ 
            map: this.atlas, 
            transparent: true,
            alphaTest: 0.5 // Aumentado para eliminar o efeito de "quadrado" nas bordas
        });
        
        this.sprite = new THREE.Sprite(this.material);
        this.sprite.scale.set(9, 12, 1);
        this.sprite.position.set(0, this.baseY, 0);
        this.scene.add(this.sprite);

        // Shadow tracks player
        this.shadow = new THREE.Mesh(
            new THREE.CircleGeometry(2.2, 20), 
            new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.4 })
        );
        this.shadow.rotation.x = -Math.PI / 2;
        this.shadow.position.y = 0.2;
        this.scene.add(this.shadow);

        // NOVO: Aura Visual de Habilidade - Invisível por padrão
        this.auraGlow = new THREE.Sprite(new THREE.SpriteMaterial({
            map: this._createAuraTexture(),
            transparent: true,
            opacity: 0,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        }));
        this.auraGlow.scale.set(18, 18, 1);
        this.auraGlow.visible = false;
        this.scene.add(this.auraGlow);
    }

    _createAuraTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 128; canvas.height = 128;
        const ctx = canvas.getContext('2d');
        const grad = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
        grad.addColorStop(0, 'rgba(255, 255, 255, 0.8)');
        grad.addColorStop(0.4, 'rgba(255, 255, 255, 0.2)');
        grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0,0,128,128);
        return new THREE.CanvasTexture(canvas);
    }

    setCharId(charId, texMap) {
        this.charId = charId;
        if (charId === 'priscilla') {
            this.gravity = -75;
            this.jumpForce = 52;
        } else if (charId === 'morgado') {
            this.gravity = -110; // Rock sólido
            this.jumpForce = 46; 
        } else {
            this.gravity = -120;
            this.jumpForce = 45;
        }

        if (this.atlas) this.atlas.dispose();
        this.atlas = this._createTextureAtlas(texMap, charId);
        this.material.map = this.atlas;
        this.material.needsUpdate = true;
    }

    _createTextureAtlas(texMap, charId) {
        // Se as texturas do personagem não existirem, faz fallback para massau
        const texRun1 = texMap[`${charId}_run1`] || texMap.run1;
        const texRun2 = texMap[`${charId}_run2`] || texMap.run2;
        const texJump = texMap[`${charId}_jump`] || texMap.jump;

        if (!texRun1 || !texRun1.image) {
            console.warn("Textures not fully loaded for atlas. Fallback to basic material.");
            return new THREE.Texture();
        }

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        
        // Handle potentially different image formats safely
        const w = texRun1.image.width || 256;
        const h = texRun1.image.height || 256;
        
        canvas.width = w * 2;
        canvas.height = h * 2;

        const drawClean = (img, dx, dy) => {
            const tempC = document.createElement('canvas');
            tempC.width = w; tempC.height = h;
            const tCtx = tempC.getContext('2d');
            if (img) tCtx.drawImage(img, 0, 0);
            const imgData = tCtx.getImageData(0,0,w,h);
            const data = imgData.data;
            const expectedChroma = charId === 'tony' ? 'blue' : 'green';
            
            // Parâmetros de Refino para Mobile
            const similarity = 0.4;
            const smoothness = 0.08;
            const spill = 0.1;

            for(let i=0; i<data.length; i+=4) {
                const r = data[i]/255, g = data[i+1]/255, b = data[i+2]/255;
                
            // Algoritmo de Chroma Key "Zero Translucency"
            // Usa um corte seco (hard cut) para eliminar qualquer rastro de fundo
            let chromaDist = 0;
            if (expectedChroma === 'blue') {
                chromaDist = b - Math.max(r, g) * 1.2; 
            } else {
                chromaDist = g - Math.max(r, b) * 1.2;
            }
            
            // Pixels são ou 100% visíveis ou 0% visíveis (Adeus quadro translúcido)
            let alpha = chromaDist > 0.1 ? 0.0 : 1.0;
            data[i+3] = Math.floor(alpha * 255);
            
            // Spill Suppression agressivo
            if (alpha > 0) {
                    if (expectedChroma === 'blue') {
                        if (b > (r + g) * 0.5) {
                            data[i+2] = Math.floor((r + g) * 0.5 * 255);
                        }
                    } else {
                        if (g > (r + b) * 0.5) {
                            data[i+1] = Math.floor((r + b) * 0.5 * 255);
                        }
                    }
                }
            }

            function smoothstep(min, max, value) {
                let x = Math.max(0, Math.min(1, (value - min) / (max - min)));
                return x * x * (3 - 2 * x);
            }

            ctx.putImageData(imgData, dx, dy);
        };

        // Canvas Y=0 é o topo. WebGL UV Y=0 é a base.
        drawClean(texRun1.image, 0, 0);   // Frame 0 (Topo-Esquerda)
        drawClean(texRun2 ? texRun2.image : null, w, 0);   // Frame 1 (Topo-Direita)
        drawClean(texJump ? texJump.image : null, 0, h);   // Frame 2 (Base-Esquerda)

        const tex = new THREE.CanvasTexture(canvas);
        tex.minFilter = THREE.LinearFilter;
        tex.magFilter = THREE.LinearFilter;
        tex.repeat.set(0.5, 0.5); 
        return tex;
    }

    setFrame(index) {
        // index 0 = run1, index 1 = run2, index 2 = jump
        const col = index % 2;
        const row = Math.floor(index / 2);
        this.atlas.offset.set(col * 0.5, 1.0 - (row + 1) * 0.5);
    }

    jump(audioSys) {
        if (this.isJumping) return;
        
        this.isJumping = true;
        this.vy = this.jumpForce;
        
        // Squash and stretch: mais sutil para não deformar o personagem
        this.scaleX = 8.5;
        this.scaleY = 12.5;
        
        if (audioSys && audioSys.playJump) {
            audioSys.playJump();
        }
    }

    update(dt, targetX, distanceTraveled) {
        this._updateHorizontalMovement(dt, targetX);
        this._updateVerticalMovement(dt, distanceTraveled);
        this._updateAnimation(distanceTraveled);
        this._updateShadow();
        this._updateGhostState(dt);
    }

    _updateGhostState(dt) {
        if (this.charId !== 'sub') {
            this.isGhost = false;
            return;
        }

        // Sub (Bassist) Ghost Notes Logic: 
        // 1.2s cycle: 0.6s solid, 0.6s ghost (intangible)
        this.ghostCycle += dt;
        if (this.ghostCycle > 1.2) this.ghostCycle -= 1.2;

        this.isGhost = this.ghostCycle > 0.6;
        
        if (this.isGhost) {
            this.material.opacity = 0.3 + Math.sin(this.ghostCycle * 20) * 0.1; // Pulsing transparency
            this.material.color.setHex(0x88aaff); // Cool blue tint for ghost mode
        } else {
            this.material.opacity = 1.0;
            this.material.color.setHex(0xffffff);
        }
    }

    _updateHorizontalMovement(dt, targetX) {
        const diff = targetX - this.sprite.position.x;
        
        // Frame-rate independent Lerp for smooth lane switching
        const lerpFactor = 1.0 - Math.exp(-15 * dt);
        this.sprite.position.x += diff * lerpFactor;
        
        // Nova Animação: O personagem se inclina (leaning) levemente na direção do movimento ao trocar de faixa
        const tilt = Math.max(-0.25, Math.min(0.25, diff * -0.15));
        this.material.rotation = tilt;
    }

    _updateVerticalMovement(dt, distanceTraveled) {
        if (this.isJumping) {
            // Apply gravity and velocity
            this.y += this.vy * dt;
            this.vy += this.gravity * dt;
            
            // Ground collision detection
            if (this.y <= 0) {
                this.y = 0;
                this.isJumping = false;
                
                // Squash and stretch: impacto mais firme e menos deformado na aterrissagem
                this.scaleX = 10;
                this.scaleY = 11;
            }
        } else {
            // Distance-based bobbing effect to simulate running steps
            this.y = Math.abs(Math.sin((distanceTraveled / 6) * Math.PI)) * 0.3;
        }

        // Smoothly animate scale back to default (9x12)
        this.scaleX += (9 - this.scaleX) * 15 * dt;
        this.scaleY += (12 - this.scaleY) * 15 * dt;
        this.sprite.scale.set(this.scaleX, this.scaleY, 1);

        // Apply final vertical position
        this.sprite.position.y = this.baseY + this.y;

        // Atualiza a Aura Visual (Apenas se for Tony ou Priscilla)
        if (this.auraGlow) {
            this.auraGlow.position.copy(this.sprite.position);
            this.auraGlow.position.z -= 0.1;
            
            let targetOpacity = 0;
            if (this.charId === 'tony') {
                const crowdFactor = (window.engine && window.engine.playerCrowd) ? window.engine.playerCrowd.length : 0;
                if (crowdFactor > 0) {
                    this.auraGlow.visible = true;
                    targetOpacity = 0.2 + (crowdFactor * 0.12);
                    this.auraGlow.material.color.setHex(0x00aaff);
                    this.auraGlow.scale.set(15 + crowdFactor * 3, 15 + crowdFactor * 3, 1);
                } else {
                    this.auraGlow.visible = false;
                }
            } else if (this.charId === 'priscilla') {
                if (this.isJumping) {
                    this.auraGlow.visible = true;
                    targetOpacity = 0.6;
                    this.auraGlow.material.color.setHex(0xffffff);
                    this.auraGlow.scale.set(22, 22, 1);
                } else {
                    targetOpacity = 0;
                    if (this.auraGlow.material.opacity < 0.05) this.auraGlow.visible = false;
                }
            } else {
                this.auraGlow.visible = false;
                targetOpacity = 0;
            }
            this.auraGlow.material.opacity += (targetOpacity - this.auraGlow.material.opacity) * 10 * dt;
            
            // --- NOVO: EFEITOS ESPECÍFICOS POR PERSONAGEM ---
            if (this.charId === 'priscilla') {
                // Pulso Magnético
                this.auraGlow.scale.setScalar(1.0 + Math.sin(performance.now() * 0.01) * 0.15);
                this.auraGlow.material.color.setHex(0x00ffcc);
            } else if (this.charId === 'tony') {
                // Aura de Liderança (Dourada e Larga)
                this.auraGlow.scale.setScalar(1.3);
                this.auraGlow.material.color.setHex(0xffcc00);
            } else if (this.charId === 'morgado') {
                // Aura de Proteção (Verde)
                this.auraGlow.material.color.setHex(0x00ff00);
            }
        }
    }

    _updateAnimation(distanceTraveled) {
        if (this.isJumping) {
            this.setFrame(2); // Jump frame
        } else {
            // Ciclo de corrida acelera matematicamente com a velocidade do jogo
            // Modificado o divisor para 4.5 para as pernas moverem muito mais rápido em altas velocidades!
            const runCycle = Math.floor(distanceTraveled / 4.5) % 2;
            this.setFrame(runCycle);
        }
    }

    _updateShadow() {
        // Shadow tracks player's X position
        this.shadow.position.x = this.sprite.position.x;
        
        // Shadow shrinks dynamically as the player jumps higher
        const shadowScale = Math.max(0.1, 1.0 - (this.y / 15));
        this.shadow.scale.set(shadowScale, shadowScale, 1);
    }
}

// ==========================================
// 🏙️ MAIN ENGINE CLASS
// ==========================================

export class GameEngine3D {
    constructor(containerEl, audioSystem) {
        window.engine = this;
        this.container = containerEl;
        this.audio = audioSystem;
        this.score = 0;
        this.isGameOver = false;
        this.isReady = false;

        // Tighter street scale for better readability and speed perception
        this.lanePositions = [-9, 0, 9]; 
        this.currentLane = 1;
        
        // Progressive Speed and Difficulty Settings
        this.baseSpeed = 38;
        this.gameSpeed = this.baseSpeed; 
        this.maxSpeed = 65;
        this.distanceTraveled = 0;
        
        this.spawnTimer = 0;
        this.spawnInterval = 1.5; 
        
        // Game feel timers
        this.hitlagTimer = 0;
        this.invincibilityTimer = 0;
        this.powerupTimer = 0;
        this.isStorm = false;
        this.selectedChar = 'massau'; // Default character
        
        // Cinematic State
        this.isIntro = false;
        this.introTimer = 0;
        this.introStep = 0;
        
        // --- NOVO: MÉTRICAS DE PONTUAÇÃO (COMBO SYSTEM) ---
        this.combo = 0;
        this.comboTimer = 0;
        this.maxCombo = 0;
        this.scoreMultiplier = 1.0;
        
        // Environment colors
        this.normalBgColor = new THREE.Color(0x080600);
        this.stormBgColor = new THREE.Color(0x1a0b2e); // Roxo Tempestade
        
        this.entities = [];
        this.worldObjects = []; 
        this.playerCrowd = [];

        // Shared Geometry/Materials to prevent Memory Leaks
        this.sharedAllyGlowGeo = new THREE.CircleGeometry(6, 16);
        this.sharedAllyGlowGeo.rotateX(-Math.PI/2); // Pre-rotate geometry
        this.sharedAllyGlowMat = new THREE.MeshBasicMaterial({ color: 0xffcc00, transparent: true, opacity: 0.5 });
        
        // Pools de Objetos para evitar Garbage Collection (Lixo de Memória)
        this.pools = { ally: [], truck: [], barricade: [], powerup: [], ghost: [] };
        
        this._initScene();
        
        console.log("Engine: Iniciando carregamento de assets...");
        
        // Watchdog: Se não carregar em 15 segundos, avisa o usuário
        const loadWatchdog = setTimeout(() => {
            if (!this.isReady) {
                console.error("Engine: O carregamento demorou demais! Possível erro silencioso.");
                const bar = document.getElementById('loading-bar');
                if (bar) {
                    bar.style.background = "red";
                    const label = bar.parentElement.previousElementSibling;
                    if (label) label.innerText = "ERRO DE CONEXÃO / ASSETS";
                }
            }
        }, 15000);

        this._loadAllAssets(() => {
            console.log("Engine: Assets carregados, montando mundo...");
            try {
                clearTimeout(loadWatchdog);
                // Cut particle count down to 600 to prevent massive transparent fill-rate overdraw on mobile
                this.particles = new ShaderParticleSystem(this.scene, 600);
                this.smoke = new SmokeSystem(this.scene, 350); 
                this.player = new PlayerController(this.scene, this.assets.tex, this.selectedChar);
                this._buildUrbanEnvironment();
                
                this.renderer.compile(this.scene, this.camera);
                this.isReady = true;
                console.log("Engine: TUDO PRONTO!");
                this._showUI();
            } catch (err) {
                console.error("Engine: Erro crítico na montagem do mundo:", err);
            }
        });

        this._setupControls();
        window.addEventListener('resize', this._onResize.bind(this));
    }

    resetPowerups() {
        this.powerupTimer = 0;
        const hud = document.getElementById('megaphone-hud');
        if (hud) {
            hud.style.opacity = '0';
            hud.style.display = 'none';
        }
        if (this.player && this.player.sprite) {
            this.player.sprite.material.color.setHex(0xffffff);
        }
    }


    /**
     * Define o personagem atual e atualiza as texturas em tempo real.
     */
    setPlayerCharacter(charId) {
        this.selectedChar = charId;
        if (this.player && this.assets.tex) {
            this.player.setCharId(charId, this.assets.tex);
        }
    }

    /**
     * Limpeza profunda de recursos para evitar vazamentos de memória (Memory Leaks).
     * Libera geometrias, materiais e texturas da VRAM.
     */
    destroy() {
        this.isReady = false;
        if (this.renderer) {
            this.renderer.dispose();
            if(this.container.contains(this.renderer.domElement)) {
                this.container.removeChild(this.renderer.domElement);
            }
        }
        
        // Limpeza de Geometrias e Materiais compartilhados
        if (this.sharedAllyGlowGeo) this.sharedAllyGlowGeo.dispose();
        if (this.sharedAllyGlowMat) this.sharedAllyGlowMat.dispose();
        if (this.asphaltTex) this.asphaltTex.dispose();
        if (this.posterMat) {
            if (this.posterMat.map) this.posterMat.map.dispose();
            this.posterMat.dispose();
        }

        // Limpeza de objetos na cena
        this.scene.traverse((object) => {
            if (object.isMesh) {
                if (object.geometry) object.geometry.dispose();
                if (object.material) {
                    if (Array.isArray(object.material)) {
                        object.material.forEach(m => m.dispose());
                    } else {
                        object.material.dispose();
                    }
                }
            }
        });

        window.removeEventListener('resize', this._onResize);
    }

    /**
     * Inicializa a cena Three.js com configurações de performance otimizadas para Android/iOS.
     * @private
     */
    _initScene() {
        const w = window.innerWidth, h = window.innerHeight;
        this.scene = new THREE.Scene();
        
        // Aesthetic: Deep cinematic night with subtle gold/black tint
        this.scene.background = new THREE.Color(0x080600); 
        // Ampliando a distância da névoa para gerar o efeito de "corredor longo iluminado"
        this.scene.fog = new THREE.Fog(0x080600, 80, 550); 

        // Expandindo a distância de visão da câmera (Far Clip Plane) para vermos até o fundo
        this.camera = new THREE.PerspectiveCamera(60, w / h, 0.1, 600);
        this.camera.position.set(0, 18, 40);
        this.camera.lookAt(0, 5, -80);

        // Renderer — otimizado para mobile com escalonamento de precisão
        const useHighP = window.devicePixelRatio > 2 || !/Android|iPhone|iPad/i.test(navigator.userAgent);
        this.renderer = new THREE.WebGLRenderer({ 
            antialias:       true,
            powerPreference: "high-performance",
            precision:       useHighP ? "highp" : "mediump",
            stencil:         false,
            alpha:           false,
            logarithmicDepthBuffer: false
        });
        this.renderer.setSize(w, h);
        this.renderer.shadowMap.enabled = false;
        this.renderer.sortObjects        = false;

        // Vinheta cinematica (custo zero de GPU)
        if (!document.getElementById('cinematic-vignette')) {
            const vignette = document.createElement('div');
            vignette.id = 'cinematic-vignette';
            vignette.style.cssText = "position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:999;background:radial-gradient(circle, transparent 40%, rgba(5,4,0,0.85) 120%);will-change:transform;";
            document.body.appendChild(vignette);
        }
        
        // --- PROTOCOLO DE ALTA RESOLUÇÃO (HD MOBILE) ---
        // Aumentando o cap para 2.0 (Retina/OLED Quality)
        this.currentPixelRatio = Math.min(window.devicePixelRatio, 2.0);
        this.renderer.setPixelRatio(this.currentPixelRatio);
        
        // Ativando Antialiasing (Otimizado)
        this.renderer.antialias = true;
        
        // Otimização de Performance: Adaptive Resolution
        this.fpsThreshold = 45;
        this.lastFpsCheck = 0;
        
        // GPU compositing hint no canvas
        this.renderer.domElement.style.willChange = 'transform';
        this.renderer.domElement.style.imageRendering = 'auto'; // Melhora nitidez
        
        // Pre-cache refs DOM da cinematica
        this._cinTextEl = null; this._cinOverlay = null; this._cinLogoEl = null; this._cinImpactTime = 0;
        
        this.container.innerHTML = '';
        this.container.appendChild(this.renderer.domElement);
        
        this.time = 0;
        this.fpsTimer = 0;
        this.frameCount = 0;
        this.assets = { tex: {}, mod: {} };

        // Optimized Cinematic Lighting Setup
        // Hemisphere light gives a natural gradient from sky to ground
        const hemiLight = new THREE.HemisphereLight(0x444466, 0x222222, 2.8); // Brilho aumentado para nitidez de cores
        this.scene.add(hemiLight);
        
        // A luz amarela itinerante (playerLight) foi REMOVIDA para limpar a visão.
        
        const moonLight = new THREE.DirectionalLight(0xaaccff, 0.8); 
        moonLight.position.set(0, 100, 100); // Vindo de trás da câmera para iluminar o topo uniformemente
        this.scene.add(moonLight);
    }

    /**
     * Carregador centralizado de assets com barra de progresso.
     * @param {Function} onComplete Callback executado após o carregamento total.
     * @private
     */
    _loadAllAssets(onComplete) {
        const texLoader = new THREE.TextureLoader();
        const gltfLoader = new GLTFLoader();

        const textures = {
            run1: 'assets/img/marcal_run_1.png',
            run2: 'assets/img/marcal_run_2.png',
            jump: 'assets/img/marcal_jump.png',
            logo: 'assets/img/afrodizia.png',
            tony_run1: 'assets/img/tony_run_1.png',
            tony_run2: 'assets/img/tony_run_2.png',
            tony_jump: 'assets/img/tony_jump.png',
            priscilla_run1: 'assets/img/priscilla_run_1.png',
            priscilla_run2: 'assets/img/priscilla_run_2.png',
            priscilla_jump: 'assets/img/priscilla_jump.png',
            sub_run1: 'assets/img/sub_run_1.png',
            sub_run2: 'assets/img/sub_run_2.png',
            sub_jump: 'assets/img/sub_jump.png',
            morgado_run1: 'assets/img/morgado_run_1.png',
            morgado_run2: 'assets/img/morgado_run_2.png',
            morgado_jump: 'assets/img/morgado_jump.png'
        };

        const models = {
            truck: 'assets/models/truck.glb',
            barricade: 'assets/models/barricade.glb',
            barricade2: 'assets/models/barricade2.glb',
            barricade3: 'assets/models/barricade3.glb',
            light: 'assets/models/light.glb',
            streetlight: 'assets/models/Streetlight.glb',
            charB: 'assets/models/character-b.glb',
            charF: 'assets/models/character-f.glb',
            b1: 'assets/models/building-a.glb',
            b2: 'assets/models/building-b.glb',
            sky1: 'assets/models/building-skyscraper-a.glb',
            megafone: 'assets/models/megafone.glb'
        };

        let total = Object.keys(textures).length + Object.keys(models).length;
        let loaded = 0;

        const checkDone = () => {
            loaded++;
            const bar = document.getElementById('loading-bar');
            if (bar) bar.style.width = Math.floor((loaded / total) * 100) + '%';
            if (loaded >= total) onComplete();
        };

        Object.entries(textures).forEach(([k, p]) => texLoader.load(
            p,
            (t) => { 
                console.log(`[Asset] Textura carregada: ${k}`);
                
                // OTIMIZAÇÃO DE RESOLUÇÃO: Anisotropy remove borrão em ângulos rasos
                const maxAniso = this.renderer.capabilities.getMaxAnisotropy();
                t.anisotropy = Math.min(maxAniso, 8); 
                t.minFilter = THREE.LinearMipmapLinearFilter;
                t.magFilter = THREE.LinearFilter;
                
                this.assets.tex[k] = t; 
                checkDone(); 
            },
            undefined,
            (err) => { 
                console.error(`[Asset] ERRO na textura ${k}:`, err); 
                checkDone(); 
            }
        ));
        Object.entries(models).forEach(([k, p]) => gltfLoader.load(
            p,
            (g) => { 
                console.log(`[Asset] Modelo carregado: ${k}`);
                // Downgrade Standard materials to Lambert for massive GPU performance boost
                g.scene.traverse((child) => {
                    if (child.isMesh && child.material && child.material.isMeshStandardMaterial) {
                        // Fix crucial: Removemos o emissivo de componentes transparentes (como as sombras no pé dos aliados)
                        // para resolver o bug das "bolhas amarelas" no chão que estavam travadas embaixo deles!
                        const isShadow = child.material.transparent || (child.name && child.name.toLowerCase().includes('shadow'));
                        const newMat = new THREE.MeshPhongMaterial({
                            map: child.material.map,
                            color: child.material.color,
                            emissive: isShadow ? new THREE.Color(0x000000) : new THREE.Color(0x222222),
                            emissiveIntensity: isShadow ? 0.0 : 0.2,
                            shininess: 30, // Dá um leve brilho de reflexo urbano
                            transparent: child.material.transparent,
                            opacity: child.material.opacity
                        });
                        child.material.dispose();
                        child.material = newMat;
                    }
                });
                this.assets.mod[k] = g.scene; 
                checkDone(); 
            },
            undefined,
            (err) => { console.warn(`[Assets] Model failed: ${p}`, err); checkDone(); } // Never freeze
        ));
    }

    _buildUrbanEnvironment() {
        // Asfalto gerado dinamicamente para ter textura e "física" visual
        const asphaltTex = this._createAsphaltTexture();
        asphaltTex.wrapS = THREE.RepeatWrapping;
        asphaltTex.wrapT = THREE.RepeatWrapping;
        asphaltTex.repeat.set(4, 100);
        this.asphaltTex = asphaltTex; // Store for texture offset scrolling

        // Material Global para as Placas Rasteirizadas (Alta Performance)
        this.posterMat = new THREE.MeshBasicMaterial({ 
            map: this._createPosterTexture(), 
            transparent: true,
            color: 0xffffff
        });

        // Continuous Ground com Textura
        const road = new THREE.Mesh(
            // Narrower road geometry for a tighter, intense "canyon" feel
            new THREE.PlaneGeometry(36, 2000), 
            // Upgraded specifically the road to Phong for cinematic wet reflections
            new THREE.MeshPhongMaterial({ 
                color: 0x111111, 
                specular: 0x222222, // Reflexo muito mais suave
                shininess: 30,      
                map: asphaltTex
            })
        );
        road.rotation.x = -Math.PI/2;
        road.position.z = -800;
        this.scene.add(road);

        // --- SISTEMA DE GRAFITES NO CHÃO (Visíveis nos primeiros 50 metros) ---
        // Criação de marcas no asfalto (Decals)
        const graffitiGeo = new THREE.PlaneGeometry(20, 20);
        const graffitiMat = new THREE.MeshBasicMaterial({
            map: this._createGraffitiTexture(),
            transparent: true,
            opacity: 0.85,
            depthWrite: false
        });
        
        // Pinta 5 grafites logo no começo da corrida
        for (let i = 0; i < 5; i++) {
            const decal = new THREE.Mesh(graffitiGeo, graffitiMat);
            decal.rotation.x = -Math.PI / 2; // Cola no chão
            decal.position.set(0, 0.1, -10 - (i * 25)); // A cada 25 metros
            this.scene.add(decal);
            this.worldObjects.push({ mesh: decal, type: 'ground_decal' }); // Se move com o mundo
        }

        for (let side of [-1, 1]) {
            const sidewalk = new THREE.Mesh(
                new THREE.BoxGeometry(20, 2, 2000), 
                new THREE.MeshLambertMaterial({ color: 0x1a1a1c })
            );
            // Moved sidewalk much closer to match road bounds
            sidewalk.position.set(side * 28, 1, -800);
            this.scene.add(sidewalk);
        }

        // --- RECONSTRUÇÃO DO CENÁRIO CINEMÁTICO ---
        // Restaurando a densidade original para um visual "HD" e imersivo
        for (let z = 0; z > -800; z -= 45) { 
            for (let side of [-1, 1]) {
                // Sorteio de prédios
                const bType = Math.random() > 0.5 ? 'sky1' : (Math.random() > 0.5 ? 'b1' : 'b2');
                if (this.assets.mod[bType]) {
                    const b = this.assets.mod[bType].clone();
                    b.scale.set(40, 40, 40);
                    b.position.set(side * 55, 1.5, z); 
                    b.rotation.y = side === 1 ? -Math.PI/2 : Math.PI/2;
                    
                    // --- SISTEMA DE RASTEIRIZAÇÃO (PLACAS AFRODIZIA) ---
                    // Adiciona letreiros de protesto aos prédios (Otimizado: Planos Low-Poly)
                    // Aumentado o espaçamento: chance reduzida para 15% (antes era 60%)
                    if (Math.random() > 0.85 && this.posterMat) {
                        const poster = new THREE.Mesh(new THREE.PlaneGeometry(15, 6), this.posterMat);
                        // Posiciona na fachada do prédio voltada para a rua
                        poster.position.set(side === 1 ? -12 : 12, 10 + Math.random() * 20, 0); 
                        poster.rotation.y = side === 1 ? -Math.PI/2 : Math.PI/2;
                        b.add(poster);
                    }
                    
                    // --- SISTEMA DE JANELAS VIVAS (Shader Procedural) ---
                    const windowMat = new THREE.ShaderMaterial({
                        uniforms: {
                            uTime: { value: 0 },
                            uColor: { value: new THREE.Color(0xffcc00) }
                        },
                        vertexShader: `
                            varying vec2 vUv;
                            void main() {
                                vUv = uv;
                                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                            }
                        `,
                        fragmentShader: `
                            uniform float uTime;
                            uniform vec3 uColor;
                            varying vec2 vUv;
                            void main() {
                                // Cria um padrão de grade para janelas
                                vec2 grid = fract(vUv * vec2(10.0, 20.0));
                                float win = step(0.3, grid.x) * step(0.3, grid.y);
                                // Piscar aleatório baseado no tempo e na posição
                                float flicker = sin(uTime * 2.0 + vUv.y * 100.0) * 0.5 + 0.5;
                                float active = step(0.95, fract(sin(dot(floor(vUv * 20.0), vec2(12.9898, 78.233))) * 43758.5453));
                                gl_FragColor = vec4(uColor, win * active * flicker * 0.8);
                            }
                        `,
                        transparent: true,
                        blending: THREE.AdditiveBlending,
                        depthWrite: false
                    });
                    
                    const windowPlane = new THREE.Mesh(new THREE.PlaneGeometry(12, 40), windowMat);
                    windowPlane.position.set(side === 1 ? -15 : 15, 20, 0);
                    windowPlane.rotation.y = side === 1 ? -Math.PI/2 : Math.PI/2;
                    b.add(windowPlane);
                    b.userData.windowMat = windowMat; // Para atualizar o tempo depois
                    
                    this.scene.add(b);
                    this.worldObjects.push({ mesh: b, type: 'building', windowMat: windowMat });
                }

                // 2. Renderiza os postes virados para a RUA com foco direcional (SpotLight)
                // Espaçamento maior: Apenas um poste a cada 135 unidades (3 blocos de prédios)
                const lightModel = this.assets.mod.light || this.assets.mod.streetlight;
                if (Math.abs(z) % 135 === 0 && lightModel) {
                    const st = lightModel.clone();
                    
                    // Escala natural do poste
                    st.scale.set(1.0, 1.0, 1.0);
                    
                    // Poste posicionado nas laterais (X=19, limite da pista)
                    st.position.set(side * 19, 1.5, z);
                    
                    // ROTAÇÃO: Virado para o CENTRO DA RUA
                    st.rotation.y = side === 1 ? Math.PI * 1.5 : Math.PI * 0.5;
                    this.scene.add(st);

                    // === ALINHAMENTO COM A CABEÇA DO POSTE GIGANTE ===
                    // Pela imagem, o modelo arqueia bastante para o centro e é muito alto.
                    const bulbLocalX = 0; 
                    const bulbLocalY = 23.5; // Altura no topo do arco
                    const bulbLocalZ = 12.0; // Avanço pro centro da pista acompanhando o modelo
                    
                    // 1. Ponto de Luz Intensa (O próprio bulbo)
                    const glowMat = new THREE.SpriteMaterial({
                        map: this._createGlowTexture(),
                        color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending
                    });
                    const glow = new THREE.Sprite(glowMat);
                    glow.scale.set(1.5, 1.5, 1.5); 
                    glow.position.set(bulbLocalX, bulbLocalY - 0.5, bulbLocalZ); 
                    st.add(glow);

                    // 2. Raio de Luz Volumétrico (Cone/Cilindro com Gradiente)
                    // Cria o efeito da luz "saindo" do poste e iluminando o ar
                    const shaftGeo = new THREE.CylinderGeometry(0.5, 9.0, bulbLocalY, 16, 1, true);
                    shaftGeo.translate(0, -bulbLocalY / 2, 0); // O pivô fica no topo (raio menor)
                    
                    const shaftMat = new THREE.ShaderMaterial({
                        uniforms: {
                            color: { value: new THREE.Color(0xffffff) } // Luz volumétrica branca
                        },
                        vertexShader: `
                            varying vec2 vUv;
                            void main() {
                                vUv = uv;
                                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                            }
                        `,
                        fragmentShader: `
                            uniform vec3 color;
                            varying vec2 vUv;
                            void main() {
                                // Gradiente suave de cima para baixo
                                float alpha = smoothstep(0.0, 1.0, vUv.y);
                                // Bordas suaves no formato cilíndrico
                                float edge = sin(vUv.x * 3.14159);
                                // Opacidade máxima de 0.25 para um visual mais denso e "volumétrico"
                                gl_FragColor = vec4(color, alpha * edge * 0.25); 
                            }
                        `,
                        transparent: true,
                        blending: THREE.NormalBlending, // NormalBlending evita o erro da luz "queimar" a textura do personagem
                        depthWrite: false,
                        side: THREE.DoubleSide
                    });
                    
                    const lightShaft = new THREE.Mesh(shaftGeo, shaftMat);
                    lightShaft.position.set(bulbLocalX, bulbLocalY, bulbLocalZ);
                    st.add(lightShaft);

                    // 3. SpotLight Focado (Luz real emitida no chão)
                    // Restaurado para intensidade total e brilho expansivo
                    const spotLight = new THREE.SpotLight(0xffffff, 20.0, 150, Math.PI / 4, 0.9, 2);
                    spotLight.position.set(bulbLocalX, bulbLocalY, bulbLocalZ);
                    
                    const target = new THREE.Object3D();
                    target.position.set(bulbLocalX, 0, bulbLocalZ); 
                    st.add(target);
                    spotLight.target = target;

                    st.add(spotLight);
                    this.worldObjects.push({ mesh: st, type: 'streetlight', light: spotLight });
                }
            }
        }
    }

    _createGlowTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 64; canvas.height = 64;
        const ctx = canvas.getContext('2d');
        const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
        grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
        grad.addColorStop(0.2, 'rgba(255, 200, 100, 0.8)');
        grad.addColorStop(1, 'rgba(255, 100, 0, 0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0,0,64,64);
        return new THREE.CanvasTexture(canvas);
    }

    _createAsphaltTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 512; canvas.height = 512;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        
        // Fundo base
        ctx.fillStyle = '#1a1a1c';
        ctx.fillRect(0, 0, 512, 512);
        
        // Ruído para asfalto (Textura)
        const imgData = ctx.getImageData(0, 0, 512, 512);
        for(let i = 0; i < imgData.data.length; i += 4) {
            const noise = (Math.random() - 0.5) * 30;
            imgData.data[i] = Math.min(255, Math.max(0, imgData.data[i] + noise));
            imgData.data[i+1] = Math.min(255, Math.max(0, imgData.data[i+1] + noise));
            imgData.data[i+2] = Math.min(255, Math.max(0, imgData.data[i+2] + noise));
        }
        ctx.putImageData(imgData, 0, 0);

        // Adicionando Faixas Brancas
        ctx.fillStyle = '#dddddd';
        ctx.fillRect(160, 0, 10, 512);
        ctx.fillRect(342, 0, 10, 512);

        const tex = new THREE.CanvasTexture(canvas);
        tex.minFilter = THREE.LinearMipmapLinearFilter;
        tex.magFilter = THREE.LinearFilter;
        return tex;
    }

    _createPosterTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 512; canvas.height = 256;
        const ctx = canvas.getContext('2d');
        
        // Fundo Escuro com Borda
        ctx.fillStyle = '#0a0a0c';
        ctx.fillRect(0, 0, 512, 256);
        ctx.strokeStyle = '#ffcc00';
        ctx.lineWidth = 10;
        ctx.strokeRect(5, 5, 502, 246);
        
        // Textos Procedurais de Protesto (Afrodizia)
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        
        // Desenha o Logo no cartaz
        if (this.assets.tex.logo && this.assets.tex.logo.image) {
            ctx.drawImage(this.assets.tex.logo.image, 131, 20, 250, 150);
        } else {
            ctx.font = '900 65px "Oswald", sans-serif';
            ctx.fillText("AFRODIZIA", 256, 120);
        }
        
        ctx.fillStyle = '#ffcc00';
        ctx.font = 'bold 35px "Montserrat", sans-serif';
        ctx.fillText("Junte-se à nós", 256, 220);

        return new THREE.CanvasTexture(canvas);
    }

    _createGraffitiTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 1024; canvas.height = 1024; // Alta resolução
        const ctx = canvas.getContext('2d');
        
        ctx.translate(512, 512);
        
        // Sombreamento agressivo no asfalto
        ctx.shadowColor = 'rgba(0,0,0,0.8)';
        ctx.shadowBlur = 10;
        
        // Estilo Pixação / Grafite
        if (this.assets.tex.logo && this.assets.tex.logo.image) {
            // Desenha o logo como um grafite no asfalto
            ctx.globalAlpha = 0.9;
            ctx.drawImage(this.assets.tex.logo.image, -300, -200, 600, 300);
            ctx.globalAlpha = 1.0;
        } else {
            ctx.fillStyle = '#ffcc00';
            ctx.textAlign = 'center';
            ctx.font = '900 130px "Oswald", sans-serif';
            ctx.fillText("AFRODIZIA", 0, -50);
        }
        
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 80px "Montserrat", sans-serif';
        ctx.fillText("A MARCHA", 0, 150);
        
        // Pinceladas "spray" sujas na borda
        for(let i=0; i<30; i++) {
            ctx.fillStyle = Math.random() > 0.5 ? 'rgba(255,204,0,0.3)' : 'rgba(255,255,255,0.3)';
            ctx.beginPath();
            ctx.arc((Math.random()-0.5)*800, (Math.random()-0.5)*300, Math.random()*20, 0, Math.PI*2);
            ctx.fill();
        }

        return new THREE.CanvasTexture(canvas);
    }

    _createRainSystem() {
        const count = 1500;
        const geo = new THREE.BufferGeometry();
        const pos = new Float32Array(count * 3);
        const vels = new Float32Array(count);

        for (let i = 0; i < count; i++) {
            pos[i * 3] = (Math.random() - 0.5) * 120;     // X: Spread across the road/buildings
            pos[i * 3 + 1] = Math.random() * 100;         // Y: Start high
            pos[i * 3 + 2] = (Math.random() - 0.5) * 200; // Z: Spread along the track
            vels[i] = 1.5 + Math.random() * 2.0;          // Varied fall speed
        }

        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        
        // Material de chuva fotorrealista (partículas brancas finas e semi-transparentes)
        const mat = new THREE.PointsMaterial({
            color: 0xaaaaaa,
            size: 0.15,
            transparent: true,
            opacity: 0.4,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });

        this.rainSystem = new THREE.Points(geo, mat);
        this.rainSystem.userData = { velocities: vels };
        this.scene.add(this.rainSystem);
        
        // Efeito extra: Vento/Inclinação da chuva (Aesthetic)
        this.rainSystem.rotation.z = 0.1; 
    }

    _showUI() {
        const load = document.getElementById('loading-container');
        const btn = document.getElementById('btn-start');
        if (load) load.style.display = 'none';
        if (btn) btn.style.display = 'block';
    }

    _setupControls() {
        const move = (dir) => {
            if(this.isIntro) return;
            const oldLane = this.currentLane;
            this.currentLane = Math.max(0, Math.min(2, this.currentLane + dir));
            if (oldLane !== this.currentLane && this.audio) {
                this.audio.playWhoosh();
            }
        };
        document.addEventListener('keydown', (e) => {
            if(this.isIntro) return;
            if (e.code === 'ArrowLeft' || e.code === 'KeyA') move(-1);
            if (e.code === 'ArrowRight' || e.code === 'KeyD') move(1);
            if (e.code === 'Space' || e.code === 'ArrowUp') this.player.jump(this.audio);
        });
        
        let touchX = 0, touchY = 0;
        document.addEventListener('touchstart', e => { touchX = e.touches[0].clientX; touchY = e.touches[0].clientY; }, {passive: true});
        document.addEventListener('touchend', e => {
            if(this.isIntro) return;
            const dx = e.changedTouches[0].clientX - touchX;
            const dy = e.changedTouches[0].clientY - touchY;
            if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 30) move(dx > 0 ? 1 : -1);
            else if (dy < -30) this.player.jump(this.audio);
        }, {passive: true});
    }

    startCinematic() {
        console.log("[Engine] Iniciando Cinemática...");
        this.isReady = true;
        this.isIntro = true;
        this.introTimer = 0; 
        this.introStep = 0; // CRUCIAL: Reseta o controle de atos da narrativa
        
        // Reseta o player para o centro, posicionado mais à frente para a câmera
        this.currentLane = 1;
        this.player.sprite.position.set(0, 50, -20); // Cai do céu
        this.player.sprite.scale.set(9, 12, 1); // Escala normal
        
        // Posição heróica da câmera (baixo, de frente pro player)
        this.camera.position.set(0, 2, -10);
        this.camera.lookAt(0, 10, -20);
        
        const overlay = document.getElementById('cinematic-overlay');
        const textEl = document.getElementById('cinematic-text');
        const logoEl = document.getElementById('cinematic-logo');
        
        if (overlay) {
            overlay.style.display = 'flex';
            overlay.style.background = 'rgba(0,0,0,0.85)';
            overlay.style.opacity = '1';
        }
        if (textEl) {
            textEl.innerText = '';
            textEl.style.opacity = '0';
        }
        
        // Força sprite de pulo (punho erguido dinâmico) enquanto cai
        this.player.isJumping = true; 
        this.player.setFrame(2); // Fix: Garante frame de pulo na queda
        
        console.log("Cinematic Started");
    }

    // ── Cinemática: helper de texto animado ──────────────────
    _setCinText(textEl, text, cssClass, color, extraStyle) {
        if (!textEl) return;
        textEl.classList.remove('cin-in', 'cin-impact', 'cin-slide', 'cin-pulse', 'cin-out');
        void textEl.offsetWidth;
        textEl.innerText   = text;
        textEl.style.color = color || '#ffffff';
        textEl.style.opacity = '1';
        if (extraStyle) Object.assign(textEl.style, extraStyle);
        requestAnimationFrame(() => textEl.classList.add(cssClass));
    }

    _hideCinText(textEl) {
        if (!textEl) return;
        textEl.classList.remove('cin-in', 'cin-impact', 'cin-slide', 'cin-pulse');
        textEl.classList.add('cin-out');
        setTimeout(() => { textEl.classList.remove('cin-out'); textEl.style.opacity = '0'; }, 500);
    }

    _updateCinematic(dt) {
        this.introTimer += dt;
        this.time += dt;

        if (!this._cinTextEl)  this._cinTextEl  = document.getElementById('cinematic-text');
        if (!this._cinOverlay) this._cinOverlay = document.getElementById('cinematic-overlay');
        if (!this._cinLogoEl)  this._cinLogoEl  = document.getElementById('cinematic-logo');

        const textEl  = this._cinTextEl;
        const overlay = this._cinOverlay;

        if (this.particles) this.particles.update(dt * 0.1, 0);
        if (this.smoke)     this.smoke.update(dt * 0.1, 0);

        this.renderer.toneMappingExposure += (1.3 - this.renderer.toneMappingExposure) * 2.0 * dt;
        this.camera.position.y += (2 - this.camera.position.y) * 10.0 * dt;

        // ATO 0 — QUEDA HEROICA
        if (this.introStep === 0) {
            this.player.sprite.position.y -= 80 * dt;
            if (this.player.sprite.position.y <= 1.0) {
                this.player.sprite.position.y = 1.0;
                this.player.isJumping = false;

                if (this.selectedChar === 'morgado') {
                    this.renderer.toneMappingExposure = 7.0;
                    this.scene.background.setHex(0x1a0505);
                    this.scene.fog.color.setHex(0x1a0505);
                    this.camera.position.y = -5;
                    if (this.particles) this.particles.emit(0, 5, -20, 60);
                } else {
                    this.renderer.toneMappingExposure = 6.0;
                    this.scene.background.setHex(0x020005);
                    this.scene.fog.color.setHex(0x020005);
                    this.camera.position.y = 0;
                    if (this.particles) this.particles.emit(0, 1.5, -20, 25);
                }

                if (this.audio && this.audio.playImpactThunder) this.audio.playImpactThunder();

                // ATO 1: "A revolucao..."
                console.log("[Cinematic] ATO 1: A revolução...");
                this._setCinText(textEl, 'A REVOLU\u00c7\u00c3O...', 'cin-in', 'var(--primary)', {
                    fontWeight: '900',
                    letterSpacing: '4px'
                });

                this.introStep = 1;
                this._cinImpactTime = this.introTimer;
            }
        }

        if (this.introStep >= 1) {
            const T = this.introTimer - (this._cinImpactTime || 0);

            this.renderer.toneMappingExposure += (1.3 - this.renderer.toneMappingExposure) * 3.0 * dt;
            this.camera.position.x += (0  - this.camera.position.x) * 1.5 * dt;
            this.camera.position.y += (18 - this.camera.position.y) * 1.5 * dt;
            this.camera.position.z += (40 - this.camera.position.z) * 1.2 * dt;
            const lookZ = -20 + ((-80 - -20) * Math.min(1.0, Math.max(0, T / 7.0)));
            this.camera.lookAt(0, 5, lookZ);

            if (T > 0.5 && this._cinLogoEl) this._cinLogoEl.style.opacity = '0';

            // ATO 2: "...comecou." — impacto de palavra
            if (T > 1.8 && this.introStep === 1) {
                this.introStep = 2;
                console.log("[Cinematic] ATO 2: ...começou.");
                this._hideCinText(textEl);
                setTimeout(() => {
                    this._setCinText(textEl, '...COME\u00c7OU.', 'cin-impact', '#ffffff', {
                        fontWeight: '900',
                        letterSpacing: '5px'
                    });
                    setTimeout(() => textEl && textEl.classList.add('cin-pulse'), 600);
                }, 600);
            }

            // ATO 3: "Cada voz resgatada"
            if (T > 4.0 && this.introStep === 2) {
                this.introStep = 3;
                console.log("[Cinematic] ATO 3: Cada voz resgatada");
                if (textEl) textEl.classList.remove('cin-pulse');
                this._hideCinText(textEl);
                setTimeout(() => {
                    this._setCinText(textEl, 'CADA VOZ RESGATADA', 'cin-slide', '#dddddd', {
                        fontWeight: '700'
                    });
                }, 600);
            }

            // ATO 4: "e um passo contra o racismo." — mensagem final dourada
            if (T > 6.2 && this.introStep === 3) {
                this.introStep = 4;
                console.log("[Cinematic] ATO 4: é um passo contra o racismo.");
                this._hideCinText(textEl);
                setTimeout(() => {
                    this._setCinText(textEl, '\u00c9 UM PASSO CONTRA O RACISMO.', 'cin-slide', 'var(--primary)', {
                        fontWeight: '900'
                    });
                    setTimeout(() => textEl && textEl.classList.add('cin-pulse'), 700);
                }, 500);
            }

            // Zoom final
            if (T > 7.5 && T < 9.0) {
                this.camera.fov += (45 - this.camera.fov) * 6.0 * dt;
                this.camera.updateProjectionMatrix();
            }

            // FIM DA CINEMATICA (SEGURANÇA REFORÇADA)
            if ((T > 9.5 && this.introStep === 4) || this.introTimer > 12.0) {
                this.introStep = 5;
                if (textEl) textEl.classList.remove('cin-pulse');
                this._hideCinText(textEl);
                
                // RESET AMBIENTAL: Volta para as cores normais do jogo
                this.scene.background.setHex(0x050508);
                this.scene.fog.color.setHex(0x050508);
                this.scene.fog.near = 80;
                this.scene.fog.far = 550; // Mantém a visão de longo alcance

                if (overlay) {
                    overlay.style.transition = 'background 1.5s ease-out, opacity 1.5s ease-out';
                    overlay.style.background = 'transparent';
                    overlay.style.opacity    = '0';
                    setTimeout(() => { 
                        overlay.style.display = 'none'; 
                        overlay.style.opacity = '1'; 
                        overlay.style.background = 'rgba(0,0,0,0.95)';
                    }, 1500);
                }
                this.isIntro = false;
                this.gameSpeed = 38; 
                this.renderer.toneMappingExposure = 1.3; 
                this.player.sprite.position.z = 0;
                console.log('[Cinematic] Environment Reset & Finished.');
            }
        }
    }

    update(dt) {
        if (!this.isReady || this.isGameOver) return;

        if (dt === undefined) dt = 0.016; // Fallback
        
        // Ensure DeltaTime is capped to prevent massive physics jumps during lag spikes
        dt = Math.min(dt, 0.1); 

        // Hitlag (Freeze Frame) for game feel impact
        if (this.hitlagTimer > 0) {
            this.hitlagTimer -= dt;
            this.renderer.render(this.scene, this.camera);
            return; // Skip all physics/logic updates to freeze the game
        }

        if (this.isIntro) {
            this._updateCinematic(dt);
            this.renderer.render(this.scene, this.camera);
            return;
        }

        this.time += dt;

        // Progressive Difficulty: Safe, stable, and gradual increase
        // Tony tem cadência menor (mais focado em precisão) do que o Massau (velocista)
        this.maxSpeed = this.selectedChar === 'tony' ? 65 : 85; 
        const accelRate = this.selectedChar === 'tony' ? 0.20 : 0.35;
        
        this.gameSpeed = Math.min(this.maxSpeed, this.gameSpeed + dt * accelRate);
        
        // --- RITMO DE SPAWN (WAVE SYSTEM) ---
        // Cria ondas de "tensão" e "descanso" variando o intervalo senoidalmente
        const waveFactor = 1.0 + Math.sin(this.time * 0.5) * 0.3;
        this.spawnInterval = (1.5 * (this.baseSpeed / this.gameSpeed)) * waveFactor;
        
        if (this.comboTimer > 0) {
            this.comboTimer -= dt;
            if (this.comboTimer <= 0) {
                this.maxCombo = Math.max(this.maxCombo, this.combo);
                this.combo = 0;
                this.scoreMultiplier = 1.0;
            }
        }

        // Handle Invincibility Blinking
        if (this.invincibilityTimer > 0) {
            this.invincibilityTimer -= dt;
            // Blink at 30hz - Otimizado para não gerar stutter
            this.player.sprite.material.opacity = Math.sin(this.time * 30) > 0 ? 0.4 : 0.9;
        } else {
            this.player.sprite.material.opacity = 1.0;
        }

        // NOVO: Habilidade Ativa do Morgado - RIFF DE RESGATE
        if (this.selectedChar === 'morgado') {
            if (!this.morgadoSkillTimer) this.morgadoSkillTimer = 0;
            this.morgadoSkillTimer += dt;
            
            if (this.morgadoSkillTimer >= 8.0) {
                this.morgadoSkillTimer = 0;
                
                // Tremor de impacto sonoro violento (Camera Shake)
                this.camera.position.y = 25; 
                
                // Flash removido a pedido (Mantendo apenas o tremor e a aura visual)
                
                // Explosão Sonora Visual na UI
                let riffUI = document.getElementById('riff-blast-ui');
                if (!riffUI) {
                    riffUI = document.createElement('div');
                    riffUI.id = 'riff-blast-ui';
                    riffUI.style.cssText = "position:absolute;top:30%;left:50%;transform:translateX(-50%) scale(0.1);color:#ff5500;font-size:70px;font-weight:900;text-shadow:0 0 40px #ff0000, 0 0 20px #fff;z-index:9999;font-family:'Oswald',sans-serif;pointer-events:none;opacity:0;transition:all 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275); text-align:center; line-height:1.1;";
                    document.body.appendChild(riffUI);
                }
                riffUI.innerHTML = "🎸<br>RIFF DE RESGATE!";
                riffUI.style.opacity = 1;
                riffUI.style.transform = "translateX(-50%) scale(1.2)";
                
                setTimeout(() => {
                    if(riffUI) {
                        riffUI.style.opacity = 0;
                        riffUI.style.transform = "translateX(-50%) scale(2.0)"; // Expande sumindo (Onda Sonora)
                    }
                }, 800);

                // Explosão Radial de Partículas do motor
                if (this.particles) {
                    for(let p=0; p<3; p++) {
                        this.particles.emit(this.player.sprite.position.x, 5, this.player.sprite.position.z - 10, 40); 
                    }
                }
                
                // MARCA NO MUNDO: Onda de Choque Dupla (Shockwave) no asfalto
                const createShockwave = (inner, outer, color, speed, delay) => {
                    const ringGeo = new THREE.RingGeometry(inner, outer, 32);
                    const ringMat = new THREE.MeshBasicMaterial({ color: color, side: THREE.DoubleSide, transparent: true, opacity: 1.0, blending: THREE.AdditiveBlending });
                    const shockwave = new THREE.Mesh(ringGeo, ringMat);
                    shockwave.rotation.x = -Math.PI / 2;
                    shockwave.position.set(this.player.sprite.position.x, 0.2, this.player.sprite.position.z);
                    this.scene.add(shockwave);
                    
                    let scale = 1.0;
                    let opacity = 1.0;
                    const animate = () => {
                        scale += speed;
                        opacity -= 0.025;
                        if (opacity > 0) {
                            shockwave.scale.set(scale, scale, 1);
                            shockwave.material.opacity = opacity;
                            shockwave.position.z += this.gameSpeed * 0.016;
                            requestAnimationFrame(animate);
                        } else {
                            this.scene.remove(shockwave);
                            shockwave.geometry.dispose();
                            shockwave.material.dispose();
                        }
                    };
                    setTimeout(animate, delay);
                };

                // Dispara duas ondas para efeito de "eco" sonoro mais visível
                createShockwave(0.5, 2.5, 0xffaa00, 2.0, 0);   // Onda principal neon
                createShockwave(0.2, 1.5, 0xff5500, 1.5, 100); // Onda secundária (eco)
                
                // Equilíbrio de Forças: Destruição Direcionada e Coleta Reduzida
                for (let i = this.entities.length - 1; i >= 0; i--) {
                    const e = this.entities[i];
                    
                    // 1. Coleta Menor (Alcance reduzido de -250 para -80)
                    if ((e.type === 'ally' || e.type === 'powerup') && e.mesh.position.z < -20 && e.mesh.position.z > -80) {
                        e.mesh.position.x = this.player.sprite.position.x;
                        e.mesh.position.z = this.player.sprite.position.z;
                    } 
                    // 2. Destruição Explosiva (Qualquer obstáculo ao redor OU na linha reta)
                    else if ((e.type === 'barricade' || e.type === 'truck') && e.mesh.position.z < -5) {
                        const dx = Math.abs(e.mesh.position.x - this.player.sprite.position.x);
                        const dz = Math.abs(e.mesh.position.z - this.player.sprite.position.z);
                        const dist = Math.sqrt(dx*dx + dz*dz);
                        
                        // Quebra TUDO em um raio de 25 unidades OU em linha reta até 300 unidades
                        const isInRadius = dist < 25.0;
                        const isSameLaneLongRange = (dx < 5.5 && e.mesh.position.z > -300);
                        
                        if (isInRadius || isSameLaneLongRange) {
                            this._destroyObstacle(e, i);
                        }
                    }
                }
            }
        }

        // Lógica Etapa 1: Efeito do Megafone (Aura e Timer)
        let activeSpeed = this.gameSpeed;
        if (this.powerupTimer > 0) {
            this.powerupTimer -= dt;
            activeSpeed *= 2.0; // Velocidade duplicada temporariamente (A pedido do usuário)
            
            // Efeito visual do Megafone (Aura pulsante super brilhante rosa/amarelo)
            this.player.sprite.material.color.setHex(Math.sin(this.time * 20) > 0 ? 0xff00ff : 0xffcc00);
            
            let hud = document.getElementById('megaphone-hud');
            if (!hud) {
                // Estilo CSS dinâmico para a UI Deslumbrante do Megafone
                if (!document.getElementById('megaphone-style')) {
                    const style = document.createElement('style');
                    style.id = 'megaphone-style';
                    style.innerHTML = `@keyframes pulseGlow { 0% { transform: translateX(-50%) scale(1); box-shadow: 0 0 20px #ff00ff, inset 0 0 10px #ff00ff; } 100% { transform: translateX(-50%) scale(1.05); box-shadow: 0 0 40px #ffcc00, inset 0 0 20px #ffcc00; } }`;
                    document.head.appendChild(style);
                }
                hud = document.createElement('div');
                hud.id = 'megaphone-hud';
                // Interface deslumbrante solicitada
                hud.style.cssText = "position:absolute;top:15%;left:50%;transform:translateX(-50%);color:#fff;font-size:36px;font-weight:900;text-shadow:0 0 10px #000;z-index:9999;transition:opacity 0.2s;font-family:'Oswald',sans-serif;background:linear-gradient(45deg, #220022, #000);padding:10px 40px;border-radius:50px;border:3px solid #ffcc00;animation:pulseGlow 0.4s infinite alternate;";
                document.body.appendChild(hud);
            }
            hud.innerHTML = `<span style="background:linear-gradient(90deg, #ff00ff, #ffcc00);-webkit-background-clip:text;-webkit-text-fill-color:transparent;">🔥 MEGAFONE: ${this.powerupTimer.toFixed(1)}s 🔥</span>`;
            hud.style.display = 'block';
            hud.style.opacity = 1;
            
            if (this.powerupTimer <= 0) {
                this.player.sprite.material.color.setHex(0xffffff); // Restaura cor
                if (hud) hud.style.opacity = 0;
            }
        }

        // Lógica Etapa 2: SISTEMA CLIMÁTICO (TEMPESTADE FOTORREALISTA)
        if (this.score >= 1500 && !this.isStorm) {
            this.isStorm = true;
            this._showFeedbackText("TEMPESTADE!", "#b400ff");
            this._createRainSystem(); // Aciona as partículas de chuva
        }

        if (this.isStorm) {
            if (this.rainSystem) {
                // Atualização gravitacional e inercial da chuva caindo no pára-brisa/câmera
                const positions = this.rainSystem.geometry.attributes.position.array;
                const vels = this.rainSystem.userData.velocities;
                for(let i=0; i<vels.length; i++) {
                    positions[i*3+1] -= vels[i] + (activeSpeed * 0.1); 
                    if(positions[i*3+1] < 0) {
                        positions[i*3+1] = 100;
                        positions[i*3] = (Math.random() - 0.5) * 100; 
                    }
                }
                this.rainSystem.geometry.attributes.position.needsUpdate = true;
            }
            
            // Transição gradual da cena para Roxo Profundo com custo 0 de GPU
            this.scene.background.lerp(this.stormBgColor, 1.5 * dt);
            this.scene.fog.color.lerp(this.stormBgColor, 1.5 * dt);
            
            // Trovões aleatórios modulando a Exposição do HDR (HDR Tone Mapping)
            if (Math.random() > 0.995) {
                this.scene.background.setHex(0xffffff); // Flash branco
                this.renderer.toneMappingExposure = 3.0; // Estouro de luz
            } else {
                this.renderer.toneMappingExposure += (1.3 - this.renderer.toneMappingExposure) * 10 * dt;
            }
        }

        // Dynamic Resolution Scaling (Targeting 60FPS)
        this.frameCount++;
        this.fpsTimer += dt;
        if (this.fpsTimer >= 1.0) {
            const fps = this.frameCount;
            if (fps < 40 && this.currentPixelRatio > 1.0) {
                this.currentPixelRatio = 1.0; // Drop resolution to save performance
                this.renderer.setPixelRatio(this.currentPixelRatio);
            } else if (fps < 25 && this.currentPixelRatio > 0.75) {
                this.currentPixelRatio = 0.75; // Crisis mode
                this.renderer.setPixelRatio(this.currentPixelRatio);
            }
            this.frameCount = 0;
            this.fpsTimer = 0;
        }

        const scrollDist = activeSpeed * dt;
        this.distanceTraveled += scrollDist;
        
        // Scroll road texture to match world speed
        if (this.asphaltTex) {
            this.asphaltTex.offset.y -= scrollDist / 20;
        }

        let beat = 0;
        if(this.audio && this.audio.isInitialized) beat = this.audio.getBeatIntensity();

        // 1. Update Player
        const targetX = this.lanePositions[this.currentLane];
        this.player.update(dt, targetX, this.distanceTraveled);
        
        // NOVO: Ghost Trail Effect em Altas Velocidades
        if (this.gameSpeed > this.baseSpeed + 15 && this.frameCount % 4 === 0) {
            this._createGhostTrail();
        }

        // Cinematic Camera Dynamics (Follow & Shake)
        const targetCameraX = this.player.sprite.position.x * 0.4; 
        this.camera.position.x += (targetCameraX - this.camera.position.x) * 3 * dt;
        
        // Dynamic FOV based on jump, beat, and speed (Speed Lines effect)
        const speedRatio = Math.max(0, this.gameSpeed - this.baseSpeed);
        const targetFOV = 60 + (beat * 6) + (this.player.isJumping ? 8 : 0) + (speedRatio * 0.6);
        this.camera.fov += (targetFOV - this.camera.fov) * 5 * dt;
        this.camera.updateProjectionMatrix();

        // Speed Lines UI Overlay
        let speedOverlay = document.getElementById('speed-lines-overlay');
        if (!speedOverlay) {
            speedOverlay = document.createElement('div');
            speedOverlay.id = 'speed-lines-overlay';
            speedOverlay.style.cssText = "position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:900;background:radial-gradient(circle, transparent 50%, rgba(255,255,255,0.05) 80%, rgba(255,255,255,0.2) 100%); mix-blend-mode: screen; opacity: 0; transition: opacity 0.2s;";
            document.body.appendChild(speedOverlay);
        }
        speedOverlay.style.opacity = Math.min(1.0, speedRatio / 25.0);

        // Subtle camera shake on heavy beats
        if (beat > 0.8) {
            this.camera.position.y = 18 + (Math.random() - 0.5) * 0.3;
        } else {
            this.camera.position.y += (18 - this.camera.position.y) * 5 * dt;
        }
        
        this.camera.lookAt(this.camera.position.x * 0.5, 5, -80);

        // O "ponto fixo amarelo perto da borda" era um bug causado pela emissão de partículas soltas ao redor da câmera.
        // Removido para limpar a visão do personagem e transferir o caos para as laterais (prédios).

        // 2. Update Environment Recycling & Building Chaos (OTIMIZADO)
        const objCount = this.worldObjects.length;
        for (let i = 0; i < objCount; i++) {
            const obj = this.worldObjects[i];
            obj.mesh.position.z += scrollDist;
            
            // CAOS NAS LATERAIS: Menor frequência para economizar CPU
            if (obj.type === 'building' && this.particles && Math.random() > 0.95 && obj.mesh.position.z < 10) {
                const side = Math.sign(obj.mesh.position.x);
                this.particles.emit(side * 55 + (Math.random() - 0.5) * 10, Math.random() * 15, obj.mesh.position.z, 2);
            }
            
            if (obj.windowMat) {
                obj.windowMat.uniforms.uTime.value = this.time;
            }
            
            if (obj.mesh.position.z > 100) {
                if (obj.type === 'ground_decal') {
                    obj.mesh.position.z -= 1025; // 41 * 25 = 1025
                } else {
                    obj.mesh.position.z -= 810; // 18 * 45 = 810
                }
            }
        }

        // 3. Update Particles & Volumetric Smoke (Shader based)
        if (this.particles) {
            this.particles.update(dt, scrollDist);
        }
        if (this.smoke) {
            this.smoke.update(dt, scrollDist);
        }

        // 4. Update Entities (Crowd/Allies following player)
        const time = this.time;
        for (let i = 0; i < this.playerCrowd.length; i++) {
            const ally = this.playerCrowd[i];
            const tX = this.player.sprite.position.x + ally.offsetX;
            const tZ = this.player.sprite.position.z + ally.offsetZ;
            ally.mesh.position.x += (tX - ally.mesh.position.x) * 6 * dt;
            ally.mesh.position.z += (tZ - ally.mesh.position.z) * 6 * dt;
            // Otimização: Math.sin pré-calculado
            ally.mesh.position.y = 1.5 + Math.abs(Math.sin(time * 10 + i)) * 0.8;
        }

        // 5. Spawn Logic
        this.spawnTimer += dt;
        if (this.spawnTimer > this.spawnInterval) { 
            this.spawnTimer = 0; 
            this._spawnObstacle(); 
        }

        // 6. Collision & Obstacle Movement
        for (let i = this.entities.length - 1; i >= 0; i--) {
            const e = this.entities[i];
            const previousZ = e.mesh.position.z;
            e.mesh.position.z += scrollDist;

            // NOVO: Habilidade Tática da Priscilla - Magnetismo de Vozes (POTENCIALIZADO)
            if (this.selectedChar === 'priscilla' && (e.type === 'ally' || e.type === 'powerup')) {
                const magnetRange = 75.0; // Alcance aumentado para Priscilla
                const dx = this.player.sprite.position.x - e.mesh.position.x;
                const dz = this.player.sprite.position.z - e.mesh.position.z;
                const distSq = dx * dx + dz * dz;

                if (distSq < magnetRange * magnetRange) {
                    const dist = Math.sqrt(distSq);
                    const pullStrength = (1.0 - dist / magnetRange) * 140.0;
                    e.mesh.position.x += (dx / dist) * pullStrength * dt;
                    e.mesh.position.z += (dz / dist) * pullStrength * dt;
                    
                    // Efeito visual de rastro magnético (Partículas Douradas)
                    if (this.particles && Math.random() > 0.8) {
                        this.particles.emit(e.mesh.position.x, e.mesh.position.y, e.mesh.position.z, 1);
                    }
                }
            }
            if (e.type === 'powerup') {
                e.mesh.rotation.y += 5.0 * dt; // Rotação rápida na horizontal (Eixo Y real do 3D)
                e.mesh.rotation.x = 0; // Travado para não girar pro chão
                e.mesh.rotation.z = Math.PI / 8; // Leve inclinação estética
                // Flutuação suave
                e.mesh.position.y = 2.0 + Math.sin(this.time * 5.0) * 0.5;
                
                // Efeito Arco-íris (OTIMIZADO: Sem traverse no loop de update)
                const hue = (this.time * 1.5) % 1.0;
                if (e.rainbowMats) {
                    const intensity = 0.8 + Math.sin(this.time * 15.0) * 0.3;
                    for (let m = 0; m < e.rainbowMats.length; m++) {
                        e.rainbowMats[m].emissive.setHSL(hue, 1.0, 0.5);
                        e.rainbowMats[m].emissiveIntensity = intensity;
                    }
                }
            }
            
            const zDist = e.mesh.position.z - this.player.sprite.position.z;
            const xDist = Math.abs(e.mesh.position.x - this.player.sprite.position.x);
            
            // Continuous Collision Detection (CCD) Approximation
            // Check if the object passed the player's Z-plane this frame
            const crossedPlayerLine = (previousZ <= this.player.sprite.position.z && e.mesh.position.z >= this.player.sprite.position.z);
            
            const colZ = e.type === 'truck' ? 3.5 : 3.0; // Reduzido para maior precisão visual
            // A largura exata de 2 pistas é em torno de 9.0. Ajustado o hitbox X para 8.0
            // Assim, a 3ª pista fica 100% livre e o jogador não toma body block injusto
            const colX = (e.type === 'truck' || e.subType === 'wide') ? 7.0 : 3.5; 

            // Body Block e Altura de Colisão: Barricadas podem ser puladas, Carros não.
            let isHitY = false;
            if (e.type === 'truck') {
                isHitY = this.player.y < 14.5; // Ajustado de 20.0 para 14.5: Agora é possível pular carros com o salto tático da Priscilla!
            } else if (e.type === 'barricade') {
                isHitY = this.player.y < 4.0; 
            } else { // Aliado (Aumentado para facilitar a coleta no ar)
                isHitY = this.player.y < 15.0; 
            }

            // Trigger hit if within bounds OR if it passed completely through the bounding volume this frame
            const isHitZ = Math.abs(zDist) < colZ || crossedPlayerLine;
            
            if (isHitZ && xDist < colX && isHitY) {
                // Se for o SUB e estiver em estado fantasma, atravessa TUDO (Aliados e Obstáculos)
                if (this.player.charId === 'sub' && this.player.isGhost) {
                    continue; 
                }

                if (e.type === 'ally') {
                    this._collectAlly(e, i);
                } else if (e.type === 'powerup') {
                    this._collectPowerup(e, i);
                } else {
                    // Megafone ativo? Destrói o obstáculo sem tomar dano (SMASH!)
                    if (this.powerupTimer > 0) {
                        this._destroyObstacle(e, i);
                    } else {
                        this._handleHit(e, i);
                    }
                }
            } else if (e.mesh.position.z > 50) {
                this._recycleEntity(e, i);
            }
        }

        // --- SISTEMA DE QUALIDADE ADAPTATIVA (60FPS CONSTANTE) ---
        if (this.lastFpsCheck === 0) this.lastFpsCheck = performance.now();
        this.frameCount++;
        
        const now = performance.now();
        if (now - this.lastFpsCheck >= 1500) { 
            const fps = (this.frameCount * 1000) / (now - this.lastFpsCheck);
            // Mantendo resolução mínima em 1.3 para não sacrificar muito visual no mobile
            if (fps < this.fpsThreshold && this.currentPixelRatio > 1.3) {
                this.currentPixelRatio = Math.max(1.3, this.currentPixelRatio - 0.2);
                this.renderer.setPixelRatio(this.currentPixelRatio);
            } else if (fps > 55 && this.currentPixelRatio < Math.min(window.devicePixelRatio, 2.0)) {
                // Recupera resolução se estiver rodando suave
                this.currentPixelRatio = Math.min(window.devicePixelRatio, this.currentPixelRatio + 0.1);
                this.renderer.setPixelRatio(this.currentPixelRatio);
            }
            this.frameCount = 0;
            this.lastFpsCheck = now;
        }

        this.renderer.render(this.scene, this.camera);
    }

    /**
     * Retorna uma entidade do pool se disponível, caso contrário retorna null.
     * @param {string} type Tipo da entidade (ally, truck, barricade, powerup, ghost).
     * @returns {Object|null}
     * @private
     */
    _getFromPool(type) {
        if (this.pools[type] && this.pools[type].length > 0) {
            return this.pools[type].pop();
        }
        return null;
    }

    /**
     * Move uma entidade ativa de volta para o pool de reciclagem.
     * @private
     */
    _recycleEntity(entity, index) {
        entity.mesh.visible = false; // Otimização: Apenas esconde, não remove da árvore de cena
        this.pools[entity.type].push(entity);
        if (index !== undefined) {
            this.entities.splice(index, 1);
        }
    }

    _spawnObstacle() {
        const lane = Math.floor(Math.random() * 3);
        const rand = Math.random();
        let type = rand > 0.65 ? 'ally' : (rand > 0.35 ? 'barricade' : (rand > 0.05 ? 'truck' : 'powerup'));
        
        // REGRAS DE SPAWN RESTRITAS: Somente o MASSAU tem acesso ao Megafone.
        // Para qualquer outro personagem, o Megafone é removido do spawn.
        if (type === 'powerup' && this.selectedChar !== 'massau') {
            type = 'ally'; 
        }
        
        let entity = this._getFromPool(type);
        
        if (!entity) {
            let mesh;
            let subType = 'normal';
            
            if (type === 'ally') {
                const model = Math.random() > 0.5 ? this.assets.mod.charB : this.assets.mod.charF;
                if (model) {
                    mesh = model.clone();
                    // Aliados com escala natural na pista
                    mesh.scale.set(3.5, 3.5, 3.5); 
                    // Virados de FRENTE para a câmera (podemos ver os rostos deles agora)
                    mesh.rotation.y = 0; 
                }
            } else if (type === 'powerup') {
                if (this.assets.mod.megafone) {
                    mesh = this.assets.mod.megafone.clone();
                    mesh.scale.set(1.0, 1.0, 1.0); 
                    
                    // OTIMIZAÇÃO: Cache de materiais para o efeito arco-íris
                    const rainbowMats = [];
                    mesh.traverse((child) => {
                        if (child.isMesh && child.material) {
                            if (child.material.emissive) {
                                rainbowMats.push(child.material);
                            }
                            if (child.material.isMeshStandardMaterial) {
                                child.material.emissiveIntensity = 0.2;
                            }
                        }
                    });
                    
                    this.scene.add(mesh);
                    entity = { mesh, type, rainbowMats, subType };
                } else {
                    mesh = new THREE.Mesh(
                        new THREE.OctahedronGeometry(2.5, 0),
                        new THREE.MeshLambertMaterial({ color: 0xffcc00, emissive: 0xffcc00, emissiveIntensity: 0.8, wireframe: true })
                    );
                    this.scene.add(mesh);
                    entity = { mesh, type, rainbowMats: [mesh.material], subType };
                }
            } else if (type === 'truck' && this.assets.mod.truck) {
                mesh = this.assets.mod.truck.clone();
                mesh.scale.set(24, 24, 24); 
                // Viatura gerada de lado criando um enorme bloqueio de rua (drift block)
                mesh.rotation.y = Math.PI / 2;
            } else if (type === 'barricade') {
                // Multi-spawn: Sorteia entre os 3 modelos de barricadas para adicionar a diversidade pedida
                const bRng = Math.random();
                let bMod;
                if (bRng > 0.66 && this.assets.mod.barricade3) bMod = this.assets.mod.barricade3;
                else if (bRng > 0.33 && this.assets.mod.barricade2) bMod = this.assets.mod.barricade2;
                else bMod = this.assets.mod.barricade;
                
                if (bMod) {
                    mesh = bMod.clone();
                    // Ajustes individuais de tamanho para barricadas
                    if (bMod === this.assets.mod.barricade2) {
                        mesh.scale.set(6.0, 6.0, 6.0); // Aumentado barricade 2 (ocupa 1 pista)
                    } else if (bMod === this.assets.mod.barricade3) {
                        mesh.scale.set(4.5, 4.5, 4.5); // Diminuído barricade 3 (ocupa 1 pista)
                    } else {
                        mesh.scale.set(6, 6, 6); // Barricada 1 ocupará 2 pistas usando lógica wide
                        subType = 'wide';
                    }
                }
            }
            
            if (mesh && !entity) {
                this.scene.add(mesh);
                entity = { mesh, type, subType };
            }
        }

        if (entity) {
            entity.mesh.visible = true;
            
            // Lógica de Ocupação de 2 Pistas (Carro Lateral e Barricada 1)
            let spawnX = this.lanePositions[lane];
            if (type === 'truck' || entity.subType === 'wide') {
                // Força a ficar entre duas pistas (-4.5 = Esquerda/Centro | 4.5 = Direita/Centro)
                spawnX = lane === 0 ? -4.5 : (lane === 2 ? 4.5 : (Math.random() > 0.5 ? -4.5 : 4.5));
            }

            // Limpeza de segurança para evitar duplicatas em objetos reciclados
            const toRemove = [];
            entity.mesh.children.forEach(c => { if(c.userData.isClone) toRemove.push(c); });
            toRemove.forEach(c => entity.mesh.remove(c));
            
            // RESTAURAÇÃO DE ESCALAS ORIGINAIS (Evita o bug de tudo ficar minúsculo)
            if (type === 'truck') {
                entity.mesh.scale.set(24, 24, 24);
            } else if (type === 'barricade') {
                // Identifica qual modelo de barricada é para aplicar a escala correta
                if (entity.mesh.geometry === (this.assets.mod.barricade3 ? this.assets.mod.barricade3.geometry : null)) {
                    entity.mesh.scale.set(4.5, 4.5, 4.5);
                } else {
                    entity.mesh.scale.set(6, 6, 6);
                }
            } else if (type === 'ally') {
                entity.mesh.scale.set(3.5, 3.5, 3.5);
            } else {
                entity.mesh.scale.set(1, 1, 1);
            }

            entity.subType = 'normal';

            entity.mesh.position.set(spawnX, type==='ally'? 1 : 0, -800);
            
            // Aura verde foi removida definitivamente
            
            this.entities.push(entity);
        }
    }

    _collectPowerup(e, i) {
        // Habilidade EXCLUSIVA Massau: Megafone
        if (this.selectedChar === 'massau') {
            const duration = 10.0;
            this.powerupTimer = duration; 
            this._showFeedbackText(`🔥 MODO MEGAFONE ATIVO!`, "#ffcc00");
        } else {
            // Caso algum outro pegue por erro (não deveria spawnar), ganha apenas bônus de score
            this._showFeedbackText(`+50 PONTOS EXTRAS!`, "#ffffff");
        }

        this.hitlagTimer = 0.05;
        this.score += 50;
        if (this.onScoreUpdate) this.onScoreUpdate(this.score);
        this._recycleEntity(e, i);
    }

    _destroyObstacle(e, i) {
        this._showFeedbackText("💥 IMPACTO!", "#ffffff");
        this.hitlagTimer = 0.08;
        this.camera.position.y = 20;
        this._recycleEntity(e, i);
    }



    _collectAlly(e, i) {
        // --- SISTEMA DE COMBO ---
        this.combo++;
        this.comboTimer = 2.5; 
        this.scoreMultiplier = 1.0 + (Math.floor(this.combo / 5) * 0.1); 
        
        let earned = 20;
        if (this.powerupTimer > 0) earned *= 2;
        earned = Math.floor(earned * this.scoreMultiplier);
        
        if (this.selectedChar === 'tony') {
            const crowdBonus = 1 + (this.playerCrowd.length * 0.08);
            earned = Math.floor(earned * crowdBonus);
        }
        
        this.score += earned;
        if (this.onScoreUpdate) this.onScoreUpdate(this.score, this.combo);
        
        this.hitlagTimer = 0.03; 
        e.mesh.scale.set(2.8, 2.8, 2.8);

        // Formação da Multidão em "V" (Não amontoados atrás)
        // Isso limpa a visão central do jogador. A multidão abre para as laterais e se estende para trás.
        const index = this.playerCrowd.length;
        const row = Math.floor(index / 2) + 1;
        const isRight = index % 2 === 0;
        
        const offsetX = isRight ? (3 + row * 4) : -(3 + row * 4); // Expande paras as laterais
        
        // Z POSITIVO! Na nossa câmera (que olha pro -Z), Z positivo significa aproximar-se da tela.
        // Isso coloca a multidão exatamente NAS COSTAS do jogador.
        const offsetZ = 10 + (row * 6); 
        
        // PROGRESSÃO CONTROLADA: Aumenta a velocidade de forma justa e respeita o limite máximo
        this.gameSpeed = Math.min(this.maxSpeed, this.gameSpeed + 3.0);
        
        // Limite de 5 pessoas seguindo o jogador, como solicitado
        if (this.playerCrowd.length < 5) {
            this.playerCrowd.push({
                mesh: e.mesh,
                offsetX: offsetX,       
                offsetZ: offsetZ 
            });
        } else {
            // Maximum visual crowd reached, just recycle the mesh invisibly
            e.mesh.visible = false;
            this.pools['ally'].push(e);
        }

        this.entities.splice(i, 1);
        this._showFeedbackText(`+${earned} VOZES!`, "#ffcc00");
        if (this.particles) {
            this.particles.emit(e.mesh.position.x, 5, e.mesh.position.z, 30);
        }
    }

    _handleHit(e, i) {
        if (this.invincibilityTimer > 0) return;
        
        // --- RESET DE COMBO AO TOMAR DANO ---
        this.combo = 0;
        this.scoreMultiplier = 1.0;

        // Mecânica Única: TONY (Perde aliados, mas preserva a pontuação)
        if (this.selectedChar === 'tony' && this.playerCrowd.length > 0) {
            const alliesToLose = Math.min(2, this.playerCrowd.length);
            for (let j = 0; j < alliesToLose; j++) {
                const lostAlly = this.playerCrowd.pop();
                lostAlly.mesh.visible = false;
                this.pools['ally'].push({ mesh: lostAlly.mesh, type: 'ally' });
            }
            this._showFeedbackText("⚠️ ALIADO DISPERSADO!", "#ff3300");
        } else {
            // Padrão: Perda de 100 vozes e 1 aliado
            this.score = Math.max(0, this.score - 100);
            if (this.onScoreUpdate) this.onScoreUpdate(this.score);
            
            if (this.playerCrowd.length > 0) {
                const lostAlly = this.playerCrowd.pop();
                lostAlly.mesh.visible = false;
                this.pools['ally'].push({ mesh: lostAlly.mesh, type: 'ally' });
            }
            this._showFeedbackText("💔 CONEXÃO PERDIDA!", "#ff3300");
        }
        
        this.hitlagTimer = 0.12; 
        this.invincibilityTimer = 1.5; 
        
        // Priscilla mantém mais inércia após o impacto
        this.gameSpeed = (this.selectedChar === 'priscilla') ? Math.max(this.baseSpeed + 12, this.gameSpeed * 0.5) : this.baseSpeed;
        
        this.camera.position.y = 19; 
        this._recycleEntity(e, i);
    }

    _showFeedbackText(text, color) {
        const ui = document.getElementById('ui-container');
        if (!ui) return;
        const div = document.createElement('div');
        div.innerText = text;
        // Smooth transitions, longer readable duration
        div.style.cssText = `position:absolute;left:50%;top:45%;transform:translate(-50%,-50%);color:${color};font-weight:900;font-size:clamp(1.5rem, 7vw, 3.8rem);text-shadow:0 8px 30px rgba(0,0,0,0.9);transition:all 0.6s cubic-bezier(0.23, 1, 0.32, 1);z-index:100;pointer-events:none;opacity:1;white-space:nowrap;letter-spacing:1px;`;
        ui.appendChild(div);
        
        // Let it stay readable for 600ms before sliding up and fading
        setTimeout(() => { 
            div.style.top = '25%'; 
            div.style.opacity = '0'; 
        }, 600);
        
        setTimeout(() => div.remove(), 1200);
    }

    /**
     * Sistema de Rastro (Afterimage) para alta velocidade.
     * Utiliza pooling de sprites para garantir 60fps sem interrupções de memória.
     */
    _createGhostTrail() {
        if (!this.player || !this.player.sprite) return;
        
        let ghost = this._getFromPool('ghost');
        
        if (!ghost) {
            // Cria novo se o pool estiver vazio
            const mat = this.player.sprite.material.clone();
            ghost = { 
                mesh: new THREE.Sprite(mat),
                type: 'ghost'
            };
            this.scene.add(ghost.mesh);
        } else {
            ghost.mesh.visible = true;
        }
        
        // Configuração visual do rastro
        if (this.powerupTimer > 0) {
            ghost.mesh.material.color.setHex(0xff00ff);
        } else {
            ghost.mesh.material.color.setHex(0xaaaaaa);
        }
        
        ghost.mesh.material.opacity = 0.2;
        ghost.mesh.material.transparent = true;
        ghost.mesh.material.blending = THREE.AdditiveBlending;
        
        ghost.mesh.scale.copy(this.player.sprite.scale);
        ghost.mesh.position.copy(this.player.sprite.position);
        ghost.mesh.position.z -= 0.5;
        
        const startT = this.time;
        const animateGhost = () => {
            if (this.isGameOver || !this.isReady) return;
            const elapsed = this.time - startT;
            
            if (elapsed > 0.3) {
                // Em vez de deletar, devolvemos para o pool
                ghost.mesh.visible = false;
                this.pools.ghost.push(ghost);
                return;
            }
            
            ghost.mesh.material.opacity = 0.2 * (1.0 - (elapsed / 0.3));
            ghost.mesh.scale.x += 0.05 * (elapsed / 0.3); // Expansão sutil
            ghost.mesh.scale.y += 0.05 * (elapsed / 0.3);
            
            requestAnimationFrame(animateGhost);
        };
        
        animateGhost();
    }

    _onResize() {
        const w = window.innerWidth, h = window.innerHeight;
        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(w, h);
    }
}
