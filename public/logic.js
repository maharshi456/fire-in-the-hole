$(function () {
  let mouseX = 0;
  let mouseY = 0; // Track the mouse position
  const keysPressed = {};
  let players = {};
  let bullets = [];
  let weapons = [];
  let mysteryBox = null;
  let damageNumbers = [];
  let alerts = [];
  let killFeed = [];
  const pendingWeaponPickups = new Set();
  let respawnAt = 0;
  let nextShotAt = 0;
  let gameStarted = false;
  let player = {
    id: "",
    x: 10,
    y: 10,
    width: 20,
    height: 20,
    color: "lightblue",
    speed: 10,
    bullets: [],
    alive: false,
    joined: false,
    score: 0,
    lives: 3,
    maxHealth: 100,
    health: 100,
    name: "Player",
    weapon: null,
    ability: null,
    armorUntil: 0,
    berserkerUntil: 0,
    spawnProtectedUntil: 0,
    lastShotAt: 0,
    gameOver: false,
  };
  let playerId = "";

  const ammo = {
    speed: 10,
    size: 5,
  };
  const barriers = [
    { x: 260, y: 170, width: 130, height: 24 },
    { x: 820, y: 150, width: 28, height: 150 },
    { x: 420, y: 500, width: 28, height: 120 },
  ];
  const berserkerWeightMultiplier = 0.35;
  const berserkerCooldownMultiplier = 0.65;
  const berserkerBulletSpeedMultiplier = 1.15;
  const playerSpriteSize = 54;
  const weaponSpriteSize = 60;
  const pickupSpriteSize = 72;
  const respawnDelay = 2000;
  const sessionId =
    sessionStorage.getItem("fireInTheHoleSessionId") ||
    `${Date.now()}-${Math.random()}`;
  sessionStorage.setItem("fireInTheHoleSessionId", sessionId);
  const defaultPlayerName = `Player ${Math.floor(Math.random() * 900) + 100}`;
  let playerName =
    sessionStorage.getItem("fireInTheHolePlayerName") || defaultPlayerName;

  const socket = io(window.location.origin);
  const canvas = document.getElementById("BasePlate");
  const ctx = canvas.getContext("2d");
  const startScreen = document.getElementById("StartScreen");
  const joinForm = document.getElementById("JoinForm");
  const playerNameInput = document.getElementById("PlayerName");
  const joinButton = document.getElementById("JoinButton");
  // Set initial canvas dimensions
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight - 4;
  playerNameInput.value = playerName;

  socket.on("connect", () => {
    playerId = socket.id;
    player.id = playerId;
  });

  socket.on("playerMove", (playerData) => {
    if (playerData.id !== playerId) {
      players[playerData.id] = playerData; // Only update other players
    }
  });

  socket.on("bulletFired", (bulletData) => {
    bullets.push(bulletData);
  });

  socket.on("bulletRemoved", (bulletId) => {
    bullets = bullets.filter((bullet) => bullet.id !== bulletId);
  });

  socket.on("bulletBlocked", (bulletId) => {
    bullets = bullets.filter((bullet) => bullet.id !== bulletId);
  });

  socket.on("weaponPickedUp", (data) => {
    weapons = weapons.filter((weapon) => weapon.id !== data.weaponId);
    pendingWeaponPickups.delete(data.weaponId);
    players[data.player.id] = data.player;

    if (data.player.id === playerId) {
      syncLocalPlayer(data.player);
      nextShotAt = 0;
    }
  });

  socket.on("weaponSpawned", (weapon) => {
    weapons.push(weapon);
  });

  socket.on("mysteryBoxSpawned", (box) => {
    mysteryBox = box;
    addAlert("Mystery Box spawned at center!");
  });

  socket.on("mysteryBoxOpening", (box) => {
    mysteryBox = box;
  });

  socket.on("mysteryBoxOpenCancelled", (data) => {
    mysteryBox = data.box;
  });

  socket.on("mysteryBoxClaimed", (data) => {
    mysteryBox = null;
    players[data.player.id] = data.player;
    addAlert(`${data.player.name} found ${data.ability.name}`);

    if (data.player.id === playerId) {
      syncLocalPlayer(data.player);
    }
  });

  socket.on("damageDealt", (data) => {
    damageNumbers.push({
      x: data.x,
      y: data.y,
      damage: data.damage,
      createdAt: Date.now(),
      duration: 800,
    });
  });

  socket.on("shotRejected", (data) => {
    if (data.bulletId) {
      bullets = bullets.filter((bullet) => bullet.id !== data.bulletId);
    }

    nextShotAt = data.nextShotAt || Date.now();
  });

  socket.on("playerUpdated", (updatedPlayer) => {
    players[updatedPlayer.id] = updatedPlayer;

    if (updatedPlayer.id === playerId) {
      syncLocalPlayer(updatedPlayer);
      if (updatedPlayer.joined && !updatedPlayer.gameOver) {
        hideStartScreen();
      }
    }
  });

  socket.on("playerKilled", (data) => {
    Object.assign(players, data.players);
    addKillFeed(data.killerId, data.killedId);

    if (players[playerId]) {
      syncLocalPlayer(players[playerId]);
    }

    if (data.killedId === playerId) {
      respawnAt = player.lives > 0 ? Date.now() + respawnDelay : 0;
    }
  });

  socket.on("playerGameOver", (data) => {
    Object.assign(players, data.players);

    if (data.playerId === playerId && players[playerId]) {
      syncLocalPlayer(players[playerId]);
      respawnAt = 0;
      showStartScreen("Play Again");
    }
  });

  socket.on("playerRespawned", (respawnedPlayer) => {
    players[respawnedPlayer.id] = respawnedPlayer;

    if (respawnedPlayer.id === playerId) {
      syncLocalPlayer(respawnedPlayer);
      respawnAt = 0;
      nextShotAt = 0;
    }
  });

  socket.on("playerDisconnected", (disconnectedId) => {
    delete players[disconnectedId];
  });

  socket.on("gameState", (state) => {
    if (state.selfId) {
      playerId = state.selfId;
      player.id = playerId;
    }

    // Update all players and bullets from server
    Object.assign(players, state.players);
    bullets = state.bullets; // Add global bullets array
    weapons = state.weapons || [];
    mysteryBox = state.mysteryBox || null;

    if (players[playerId]) {
      syncLocalPlayer(players[playerId]);
    }
  });

  joinForm.addEventListener("submit", (event) => {
    event.preventDefault();
    startGame();
  });

  setInterval(() => {
    socket.emit("playerHeartbeat");
  }, 5000);

  function syncLocalPlayer(playerData) {
    player = {
      ...player,
      ...playerData,
      color: "lightblue",
      name: playerName,
    };
    players[playerId] = player;
  }

  function startGame() {
    const submittedName = playerNameInput.value.trim().slice(0, 16);
    playerName = submittedName || defaultPlayerName;
    sessionStorage.setItem("fireInTheHolePlayerName", playerName);
    playerNameInput.value = playerName;
    nextShotAt = 0;
    respawnAt = 0;
    pendingWeaponPickups.clear();
    socket.emit("playerJoined", { name: playerName, sessionId });
  }

  function showStartScreen(buttonText = "Play") {
    gameStarted = false;
    joinButton.textContent = buttonText;
    startScreen.classList.remove("hidden");
    playerNameInput.focus();
  }

  function hideStartScreen() {
    gameStarted = true;
    joinButton.textContent = "Play";
    startScreen.classList.add("hidden");
  }

  function addAlert(message) {
    alerts.push({
      message,
      createdAt: Date.now(),
      duration: 3000,
    });
  }

  function addKillFeed(killerId, killedId) {
    const killerName = players[killerId]?.name || "Unknown";
    const killedName = players[killedId]?.name || "Unknown";

    killFeed.unshift({
      message: `${killerName} eliminated ${killedName}`,
      createdAt: Date.now(),
      duration: 5000,
    });

    killFeed = killFeed.slice(0, 5);
  }

  function movement() {
    if (!gameStarted || !player.alive || player.gameOver) return; // Prevent movement if dead

    const previousX = player.x;
    const previousY = player.y;
    const movementSpeed = getMovementSpeed();

    if (keysPressed["ArrowUp"] || keysPressed["w"]) player.y -= movementSpeed;
    if (keysPressed["ArrowDown"] || keysPressed["s"]) player.y += movementSpeed;
    if (keysPressed["ArrowLeft"] || keysPressed["a"]) player.x -= movementSpeed;
    if (keysPressed["ArrowRight"] || keysPressed["d"])
      player.x += movementSpeed;

    player.x = Math.max(0, Math.min(canvas.width - player.width, player.x));
    player.y = Math.max(0, Math.min(canvas.height - player.height, player.y));

    if (
      barriers.some((barrier) => checkCollision(player, barrier)) ||
      (mysteryBox && checkCollision(player, mysteryBox))
    ) {
      player.x = previousX;
      player.y = previousY;
    }

    checkWeaponPickup();

    // Emit player's new position to the server
    socket.emit("playerMove", player);

    // Render the local player's movement
    players[playerId] = player; // Update local player position in players object
  }

  // Adjust canvas size on window resize
  window.addEventListener("resize", () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight - 4;
  });

  // Track key presses
  $(document).on("keydown", function (e) {
    keysPressed[e.key] = true;

    if (e.key === "r" || e.key === "R") {
      if (gameStarted && !player.gameOver) {
        reloadWeapon();
      }
    }

    if ((e.key === "e" || e.key === "E") && gameStarted) {
      socket.emit("mysteryBoxOpenStart");
    }

    if ((e.key === "q" || e.key === "Q") && gameStarted) {
      socket.emit("abilityUse");
    }
  });

  $(document).on("keyup", function (e) {
    keysPressed[e.key] = false;

    if (e.key === "e" || e.key === "E") {
      socket.emit("mysteryBoxOpenCancel");
    }
  });

  $(document).on("click", function (e) {
    shootBullet(e);
  });

  $(document).on("mousemove", function (e) {
    const rect = canvas.getBoundingClientRect();
    mouseX = e.clientX - rect.left;
    mouseY = e.clientY - rect.top;
  });

  // Shoot bullet
  function shootBullet() {
    if (!gameStarted) return;
    if (!player.alive || player.gameOver) return; // Prevent shooting if dead
    if (!player.weapon) return;
    const hasBerserker = player.berserkerUntil > Date.now();
    if (
      !hasBerserker &&
      player.weapon.reloading &&
      Date.now() < player.weapon.reloadCompleteAt
    )
      return;
    if (!hasBerserker && player.weapon.magazine <= 0) return;
    if (Date.now() < nextShotAt) return;

    const angle = Math.atan2(
      mouseY - (player.y + player.height / 2), // Use center of player for angle calculation
      mouseX - (player.x + player.width / 2),
    );
    const bulletSpeed =
      (player.weapon.bulletSpeed || ammo.speed) *
      (hasBerserker ? berserkerBulletSpeedMultiplier : 1);
    const cooldown =
      (player.weapon.cooldown || 500) *
      (hasBerserker ? berserkerCooldownMultiplier : 1);
    const speedX = bulletSpeed * Math.cos(angle);
    const speedY = bulletSpeed * Math.sin(angle);

    const bullet = {
      id: `${playerId}-${Date.now()}-${Math.random()}`,
      x: player.x + player.width / 2,
      y: player.y + player.height / 2,
      speedX: speedX,
      speedY: speedY,
      damage: player.weapon.damage,
      playerId: playerId,
    };

    bullets.push(bullet);
    if (!hasBerserker) {
      player.weapon.magazine -= 1;
    }
    players[playerId] = player;
    nextShotAt = Date.now() + cooldown;
    socket.emit("bulletFired", bullet); // Emit the bullet data to other clients
  }

  function reloadWeapon() {
    if (!player.alive || player.gameOver || !player.weapon) return;
    if (player.weapon.reloading) return;
    if (player.weapon.magazine >= player.weapon.magazineSize) return;
    if (player.weapon.reserveAmmo <= 0) return;

    player.weapon.reloading = true;
    player.weapon.reloadStartedAt = Date.now();
    player.weapon.reloadCompleteAt =
      player.weapon.reloadStartedAt + player.weapon.reloadTime;
    players[playerId] = player;
    socket.emit("weaponReload");
  }

  // Draw player, bullets, indicator, and update canvas
  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawBackground();

    // Draw all players
    Object.values(players).forEach((p) => {
      // Only draw player if alive
      if (p.joined && p.alive) {
        drawShadow(p.x + p.width / 2, p.y + p.height / 2);
        drawPlayerSprite(p);
        drawAbilityEffects(p);
        drawEquippedWeapon(p);
        drawReloadProgress(p);
        drawLowAmmoWarning(p);
        drawPlayerName(p);
        drawHealthBar(p);
      }
    });

    drawBarriers();
    drawWeaponPickups();
    drawMysteryBox();

    // Draw bullets
    bullets.forEach((bullet) => {
      ctx.fillStyle = "red";
      ctx.fillRect(bullet.x, bullet.y, ammo.size, ammo.size);
    });

    drawHud();
    drawLeaderboard();
    drawDamageNumbers();
    drawAlerts();
    drawKillFeed();

    if (player.gameOver) {
      drawGameOverMessage();
    } else if (!player.alive) {
      drawRespawnMessage();
    }
  }

  function drawBackground() {
    if (assets.floor) {
      const floorCanvas = document.createElement("canvas");
      const floorContext = floorCanvas.getContext("2d");
      floorCanvas.width = 410;
      floorCanvas.height = 410;
      floorContext.drawImage(assets.floor, 0, 0, floorCanvas.width, floorCanvas.height);
      const pattern = ctx.createPattern(floorCanvas, "repeat");
      ctx.fillStyle = pattern || "#d6d6d6";
    } else {
      ctx.fillStyle = "#d6d6d6";
    }

    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  function update() {
    if (gameStarted && player.alive && !player.gameOver) {
      movement(); // Only local movement
    }

    updateBullets();
    updateFeedback();
    draw();
  }

  function updateFeedback() {
    const now = Date.now();
    damageNumbers = damageNumbers.filter(
      (item) => now - item.createdAt < item.duration,
    );
    alerts = alerts.filter((item) => now - item.createdAt < item.duration);
    killFeed = killFeed.filter((item) => now - item.createdAt < item.duration);
  }

  function updateBullets() {
    const hitBulletIds = new Set();

    bullets.forEach((bullet) => {
      bullet.x += bullet.speedX;
      bullet.y += bullet.speedY;

      if (barriers.some((barrier) => checkCollision(bullet, barrier))) {
        hitBulletIds.add(bullet.id);
        socket.emit("bulletBlocked", bullet.id);
        return;
      }

      if (
        bullet.id &&
        bullet.playerId !== playerId &&
        checkCollision(bullet, player)
      ) {
        hitBulletIds.add(bullet.id);
        socket.emit("playerHit", {
          targetId: playerId,
          attackerId: bullet.playerId,
          bulletId: bullet.id,
        });
      }
    });

    bullets = bullets.filter(
      (bullet) =>
        !hitBulletIds.has(bullet.id) &&
        bullet.x >= 0 &&
        bullet.x <= canvas.width &&
        bullet.y >= 0 &&
        bullet.y <= canvas.height,
    );
  }

  // Check for collision between two objects
  function checkCollision(first, second) {
    if ("alive" in second && (!second.alive || second.gameOver)) return false;

    const firstWidth = first.width || ammo.size;
    const firstHeight = first.height || ammo.size;
    const secondWidth = second.width || ammo.size;
    const secondHeight = second.height || ammo.size;

    return (
      first.x < second.x + secondWidth &&
      first.x + firstWidth > second.x &&
      first.y < second.y + secondHeight &&
      first.y + firstHeight > second.y
    );
  }

  function checkWeaponPickup() {
    weapons.forEach((weapon) => {
      if (
        !pendingWeaponPickups.has(weapon.id) &&
        checkCollision(player, weapon)
      ) {
        pendingWeaponPickups.add(weapon.id);
        socket.emit("weaponPickup", weapon.id);
      }
    });
  }

  function drawHud() {
    const displayId = playerId ? `${playerId.slice(0, 6)}...` : "joining";
    const healthPercent = Math.max(
      0,
      (player.health || 0) / (player.maxHealth || 100),
    );
    const weapon = player.weapon ? player.weapon.name : "None";
    const ammoPercent = player.weapon
      ? player.berserkerUntil > Date.now()
        ? 1
        : Math.max(0, player.weapon.magazine / player.weapon.magazineSize)
      : 0;
    const ammoText = player.weapon
      ? player.berserkerUntil > Date.now()
        ? "Unlimited"
        : `${player.weapon.magazine}/${player.weapon.reserveAmmo}`
      : "0/0";
    const ability = player.ability ? player.ability.name : "None";
    const x = 12;
    const y = 12;
    const width = 292;
    const height = 136;

    drawGlassPanel(x, y, width, height);

    ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
    ctx.font = "16px Arial";
    ctx.fillText(player.name || playerName, x + 14, y + 24);

    ctx.fillStyle = "rgba(255, 255, 255, 0.78)";
    ctx.font = "13px Arial";
    ctx.fillText(`ID ${displayId}`, x + 14, y + 44);
    ctx.fillText(`Score ${player.score || 0}`, x + 176, y + 24);
    ctx.fillText(`Lives ${player.lives || 0}`, x + 176, y + 44);

    drawMeter(x + 14, y + 60, width - 28, 10, healthPercent, "#2ecc71");
    drawMeter(x + 14, y + 88, width - 28, 10, ammoPercent, "#f1c40f");

    ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
    ctx.font = "13px Arial";
    ctx.fillText(
      `HP ${Math.round(player.health || 0)}/${player.maxHealth || 100}`,
      x + 14,
      y + 84,
    );
    ctx.fillText(`${weapon}  Ammo ${ammoText}`, x + 14, y + 112);
    ctx.fillText(`Ability ${ability}`, x + 14, y + 136);
  }

  function drawGlassPanel(x, y, width, height) {
    ctx.fillStyle = "rgba(12, 14, 18, 0.38)";
    drawRoundRect(x, y, width, height, 8);
    ctx.fill();

    ctx.strokeStyle = "rgba(255, 255, 255, 0.22)";
    ctx.lineWidth = 1;
    drawRoundRect(x + 0.5, y + 0.5, width - 1, height - 1, 8);
    ctx.stroke();
  }

  function drawMeter(x, y, width, height, percent, color) {
    ctx.fillStyle = "rgba(255, 255, 255, 0.18)";
    drawRoundRect(x, y, width, height, height / 2);
    ctx.fill();

    ctx.fillStyle = color;
    drawRoundRect(
      x,
      y,
      width * Math.max(0, Math.min(1, percent)),
      height,
      height / 2,
    );
    ctx.fill();
  }

  function drawRoundRect(x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);

    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + width - r, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + r);
    ctx.lineTo(x + width, y + height - r);
    ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    ctx.lineTo(x + r, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
  }

  function getMovementSpeed() {
    return Math.max(5.5, player.speed - getEffectiveWeaponWeight());
  }

  function getEffectiveWeaponWeight() {
    const hasBerserker = player.berserkerUntil > Date.now();
    return (
      (player.weapon?.weight || 0) *
      (hasBerserker ? berserkerWeightMultiplier : 1)
    );
  }

  function drawLeaderboard() {
    const visiblePlayers = Object.values(players).filter((p) => p.joined);
    const nameCounts = visiblePlayers.reduce((counts, p) => {
      const name = p.name || p.id;
      counts[name] = (counts[name] || 0) + 1;
      return counts;
    }, {});
    const sortedPlayers = visiblePlayers
      .sort((a, b) => (b.score || 0) - (a.score || 0))
      .slice(0, 5);
    const panelWidth = 220;
    const rowHeight = 22;
    const panelHeight = 34 + sortedPlayers.length * rowHeight;
    const x = Math.max(12, canvas.width - panelWidth - 12);
    const y = 12;

    drawGlassPanel(x, y, panelWidth, panelHeight);

    ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
    ctx.font = "15px Arial";
    ctx.fillText("Leaderboard", x + 12, y + 22);

    sortedPlayers.forEach((p, index) => {
      const rowY = y + 44 + index * rowHeight;
      const name = p.name || p.id;
      const label = nameCounts[name] > 1 ? `${name} ${p.id.slice(-4)}` : name;
      ctx.fillStyle = "rgba(255, 255, 255, 0.86)";
      ctx.font = "13px Arial";
      ctx.fillText(`${index + 1}. ${trimText(label, 15)}`, x + 12, rowY);
      ctx.fillText(`${p.score || 0}`, x + panelWidth - 28, rowY);
    });
  }

  function drawPlayerName(p) {
    const label = trimText(p.name || p.id, 12);
    ctx.fillStyle = "black";
    ctx.font = "12px Arial";
    ctx.textAlign = "center";
    ctx.fillText(label, p.x + p.width / 2, p.y - 12);
    ctx.textAlign = "left";
  }

  function drawShadow(x, y, radius = 18) {
    ctx.beginPath();
    ctx.fillStyle = "rgba(0, 0, 0, 0.25)";
    ctx.ellipse(x, y + 16, radius, 7, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawPlayerSprite(p) {
    const centerX = p.x + p.width / 2;
    const centerY = p.y + p.height / 2;

    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.rotate(getPlayerAngle(p));

    if (assets.player) {
      ctx.drawImage(
        assets.player,
        -playerSpriteSize / 2,
        -playerSpriteSize / 2,
        playerSpriteSize,
        playerSpriteSize
      );
    } else {
      ctx.fillStyle = p.id === playerId ? p.color : "red";
      ctx.fillRect(-p.width / 2, -p.height / 2, p.width, p.height);
    }

    ctx.restore();
  }

  function getPlayerAngle(p) {
    if (p.id !== playerId) return 0;

    return Math.atan2(
      mouseY - (p.y + p.height / 2),
      mouseX - (p.x + p.width / 2),
    );
  }

  function drawHealthBar(p) {
    const barWidth = 32;
    const barHeight = 4;
    const x = p.x + p.width / 2 - barWidth / 2;
    const y = p.y - 8;
    const healthPercent = Math.max(0, (p.health || 0) / (p.maxHealth || 100));

    ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
    ctx.fillRect(x, y, barWidth, barHeight);
    ctx.fillStyle = healthPercent > 0.5 ? "limegreen" : "orange";
    ctx.fillRect(x, y, barWidth * healthPercent, barHeight);
  }

  function drawBarriers() {
    barriers.forEach((barrier) => {
      drawObstacle(barrier);
    });
  }

  function drawObstacle(obstacle) {
    if (assets.wall) {
      ctx.drawImage(
        assets.wall,
        obstacle.x,
        obstacle.y,
        obstacle.width,
        obstacle.height,
      );
      return;
    }

    ctx.fillStyle = "#3d3d3d";
    ctx.fillRect(obstacle.x, obstacle.y, obstacle.width, obstacle.height);

    ctx.fillStyle = "#5b5b5b";
    ctx.fillRect(obstacle.x, obstacle.y, obstacle.width, 4);
  }

  function drawWeaponPickups() {
    weapons.forEach((weapon) => {
      drawWeaponIcon(weapon.x, weapon.y, weapon.width, weapon.height, weapon);
    });
  }

  function drawWeaponIcon(x, y, width, height, weapon) {
    const weaponImage = {
      pistol: assets.pistol,
      rifle: assets.rifle,
      blaster: assets.bazooka,
    }[weapon.type];
    const centerX = x + width / 2;
    const centerY = y + height / 2;

    if (weaponImage) {
      ctx.save();
      ctx.shadowColor = weapon.color || "#8b5cf6";
      ctx.shadowBlur = 10;
      ctx.drawImage(
        weaponImage,
        centerX - weaponSpriteSize / 2,
        centerY - weaponSpriteSize / 2,
        weaponSpriteSize,
        weaponSpriteSize
      );
      ctx.restore();
      return;
    }

    ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
    ctx.fillRect(x - 2, y - 2, width + 4, height + 4);

    ctx.fillStyle = weapon.color || "#222";

    if (weapon.type === "rifle") {
      ctx.fillRect(x + 3, y + 10, width - 4, 5);
      ctx.fillRect(x + 12, y + 14, 5, 7);
      ctx.fillRect(x + width - 4, y + 8, 5, 3);
      return;
    }

    if (weapon.type === "blaster") {
      ctx.beginPath();
      ctx.arc(x + width / 2, y + height / 2, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(x + width - 7, y + 10, 8, 5);
      return;
    }

    ctx.fillRect(x + 5, y + 8, 14, 6);
    ctx.fillRect(x + 8, y + 14, 5, 7);
    ctx.fillRect(x + 17, y + 7, 5, 3);
  }

  function drawMysteryBox() {
    if (!mysteryBox) return;

    drawPickup(mysteryBox);

    ctx.fillStyle = "black";
    ctx.font = "12px Arial";
    ctx.textAlign = "center";
    ctx.fillText(
      "Hold E",
      mysteryBox.x + mysteryBox.width / 2,
      mysteryBox.y + mysteryBox.height + 16,
    );
    ctx.textAlign = "left";

    if (!mysteryBox.openedBy) return;

    const startedAt = mysteryBox.openStartedAt;
    const duration = Math.max(1, mysteryBox.openCompleteAt - startedAt);
    const progress = Math.min(
      1,
      Math.max(0, (Date.now() - startedAt) / duration),
    );
    const centerX = mysteryBox.x + mysteryBox.width / 2;
    const centerY = mysteryBox.y + mysteryBox.height / 2;
    const radius = mysteryBox.width / 2 + 9;

    ctx.strokeStyle = "rgba(0, 0, 0, 0.35)";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = "#f1c40f";
    ctx.beginPath();
    ctx.arc(
      centerX,
      centerY,
      radius,
      -Math.PI / 2,
      -Math.PI / 2 + Math.PI * 2 * progress,
    );
    ctx.stroke();
    ctx.lineWidth = 1;
  }

  function drawPickup(pickup) {
    const centerX = pickup.x + pickup.width / 2;
    const centerY = pickup.y + pickup.height / 2;

    ctx.save();
    ctx.shadowColor = "#8b5cf6";
    ctx.shadowBlur = 18;

    if (assets.pickup) {
      ctx.drawImage(
        assets.pickup,
        centerX - pickupSpriteSize / 2,
        centerY - pickupSpriteSize / 2,
        pickupSpriteSize,
        pickupSpriteSize
      );
    } else {
      ctx.fillStyle = "#6f42c1";
      ctx.fillRect(pickup.x, pickup.y, pickup.width, pickup.height);
      ctx.fillStyle = "white";
      ctx.font = "22px Arial";
      ctx.fillText("?", pickup.x + 12, pickup.y + 26);
    }

    ctx.restore();
  }

  function drawEquippedWeapon(p) {
    if (!p.weapon) return;

    const angle =
      p.id === playerId
        ? Math.atan2(
            mouseY - (p.y + p.height / 2),
            mouseX - (p.x + p.width / 2),
          )
        : 0;
    const startX = p.x + p.width / 2;
    const startY = p.y + p.height / 2;
    const endX = startX + Math.cos(angle) * 18;
    const endY = startY + Math.sin(angle) * 18;

    ctx.strokeStyle = p.weapon.color || "black";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(endX, endY);
    ctx.stroke();
    ctx.fillStyle = p.weapon.color || "black";
    ctx.beginPath();
    ctx.arc(endX, endY, p.weapon.type === "blaster" ? 4 : 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 1;
  }

  function drawAbilityEffects(p) {
    const now = Date.now();
    const centerX = p.x + p.width / 2;
    const centerY = p.y + p.height / 2;

    if (p.spawnProtectedUntil > now) {
      ctx.strokeStyle = "#2f80ed";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(
        centerX,
        centerY,
        Math.max(p.width, p.height) / 2 + 15,
        0,
        Math.PI * 2,
      );
      ctx.stroke();
      ctx.lineWidth = 1;
    }

    if (p.armorUntil > now) {
      ctx.strokeStyle = "#8e44ad";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(
        centerX,
        centerY,
        Math.max(p.width, p.height) / 2 + 5,
        0,
        Math.PI * 2,
      );
      ctx.stroke();
      ctx.lineWidth = 1;
    }

    if (p.berserkerUntil > now) {
      ctx.strokeStyle = "#f1c40f";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(
        centerX,
        centerY,
        Math.max(p.width, p.height) / 2 + 10,
        0,
        Math.PI * 2,
      );
      ctx.stroke();
      ctx.lineWidth = 1;
    }
  }

  function drawReloadProgress(p) {
    const weapon = p.weapon;

    if (!weapon?.reloading || Date.now() >= weapon.reloadCompleteAt) return;

    const startedAt =
      weapon.reloadStartedAt || weapon.reloadCompleteAt - weapon.reloadTime;
    const duration = Math.max(1, weapon.reloadCompleteAt - startedAt);
    const progress = Math.min(
      1,
      Math.max(0, (Date.now() - startedAt) / duration),
    );
    const centerX = p.x + p.width / 2;
    const centerY = p.y + p.height / 2;
    const radius = Math.max(p.width, p.height) / 2 + 9;

    ctx.strokeStyle = "rgba(0, 0, 0, 0.25)";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = weapon.color || "#ffffff";
    ctx.beginPath();
    ctx.arc(
      centerX,
      centerY,
      radius,
      -Math.PI / 2,
      -Math.PI / 2 + Math.PI * 2 * progress,
    );
    ctx.stroke();
    ctx.lineWidth = 1;
  }

  function drawLowAmmoWarning(p) {
    if (p.id !== playerId || !p.weapon || p.weapon.reloading) return;
    if (p.berserkerUntil > Date.now()) return;

    const lowAmmoLimit = Math.max(2, Math.ceil(p.weapon.magazineSize * 0.25));
    if (p.weapon.magazine > lowAmmoLimit) return;

    const label = p.weapon.magazine === 0 ? "Reload!" : "Low ammo";
    ctx.fillStyle = p.weapon.magazine === 0 ? "#c0392b" : "#d35400";
    ctx.font = "13px Arial";
    ctx.textAlign = "center";
    ctx.fillText(label, p.x + p.width / 2, p.y - 28);
    ctx.textAlign = "left";
  }

  function drawDamageNumbers() {
    const now = Date.now();

    damageNumbers.forEach((item) => {
      const age = now - item.createdAt;
      const progress = age / item.duration;

      ctx.globalAlpha = Math.max(0, 1 - progress);
      ctx.fillStyle = "#c0392b";
      ctx.font = "18px Arial";
      ctx.textAlign = "center";
      ctx.fillText(`-${item.damage}`, item.x, item.y - 16 - progress * 18);
      ctx.textAlign = "left";
      ctx.globalAlpha = 1;
    });
  }

  function drawAlerts() {
    alerts.forEach((alert, index) => {
      const y = 26 + index * 28;
      const width = Math.min(420, canvas.width - 32);
      const x = canvas.width / 2 - width / 2;

      ctx.fillStyle = "rgba(0, 0, 0, 0.68)";
      ctx.fillRect(x, y, width, 24);
      ctx.fillStyle = "white";
      ctx.font = "15px Arial";
      ctx.textAlign = "center";
      ctx.fillText(alert.message, canvas.width / 2, y + 17);
      ctx.textAlign = "left";
    });
  }

  function drawKillFeed() {
    const x = 12;
    const y = canvas.height - 24 - killFeed.length * 24;

    killFeed.forEach((item, index) => {
      ctx.fillStyle = "rgba(0, 0, 0, 0.58)";
      ctx.fillRect(x, y + index * 24, 260, 22);
      ctx.fillStyle = "white";
      ctx.font = "13px Arial";
      ctx.fillText(item.message, x + 8, y + 15 + index * 24);
    });
  }

  function trimText(text, maxLength) {
    if (text.length <= maxLength) return text;
    return `${text.slice(0, maxLength - 3)}...`;
  }

  function drawRespawnMessage() {
    const secondsLeft = Math.max(1, Math.ceil((respawnAt - Date.now()) / 1000));
    const message = `Respawning in ${secondsLeft}...`;

    ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
    ctx.fillRect(canvas.width / 2 - 150, canvas.height / 2 - 38, 300, 76);

    ctx.fillStyle = "black";
    ctx.font = "28px Arial";
    ctx.fillText(message, canvas.width / 2 - 112, canvas.height / 2 + 10);
  }

  function drawGameOverMessage() {
    const message = "Game Over";
    const restartMessage = "Enter a username to play again";

    ctx.fillStyle = "rgba(0, 0, 0, 0.78)";
    ctx.fillRect(canvas.width / 2 - 180, canvas.height / 2 - 70, 360, 140);

    ctx.fillStyle = "white";
    ctx.font = "36px Arial";
    ctx.fillText(message, canvas.width / 2 - 90, canvas.height / 2 - 12);

    ctx.font = "20px Arial";
    ctx.fillText(restartMessage, canvas.width / 2 - 80, canvas.height / 2 + 30);
  }

  // Game loop
  function gameLoop() {
    update();
    requestAnimationFrame(gameLoop);
  }

  // Start the game after image assets are ready.
  loadAssets().then(() => {
    gameLoop();
  });
});
