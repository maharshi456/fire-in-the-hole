const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 1212;
let players = {};
let weapons = [];
let mysteryBox = null;
let mysterySpawnTimer = null;
let mysteryOpenTimer = null;
const STARTING_LIVES = 3;
const RESPAWN_DELAY = 2000;
const MAX_HEALTH = 100;
const BULLET_DAMAGE = 25;
const MAP_WIDTH = 1050;
const MAP_HEIGHT = 650;
const PLAYER_SIZE = 20;
const WEAPON_COUNT = 4;
const MIN_WEAPON_DISTANCE = 160;
const WEAPON_RESPAWN_DELAY = 6000;
const MYSTERY_BOX_SIZE = 36;
const MYSTERY_BOX_OPEN_TIME = 3000;
const MYSTERY_BOX_MIN_SPAWN = 25000;
const MYSTERY_BOX_MAX_SPAWN = 45000;
const MYSTERY_BOX_RANGE = 70;
const ARMOR_DURATION = 8000;
const ARMOR_DAMAGE_MULTIPLIER = 0.55;
const BERSERKER_DURATION = 6000;
const BERSERKER_COOLDOWN_MULTIPLIER = 0.65;
const barriers = [
  { x: 260, y: 170, width: 130, height: 24 },
  { x: 820, y: 150, width: 28, height: 150 },
  { x: 420, y: 500, width: 28, height: 120 },
];
const weaponTypes = [
  {
    type: "pistol",
    name: "Pistol",
    damage: 25,
    bulletSpeed: 10,
    cooldown: 450,
    weight: 3.0,
    magazineSize: 8,
    totalAmmo: 32,
    reloadTime: 1100,
    color: "#2f80ed",
  },
  {
    type: "rifle",
    name: "Rifle",
    damage: 20,
    bulletSpeed: 14,
    cooldown: 180,
    weight: 2.5,
    magazineSize: 18,
    totalAmmo: 72,
    reloadTime: 1500,
    color: "#27ae60",
  },
  {
    type: "blaster",
    name: "Blaster",
    damage: 35,
    bulletSpeed: 8,
    cooldown: 850,
    weight: 4.2,
    magazineSize: 4,
    totalAmmo: 16,
    reloadTime: 1900,
    color: "#f2994a",
  },
];
const abilityTypes = [
  {
    type: "armor",
    name: "Armor",
    description: "Reduced incoming damage for 8s",
    color: "#8e44ad",
  },
  {
    type: "heal",
    name: "Heal",
    description: "Restores 50 health",
    color: "#e74c3c",
  },
  {
    type: "berserker",
    name: "Berserker",
    description: "Unlimited ammo for 6s",
    color: "#f1c40f",
  },
];

server.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
  pingInterval: 5000,
  pingTimeout: 5000,
});

// Serve files from the public folder
app.use(express.static(path.join(__dirname, "public")));

function sanitizeName(name) {
  if (typeof name !== "string") return "Player";

  const cleanName = name.trim().replace(/\s+/g, " ").slice(0, 16);
  return cleanName || "Player";
}

function createPlayer(id) {
  const spawn = getRandomOpenPosition(PLAYER_SIZE, PLAYER_SIZE);

  return {
    id,
    x: spawn.x,
    y: spawn.y,
    width: PLAYER_SIZE,
    height: PLAYER_SIZE,
    color: "red",
    speed: 10,
    bullets: [],
    alive: false,
    joined: false,
    score: 0,
    lives: STARTING_LIVES,
    maxHealth: MAX_HEALTH,
    health: MAX_HEALTH,
    name: "Player",
    weapon: null,
    ability: null,
    armorUntil: 0,
    berserkerUntil: 0,
    lastShotAt: 0,
    gameOver: false,
    sessionId: null,
    lastSeen: Date.now(),
  };
}

function getRandomOpenPosition(width, height, existingWeapons = weapons) {
  for (let attempt = 0; attempt < 80; attempt++) {
    const position = {
      x: Math.floor(Math.random() * (MAP_WIDTH - width - 40)) + 20,
      y: Math.floor(Math.random() * (MAP_HEIGHT - height - 40)) + 20,
      width,
      height,
    };

    const hitsBarrier = barriers.some((barrier) => checkCollision(position, barrier));
    const hitsWeapon = existingWeapons.some(
      (weapon) => distanceBetween(position, weapon) < MIN_WEAPON_DISTANCE
    );

    if (!hitsBarrier && !hitsWeapon) {
      return { x: position.x, y: position.y };
    }
  }

  return { x: 40, y: 40 };
}

