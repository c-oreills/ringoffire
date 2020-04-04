// Utilities ---------------------------------------------------------------- //

function throttled(delay, fn) {
  let lastCall = 0;
  return function (...args) {
    const now = (new Date).getTime();
    if (now - lastCall < delay) {
      return null;
    }
    lastCall = now;
    return fn(...args);
  };
};


// Base data setup ---------------------------------------------------------- //

const suits = ['C', 'D', 'H', 'S'];
const faces = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
var cards = [];
const cursors = {};


// Socket handling ---------------------------------------------------------- //

var socket = io();
socket.on('connect', function() {
  socket.emit('register', window.location.search);
});

socket.on('deregister', function(name) {
  delete cursors[name];
});

socket.on('server_cursor_update', function(e) {
  cursors[e.name] = e;
});

socket.on('server_cards_update', function(updated_cards) {
  console.log('scu');
  cards = updated_cards;
});


// Mouse handling ----------------------------------------------------------- //

const m = {
  x: innerWidth / 2,
  y: innerHeight / 2
};


function emitMouseMove(m) {
  socket.emit('client_cursor_update', m);
}

const throttledEmitMouseMove = throttled(50, emitMouseMove);

window.onmousemove = function(e) {
  m.x = e.offsetX;
  m.y = e.offsetY;
  throttledEmitMouseMove(m);
};


// Card handling ------------------------------------------------------------ //

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
  cards.length = 1;
};

function rotateAroundCenter(card, rot) {
  // WIP
  card.x = card.x + cardWidth * Math.cos((Math.PI / 180) * rot);
  card.y = card.y - cardWidth * Math.sin((Math.PI / 180) * rot);
}

function scatterCards() {
  cards.forEach(
    card => {
      let theta = Math.random();
      card.x = Math.cos(theta * Math.PI * 2) * scatterRadius + ((canvas.width - cardWidth) / 2);
      card.y = Math.sin(theta * Math.PI * 2) * scatterRadius + ((canvas.height - cardHeight) / 2);
      // card.rot = Math.random() * 360;
    });
}

function emitCardsUpdate() {
  socket.emit('client_cards_update', cards);
}

// Draw logic --------------------------------------------------------------- //

var cardBack = new Image();
cardBack.src = 'static/images/2B.svg';

function drawImg(ctx, img, x, y, width, height, rot) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate((Math.PI / 180) * rot);
  ctx.drawImage(img, 0, 0, width, height);
  ctx.restore();
};

const canvas = document.getElementById('canvas');

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
