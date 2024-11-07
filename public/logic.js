$(function () {
  let mouseX = 0;
  let mouseY = 0; // Track the mouse position
  const keysPressed = {};
  const players = {};
  const playerId = Math.random().toString(36).substring(2, 15);
  const player = {
    id: playerId,
    x: 10,
    y: 10,
    width: 20,
    height: 20,
    color: "lightblue",
    speed: 10,
    bullets: [],
  };

  const ammo = {
    speed: 10,
    size: 5,
  };

  const socket = io("https://fire-in-the-hole.onrender.com");
  const canvas = document.getElementById("BasePlate");
  const ctx = canvas.getContext("2d");

  // Set initial canvas dimensions
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight - 4;

  socket.on("playerMove", (data) => {
    players[data.id] = data; // Update player position in players object
  });

  socket.on("bulletFired", (bulletData) => {
    // Add the received bullet to the bullets array so it can be rendered
    player.bullets.push(bulletData);
  });

  function movement() {
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

  // Shoot bullet
  function shootBullet() {
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
    };

    player.bullets.push(bullet);

    // Emit the bullet data to other clients
    socket.emit("bulletFired", bullet);
  }

  // Draw player, bullets, indicator, and update canvas
  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw all players
    Object.values(players).forEach((p) => {
      ctx.fillStyle = p.id === playerId ? p.color : "red"; // Local player is light blue, others are red
      ctx.fillRect(p.x, p.y, p.width, p.height);
    });

    // Draw bullets
    player.bullets.forEach((bullet) => {
      ctx.fillStyle = "red";
      ctx.fillRect(bullet.x, bullet.y, ammo.size, ammo.size);
    });

    // Draw indicator line from player to mouse position
    // drawArrow(player.x, player.y, player.width, player.height, mouseX, mouseY);
  }

  // function drawArrow(playerX, playerY, playerWidth, playerHeight, toX, toY) {
  //   const arrowLength = 30; // Arrow shaft length
  //   const angle = Math.atan2(
  //     toY - (playerY + playerHeight / 2),
  //     toX - (playerX + playerWidth / 2)
  //   ); // Calculate angle between player center and mouse

  //   // Calculate the start point of the arrow (after the player rectangle)
  //   const playerCenterX = playerX + playerWidth / 2;
  //   const playerCenterY = playerY + playerHeight / 2;

  //   // Offset the starting point by moving along the angle from the center of the player to just beyond the player's edge
  //   const offsetX = (playerWidth / 2) * Math.cos(angle);
  //   const offsetY = (playerHeight / 2) * Math.sin(angle);
  //   const startX = playerCenterX + offsetX; // Start after the player rectangle
  //   const startY = playerCenterY + offsetY; // Start after the player rectangle

  //   // Calculate the end of the arrow shaft
  //   const endX = startX + arrowLength * Math.cos(angle);
  //   const endY = startY + arrowLength * Math.sin(angle);

  //   // Arrow shaft
  //   ctx.beginPath();
  //   ctx.moveTo(startX, startY);
  //   ctx.lineTo(endX, endY);
  //   ctx.strokeStyle = "black"; // Arrow color
  //   ctx.lineWidth = 2;
  //   ctx.stroke();
  // }

  function update() {
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

      // if (checkCollision(bullet, enemy)) {
      //   console.log("Bullet hit the enemy!");
      //   enemy = {};
      //   // Remove the bullet after hitting the enemy
      //   player.bullets.splice(index, 1);
      // }
    });

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
    update();
    requestAnimationFrame(gameLoop);
  }

  // Start the game
  gameLoop();
});
