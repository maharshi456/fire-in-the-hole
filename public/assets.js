const assets = {};

function loadImage(name, src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.src = src;
    img.onload = () => {
      assets[name] = img;
      resolve(img);
    };
    img.onerror = () => {
      assets[name] = null;
      resolve(null);
    };
  });
}

async function loadAssets() {
  await Promise.all([
    loadImage("floor", "/assets/floor.png"),
    loadImage("wall", "/assets/wall.png"),
    loadImage("player", "/assets/player.png"),
    loadImage("rifle", "/assets/rifle.png"),
    loadImage("pistol", "/assets/pistol.png"),
    loadImage("bazooka", "/assets/bazooka.png"),
    loadImage("pickup", "/assets/pickup.png"),
  ]);
}

window.assets = assets;
window.loadAssets = loadAssets;
