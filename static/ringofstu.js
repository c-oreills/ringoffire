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

function shuffle(a) {
  var j, x, i;
  for (i = a.length - 1; i > 0; i--) {
    j = Math.floor(Math.random() * (i + 1));
    x = a[i];
    a[i] = a[j];
    a[j] = x;
  }
  return a;
}

function degToRad(degrees) {
  return degrees * Math.PI / 180;
}

function hypFromSides(side1, side2) {
  return Math.sqrt(side1 * side1 + side2 * side2);
}


// Base data setup ---------------------------------------------------------- //

const suits = ['C', 'D', 'H', 'S'];
const faces = ['A', '2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K'];
const cardState = {faceDown: 'faceDown', faceUp: 'faceUp', offTable: 'offTable'};
var cards = [];
const cursors = {};
var cardBeingDragged = null;


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

socket.on('server_card_update', function(updated_card) {
  cards.forEach(function (card) {
    if (card.suit == updated_card.suit && card.face == updated_card.face) {
      Object.assign(card, updated_card);
    }
  });
});

socket.on('server_cards_update', function(updated_cards) {
  cards = updated_cards;
});


// Mouse/keyboard handling -------------------------------------------------- //

const m = {
  x: innerWidth / 2,
  y: innerHeight / 2
};


function emitMouseMoveAndDraggedCard(m, e) {
  socket.emit('client_cursor_update', m);
  if (cardBeingDragged !== null) {
    cardBeingDragged.x += e.movementX;
    cardBeingDragged.y += e.movementY;
    emitCardUpdate(cardBeingDragged);
  }
}

const throttledEmitMouseMoveAndDraggedCard = throttled(50, emitMouseMoveAndDraggedCard);

window.onmousemove = function(e) {
  m.x = e.offsetX;
  m.y = e.offsetY;
  throttledEmitMouseMoveAndDraggedCard(m, e);
};

window.onmousedown = function(e) {
  cardBeingDragged = getTopCardAtPoint(m.x, m.y);
};

window.onmouseup = function(e) {
  if (cardBeingDragged != null && isCardOutsideCircle(cardBeingDragged)) {
    cardBeingDragged.state = cardState.faceUp;
    emitCardUpdate(cardBeingDragged);
  };
  cardBeingDragged = null;
};

window.onkeydown = function(e) {
  if (e.key == ' ') {
    clearFaceUpCards();
  }
};


// Draw utility functions --------------------------------------------------- //

function rectMidPointDiagAngleHyp(x, y, width, height, rot) {
  let hyp = hypFromSides(width / 2, height / 2);
  let diagAngle = Math.atan(height / width);
  let midX = x + Math.cos(degToRad(rot) + diagAngle) * hyp;
  let midY = y +  Math.sin(degToRad(rot) + diagAngle) * hyp;
  return [midX, midY, diagAngle, hyp];
}

function rotateRectAroundCenter(x, y, width, height, rot, rotBy) {
  // WIP
  let [midX, midY, diagAngle, hyp] = rectMidPointDiagAngleHyp(x, y, width, height, rot);
  let newX = midX - hyp * Math.cos(degToRad(rot + rotBy) + diagAngle);
  let newY = midY - hyp * Math.sin(degToRad(rot + rotBy) + diagAngle);
  let newRot = rot + rotBy;
  return [newX, newY, newRot];
}

function pointIsInRect(rectX, rectY, rectWidth, rectHeight, rectRot, pointX, pointY) {
  let [midX, midY, diagAngle, hyp] = rectMidPointDiagAngleHyp(rectX, rectY, rectWidth, rectHeight, rectRot);
  let pointDiffX = pointX - midX;
  let pointDiffY = pointY - midY;
  let pointDiffAngle = Math.atan(pointDiffY / pointDiffX);
  let pointDiffHyp = hypFromSides(pointDiffX, pointDiffY);
  let pointRotatedX = midX + Math.cos(pointDiffAngle - degToRad(rectRot)) * pointDiffHyp;
  let pointRotatedY = midY + Math.sin(pointDiffAngle - degToRad(rectRot)) * pointDiffHyp;
  if (midX - (rectWidth / 2) < pointRotatedX &&
      pointRotatedX < midX + (rectWidth / 2) &&
      midY - (rectHeight / 2) < pointRotatedY &&
      pointRotatedY < midY + (rectHeight / 2)) {
    return true;
  } else {
    return false;
  }
}


