# spano

![#f03c15](https://placehold.it/15/f03c15/000000?text=+) There is a technical problem I can't solve mathematicaly, probably next generation of deep neural networks will help.  See below for detailed explanation. 

DEMO: https://webwayer.github.io/spano/

This repository contains proof-of-concept (code and explanation) for software that automate process of creating vertical curved panorama using drone.  
Like this:

![vertical curved panorama](https://i.pinimg.com/originals/fb/8b/a8/fb8ba8e4ecfe208d93b0007b5d92fb5d.jpg)

# Overview

Stuff used:
- JQuery
- Typescript
- three.js (3D stuff, see magic below)

**Assume that vertical curved panorama (panorama) just combined set of photos of ground surface from different position (longitude&latitude and altitude) and different angle of shooting.**  
**Also images should be cuted (we need only some part of each photo).**

**Everyhing is tested on DJI mavic pro's 46.8 degrees vertical field of view sensor**

*So software can calculate everything for you. Amazing!*  

There is 2 types of curves `spano` can generate (and many more with little bit additional code).
- Simple curve (90 degrees curved part)
- Even more curved curve (120 degrees curved part).

You can ajust:
- Altitude of the start point
- Offset (part of the ground under a start point you don't want to see on the panorama)
- First flat part (with normal perspective)
- Radius of the curved part (actually sense of panorama)
- Last flat part (with normal perspecrive)

Then `spano` will show you how your curve looks like and how drone should fly, how many images it should take and from where.  
Also you will see in text detailed instructions for this process.  See Demo.  
