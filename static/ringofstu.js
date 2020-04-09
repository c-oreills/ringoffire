'use strict';

// Utilities ---------------------------------------------------------------- //

function throttled(delay, fn) {
  // Throttle calls to fn to once per delay ms
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
  // Shuffles an array in place (explicitly don't return it)
  var j, x, i;
  for (i = a.length - 1; i > 0; i--) {
    j = Math.floor(Math.random() * (i + 1));
    x = a[i];
    a[i] = a[j];
    a[j] = x;
  }
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

// Array of cards - lower index is lower in stack (i.e. top card is last item).
// Can be sparse to allow easy placing of cards at the top (see moveCardToTop)
// so needs checks for undefined values when iterating through
var cards = [];
var cursors = {};
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

socket.on('server_card_update', function(updatedCard) {
  handleUpdatedCard(updatedCard);
});

socket.on('server_cards_update', function(updatedCards) {
  cards = updatedCards;
});


// Mouse/keyboard handling -------------------------------------------------- //

const m = {
  x: innerWidth / 2,
  y: innerHeight / 2
};

function emitMouseMoveAndDraggedCard(m, e) {
  socket.emit('client_cursor_update', m);
  if (cardBeingDragged !== null) {
    emitCardUpdate(cardBeingDragged);
  }
}

const throttledEmitMouseMoveAndDraggedCard = throttled(50, emitMouseMoveAndDraggedCard);

window.onmousemove = function(e) {
  m.x = e.offsetX;
  m.y = e.offsetY;
  if (cardBeingDragged !== null) {
    moveCard(cardBeingDragged, e.movementX, e.movementY);
  }
  throttledEmitMouseMoveAndDraggedCard(m, e);
};

window.onmousedown = function(e) {
  cardBeingDragged = getTopCardAtPoint(m.x, m.y);
};

window.onmouseup = function(e) {
  if (cardBeingDragged != null && isCardOutsideCircle(cardBeingDragged)) {
    turnCardFaceUp(cardBeingDragged);
    emitCardUpdate(cardBeingDragged);
  };
  cardBeingDragged = null;
};


// Draw utility functions --------------------------------------------------- //

function rectMidPointDiagAngleRad(x, y, width, height, rot) {
  /* Return rectangle's midpoint (x, y), diagonal angle from origin (not taking
  into account rotation), and "radius", i.e. length from midpoint to corner */
  let diagAngle, radius;
  if (width == cardWidth && height == cardHeight) {
    // Optimization: use precomputed values
    diagAngle = cardDiagAngle;
    radius = cardRadius;
  } else {
    diagAngle = Math.atan(height / width);
    radius = hypFromSides(width / 2, height / 2);
  }

  let midX = x + Math.cos(degToRad(rot) + diagAngle) * radius;
  let midY = y +  Math.sin(degToRad(rot) + diagAngle) * radius;
  return [midX, midY, diagAngle, radius];
}

function pointIsInRect(rectX, rectY, rectWidth, rectHeight, rectRot, pointX, pointY) {
  /* Check if a point is in (rotated) rectangle by negatively rotating the point
  around the rectangle's midpoint and then checking if it's inside the unrotated
  rectangle. */
  let [midX, midY, ..._] = rectMidPointDiagAngleRad(rectX, rectY, rectWidth, rectHeight, rectRot);
  let pointDiffX = pointX - midX;
  let pointDiffY = pointY - midY;
  let pointDiffAngle = Math.atan(pointDiffY / pointDiffX);
  let pointDiffHyp = hypFromSides(pointDiffX, pointDiffY);
  let pointRotatedX = midX + Math.cos(pointDiffAngle - degToRad(rectRot)) * pointDiffHyp;
  let pointRotatedY = midY + Math.sin(pointDiffAngle - degToRad(rectRot)) * pointDiffHyp;
  return Boolean(
    midX - (rectWidth / 2) < pointRotatedX && pointRotatedX < midX + (rectWidth / 2) &&
    midY - (rectHeight / 2) < pointRotatedY && pointRotatedY < midY + (rectHeight / 2)
  );
}


// Card handling ------------------------------------------------------------ //

// Orig image size 225x315: 2/3 scale
const cardWidth = 150;
const cardHeight = 210;
// Card diagonal angle from origin
const cardDiagAngle = Math.atan(cardHeight / cardWidth);
// Card diagonal "radius" for use in rotation around center point
const cardRadius = hypFromSides(cardWidth / 2, cardHeight / 2);

const tableWidth = 1024;
const tableHeight = 768;
const tableCenterX = tableWidth / 2;
const tableCenterY = tableHeight / 2;
const innerCircleRadius = 100;
const outerCircleRadius = 350;
const scatterRadius = 220;

function initCards() {
  cards.splice(0, cards.length);
  for (let suit of suits) {
    for (let face of faces) {
      cards.push({
        suit,
        face,
        x: 0,
        y: 0,
        rot: 0,
        state: cardState.faceDown
      });
    }
  }
  shuffle(cards);
};

function scatterCards() {
  for (let card of cards) {
    if (typeof card == 'undefined') continue;

    let theta = Math.random() * Math.PI * 2;
    card.x = Math.cos(theta) * scatterRadius + (tableCenterX - (cardWidth / 2));
    card.y = Math.sin(theta) * scatterRadius + (tableCenterY - (cardHeight / 2));
    card.rot = 0; // Reset rotation in prep for rotating around center
    rotateCardAroundCenter(card, Math.random() * 360);
  };
}

function startUp() {
  initCards();
  scatterCards();
}

function rotateCardAroundCenter(card, rotBy) {
  let [midX, midY, diagAngle, hyp] = rectMidPointDiagAngleRad(card.x, card.y, cardWidth, cardHeight, card.rot);
  card.x = midX - hyp * Math.cos(degToRad(card.rot + rotBy) + diagAngle);
  card.y = midY - hyp * Math.sin(degToRad(card.rot + rotBy) + diagAngle);
  card.rot = card.rot + rotBy;
}

function getTopCardAtPoint(x, y) {
  for (let i = cards.length - 1; i >= 0; i--) {
    let card = cards[i];
    if (typeof card == 'undefined') continue;

    if (card.state == cardState.offTable) {
      continue;
    }
    if (pointIsInRect(card.x, card.y, cardWidth, cardHeight, card.rot, x, y)) {
      return card;
    }
  }
  return null;
}

function moveCard(card, dx, dy) {
  card.x += dx;
  card.y += dy;
  let [midX, midY, ..._] = rectMidPointDiagAngleRad(card.x, card.y, cardWidth, cardHeight, card.rot);
  // Limit to table boundaries
  if (midX < 0) card.x -= midX;
  if (midY < 0) card.y -= midY;
  if (midX > tableWidth) card.x -= (midX - tableWidth);
  if (midY > tableHeight) card.y -= (midY - tableHeight);
}

function isCardOutsideCircle(card) {
  let [midX, midY, ..._] = rectMidPointDiagAngleRad(card.x, card.y, cardWidth, cardHeight, card.rot);
  let hyp = hypFromSides(midX - tableCenterX, midY - tableCenterY);
  return Boolean(hyp > outerCircleRadius + (cardWidth / 2));
}

function moveCardToTop(card, newCard, index) {
  /* Move a card to the top of the stack if it's not already there. Optionally
  replace with newCard. This may lead to array decompaction over time but any
  syncs back and forth to Pythonland via client_cards_update recompact the
  array. index can be specified to save a lookup. */
  newCard = newCard || card;
  index = index || cards.indexOf(card);

  if (index < cards.length) {
    delete cards[index];
    cards[cards.length] = newCard;
  }
}

function turnCardFaceUp(card) {
  card.state = cardState.faceUp;
  moveCardToTop(card);
}

function handleUpdatedCard(updatedCard) {
  // TODO: It's gross to iterate through cards to check for equality like this.
  // Could rely on Object insertion order.
  for (let [index, card] of Object.entries(cards)) {
    if (typeof card == 'undefined') continue;

    if (card.suit == updatedCard.suit && card.face == updatedCard.face) {
      // If card is being flipped to face up, move to top of stack
      if (card.state == cardState.faceDown && updatedCard.state == cardState.faceUp) {
        moveCardToTop(card, updatedCard, index);
      } else {
        cards[index] = updatedCard;
      }
      break;
    }
  };
}

function clearFaceUpCards() {
  for (let card of cards) {
    if (typeof card == 'undefined') continue;

    if (card.state == cardState.faceUp) {
      card.state = cardState.offTable;
    }
  };
}

function emitCardUpdate(card) {
  socket.emit('client_card_update', card);
}

function emitCardsUpdate() {
  socket.emit('client_cards_update', cards);
}

// Draw logic --------------------------------------------------------------- //

const background = new Image();
background.src = 'static/images/background.jpg';
const cardBack = new Image();
cardBack.src = 'static/images/2B.svg';
const cardImages = {};

function initCardImages() {
  for (let suit of suits) {
    cardImages[suit] = {};
    for (let face of faces) {
      let img = new Image();
      img.src = `static/images/${face}${suit}.svg`;
      cardImages[suit][face] = img;
    }
  }
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

  for (let card of cards) {
    if (typeof card == 'undefined') continue;

    let img;
    if (card.state == cardState.faceDown) {
      img = cardBack;
    } else if (card.state == cardState.faceUp) {
      img = cardImages[card.suit][card.face];
    }

    if (card.state != cardState.offTable) {
      drawImg(ctx, img, card.x, card.y, cardWidth, cardHeight, card.rot);
    }
  };

  for (let [name, cursor] of Object.entries(cursors)) {
    ctx.beginPath();
    ctx.fillStyle = 'blue';
    ctx.arc(cursor.x, cursor.y, 10, 0, 2 * Math.PI);
    ctx.fill();
  };

  window.requestAnimationFrame(draw);
}

window.requestAnimationFrame(draw);