// Card handling ------------------------------------------------------------ //

// Orig image size 225x315: 2/3 scale
const cardWidth = 150;
const cardHeight = 210;

// Card diagonal "radius" for use in rotation around center point
const cardDiag = hypFromSides(cardWidth, cardHeight);
const cardDiagAngle = Math.atan(cardWidth / cardHeight);

const tableCenterX = 1024 / 2;
const tableCenterY = 768 / 2;
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
          state: cardState.faceDown
        })));
  shuffle(cards);
  // cards.length = 1;
};


function scatterCards() {
  cards.forEach(
    card => {
      let theta = Math.random();
      card.x = Math.cos(theta * Math.PI * 2) * scatterRadius + (tableCenterX - (cardWidth / 2));
      card.y = Math.sin(theta * Math.PI * 2) * scatterRadius + (tableCenterY - (cardHeight / 2));
      rotateCardAroundCenter(card, Math.random() * 360);
    });
}

function startUp() {
  initCards();
  scatterCards();
}

function rotateCardAroundCenter(card, rotBy) {
  let [x, y, rot] = rotateRectAroundCenter(card.x, card.y, cardWidth, cardHeight, card.rot, rotBy);
  card.x = x;
  card.y = y;
  card.rot = rot;
}

function getTopCardAtPoint(x, y) {
  for (let i = cards.length - 1; i > 0; i--) {
    let card = cards[i];
    if (card.state == cardState.offTable) {
      continue;
    }
    if (pointIsInRect(card.x, card.y, cardWidth, cardHeight, card.rot, x, y)) {
      return card;
    }
  }
  return null;
}

function isCardOutsideCircle(card) {
  let [midX, midY, _a, _h] = rectMidPointDiagAngleHyp(card.x, card.y, cardWidth, cardHeight, card.rot);
  let hyp = hypFromSides(midX - tableCenterX, midY - tableCenterY);
  if (hyp > outerCircleRadius + (cardWidth / 2)) {
    return true;
  } else {
    return false;
  }
}

function clearFaceUpCards() {
  cards.forEach(function(card) {
    if (card.state == cardState.faceUp) {
      card.state = cardState.offTable;
    }
  });
  emitCardsUpdate();
}

function emitCardUpdate(card) {
  socket.emit('client_card_update', card);
}

function emitCardsUpdate() {
  socket.emit('client_cards_update', cards);
}

// Draw logic --------------------------------------------------------------- //

const background = new Image();
background.src = 'static/images/background.png';
const cardBack = new Image();
cardBack.src = 'static/images/2B.svg';
const cardImages = {};

function initCardImages() {
  suits.forEach(
    suit => {
      cardImages[suit] = {};
      faces.forEach(
        face => {
          let img = new Image();
          img.src = `static/images/${face}${suit}.svg`;
          cardImages[suit][face] = img;
        });
    });
}

function drawImg(ctx, img, x, y, width, height, rot) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(degToRad(rot));
  ctx.drawImage(img, 0, 0, width, height);
  ctx.restore();
};

const canvas = document.getElementById('canvas');

initCardImages();

function draw() {
  const ctx = canvas.getContext('2d');
  ctx.drawImage(background, 0, 0, canvas.width, canvas.height);

  cards.forEach(function(card) {
    let img;
    if (card.state == cardState.faceDown) {
      img = cardBack;
    } else if (card.state == cardState.faceUp) {
      img = cardImages[card.suit][card.face];
    }

    if (card.state != cardState.offTable) {
      drawImg(ctx, img, card.x, card.y, cardWidth, cardHeight, card.rot);
    }
  });

  // ctx.beginPath();
  // ctx.arc(tableCenterX, tableCenterY, innerCircleRadius, 0, 2 * Math.PI);
  // ctx.stroke();

  // ctx.beginPath();
  // ctx.arc(tableCenterX, tableCenterY, outerCircleRadius, 0, 2 * Math.PI);
  // ctx.stroke();

  Object.entries(cursors).forEach(([name, cursor]) => {
    ctx.beginPath();
    ctx.fillStyle = 'green';
    ctx.arc(cursor.x, cursor.y, 10, 0, 2 * Math.PI);
    ctx.fill();
  });

  window.requestAnimationFrame(draw);
}

window.requestAnimationFrame(draw);
