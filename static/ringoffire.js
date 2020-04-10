'use strict';

const canvas = document.getElementById('canvas');
const controls = document.getElementById('controls');


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


// Draw constants, coord scaling functions and window resize handler -------- //

var defaultDrawVars = {
  // Orig image size 225x315: 2/3 scale
  cardWidth: 150,
  cardHeight: 210,

  tableWidth: 1024,
  tableHeight: 768,
  innerCircleRadius: 100,
  outerCircleRadius: 350,
  scatterRadius: 220,

};
var dv = {}; // drawVars

function scaleCoords(obj) {
  let newObj = Object.assign({}, obj);
  newObj.x *= dv.ratio;
  newObj.y *= dv.ratio;
  return newObj;
}

function unscaleCoords(obj) {
  let newObj = Object.assign({}, obj);
  newObj.x /= dv.ratio;
  newObj.y /= dv.ratio;
  return newObj;
}

function resizeWindow() {
  let ddv = defaultDrawVars;

  function applyFnToCardsAndCursors(fn) {
    for (let card of cards) {
      if (typeof card == 'undefined')
        continue;

      Object.assign(card, fn(card));
    }

    for (let cursor of Object.values(cursors)) {
      Object.assign(cursor, fn(cursor));
    }
  }

  if (typeof dv.ratio != 'undefined') {
    applyFnToCardsAndCursors(unscaleCoords);
  }

  let widthRatio = Math.min(window.innerWidth, ddv.tableWidth) / ddv.tableWidth;
  // pad height so controls can display
  let paddedTableHeight = ddv.tableHeight + 4 * controls.clientHeight;
  let heightRatio = Math.min(window.innerHeight, paddedTableHeight) / paddedTableHeight;
  dv.ratio = Math.min(widthRatio, heightRatio, 1);

  applyFnToCardsAndCursors(scaleCoords);

  for (let [prop, value] of Object.entries(defaultDrawVars)) {
    dv[prop] = dv.ratio * value;
  }

  // Card diagonal angle from origin
  dv.cardDiagAngle = Math.atan(dv.cardHeight / dv.cardWidth),
  // Card diagonal "radius" for use in rotation around center point
  dv.cardRadius = hypFromSides(dv.cardWidth / 2, dv.cardHeight / 2),

  dv.tableCenterX = dv.tableWidth / 2,
  dv.tableCenterY = dv.tableHeight / 2,

  canvas.width = dv.tableWidth;
  canvas.height = dv.tableHeight;
  controls.style.width = dv.tableWidth + 'px';
}

resizeWindow();

window.onresize = resizeWindow;
window.onorientationchange = resizeWindow;


// Socket handling ---------------------------------------------------------- //

var socket = io();
socket.on('connect', function() {
  socket.emit('register', window.location.search);
});

socket.on('deregister', function(name) {
  delete cursors[name];
});

socket.on('server_cursor_update', function(cursor) {
  cursors[cursor.name] = scaleCoords(cursor);
});

socket.on('server_card_update', function(updatedCard) {
  handleUpdatedCard(updatedCard);
});

socket.on('server_cards_update', function(updatedCards) {
  cards = updatedCards.map(scaleCoords);
});


// Cursor handling (mouse/touch agnostic) ----------------------------------- //

const cursor = {
  x: 0,
  y: 0
};

function emitCursorMoveAndDraggedCard() {
  socket.emit('client_cursor_update', unscaleCoords(cursor));
  if (cardBeingDragged !== null) {
    emitCardUpdate(cardBeingDragged);
  }
}

const throttledEmitCursorMoveAndDraggedCard = throttled(50, emitCursorMoveAndDraggedCard);

function handleCursorMove(dx, dy) {
  if (cardBeingDragged !== null) {
    moveCard(cardBeingDragged, dx, dy);
  }
  throttledEmitCursorMoveAndDraggedCard();
}

function handleCursorDown() {
  cardBeingDragged = getTopCardAtPoint(cursor.x, cursor.y);
}

function handleCursorUp() {
  if (cardBeingDragged != null && isCardOutsideCircle(cardBeingDragged)) {
    turnCardFaceUp(cardBeingDragged);
    emitCardUpdate(cardBeingDragged);
  };
  cardBeingDragged = null;
}


// Mouse handling ----------------------------------------------------------- //

window.onmousemove = function(e) {
  let movementX = e.pageX - canvas.offsetLeft - cursor.x;
  let movementY = e.pageY - canvas.offsetTop - cursor.y;
  cursor.x = e.pageX - canvas.offsetLeft;
  cursor.y = e.pageY - canvas.offsetTop;
  handleCursorMove(movementX, movementY);
};

window.onmousedown = function(e) {
  handleCursorDown();
};

window.onmouseup = function(e) {
  handleCursorUp();
};


// Touch handling ----------------------------------------------------------- //

