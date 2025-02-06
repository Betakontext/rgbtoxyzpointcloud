
This is Betakontext/rgbtoxyzpointcloud
For full documentation see: https://github.com/Betakontext/rgbtoxyzpointcloud

This program converts the RGB values of any chosen JPEG into XYZ coordinates. Each point gets the color value of the original pixel.

------------------

-> online Version <- 

https://rgbtoxyzpointcloud.vercel.app/

The main folder contains the files for the online Version using vercel.com for deployment and supabase.com as storage for the uploaded images to create a *.json to process the pointcloud:

In this version the *.json lists of the extracted coordinates are stored in the session cache of your browser.

------------------

-> local Version for Linux in folder /local <-

After download and unzip the project you can test it offline via terminal using a local server.

To run the program offline on a local server: 
Open the terminal and go to /local folder.
Install Node.js and check if node is installed:
bash: node -v

Start a local server to see the pointcloud: cd path\Directory
bash: node localserver.js
It is running if you see
http://localhost:3000/
Copy paste this url into the browser or ctrl click the link in the terminal
To close local server with press ctrl+c

-> Choose a *.jpg. I atm recommend to start with sth max 500kb, as the created *.json files to process the pointcloud can get quite big. 

Have fun!



