# In-browser Ring of Fire card game

My friend's birthday get together got cancelled by the COVID-19 lockdown, so at his request I hacked together the next best thing: remote play Ring of Fire.

![Demo video](readme_imgs/demo.gif?raw=true)

The design philosophy follows that of [Desperate Gods](https://www.wolfire.com/desperate-gods): give players a shared physical space but don't enforce any rules. This led to fun things like tug-of-war over cards, and useful things like one player taking a turn on behalf of another while they were out of the room.

Most logic takes place on the client, and no frontend libraries are used save for Socket.io. Rendering is in canvas, with hand-rolled hit detection. The backend is a (mostly) dumb message bus server.

Tested on Chrome, Firefox, Webkit (Safari) and Edge. Supports mobile devices.

![Zoom call](readme_imgs/zoom_photo.jpg?raw=true)
