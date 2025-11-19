
This is Betakontext/rgbtoxyzpointcloud
For full documentation see: https://github.com/Betakontext/rgbtoxyzpointcloud

This program converts the RGB values of any chosen JPEG into XYZ coordinates. Each point gets the color value of the original pixel.

------------------

-> online Version <- 

https://rgbtoxyzpointcloud.vercel.app/

The main folder contains the files for the online Version using vercel.com for deployment and local storage for the uploaded images to create a *.json to process the pointcloud:
In this version the *.json lists of the extracted coordinates are stored in the session cache of your browser.

------------------

-> local Version in folder /local <-

To run the program offline on a local server: 

Check if Node.js v18.12.0 is installed -> bash: node -v
If you get: v18.12.0 you can run the app.
If not or you have another version, install v18.12.0
You can use NVM to switch between different versions of node.js
To get NVM for Windows: Download the installer from https://github.com/coreybutler/nvm-windows/releases and run it. Open a new Command Prompt or PowerShell and run:
nvm install 18.12.0
nvm use 18.12.0
Verify the update: node -v

Once the needed node version is installed:

From the main folder of the downloaded project go into the /local folder and open the terminal from there.
bash: node localserver.js
Local server is running if you see the link
http://localhost:3000/
Copy paste or ctrl click this url into the browser.
To close local server with press ctrl+c

If the app is running you'll see the "Browse" - button on a black screen.
-> Choose a *.jpg and wait for the pointcloud.

Local version stores your chosen files in the folder /local/Bilder and the *json in the folder /local/lists.
I atm recommend to start with *.jpgs of max. 1 mb, as the created *.json files to process the pointcloud can get quite big. 

------------------

Have fun!




