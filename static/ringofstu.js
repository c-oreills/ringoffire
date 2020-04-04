// Base data setup ---------------------------------------------------------- //

const suits = ['C', 'D', 'H', 'S'];
const faces = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const cards = [];
const cursors = {};

// Socket handling ---------------------------------------------------------- //

var socket = io();
socket.on('connect', function() {
  socket.emit('register', window.location.search);
});

socket.on('deregister', function(name) {
  delete cursors[name];
});

socket.on('cursorupdate', function(e) {
  cursors[e.name] = e;
});

// Mouse handling ----------------------------------------------------------- //

const m = {
  x: innerWidth / 2,
  y: innerHeight / 2
};


window.onmousemove = function(e) {
  m.x = e.offsetX;
  m.y = e.offsetY;
  socket.emit('mousemove', m);
};


// Draw logic --------------------------------------------------------------- //

var cardBack = new Image();
cardBack.src = 'static/images/2B.svg';

// Orig image size 225x315: 2/3 scale
const cardWidth = 150;
const cardHeight = 210;

// Card diagonal "radius" for use in rotation around center point
const cardDiag = Math.sqrt(cardWidth * cardWidth + cardHeight * cardHeight);
const cardDiagAngle = Math.atan(cardWidth / cardHeight);

const innerCircleRadius = 100;
const outerCircleRadius = 350;
const scatterRadius = 220;

var cardRot = 25;

function drawImg(ctx, img, x, y, width, height, rot) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate((Math.PI / 180) * rot);
  ctx.drawImage(img, 0, 0, width, height);
  ctx.restore();
};


function rotateAroundCenter(card, rot) {
  // WIP
  card.x = card.x + cardWidth * Math.cos((Math.PI / 180) * rot);
  card.y = card.y - cardWidth * Math.sin((Math.PI / 180) * rot);
}


function initCards() {
  suits.forEach(
    suit => faces.forEach(
      face =>
      cards.push({
        suit,
        face,
        x: 0,
        y: 0,
        rot: 0,
      })));
};

const canvas = document.getElementById('canvas');

function scatterCards() {
  cards.forEach(
    card => {
      let theta = Math.random();
      card.x = Math.cos(theta * Math.PI * 2) * scatterRadius + ((canvas.width - cardWidth) / 2);
      card.y = Math.sin(theta * Math.PI * 2) * scatterRadius + ((canvas.height - cardHeight) / 2);
      // card.rot = Math.random() * 360;
    });
}

initCards();
scatterCards();

function draw() {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  cards.forEach(card =>
    drawImg(ctx, cardBack, card.x, card.y, cardWidth, cardHeight, card.rot));

  ctx.beginPath();
  ctx.arc(canvas.width / 2, canvas.height / 2, innerCircleRadius, 0, 2 * Math.PI);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(canvas.width / 2, canvas.height / 2, outerCircleRadius, 0, 2 * Math.PI);
  ctx.stroke();

  Object.entries(cursors).forEach(([name, cursor]) => {
    ctx.beginPath();
    ctx.fillStyle = 'green';
    ctx.arc(cursor.x, cursor.y, 10, 0, 2 * Math.PI);
    ctx.fill();
  });

  drawImg(ctx, cardBack, m.x, m.y, cardWidth, cardHeight, cardRot);

  window.requestAnimationFrame(draw);
}

window.requestAnimationFrame(draw);
