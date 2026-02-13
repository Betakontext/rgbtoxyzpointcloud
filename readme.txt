
This is RGB to XYZ pointcloud. It converts the RGB values of a picture file into a pointcloud using the rgb values as XYZ coordinates to animate a pointcloud. Each point gets the color value and the xyz value out of rgb values of the original pixel. It includes an A-Frame VR scene (check out their framework: https://github.com/aframevr/aframe/) to dive into the pointcloud via MetaQuest3 headset. Other VR devices are not tested yet.
------------------
Online Version: https://dev.betakontext.de/pointcloud
The main branch contains the files for the last stable build using cache API and local storage for the uploaded images to create a storage for the rgb values. It then used the rgb values to point on xyz coordinates to process the pointcloud.
------------------
Offline Version for debugging and further development f.e. on Ubuntu:
Navigate into the root folder of the project:
    bash:   sudo apt install npm
    bash:   npm init -y
Install some packages:
    bash:   npm install serve-static finalhandler
WebXR needs https, f.e. with a local certificate over mkcert:
    bash:   sudo apt install libnss3-tools && sudo apt install mkcert && mkcert -install
and
    bash:   mkcert localhost
this creates    ->  localhost.pem
                ->  localhost-key.pem
in your System-Trust-Store
files:  https-server.js, localhost-key.pem, localhost.pem
have to be stored in the same folder as index.html, f.e. here in /public
    bash:   node https-server.js
->  https://localhost:8443
To stop the server:
    bash:   Ctrl + C
------------------
To test pointclou VR on Meta Quest (Chromium / Wolvic):
    Make sure to be in the same network as your PC with running local server. Find out the IP adress of your PC.
    Open f.e. https://192.168.1.42:8443 in the Quest browser.
    If you use a selfsigned certificate, you have to accept the security message in the Quest‑Browser.
    ->  Remote‑VR-Debugging
------------------
Build with Ai assistance and deployed under MIT licence.
CONTACT: dev@betakontext.de

Fork, explore, build on...
Have fun!










