(() => {
  "use strict";

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;
  const $ = (id) => document.getElementById(id);

  const ui = {
    time: $("time"), distance: $("distance"), speed: $("speed"),
    bestTop: $("bestTop"), menu: $("menuOverlay"), end: $("endOverlay"),
    start: $("startBtn"), restart: $("restartBtn"),
    resultTitle: $("resultTitle"), resultCopy: $("resultCopy"),
    resultEyebrow: $("resultEyebrow"), resultIcon: $("resultIcon"),
    finalDistance: $("finalDistance"), finalTime: $("finalTime"), finalBest: $("finalBest")
  };

  const ROAD = { left: 72, right: 408, width: 336 };
  const LANES = [128, 212, 296, 380];
  const keys = { left: false, right: false, gas: false, brake: false };
  let state = "menu";
  let player, traffic, particles, elapsed, distance, speed, roadOffset, spawnTimer, lastTime;
  let best = Number(localStorage.getItem("webRacerBest") || 0);
  ui.bestTop.textContent = `${best} m`;

  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  const formatTime = (seconds) => {
    const s = Math.floor(seconds);
    return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  };

  function resetGame() {
    player = { x: W / 2, y: H - 135, w: 42, h: 76, color: "#47e6df", tilt: 0 };
    traffic = [];
    particles = [];
    elapsed = 0; distance = 0; speed = 150;
    roadOffset = 0; spawnTimer = 0.7; lastTime = 0;
    Object.keys(keys).forEach(k => keys[k] = false);
    updateHud();
  }

  function startGame() {
    resetGame();
    state = "playing";
    ui.menu.classList.add("hidden");
    ui.end.classList.add("hidden");
    requestAnimationFrame(loop);
  }

  function finishGame() {
    if (state !== "playing") return;
    state = "over";
    const newBest = Math.max(best, Math.floor(distance));
    const record = newBest > best;
    best = newBest;
    localStorage.setItem("webRacerBest", String(best));
    ui.bestTop.textContent = `${best} m`;
    ui.resultEyebrow.textContent = "RUN COMPLETE";
    ui.resultIcon.textContent = "💥";
    ui.resultTitle.textContent = "Oops! Crash!";
    ui.resultCopy.textContent = `Kamu menempuh ${Math.floor(distance)} meter. Coba lagi dan hindari lalu lintas!`;
    if (record) ui.resultCopy.textContent += " Rekor baru!";
    ui.finalDistance.textContent = `${Math.floor(distance)} m`;
    ui.finalTime.textContent = formatTime(elapsed);
    ui.finalBest.textContent = `${best} m`;
    ui.end.classList.remove("hidden");
    draw();
  }

  function updateHud() {
    ui.time.textContent = formatTime(elapsed || 0);
    ui.distance.innerHTML = `${Math.floor(distance || 0)} <small>m</small>`;
    ui.speed.innerHTML = `${Math.round(speed || 0)} <small>km/h</small>`;
  }

  function roundedRect(c, x, y, w, h, r) {
    c.beginPath();
    c.roundRect(x, y, w, h, r);
    c.fill();
  }

  function drawRoad(dt = 0) {
    ctx.fillStyle = "#233c35";
    ctx.fillRect(0, 0, W, H);
    // roadside texture
    for (let y = -40 + (roadOffset * 0.7) % 80; y < H; y += 80) {
      ctx.fillStyle = "#2c4a3d";
      ctx.fillRect(20, y, 34, 28);
      ctx.fillRect(W - 54, y + 28, 34, 28);
      ctx.fillStyle = "#385644";
      ctx.beginPath(); ctx.arc(35, y + 13, 9, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(W - 36, y + 42, 10, 0, Math.PI * 2); ctx.fill();
    }
    // road
    const grad = ctx.createLinearGradient(ROAD.left, 0, ROAD.right, 0);
    grad.addColorStop(0, "#343d49"); grad.addColorStop(.5, "#424b57"); grad.addColorStop(1, "#343d49");
    ctx.fillStyle = grad;
    ctx.fillRect(ROAD.left, 0, ROAD.width, H);
    // edge lines
    ctx.fillStyle = "#dce3e7";
    ctx.fillRect(ROAD.left + 5, 0, 3, H);
    ctx.fillRect(ROAD.right - 8, 0, 3, H);
    // lane markers
    ctx.fillStyle = "#d8dde0";
    const dashH = 43, gap = 34;
    for (let x of [ROAD.left + 88, ROAD.left + 172, ROAD.left + 256]) {
      for (let y = -dashH + (roadOffset % (dashH + gap)); y < H; y += dashH + gap) {
        ctx.globalAlpha = .65;
        ctx.fillRect(x - 2, y, 4, dashH);
      }
    }
    ctx.globalAlpha = 1;
    // subtle road sheen
    ctx.fillStyle = "#ffffff08";
    ctx.fillRect(W / 2 - 1, 0, 2, H);
  }

  function drawCar(car, isPlayer = false) {
    ctx.save();
    ctx.translate(car.x, car.y);
    ctx.rotate(car.tilt || 0);
    // shadow
    ctx.fillStyle = "#0007";
    roundedRect(ctx, -car.w / 2 + 3, -car.h / 2 + 5, car.w, car.h, 9);
    // wheels
    ctx.fillStyle = "#111820";
    roundedRect(ctx, -car.w / 2 - 4, -car.h / 2 + 12, 7, 19, 3);
    roundedRect(ctx, car.w / 2 - 3, -car.h / 2 + 12, 7, 19, 3);
    roundedRect(ctx, -car.w / 2 - 4, car.h / 2 - 30, 7, 19, 3);
    roundedRect(ctx, car.w / 2 - 3, car.h / 2 - 30, 7, 19, 3);
    // body
    ctx.fillStyle = car.color;
    roundedRect(ctx, -car.w / 2, -car.h / 2, car.w, car.h, 9);
    // front / rear details
    ctx.fillStyle = isPlayer ? "#b9fff6" : "#d8e0e7";
    roundedRect(ctx, -car.w / 2 + 5, -car.h / 2 + 5, car.w - 10, 6, 3);
    ctx.fillStyle = "#172a3b";
    roundedRect(ctx, -car.w / 2 + 6, -car.h / 2 + 17, car.w - 12, 20, 5);
    ctx.fillStyle = "#253e50";
    roundedRect(ctx, -car.w / 2 + 7, 5, car.w - 14, 18, 4);
    ctx.fillStyle = isPlayer ? "#f5ffad" : "#ffcf9d";
    roundedRect(ctx, -car.w / 2 + 4, car.h / 2 - 9, 8, 4, 2);
    roundedRect(ctx, car.w / 2 - 12, car.h / 2 - 9, 8, 4, 2);
    if (isPlayer) {
      ctx.shadowColor = "#47e6df";
      ctx.shadowBlur = 15;
      ctx.strokeStyle = "#b9fff6";
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.roundRect(-car.w / 2 + .5, -car.h / 2 + .5, car.w - 1, car.h - 1, 9); ctx.stroke();
    }
    ctx.restore();
  }

  function spawnTraffic() {
    const lane = Math.floor(Math.random() * LANES.length);
    const colors = ["#ff6b6b", "#ffc857", "#a78bfa", "#f472b6", "#e5e7eb"];
    const x = LANES[lane] + (Math.random() * 12 - 6);
    traffic.push({ x, y: -90, w: 40, h: 72, color: colors[Math.floor(Math.random() * colors.length)], passed: false });
  }

  function collides(a, b) {
    const ax = a.x - a.w * .36, ar = a.x + a.w * .36;
    const ay = a.y - a.h * .39, ab = a.y + a.h * .39;
    const bx = b.x - b.w * .36, br = b.x + b.w * .36;
    const by = b.y - b.h * .39, bb = b.y + b.h * .39;
    return ax < br && ar > bx && ay < bb && ab > by;
  }

  function update(dt) {
    elapsed += dt;
    const targetSpeed = keys.brake ? 85 : keys.gas ? 245 : 165;
    speed += (targetSpeed - speed) * Math.min(1, dt * 2.3);
    const moveSpeed = 300 + speed * .42;
    if (keys.left) player.x -= moveSpeed * dt;
    if (keys.right) player.x += moveSpeed * dt;
    player.x = clamp(player.x, ROAD.left + 28, ROAD.right - 28);
    player.tilt += ((keys.left ? -.12 : keys.right ? .12 : 0) - player.tilt) * Math.min(1, dt * 8);

    roadOffset = (roadOffset + (speed * 1.5 + 80) * dt) % 1000;
    distance += speed * dt / 3.6;
    spawnTimer -= dt;
    if (spawnTimer <= 0) {
      spawnTraffic();
      spawnTimer = Math.max(.52, 1.15 - elapsed * .008) + Math.random() * .35;
    }

    for (const car of traffic) {
      car.y += (speed * 1.65 + 105) * dt;
      if (!car.passed && car.y > player.y + 45) {
        car.passed = true;
        distance += 12;
      }
      if (collides(player, car)) {
        finishGame();
        return;
      }
    }
    traffic = traffic.filter(car => car.y < H + 100);
    updateHud();
  }

  function draw() {
    drawRoad();
    traffic.forEach(car => drawCar(car));
    if (player) drawCar(player, true);
    // vignette
    const v = ctx.createLinearGradient(0, 0, 0, H);
    v.addColorStop(0, "#00000018"); v.addColorStop(.5, "#00000000"); v.addColorStop(1, "#00000022");
    ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
  }

  function loop(timestamp) {
    if (state !== "playing") return;
    const dt = Math.min((timestamp - (lastTime || timestamp)) / 1000, .035);
    lastTime = timestamp;
    update(dt);
    draw();
    if (state === "playing") requestAnimationFrame(loop);
  }

  function setKey(key, value) {
    const k = key.toLowerCase();
    if (k === "arrowleft" || k === "a") keys.left = value;
    if (k === "arrowright" || k === "d") keys.right = value;
    if (k === "arrowup" || k === "w") keys.gas = value;
    if (k === "arrowdown" || k === "s") keys.brake = value;
  }

  window.addEventListener("keydown", e => {
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", " "].includes(e.key)) e.preventDefault();
    if (e.key === " " && state !== "playing") startGame();
    setKey(e.key, true);
  });
  window.addEventListener("keyup", e => setKey(e.key, false));
  window.addEventListener("blur", () => Object.keys(keys).forEach(k => keys[k] = false));

  function bindHold(id, key) {
    const el = $(id);
    const down = e => { e.preventDefault(); keys[key] = true; };
    const up = e => { e.preventDefault(); keys[key] = false; };
    el.addEventListener("pointerdown", down);
    ["pointerup", "pointerleave", "pointercancel"].forEach(type => el.addEventListener(type, up));
  }
  bindHold("leftBtn", "left");
  bindHold("rightBtn", "right");
  bindHold("gasBtn", "gas");
  bindHold("brakeBtn", "brake");

  ui.start.addEventListener("click", startGame);
  ui.restart.addEventListener("click", startGame);

  resetGame();
  draw();
})();