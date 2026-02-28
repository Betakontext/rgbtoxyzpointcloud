# RGB to XYZ pointcloud

Convert the RGB values of an image file into a pointcloud, using the given rgb values as XYZ coordinates to animate it in the browser.
Each point gets the color value and transforms to the xyz position out of rgb values of the original pixel.

It includes an A-Frame VR scene (check out their framework: https://github.com/aframevr/aframe/) to dive into the pointcloud via VR headset. it works fine on MetaQuest 3. Other VR devices are not tested yet. Please let me know if you try it with another device.

The main branch contains the last stable build using cache API for browser storage and VR options.
____________

Online Version: https://dev.betakontext.de/pointcloud

____________

Offline Version:

- Open the terminal inside the /public folder
- Start a local http-server:

        bash:   python3 -m http.server 8000

-> Explore the pontcloud the browser: http://localhost:8000/

- Stop the http-server:

        bash:   Ctrl + C

____________

To test VR locally on the Meta Quest headset (Chromium / Wolvic):

-> Make sure to be in the same network as your PC with running local server.
-> Find out the IP adress of your PC.
-> Open the https-server running on your PC in the Quest browser.

Navigate into the root folder of the project:

    bash:   sudo apt install npm
    bash:   npm init -y

Install necesary packages:

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


To test on Meta Quest (Chromium / Wolvic):

Make sure to be in the same network as your PC with running local server. Find out the IP adress of your PC.
Open f.e. https://192.168.1.42:8443 in the Quest browser.
If you use a selfsigned certificate, you have to accept the security message in the Quest‑Browser.

-> If you use a selfsigned certificate, you have to accept the security message in the Quest‑Browser.
->  Remote‑Debugging


On firefox you can try WebXR API Emulator.

------------------
Build with Ai assistance and deployed under MIT licence.
CONTACT: https://dev.betakontext.de | dev@betakontext.de












