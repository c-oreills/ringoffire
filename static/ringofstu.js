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
// array of cards - lower index is lower in stack (i.e. top card is last item)
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
  // TODO: It's gross to iterate through cards to check for equality like this.
  // Could rely on Object insertion order.
  for (let card of cards) {
    if (card.suit == updated_card.suit && card.face == updated_card.face) {
      Object.assign(card, updated_card);
      break;
    }
  };
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
    emitCardUpdate(cardBeingDragged);
  }
}

const throttledEmitMouseMoveAndDraggedCard = throttled(50, emitMouseMoveAndDraggedCard);

window.onmousemove = function(e) {
  m.x = e.offsetX;
  m.y = e.offsetY;
  if (cardBeingDragged !== null) {
    cardBeingDragged.x += e.movementX;
    cardBeingDragged.y += e.movementY;
  }
  throttledEmitMouseMoveAndDraggedCard(m, e);
};

window.onmousedown = function(e) {
  cardBeingDragged = getTopCardAtPoint(m.x, m.y);
};

window.onmouseup = function(e) {
  if (cardBeingDragged != null && isCardOutsideCircle(cardBeingDragged)) {
    // TODO: Slightly bad UX since flipped cards can end up below other flipped
    // cards (ideally they'd always be on top) - but we want to keep whole card
    // resyncs to a minimum to prevent blitzing state from others. Can work
    // around by clearing flipped cards frequently.
    cardBeingDragged.state = cardState.faceUp;
    emitCardUpdate(cardBeingDragged);
  };
  cardBeingDragged = null;
};


// Draw utility functions --------------------------------------------------- //

function rectMidPointDiagAngleHyp(x, y, width, height, rot) {
  // TODO: since we're most likely to call this on cards, we could optimise by
  // memoizing hyp and diagAngle based on cardWidth and cardHeight
  let hyp = hypFromSides(width / 2, height / 2);
  let diagAngle = Math.atan(height / width);
  let midX = x + Math.cos(degToRad(rot) + diagAngle) * hyp;
  let midY = y +  Math.sin(degToRad(rot) + diagAngle) * hyp;
  return [midX, midY, diagAngle, hyp];
}

function pointIsInRect(rectX, rectY, rectWidth, rectHeight, rectRot, pointX, pointY) {
  /* Check if a point is in (rotated) rectangle by negatively rotating the point
  around the rectangle's midpoint and then checking if it's inside the unrotated
  rectangle. */
  let [midX, midY, ..._] = rectMidPointDiagAngleHyp(rectX, rectY, rectWidth, rectHeight, rectRot);
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

// Card diagonal "radius" for use in rotation around center point
const cardDiag = hypFromSides(cardWidth, cardHeight);
const cardDiagAngle = Math.atan(cardWidth / cardHeight);

const tableCenterX = 1024 / 2;
const tableCenterY = 768 / 2;
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
  let [midX, midY, diagAngle, hyp] = rectMidPointDiagAngleHyp(card.x, card.y, cardWidth, cardHeight, card.rot);
  card.x = midX - hyp * Math.cos(degToRad(card.rot + rotBy) + diagAngle);
  card.y = midY - hyp * Math.sin(degToRad(card.rot + rotBy) + diagAngle);
  card.rot = card.rot + rotBy;
}

function getTopCardAtPoint(x, y) {
  for (let i = cards.length - 1; i >= 0; i--) {
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
  let [midX, midY, ..._] = rectMidPointDiagAngleHyp(card.x, card.y, cardWidth, cardHeight, card.rot);
  let hyp = hypFromSides(midX - tableCenterX, midY - tableCenterY);
  return Boolean(hyp > outerCircleRadius + (cardWidth / 2));
}

function clearFaceUpCards() {
  for (let card of cards) {
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