function spawnWeapon(existingWeapons = weapons) {
  const weaponType = weaponTypes[Math.floor(Math.random() * weaponTypes.length)];
  const position = getRandomOpenPosition(24, 24, existingWeapons);

  return {
    id: `weapon-${Date.now()}-${Math.random()}`,
    x: position.x,
    y: position.y,
    width: 24,
    height: 24,
    ...weaponType,
  };
}

function refillWeapons() {
  while (weapons.length < WEAPON_COUNT) {
    weapons.push(spawnWeapon(weapons));
  }
}

function checkCollision(first, second) {
  return (
    first.x < second.x + second.width &&
    first.x + first.width > second.x &&
    first.y < second.y + second.height &&
    first.y + first.height > second.y
  );
}

function distanceBetween(first, second) {
  const firstCenterX = first.x + first.width / 2;
  const firstCenterY = first.y + first.height / 2;
  const secondCenterX = second.x + second.width / 2;
  const secondCenterY = second.y + second.height / 2;

  return Math.hypot(firstCenterX - secondCenterX, firstCenterY - secondCenterY);
}

function resetPlayerForSpawn(player, options = {}) {
  const spawn = getRandomOpenPosition(player.width, player.height);

  return {
    ...player,
    x: spawn.x,
    y: spawn.y,
    alive: true,
    joined: true,
    score: options.resetScore ? 0 : player.score,
    lives: options.resetLives ? STARTING_LIVES : player.lives,
    health: MAX_HEALTH,
    maxHealth: MAX_HEALTH,
    weapon: null,
    ability: null,
    armorUntil: 0,
    berserkerUntil: 0,
    lastShotAt: 0,
    gameOver: false,
    bullets: [],
    lastSeen: Date.now(),
  };
}

function createEquippedWeapon(weapon) {
  const magazine = Math.min(weapon.magazineSize, weapon.totalAmmo);

  return {
    type: weapon.type,
    name: weapon.name,
    damage: weapon.damage,
    bulletSpeed: weapon.bulletSpeed,
    cooldown: weapon.cooldown,
    weight: weapon.weight,
    magazineSize: weapon.magazineSize,
    magazine,
    reserveAmmo: weapon.totalAmmo - magazine,
    reloadTime: weapon.reloadTime,
    reloading: false,
    reloadStartedAt: 0,
    reloadCompleteAt: 0,
    color: weapon.color,
  };
}

function scheduleMysteryBoxSpawn() {
  if (mysterySpawnTimer || mysteryBox) return;

  const delay =
    Math.floor(Math.random() * (MYSTERY_BOX_MAX_SPAWN - MYSTERY_BOX_MIN_SPAWN)) +
    MYSTERY_BOX_MIN_SPAWN;

  mysterySpawnTimer = setTimeout(() => {
    mysterySpawnTimer = null;
    spawnMysteryBox();
  }, delay);
}

function spawnMysteryBox() {
  mysteryBox = {
    id: `mystery-${Date.now()}-${Math.random()}`,
    x: Math.floor(MAP_WIDTH / 2 - MYSTERY_BOX_SIZE / 2),
    y: Math.floor(MAP_HEIGHT / 2 - MYSTERY_BOX_SIZE / 2),
    width: MYSTERY_BOX_SIZE,
    height: MYSTERY_BOX_SIZE,
    openedBy: null,
    openStartedAt: 0,
    openCompleteAt: 0,
    openDuration: MYSTERY_BOX_OPEN_TIME,
  };

  io.emit("mysteryBoxSpawned", mysteryBox);
}

function cancelMysteryBoxOpening(reason = "cancelled") {
  if (!mysteryBox?.openedBy) return;

  const playerId = mysteryBox.openedBy;
  mysteryBox.openedBy = null;
  mysteryBox.openStartedAt = 0;
  mysteryBox.openCompleteAt = 0;

  if (mysteryOpenTimer) {
    clearTimeout(mysteryOpenTimer);
    mysteryOpenTimer = null;
  }

  io.emit("mysteryBoxOpenCancelled", {
    box: mysteryBox,
    playerId,
    reason,
  });
}

