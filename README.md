# RGB to XYZ pointcloud

Convert the RGB values of an image file into a pointcloud, using the given rgb values as XYZ coordinates to animate it in the browser.
Each point gets the color value and transforms to the xyz position out of rgb values of the original pixel.

It includes an A-Frame VR scene (check out their framework: https://github.com/aframevr/aframe/) to dive into the pointcloud via VR headset. it works fine on MetaQuest 3. Other VR devices are not tested yet. Please let me know if you try it with another device.

The main branch contains the last stable build using cache API for browser storage and VR options.
____________
Online Version: https://dev.betakontext.de/pointcloud

Offline Version:

- Open the terminal inside the /public folder
- Start a local http-server:

        bash:   python3 -m http.server 8000

-> Explore the pontcloud the browser: http://localhost:8000/

- Stop the http-server:

        bash:   Ctrl + C

To test VR locally on the Meta Quest headset (Chromium / Wolvic):
-> Make sure to be in the same network as your PC with running local server.
-> Find out the IP adress of your PC.
-> Open the http-server running on your PC in the Quest browser.
-> If you use a selfsigned certificate, you have to accept the security message in the Quest‑Browser.

------------------
------------------
Fork, explore, build on...Have fun!
------------------
Build with Ai assistance and deployed under MIT licence.
CONTACT: Christoph Medicus | dev@betakontext.de