var activeTouch = null;

canvas.addEventListener('touchstart', function(e) {
  e.preventDefault();
  for (let touch of e.changedTouches) {
    if (activeTouch && activeTouch.identifier != touch.identifier)
      continue;

    cursor.x = touch.pageX - canvas.offsetLeft;
    cursor.y = touch.pageY - canvas.offsetTop;
    handleCursorDown();

    activeTouch = touch;
  }
});

canvas.addEventListener('touchmove', function(e) {
  e.preventDefault();
  for (let touch of e.changedTouches) {
    if (activeTouch && activeTouch.identifier != touch.identifier)
      continue;

    let oldTouch = activeTouch;
    let dx = touch.pageX - oldTouch.pageX;
    let dy = touch.pageY - oldTouch.pageY;
    handleCursorMove(dx, dy);

    activeTouch = touch;
  }
});

canvas.addEventListener('touchend', function(e) {
  e.preventDefault();
  for (let touch of e.changedTouches) {
    if (activeTouch && activeTouch.identifier != touch.identifier)
      continue;

    handleCursorUp();
    activeTouch = null;
  }
});

canvas.addEventListener('touchcancel', function(e) {
  e.preventDefault();
  for (let touch of e.changedTouches) {
    if (activeTouch && activeTouch.identifier != touch.identifier)
      continue;

    handleCursorUp();
    activeTouch = null;
  }
});


// Draw functions ----------------------------------------------------------- //

function rectMidPointDiagAngleRad(x, y, width, height, rot) {
  /* Return rectangle's midpoint (x, y), diagonal angle from origin (not taking
  into account rotation), and "radius", i.e. length from midpoint to corner */
  let diagAngle, radius;
  if (width == dv.cardWidth && height == dv.cardHeight) {
    // Optimization: use precomputed values
    diagAngle = dv.cardDiagAngle;
    radius = dv.cardRadius;
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
    card.x = Math.cos(theta) * dv.scatterRadius + (dv.tableCenterX - (dv.cardWidth / 2));
    card.y = Math.sin(theta) * dv.scatterRadius + (dv.tableCenterY - (dv.cardHeight / 2));
    card.rot = 0; // Reset rotation in prep for rotating around center
    rotateCardAroundCenter(card, Math.random() * 360);
  };
}

function startUp() {
  initCards();
  scatterCards();
}

function rotateCardAroundCenter(card, rotBy) {
  let [midX, midY, diagAngle, hyp] = rectMidPointDiagAngleRad(card.x, card.y, dv.cardWidth, dv.cardHeight, card.rot);
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
    if (pointIsInRect(card.x, card.y, dv.cardWidth, dv.cardHeight, card.rot, x, y)) {
      return card;
    }
  }
  return null;
}

function moveCard(card, dx, dy) {
  card.x += dx;
  card.y += dy;
  let [midX, midY, ..._] = rectMidPointDiagAngleRad(card.x, card.y, dv.cardWidth, dv.cardHeight, card.rot);
  // Limit to table boundaries
  if (midX < 0) card.x -= midX;
  if (midY < 0) card.y -= midY;
  if (midX > dv.tableWidth) card.x -= (midX - dv.tableWidth);
  if (midY > dv.tableHeight) card.y -= (midY - dv.tableHeight);
}

function isCardOutsideCircle(card) {
  let [midX, midY, ..._] = rectMidPointDiagAngleRad(card.x, card.y, dv.cardWidth, dv.cardHeight, card.rot);
  let hyp = hypFromSides(midX - dv.tableCenterX, midY - dv.tableCenterY);
  return Boolean(hyp > dv.outerCircleRadius + (dv.cardWidth / 2));
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
  updatedCard = scaleCoords(updatedCard);
  // TODO: It's gross to iterate through cards to check for equality like this.
  // Could rely on Object insertion order. In reality though an acceptable
  // performance hit given likely size of array, even as it grows sparse.
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
  socket.emit('client_card_update', unscaleCoords(card));
}

function emitCardsUpdate() {
  // Ideally this function should be used as little as possible, as it blitzes
  // state that others may have updated. Prefer emitCardUpdate where possible.
  socket.emit('client_cards_update', cards.map(unscaleCoords));
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

initCardImages();

function draw() {
  const ctx = canvas.getContext('2d');
  ctx.drawImage(background, 0, 0, dv.tableWidth, dv.tableHeight);

  for (let card of cards) {
    if (typeof card == 'undefined') continue;

    let img;
    if (card.state == cardState.faceDown) {
      img = cardBack;
    } else if (card.state == cardState.faceUp) {
      img = cardImages[card.suit][card.face];
    }

    if (card.state != cardState.offTable) {
      drawImg(ctx, img, card.x, card.y, dv.cardWidth, dv.cardHeight, card.rot);
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
