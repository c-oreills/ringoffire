from urllib.parse import parse_qs

from flask import Flask, Response, render_template, request
from flask_socketio import SocketIO

app = Flask(__name__)
app.config['SECRET_KEY'] = 'secret!'
app.config['DEBUG'] = True
socketio = SocketIO(app)

names_to_sid = {}
last_seen_cards = None


def get_name_from_sid(sid):
    for name, sid_ in names_to_sid.items():
        if sid_ == sid:
            return name


def all_other_sids(sid):
    for sid_ in names_to_sid.values():
        if sid_ != sid:
            yield sid_


@app.route('/')
def index():
    return Response(open('index.html').read(), mimetype='text/html')


@socketio.on('disconnect')
def handle_disconnect():
    name = get_name_from_sid(request.sid)
    socketio.emit('deregister', name, broadcast=True)
    print(f'deregister from {name} (sid: {request.sid})')


@socketio.on('register')
def handle_register(message):
    if message and message.startswith('?'):
        message = message[1:]
    qs_dict = parse_qs(message)
    if 'name' in qs_dict:
        name, = qs_dict['name']
    else:
        name = request.sid
    names_to_sid[name] = request.sid
    print(f'register from {name} (sid: {request.sid})')
    if last_seen_cards:
        socketio.emit('server_cards_update', last_seen_cards, room=request.sid)


@socketio.on('client_cursor_update')
def handle_client_cursor_update(mouse):
    name = get_name_from_sid(request.sid)
    mouse.update(name=name)
    for sid in all_other_sids(request.sid):
        socketio.emit('server_cursor_update', mouse, room=sid)


@socketio.on('client_card_update')
def handle_client_card_update(card):
    if last_seen_cards:
        for card_ in last_seen_cards:
            if (
                    card['suit'] == card_['suit'] and
                    card['face'] == card_['face']):
                card_.update(card)
    name = get_name_from_sid(request.sid)
    for sid in all_other_sids(request.sid):
        socketio.emit('server_card_update', card, room=sid)


@socketio.on('client_cards_update')
def handle_client_cards_update(cards):
    global last_seen_cards
    # Compact cards array, stripping out any nulls to reset to non-sparse array
    cards = [c for c in cards if c]
    last_seen_cards = cards
    name = get_name_from_sid(request.sid)
    # Since we're blitzing all state, broadcasts to force a resync on all
    # clients including one who sent the message
    socketio.emit('server_cards_update', cards, broadcast=True)


if __name__ == '__main__':
    socketio.run(app)
