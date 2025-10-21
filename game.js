// Simple Bowser vs Mario game - play as Bowser
(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

  // Set logical resolution
  const WIDTH = 960;
  const HEIGHT = 540;
  canvas.width = WIDTH;
  canvas.height = HEIGHT;

  // UI elements
  const bowserHealthEl = document.getElementById('bowserHealth');
  const marioHealthEl = document.getElementById('marioHealth');
  const timeEl = document.getElementById('time');
  const restartBtn = document.getElementById('restart');

  // Game state
  let keys = {};
  let lastTime = performance.now();
  let elapsed = 0;
  let running = false;

  // Entities
  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
  class Entity {
    constructor(x,y,w,h,color,label) {
      this.x=x;this.y=y;this.w=w;this.h=h;this.color=color;this.label=label;
      this.vx=0; this.vy=0; this.onGround=false;
    }
    rect() { return {x:this.x,y:this.y,w:this.w,h:this.h}; }
    intersects(o) {
      return !(this.x+this.w < o.x || this.x > o.x+o.w || this.y+this.h < o.y || this.y > o.y+o.h);
    }
    draw() {
      ctx.fillStyle = this.color;
      ctx.fillRect(this.x, this.y, this.w, this.h);
      ctx.fillStyle = "#fff";
      ctx.font = "14px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(this.label, this.x + this.w/2, this.y + this.h/2 + 5);
    }
  }

  const gravity = 1600;
  // Jump forces
  const marioJumpForce = 520; // Mario's jump impulse
  const bowserJumpForce = marioJumpForce * 2; // Bowser jumps twice as high

  // Player = Bowser
  const bowser = new Entity(100, HEIGHT-130, 96, 96, "#b23", "Bowser");
  bowser.maxHealth = 100;
  bowser.health = bowser.maxHealth;

  // Enemy = Mario
  const mario = new Entity(700, HEIGHT-130, 56, 88, "#2a9", "Mario");
  mario.maxHealth = 60;
  mario.health = mario.maxHealth;
  mario.direction = -1; // -1 left, 1 right
  mario.aiTimer = 0;

  // Fireballs shot by Bowser
  const fireballs = [];

  function spawnFireball(x,y,dir) {
    fireballs.push({
      x:x, y:y, r:12, vx: 520 * dir, life: 2.5
    });
  }

  // Simple ground rectangle
  const groundY = HEIGHT - 40;

  function update(dt) {
    if (!running) return;

    elapsed += dt;

    // Input: horizontal movement
    const speed = 260;
    if (keys.ArrowLeft || keys.a || keys.KeyA) bowser.vx = -speed;
    else if (keys.ArrowRight || keys.d || keys.KeyD) bowser.vx = speed;
    else bowser.vx = 0;

    // Jump
    if ((keys.ArrowUp || keys.w || keys.KeyW) && bowser.onGround) {
      bowser.vy = -bowserJumpForce;
      bowser.onGround = false;
    }

    // Fire (space) - basic cooldown
    if ((keys.Space || keys[' ']) && (!bowser.cooldown || bowser.cooldown <= 0)) {
      const dir = bowser.facing || 1;
      spawnFireball(bowser.x + bowser.w/2 + dir*50, bowser.y + bowser.h/2, dir);
      bowser.cooldown = 0.45;
    }
    if (bowser.cooldown > 0) bowser.cooldown -= dt;

    // Facing from last horizontal input if any
    if (bowser.vx < 0) bowser.facing = -1;
    else if (bowser.vx > 0) bowser.facing = 1;

    // Physics for bowser
    bowser.vy += gravity * dt;
    bowser.x += bowser.vx * dt;
    bowser.y += bowser.vy * dt;

    // Ground collision
    if (bowser.y + bowser.h >= groundY) {
      bowser.y = groundY - bowser.h;
      bowser.vy = 0;
      bowser.onGround = true;
    } else bowser.onGround = false;

    // Keep in bounds
    bowser.x = clamp(bowser.x, 8, WIDTH - bowser.w - 8);

    // Mario AI: simple patrol with occasional dash or jump toward Bowser
    mario.aiTimer -= dt;
    const marioSpeed = 140;
    if (mario.aiTimer <= 0) {
      const choice = Math.random();
      if (choice < 0.6) {
        // Patrol towards side
        if (mario.x < 120) mario.direction = 1;
        else if (mario.x > WIDTH-120) mario.direction = -1;
        else mario.direction = (Math.random() < 0.5) ? -1 : 1;
      } else if (choice < 0.9) {
        // Move toward Bowser
        mario.direction = (bowser.x < mario.x) ? -1 : 1;
      } else {
        // Jump toward Bowser
        if (mario.onGround) mario.vy = -marioJumpForce;
      }
      mario.aiTimer = 0.8 + Math.random()*1.2;
    }

    // Mario physics
    mario.vx = mario.direction * marioSpeed;
    mario.vy += gravity * dt;
    mario.x += mario.vx * dt;
    mario.y += mario.vy * dt;
    if (mario.y + mario.h >= groundY) {
      mario.y = groundY - mario.h;
      mario.vy = 0;
      mario.onGround = true;
    } else mario.onGround = false;
    mario.x = clamp(mario.x, 8, WIDTH - mario.w - 8);

    // Mario contact attack
    if (mario.intersects(bowser) && (!mario.attackCooldown || mario.attackCooldown <= 0)) {
      const dmg = 8 + Math.floor(Math.random()*8);
      bowser.health -= dmg;
      bowser.health = Math.max(0, bowser.health);
      mario.attackCooldown = 0.9;
      // small knockback
      bowser.vx += (bowser.x < mario.x ? -1 : 1) * 180;
    }
    if (mario.attackCooldown > 0) mario.attackCooldown -= dt;

    // Update fireballs (only Bowser's exist now)
    for (let i = fireballs.length - 1; i >= 0; i--) {
      const f = fireballs[i];
      f.life -= dt;
      f.x += f.vx * dt;
      // collide with Mario
      if (f.x > mario.x && f.x < mario.x + mario.w && f.y > mario.y && f.y < mario.y + mario.h) {
        // Hit!
        mario.health -= 18;
        if (mario.health < 0) mario.health = 0;
        fireballs.splice(i,1);
        continue;
      }
      if (f.life <= 0 || f.x < -50 || f.x > WIDTH + 50) fireballs.splice(i,1);
    }

    // Check win/lose
    if (mario.health <= 0) {
      running = false;
      showMessage("You won! Mario defeated.");
    } else if (bowser.health <= 0) {
      running = false;
      showMessage("You lost. Bowser was defeated.");
    }

    // Update UI health bars
    updateHealthBars();
    timeEl.textContent = (elapsed).toFixed(1);
  }

  function updateHealthBars() {
    const bPct = clamp(bowser.health / bowser.maxHealth, 0, 1);
    const mPct = clamp(mario.health / mario.maxHealth, 0, 1);
    bowserHealthEl.style.setProperty('--pct', bPct);
    marioHealthEl.style.setProperty('--pct', mPct);
    bowserHealthEl.style.background = "#333";
    marioHealthEl.style.background = "#333";
    bowserHealthEl.style.position = 'relative';
    marioHealthEl.style.position = 'relative';
    bowserHealthEl.innerHTML = `<div style="position:absolute;left:0;top:0;bottom:0;width:${Math.round(bPct*100)}%;background:linear-gradient(90deg,#ffb86b,#ff4a4a)"></div>`;
    marioHealthEl.innerHTML = `<div style="position:absolute;left:0;top:0;bottom:0;width:${Math.round(mPct*100)}%;background:linear-gradient(90deg,#7fffd4,#2ad58f)"></div>`;
  }

  function draw() {
    // background
    ctx.clearRect(0,0,WIDTH,HEIGHT);

    // ground
    ctx.fillStyle = "#6b8e23";
    ctx.fillRect(0, groundY, WIDTH, HEIGHT - groundY);

    // castle/background hint
    ctx.fillStyle = "rgba(0,0,0,0.06)";
    ctx.fillRect(640, groundY-200, 220, 200);

    // Draw entities
    bowser.draw();
    mario.draw();

    // Draw fireballs
    for (const f of fireballs) {
      ctx.beginPath();
      ctx.fillStyle = "#ff8c1a";
      ctx.arc(f.x, f.y, f.r, 0, Math.PI*2);
      ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,0.12)";
      ctx.stroke();
    }

    // Draw simple health numbers
    ctx.fillStyle = "#111";
    ctx.font = "14px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(`Bowser HP: ${Math.max(0,Math.round(bowser.health))}`, 12, 20);
    ctx.fillText(`Mario HP: ${Math.max(0,Math.round(mario.health))}`, 12, 40);
  }

  function loop(now) {
    const dt = Math.min(0.033, (now - lastTime)/1000);
    lastTime = now;
    update(dt);
    draw();
    requestAnimationFrame(loop);
  }

  function showMessage(text) {
    setTimeout(()=>alert(text), 50);
  }

  // Input handlers (robust: record both e.key and e.code)
  window.addEventListener('keydown', (e) => {
    if (e.code === "Space") {
      keys.Space = true;
      e.preventDefault();
    }
    if (e.key) keys[e.key] = true;
    if (e.code) keys[e.code] = true;
  });
  window.addEventListener('keyup', (e) => {
    if (e.code === "Space") keys.Space = false;
    if (e.key) keys[e.key] = false;
    if (e.code) keys[e.code] = false;
  });

  restartBtn.addEventListener('click', startGame);

  function startGame() {
    // reset state
    bowser.x = 120; bowser.y = groundY - bowser.h; bowser.vx = bowser.vy = 0; bowser.health = bowser.maxHealth;
    mario.x = 700; mario.y = groundY - mario.h; mario.vx = mario.vy = 0; mario.health = mario.maxHealth; mario.direction = -1; mario.aiTimer = 0.6;
    fireballs.length = 0;
    elapsed = 0;
    running = true;
    lastTime = performance.now();
    updateHealthBars();
  }

  // Tweak UI health bar initial
  updateHealthBars();

  // Start loop
  requestAnimationFrame(loop);

  // Auto-start for convenience
  // startGame(); // uncomment to auto-start on load
})();
