from urllib.parse import parse_qs

from flask import Flask, render_template, request
from flask_socketio import SocketIO

app = Flask(__name__)
app.config['SECRET_KEY'] = 'secret!'
app.config['DEBUG'] = True
socketio = SocketIO(app)

names_to_sid = {}


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
    return open('index.html').read()


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


@socketio.on('client_cursor_update')
def handle_client_cursor_update(mouse):
    name = get_name_from_sid(request.sid)
    mouse.update(name=name)
    for sid in all_other_sids(request.sid):
        socketio.emit('server_cursor_update', mouse, room=sid)


@socketio.on('client_cards_update')
def handle_client_cards_update(cards):
    name = get_name_from_sid(request.sid)
    for sid in all_other_sids(request.sid):
        socketio.emit('server_cards_update', cards, room=sid)


if __name__ == '__main__':
    socketio.run(app)
