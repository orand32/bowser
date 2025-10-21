// Robust Bowser vs Mario game - improved startup and error handling
(() => {
  try {
    const canvas = document.getElementById('game');
    if (!canvas) throw new Error('Canvas element with id="game" not found. Make sure index.html contains <canvas id="game">');
    const ctx = canvas.getContext('2d');

    // logical resolution
    const WIDTH = 960, HEIGHT = 540;
    canvas.width = WIDTH; canvas.height = HEIGHT;

    // UI elements (guarded)
    const bowserHealthEl = document.getElementById('bowserHealth');
    const marioHealthEl = document.getElementById('marioHealth');
    const timeEl = document.getElementById('time');
    const restartBtn = document.getElementById('restart');

    // Assets
    const assets = {
      bowser: new Image(),
      bowserSheet: new Image(),
      mario: new Image(),
      fireball: new Image(),
    };
    // default asset paths (place files under assets/)
    assets.bowser.src = 'assets/bowser.png';
    assets.bowserSheet.src = 'assets/bowser_sheet.png';
    assets.mario.src = 'assets/mario.png';
    assets.fireball.src = 'assets/fireball.png';

    function loadAllImages(list, cb) {
      const imgs = Object.values(list);
      let left = imgs.length;
      if (!left) return cb();
      imgs.forEach(img => {
        if (img.complete && img.naturalWidth) {
          left--; if (left === 0) cb(); return;
        }
        img.onload = () => { left--; if (left === 0) cb(); };
        img.onerror = () => { console.warn('Failed to load image', img.src); left--; if (left === 0) cb(); };
      });
    }

    // game state
    let keys = {}, lastTime = performance.now(), elapsed = 0, running = false;
    let ending = null; const particles = [];

    function clamp(x,a,b){return Math.max(a,Math.min(b,x));}
    class Entity{
      constructor(x,y,w,h,color,label,spriteKey){this.x=x;this.y=y;this.w=w;this.h=h;this.color=color;this.label=label;this.spriteKey=spriteKey||null;this.vx=0;this.vy=0;this.onGround=false;this.facing=1;}
      rect(){return {x:this.x,y:this.y,w:this.w,h:this.h};}
      intersects(o){return !(this.x+this.w < o.x || this.x > o.x+o.w || this.y+this.h < o.y || this.y > o.y+o.h);}    }

    const gravity = 1600;
    const marioJumpForce = 520;
    const bowserJumpForce = marioJumpForce * 2;

    const bowser = new Entity(120, HEIGHT-130, 96, 96, '#b23','Bowser','bowser'); bowser.maxHealth=100; bowser.health=bowser.maxHealth;
    // optional sheet config — adjust to your sheet
    bowser.sheet = { imgKey: 'bowserSheet', frameW:96, frameH:96, frames:6, frameIndex:0, fps:10, t:0 };

    const mario = new Entity(700, HEIGHT-130, 56, 88, '#2a9','Mario','mario'); mario.maxHealth=60; mario.health=mario.maxHealth; mario.direction=-1; mario.aiTimer=0;

    const fireballs = [];
    function spawnFireball(x,y,dir){ fireballs.push({x:x,y:y,r:12,vx:520*dir,life:2.5,owner:'bowser'}); }

    const groundY = HEIGHT - 40;

    function spawnConfetti(x,y,n){ for(let i=0;i<n;i++){ const angle=Math.random()*Math.PI*2; const speed=120+Math.random()*200; particles.push({ x:x+(Math.random()*30-15), y:y+(Math.random()*10-5), vx:Math.cos(angle)*speed, vy:-Math.abs(Math.sin(angle))*(80+Math.random()*160)-40, life:1.2+Math.random()*1.4, size:4+Math.random()*6, color:['#ff4d4d','#ffca3a','#8ac926','#1982c4','#6a4c93'][Math.floor(Math.random()*5)] }); } }
    function updateParticles(dt){ for(let i=particles.length-1;i>=0;i--){ const p=particles[i]; p.life-=dt; if(p.life<=0){particles.splice(i,1);continue;} p.vy+=gravity*0.4*dt; p.x+=p.vx*dt; p.y+=p.vy*dt; p.vx*=0.995; p.vy*=0.995; } }

    function updateEnding(dt){ if(!ending) return; ending.t+=dt; updateParticles(dt); if(ending.type==='bowserWin' && ending.t>=ending.duration){ ending=null; showMessage('You won! Mario defeated.'); } }

    function advanceSheetFrame(e,dt){ if(!e.sheet) return; const img=assets[e.sheet.imgKey]; if(!img||!img.complete||!img.naturalWidth) return; e.sheet.t+=dt; const period=1/(e.sheet.fps||8); if(e.sheet.t>=period){ e.sheet.t-=period; e.sheet.frameIndex=(e.sheet.frameIndex+1)%(e.sheet.frames||1); } }

    function drawEntityWithSprite(e){ // sheet
      if(e.sheet && assets[e.sheet.imgKey] && assets[e.sheet.imgKey].complete && assets[e.sheet.imgKey].naturalWidth){ const img=assets[e.sheet.imgKey]; const fi=e.sheet.frameIndex||0; const sx=fi*e.sheet.frameW; const sy=0; const sw=e.sheet.frameW; const sh=e.sheet.frameH; const dw=e.w; const dh=e.h; const facing=e.facing||1; if(facing===-1){ ctx.save(); ctx.translate(e.x+dw/2,0); ctx.scale(-1,1); ctx.drawImage(img,sx,sy,sw,sh,-dw/2,e.y,dw,dh); ctx.restore(); } else { ctx.drawImage(img,sx,sy,sw,sh,e.x,e.y,dw,dh); } return; }
      // single image
      if(e.spriteKey && assets[e.spriteKey] && assets[e.spriteKey].complete && assets[e.spriteKey].naturalWidth){ const img=assets[e.spriteKey]; const facing=e.facing||1; if(facing===-1){ ctx.save(); ctx.translate(e.x+e.w/2,0); ctx.scale(-1,1); ctx.drawImage(img,-e.w/2,e.y,e.w,e.h); ctx.restore(); } else { ctx.drawImage(img,e.x,e.y,e.w,e.h); } return; }
      // Mario face fallback
      if(e.label==='Mario'){
        ctx.fillStyle=e.color; ctx.fillRect(e.x,e.y,e.w,e.h);
        const faceX=e.x + e.w*0.12, faceW=e.w*0.76, faceY=e.y+e.h*0.18, faceH=e.h*0.48;
        // skin
        ctx.fillStyle='#f1c27d'; ctx.fillRect(faceX,faceY,faceW,faceH);
        const eyeY=faceY + faceH*0.28; const leftEyeX=faceX+faceW*0.28; const rightEyeX=faceX+faceW*0.72; const eyeR=Math.max(2,e.w*0.05);
        ctx.fillStyle='#000'; ctx.beginPath(); ctx.arc(leftEyeX,eyeY,eyeR,0,Math.PI*2); ctx.fill(); ctx.beginPath(); ctx.arc(rightEyeX,eyeY,eyeR,0,Math.PI*2); ctx.fill();
        // eyebrows
        ctx.strokeStyle='#3a2b1f'; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(leftEyeX-eyeR-2,eyeY-8); ctx.lineTo(leftEyeX+eyeR+2,eyeY-10); ctx.stroke(); ctx.beginPath(); ctx.moveTo(rightEyeX-eyeR-2,eyeY-10); ctx.lineTo(rightEyeX+eyeR+2,eyeY-8); ctx.stroke();
        // nose
        ctx.fillStyle='#d9a76d'; ctx.beginPath(); ctx.arc(e.x+e.w/2, faceY+faceH*0.55, Math.max(2,e.w*0.04),0,Math.PI*2); ctx.fill();
        // smile
        ctx.strokeStyle='#7b4b2b'; ctx.lineWidth=2; ctx.beginPath(); ctx.arc(e.x+e.w/2, faceY+faceH*0.78, faceW*0.22,0.15*Math.PI,0.85*Math.PI); ctx.stroke();
        return;
      }
      // generic fallback
      ctx.fillStyle=e.color; ctx.fillRect(e.x,e.y,e.w,e.h); ctx.fillStyle='#fff'; ctx.font='14px sans-serif'; ctx.textAlign='center'; ctx.fillText(e.label,e.x+e.w/2,e.y+e.h/2+5);
    }

    function update(dt){
      if(!running && !ending) return; if(ending){ updateEnding(dt); return; }
      elapsed += dt;
      const speed=260; if(keys.ArrowLeft||keys.a||keys.KeyA) bowser.vx=-speed; else if(keys.ArrowRight||keys.d||keys.KeyD) bowser.vx=speed; else bowser.vx=0;
      if((keys.ArrowUp||keys.w||keys.KeyW) && bowser.onGround){ bowser.vy=-bowserJumpForce; bowser.onGround=false; }
      if((keys.Space||keys[' ']) && (!bowser.cooldown || bowser.cooldown<=0)){ const dir=bowser.facing||1; spawnFireball(bowser.x+bowser.w/2+dir*50,bowser.y+bowser.h/2,dir); bowser.cooldown=0.45; }
      if(bowser.cooldown>0) bowser.cooldown -= dt; if(bowser.vx<0) bowser.facing=-1; else if(bowser.vx>0) bowser.facing=1;
      bowser.vy += gravity*dt; bowser.x += bowser.vx*dt; bowser.y += bowser.vy*dt; if(bowser.y+bowser.h>=groundY){ bowser.y=groundY-bowser.h; bowser.vy=0; bowser.onGround=true;} else bowser.onGround=false; bowser.x = clamp(bowser.x,8,WIDTH-bowser.w-8);
      mario.aiTimer -= dt; const marioSpeed=140; if(mario.aiTimer<=0){ const choice=Math.random(); if(choice<0.6){ if(mario.x<120) mario.direction=1; else if(mario.x>WIDTH-120) mario.direction=-1; else mario.direction=(Math.random()<0.5)?-1:1; } else if(choice<0.9){ mario.direction=(bowser.x<mario.x)?-1:1; } else { if(mario.onGround) mario.vy=-marioJumpForce; } mario.aiTimer = 0.8 + Math.random()*1.2; }
      mario.vx = mario.direction * marioSpeed; mario.vy += gravity*dt; mario.x += mario.vx*dt; mario.y += mario.vy*dt; if(mario.y + mario.h >= groundY){ mario.y = groundY - mario.h; mario.vy = 0; mario.onGround = true; } else mario.onGround = false; mario.x = clamp(mario.x,8,WIDTH-mario.w-8);
      if(mario.intersects(bowser) && (!mario.attackCooldown || mario.attackCooldown <= 0)){ const dmg = 8 + Math.floor(Math.random()*8); bowser.health -= dmg; bowser.health = Math.max(0,bowser.health); mario.attackCooldown = 0.9; bowser.vx += (bowser.x < mario.x ? -1 : 1) * 180; }
      if(mario.attackCooldown > 0) mario.attackCooldown -= dt;
      for(let i=fireballs.length-1;i>=0;i--){ const f = fireballs[i]; f.life -= dt; f.x += f.vx*dt; if(f.x > mario.x && f.x < mario.x + mario.w && f.y > mario.y && f.y < mario.y + mario.h){ mario.health -= 18; if(mario.health < 0) mario.health = 0; fireballs.splice(i,1); continue; } if(f.life<=0 || f.x < -50 || f.x > WIDTH + 50 || f.y > HEIGHT + 200 || f.y < -200) fireballs.splice(i,1); }
      // Advance sheet frame
      advanceSheetFrame(bowser, dt);
      if(mario.health <= 0){ ending = { type: 'bowserWin', t:0, duration:3.5 }; running = false; spawnConfetti(bowser.x + bowser.w/2, bowser.y + bowser.h/2 - 20, 50); } else if(bowser.health <= 0){ running = false; showMessage('You lost. Bowser was defeated.'); }
      updateHealthBars(); timeEl && (timeEl.textContent = (elapsed).toFixed(1));
    }

    function updateHealthBars(){ if(!bowserHealthEl || !marioHealthEl) return; const bPct = clamp(bowser.health / bowser.maxHealth,0,1); const mPct = clamp(mario.health / mario.maxHealth,0,1); bowserHealthEl.style.setProperty('--pct',bPct); marioHealthEl.style.setProperty('--pct',mPct); bowserHealthEl.style.background='#333'; marioHealthEl.style.background='#333'; bowserHealthEl.style.position='relative'; marioHealthEl.style.position='relative'; bowserHealthEl.innerHTML = `<div style="position:absolute;left:0;top:0;bottom:0;width:${Math.round(bPct*100)}%;background:linear-gradient(90deg,#ffb86b,#ff4a4a)"></div>`; marioHealthEl.innerHTML = `<div style="position:absolute;left:0;top:0;bottom:0;width:${Math.round(mPct*100)}%;background:linear-gradient(90deg,#7fffd4,#2ad58f)"></div>`; }

    function draw(){
      try{
        ctx.clearRect(0,0,WIDTH,HEIGHT);
        ctx.fillStyle = '#6b8e23'; ctx.fillRect(0,groundY,WIDTH,HEIGHT-groundY);
        ctx.fillStyle = 'rgba(0,0,0,0.06)'; ctx.fillRect(640,groundY-200,220,200);
        if(ending && ending.type==='bowserWin'){
          ctx.globalAlpha = 0.45; drawEntityWithSprite(mario); ctx.globalAlpha = 1;
          for(const p of particles){ ctx.fillStyle = p.color; ctx.fillRect(p.x,p.y,p.size,p.size); }
          const p = Math.min(1,ending.t/ending.duration); const bob = Math.sin(p*Math.PI*2)*8*(1-p*0.6); const scale = 1 + 0.35 * Math.sin(ending.t * 8) * (1 - p*0.2);
          const cx = bowser.x + bowser.w/2; const cy = bowser.y + bowser.h/2 + bob - (p < 0.25 ? (1-p/0.25)*40 : 0);
          ctx.save(); ctx.translate(cx,cy); ctx.scale(scale,scale);
          if(assets.bowser && assets.bowser.complete && assets.bowser.naturalWidth){ ctx.drawImage(assets.bowser,-bowser.w/2,-bowser.h/2,bowser.w,bowser.h); } else if(assets.bowserSheet && assets.bowserSheet.complete && assets.bowserSheet.naturalWidth){ const fi = bowser.sheet.frameIndex||0; const sx = fi * bowser.sheet.frameW; ctx.drawImage(assets.bowserSheet,sx,0,bowser.sheet.frameW,bowser.sheet.frameH,-bowser.w/2,-bowser.h/2,bowser.w,bowser.h); } else { ctx.fillStyle = bowser.color; ctx.fillRect(-bowser.w/2,-bowser.h/2,bowser.w,bowser.h); ctx.fillStyle='#fff'; ctx.font='16px sans-serif'; ctx.textAlign='center'; ctx.fillText('Bowser',0,6); }
          ctx.restore(); for(const p2 of particles){ ctx.fillStyle = p2.color; ctx.fillRect(p2.x,p2.y,p2.size,p2.size); }
          ctx.fillStyle='#ffcc00'; ctx.font='28px sans-serif'; ctx.textAlign='center'; ctx.fillText('BOWSER WINS!',WIDTH/2,60); return; }
        drawEntityWithSprite(bowser); drawEntityWithSprite(mario);
        for(const f of fireballs){ if(assets.fireball && assets.fireball.complete && assets.fireball.naturalWidth){ const size = f.r*2; ctx.drawImage(assets.fireball,f.x-f.r,f.y-f.r,size,size); } else { ctx.beginPath(); ctx.fillStyle='#ff8c1a'; ctx.arc(f.x,f.y,f.r,0,Math.PI*2); ctx.fill(); ctx.strokeStyle='rgba(0,0,0,0.12)'; ctx.stroke(); } }
        ctx.fillStyle='#111'; ctx.font='14px sans-serif'; ctx.textAlign='left'; ctx.fillText(`Bowser HP: ${Math.max(0,Math.round(bowser.health))}`,12,20); ctx.fillText(`Mario HP: ${Math.max(0,Math.round(mario.health))}`,12,40);
      } catch(err){ console.error('Draw error',err); }
    }

    function loop(now){ try{ const dt = Math.min(0.033,(now-lastTime)/1000); lastTime = now; update(dt); draw(); requestAnimationFrame(loop); } catch(e){ console.error('Loop error',e); } }

    function showMessage(text){ setTimeout(()=>alert(text),50); }

    // input
    window.addEventListener('keydown',(e)=>{ if(e.code==='Space'){ keys.Space=true; e.preventDefault(); } if(e.key) keys[e.key]=true; if(e.code) keys[e.code]=true; });
    window.addEventListener('keyup',(e)=>{ if(e.code==='Space') keys.Space=false; if(e.key) keys[e.key]=false; if(e.code) keys[e.code]=false; });

    if(restartBtn){ restartBtn.addEventListener('click', startGame); } else { console.warn('Restart button not found (id="restart"). Start game from console with startGame()'); }

    function startGame(){ try{ bowser.x=120; bowser.y=groundY-bowser.h; bowser.vx=bowser.vy=0; bowser.health=bowser.maxHealth; mario.x=700; mario.y=groundY-mario.h; mario.vx=mario.vy=0; mario.health=mario.maxHealth; mario.direction=-1; mario.aiTimer=0.6; fireballs.length=0; particles.length=0; ending=null; elapsed=0; running=true; lastTime=performance.now(); if(bowser.sheet){ bowser.sheet.frameIndex=0; bowser.sheet.t=0; } updateHealthBars(); console.log('Game started'); } catch(err){ console.error('startGame error',err); } }

    // expose for debugging
    window._GAME = { assets, bowser, mario, fireballs, particles, startGame };

    updateHealthBars(); requestAnimationFrame(loop); loadAllImages(assets,()=>{ console.log('Assets load attempt finished; starting game.'); startGame(); });

  } catch(err){ console.error('Fatal init error', err); alert('Game failed to initialize. Open the console for details.'); }
})();
