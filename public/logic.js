$(function () {
  let mouseX = 0;
  let mouseY = 0; // Track the mouse position
  const keysPressed = {};
  const players = {};
  let player = {
    id: "",
    x: 10,
    y: 10,
    width: 20,
    height: 20,
    color: "lightblue",
    speed: 10,
    bullets: [],
    alive: true,
  };
  let playerId = "";

  const ammo = {
    speed: 10,
    size: 5,
  };

  const socket = io("https://fire-in-the-hole.onrender.com");
  const canvas = document.getElementById("BasePlate");
  const ctx = canvas.getContext("2d");
  const enemyColor = getRandomColor(); // Random color for enemies

  // Set initial canvas dimensions
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight - 4;

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
    if (bulletData.playerId !== playerId) {
      if (!players[bulletData.playerId]) return; // Player not found
      if (!players[bulletData.playerId].bullets)
        players[bulletData.playerId].bullets = [];
      players[bulletData.playerId].bullets.push(bulletData);
    }
  });

  socket.on("playerKilled", (killedId) => {
    if (players[killedId]) {
      players[killedId].alive = false;
    }
  });

  socket.on("playerDisconnected", (disconnectedId) => {
    delete players[disconnectedId];
  });

  function movement() {
    if (!player.alive) return; // Prevent movement if dead

    if (keysPressed["ArrowUp"] || keysPressed["w"]) player.y -= player.speed;
    if (keysPressed["ArrowDown"] || keysPressed["s"]) player.y += player.speed;
    if (keysPressed["ArrowLeft"] || keysPressed["a"]) player.x -= player.speed;
    if (keysPressed["ArrowRight"] || keysPressed["d"]) player.x += player.speed;

    // Emit player's new position to the serverXx
    socket.emit("playerMove", player);

    // Render the local player's movement
    players[playerId] = player; // Update local player position in players object

    // Render player's movement locally
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillRect(player.x, player.y, 20, 20);

    player.x = Math.max(0, Math.min(canvas.width - player.width, player.x));
    player.y = Math.max(0, Math.min(canvas.height - player.height, player.y));
  }

  // Adjust canvas size on window resize
  window.addEventListener("resize", () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight - 4;
  });

  // Track key presses
  $(document).on("keydown", function (e) {
    keysPressed[e.key] = true;
  });

  $(document).on("keyup", function (e) {
    keysPressed[e.key] = false;
  });

  $(document).on("click", function (e) {
    shootBullet(e);
  });

  $(document).on("mousemove", function (e) {
    const rect = canvas.getBoundingClientRect();
    mouseX = e.clientX - rect.left;
    mouseY = e.clientY - rect.top;
  });

  // Random Color Generator
  function getRandomColor() {
    var letters = "0123456789ABCDEF";
    var color = "#";
    for (var i = 0; i < 6; i++) {
      color += letters[Math.floor(Math.random() * 16)];
    }
    return color;
  }

  // Shoot bullet
  function shootBullet() {
    if (!player.alive) return; // Prevent shooting if dead
    const angle = Math.atan2(
      mouseY - (player.y + player.height / 2), // Use center of player for angle calculation
      mouseX - (player.x + player.width / 2)
    );
    const speedX = ammo.speed * Math.cos(angle);
    const speedY = ammo.speed * Math.sin(angle);

    const bullet = {
      x: player.x + player.width / 2,
      y: player.y + player.height / 2,
      speedX: speedX,
      speedY: speedY,
      playerId: playerId,
    };

    player.bullets.push(bullet);
    socket.emit("bulletFired", bullet); // Emit the bullet data to other clients
  }

  // Draw player, bullets, indicator, and update canvas
  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw all players
    Object.values(players).forEach((p) => {
      if (p.bullets) {
        p.bullets.forEach((bullet) => {
          ctx.fillStyle = "red";
          ctx.fillRect(bullet.x, bullet.y, ammo.size, ammo.size);
        });
      }

      // Only draw player if alive
      if (p.alive) {
        ctx.fillStyle = p.id === playerId ? p.color : "red";
        ctx.fillRect(p.x, p.y, p.width, p.height);
      }
    });
  }

  function update() {
    if (player.alive) {
      movement();

      player.bullets.forEach((bullet, index) => {
        bullet.x += bullet.speedX;
        bullet.y += bullet.speedY;

        // Remove bullets that go off screen
        if (
          bullet.x < 0 ||
          bullet.x > canvas.width ||
          bullet.y < 0 ||
          bullet.y > canvas.height
        ) {
          player.bullets.splice(index, 1);
        }

        // enemy get hit by player bullets
        Object.values(players).forEach((p) => {
          if (p.id !== playerId && checkCollision(bullet, p)) {
            socket.emit("playerKilled", p.id); // Notify server
            p.alive = false;
            // player.bullets.splice(index, 1);
          }
        });
      });

      // player got killed by enemy bullets
      Object.values(players).forEach((ele) => {
        if (ele.id !== playerId) {
          ele.bullets.forEach((bullet, index) => {
            if (checkCollision(bullet, player)) {
              console.log("im dead");
              // ele.bullets.splice(index, 1);
              player.alive = false; // Mark the local player as dead
            }
          });
        }
      });
    }

    draw();
  }

  // Check for collision between two objects\
  function checkCollision(bullet, enemy) {
    return (
      bullet.x < enemy.x + enemy.width &&
      bullet.x + ammo.size > enemy.x &&
      bullet.y < enemy.y + enemy.height &&
      bullet.y + ammo.size > enemy.y
    );
  }

  // Game loop
  function gameLoop() {
    if (!player.alive) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "black";
      ctx.font = "30px Arial";
      ctx.fillText("Game Over", canvas.width / 2 - 70, canvas.height / 2);
      return;
    } else {
      update();
      requestAnimationFrame(gameLoop);
    }
  }

  // Start the game
  gameLoop();
});