function getRandomAbility() {
  return abilityTypes[Math.floor(Math.random() * abilityTypes.length)];
}

function isPlayerNearMysteryBox(player) {
  return mysteryBox && distanceBetween(player, mysteryBox) <= MYSTERY_BOX_RANGE;
}

refillWeapons();
scheduleMysteryBoxSpawn();

io.on("connection", (socket) => {
  console.log(`Player connected: ${socket.id}`);

  // Initialize new player
  players[socket.id] = createPlayer(socket.id);

  socket.emit("gameState", {
    players,
    bullets: [],
    weapons,
    mysteryBox,
    selfId: socket.id,
  });

  socket.on("playerJoined", (data) => {
    if (!players[socket.id]) return;

    const name = typeof data === "string" ? data : data?.name;
    const sessionId = typeof data === "object" ? data?.sessionId : null;

    Object.entries(players).forEach(([id, existingPlayer]) => {
      if (id !== socket.id && sessionId && existingPlayer.sessionId === sessionId) {
        delete players[id];
        io.emit("playerDisconnected", id);
      }
    });

    players[socket.id] = resetPlayerForSpawn(players[socket.id], {
      resetLives: true,
      resetScore: true,
    });
    players[socket.id].name = sanitizeName(name);
    players[socket.id].sessionId = sessionId;
    players[socket.id].joined = true;
    players[socket.id].lastSeen = Date.now();
    io.emit("playerUpdated", players[socket.id]);
  });

  // Send player move
  socket.on("playerMove", (playerData) => {
    if (players[socket.id]) {
      if (!players[socket.id].joined) return;

      players[socket.id].lastSeen = Date.now();
      const proposedPlayer = {
        ...players[socket.id],
        x: playerData.x,
        y: playerData.y,
      };

      if (!mysteryBox || !checkCollision(proposedPlayer, mysteryBox)) {
        players[socket.id].x = proposedPlayer.x;
        players[socket.id].y = proposedPlayer.y;
      }

      if (
        mysteryBox?.openedBy === socket.id &&
        !isPlayerNearMysteryBox(players[socket.id])
      ) {
        cancelMysteryBoxOpening("left-range");
      }

      socket.broadcast.emit("playerMove", players[socket.id]);
    }
  });

  // Receive and broadcast bullet
  socket.on("bulletFired", (bulletData) => {
    const shooter = players[socket.id];

    if (shooter && shooter.joined && shooter.alive && !shooter.gameOver && shooter.weapon) {
      const now = Date.now();
      const hasBerserker = shooter.berserkerUntil > now;
      const cooldown = (shooter.weapon.cooldown || 500) *
        (hasBerserker ? BERSERKER_COOLDOWN_MULTIPLIER : 1);

      if (!hasBerserker && shooter.weapon.reloading && now < shooter.weapon.reloadCompleteAt) {
        socket.emit("shotRejected", {
          bulletId: bulletData.id,
          reason: "reloading",
          nextShotAt: shooter.weapon.reloadCompleteAt,
        });
        return;
      }

      if (now - shooter.lastShotAt < cooldown) {
        socket.emit("shotRejected", {
          bulletId: bulletData.id,
          reason: "cooldown",
          nextShotAt: shooter.lastShotAt + cooldown,
        });
        return;
      }

      if (!hasBerserker && shooter.weapon.magazine <= 0) {
        socket.emit("shotRejected", {
          bulletId: bulletData.id,
          reason: "empty",
          nextShotAt: now,
        });
        io.emit("playerUpdated", shooter);
        return;
      }

      if (!hasBerserker) {
        shooter.weapon.magazine -= 1;
      }
      shooter.lastShotAt = now;
      shooter.lastSeen = Date.now();
      const bullet = {
        ...bulletData,
        playerId: socket.id,
        damage: shooter.weapon.damage,
        speedX: bulletData.speedX,
        speedY: bulletData.speedY,
      };
      shooter.bullets.push(bullet);
      io.emit("playerUpdated", shooter);
      socket.broadcast.emit("bulletFired", bullet);
    }
  });

  socket.on("weaponPickup", (weaponId) => {
    const player = players[socket.id];
    const weapon = weapons.find((item) => item.id === weaponId);

    if (!player || !player.joined || !weapon || !player.alive || player.gameOver) return;

    const pickupRange = Math.max(player.width, player.height) + 24;
    if (distanceBetween(player, weapon) > pickupRange) return;

    if (player.weapon && player.weapon.type === weapon.type) {
      player.weapon.reserveAmmo += weapon.totalAmmo;
      player.weapon.reloading = false;
      player.weapon.reloadStartedAt = 0;
      player.weapon.reloadCompleteAt = 0;
    } else {
      player.weapon = createEquippedWeapon(weapon);
    }
    player.lastSeen = Date.now();
    weapons = weapons.filter((item) => item.id !== weaponId);

    io.emit("weaponPickedUp", {
      weaponId,
      player: players[socket.id],
    });

    setTimeout(() => {
      const newWeapon = spawnWeapon(weapons);
      weapons.push(newWeapon);
      io.emit("weaponSpawned", newWeapon);
    }, WEAPON_RESPAWN_DELAY);
  });

  socket.on("weaponReload", () => {
    const player = players[socket.id];
    const weapon = player?.weapon;

    if (!player || !weapon || !player.alive || player.gameOver) return;
    if (
      weapon.reloading ||
      weapon.magazine >= weapon.magazineSize ||
      weapon.reserveAmmo <= 0
    ) {
      socket.emit("playerUpdated", player);
      return;
    }

    weapon.reloading = true;
    weapon.reloadStartedAt = Date.now();
    weapon.reloadCompleteAt = weapon.reloadStartedAt + weapon.reloadTime;
    player.lastSeen = Date.now();
    io.emit("playerUpdated", player);

    setTimeout(() => {
      const currentPlayer = players[socket.id];
      const currentWeapon = currentPlayer?.weapon;

      if (
        !currentPlayer ||
        !currentWeapon ||
        currentWeapon.type !== weapon.type ||
        !currentWeapon.reloading
      ) {
        return;
      }

      const neededAmmo = currentWeapon.magazineSize - currentWeapon.magazine;
      const loadedAmmo = Math.min(neededAmmo, currentWeapon.reserveAmmo);
      currentWeapon.magazine += loadedAmmo;
      currentWeapon.reserveAmmo -= loadedAmmo;
      currentWeapon.reloading = false;
      currentWeapon.reloadStartedAt = 0;
      currentWeapon.reloadCompleteAt = 0;
      currentPlayer.lastSeen = Date.now();
      io.emit("playerUpdated", currentPlayer);
    }, weapon.reloadTime);
  });

  socket.on("mysteryBoxOpenStart", () => {
    const player = players[socket.id];

    if (
      !mysteryBox ||
      !player ||
      !player.joined ||
      !player.alive ||
      player.gameOver ||
      player.ability ||
      mysteryBox.openedBy ||
      !isPlayerNearMysteryBox(player)
    ) {
      return;
    }

    mysteryBox.openedBy = socket.id;
    mysteryBox.openStartedAt = Date.now();
    mysteryBox.openCompleteAt = mysteryBox.openStartedAt + MYSTERY_BOX_OPEN_TIME;

    io.emit("mysteryBoxOpening", mysteryBox);

    mysteryOpenTimer = setTimeout(() => {
      const opener = players[socket.id];

      if (
        !mysteryBox ||
        mysteryBox.openedBy !== socket.id ||
        !opener ||
        !opener.alive ||
        opener.gameOver ||
        opener.ability ||
        !isPlayerNearMysteryBox(opener)
      ) {
        cancelMysteryBoxOpening("interrupted");
        return;
      }

      const ability = getRandomAbility();
      opener.ability = ability;
      opener.lastSeen = Date.now();

      const claimedBoxId = mysteryBox.id;
      mysteryBox = null;
      mysteryOpenTimer = null;

      io.emit("mysteryBoxClaimed", {
        boxId: claimedBoxId,
        playerId: socket.id,
        ability,
        player: opener,
      });

      scheduleMysteryBoxSpawn();
    }, MYSTERY_BOX_OPEN_TIME);
  });

  socket.on("mysteryBoxOpenCancel", () => {
    if (mysteryBox?.openedBy === socket.id) {
      cancelMysteryBoxOpening("released");
    }
  });

  socket.on("abilityUse", () => {
    const player = players[socket.id];
    const ability = player?.ability;

    if (!player || !ability || !player.joined || !player.alive || player.gameOver) return;

    const now = Date.now();

    if (ability.type === "heal") {
      player.health = Math.min(player.maxHealth, player.health + 50);
    }

    if (ability.type === "armor") {
      player.armorUntil = now + ARMOR_DURATION;
    }

    if (ability.type === "berserker") {
      player.berserkerUntil = now + BERSERKER_DURATION;

      if (player.weapon) {
        player.weapon.reloading = false;
        player.weapon.reloadStartedAt = 0;
        player.weapon.reloadCompleteAt = 0;
      }
    }

    player.ability = null;
    player.lastSeen = now;
    io.emit("playerUpdated", player);
  });

  socket.on("bulletBlocked", (bulletId) => {
    io.emit("bulletBlocked", bulletId);
  });

  socket.on("playerHit", ({ targetId, attackerId, bulletId }) => {
    const target = players[targetId];
    const attacker = players[attackerId];

    if (
      !target ||
      !attacker ||
      !target.alive ||
      target.gameOver ||
      targetId === attackerId ||
      socket.id !== targetId
    ) {
      return;
    }

    target.lastSeen = Date.now();
    let damage = Number.isFinite(Number(damageFromBullet(attacker, bulletId)))
      ? damageFromBullet(attacker, bulletId)
      : BULLET_DAMAGE;
    if (target.armorUntil > Date.now()) {
      damage *= ARMOR_DAMAGE_MULTIPLIER;
    }
    target.health = Math.max(0, target.health - damage);
    io.emit("bulletRemoved", bulletId);

    if (target.health > 0) {
      io.emit("playerUpdated", target);
      return;
    }

    handlePlayerDeath(targetId, attackerId);
  });

  function handlePlayerDeath(killedId, killerId) {
    const killedPlayer = players[killedId];
    const killer = players[killerId];

    if (killedPlayer && killedPlayer.alive && killedId !== killerId) {
      killedPlayer.alive = false;
      killedPlayer.lives = Math.max(0, killedPlayer.lives - 1);
      killedPlayer.health = 0;
      killedPlayer.gameOver = killedPlayer.lives === 0;
      killedPlayer.joined = !killedPlayer.gameOver;
      killedPlayer.ability = null;
      killedPlayer.armorUntil = 0;
      killedPlayer.berserkerUntil = 0;

      if (mysteryBox?.openedBy === killedId) {
        cancelMysteryBoxOpening("dead");
      }

      if (killer) {
        killer.score += 1;
      }

      io.emit("playerKilled", {
        killedId,
        killerId,
        players,
      });

      if (killedPlayer.gameOver) {
        io.emit("playerGameOver", {
          playerId: killedId,
          players,
        });
        return;
      }

      setTimeout(() => {
        if (!players[killedId]) return;

        players[killedId] = resetPlayerForSpawn(players[killedId]);

        io.emit("playerRespawned", players[killedId]);
      }, RESPAWN_DELAY);
    }
  }

  socket.on("playerRestart", () => {
    if (!players[socket.id]) return;

    players[socket.id] = resetPlayerForSpawn(players[socket.id], {
      resetLives: true,
      resetScore: true,
    });

    io.emit("playerRespawned", players[socket.id]);
  });

  socket.on("playerHeartbeat", () => {
    if (players[socket.id]) {
      players[socket.id].lastSeen = Date.now();
    }
  });

  function damageFromBullet(attacker, bulletId) {
    const bullet = attacker.bullets.find((item) => item.id === bulletId);
    return bullet?.damage || attacker.weapon?.damage || BULLET_DAMAGE;
  }

  // Handle disconnection
  socket.on("disconnect", () => {
    console.log(`Player disconnected: ${socket.id}`);
    if (mysteryBox?.openedBy === socket.id) {
      cancelMysteryBoxOpening("disconnected");
    }
    delete players[socket.id];
    socket.broadcast.emit("playerDisconnected", socket.id);
  });
});

setInterval(() => {
  const now = Date.now();

  Object.entries(players).forEach(([id, player]) => {
    if (now - player.lastSeen > 15000) {
      if (mysteryBox?.openedBy === id) {
        cancelMysteryBoxOpening("timeout");
      }
      delete players[id];
      io.emit("playerDisconnected", id);
    }
  });
}, 5000);
