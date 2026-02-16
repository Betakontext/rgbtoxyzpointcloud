"RGB to XYZ pointcloud" converts the RGB values of an image file into a pointcloud, using the given rgb values as XYZ coordinates to animate it in the browser.
Each point gets the color value and transforms to the xyz position out of rgb values of the original pixel.

It includes an A-Frame VR scene (check out their framework: https://github.com/aframevr/aframe/) to dive into the pointcloud via VR headset. it works fine on MetaQuest 3. Other VR devices are not tested yet. Please let me know if you try it with another device.

The main branch contains the last stable build using cache API for browser storage and VR options.
------------------
------------------
Online Version: https://dev.betakontext.de/pointcloud
------------------
Offline Version:
    Open the terminal inside the /public folder
    Start a local server:
        bash:   python3 -m http.server 8000
        Explore n the browser: http://localhost:8000/
    Stop the server:
        bash:   Ctrl + C
------------------
To test pointcloud VR locally on Meta Quest (Chromium / Wolvic):
    Make sure to be in the same network as your PC with running local server. Find out the IP adress of your PC.
    Open f.e. http://localhost:8000/ in the Quest browser.
    If you use a selfsigned certificate, you have to accept the security message in the Quest‑Browser.
    ->  Offline remote‑VR-Debugging
------------------
------------------
Fork, explore, build on...Have fun!
------------------
Build with Ai assistance and deployed under MIT licence.
CONTACT: Christoph Medicus | dev@betakontext.de












