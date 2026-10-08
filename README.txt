NOVOTEK PICK-TO-LIGHT - HTML + DESKTOP APP PACKAGE
====================================================

This ZIP intentionally contains BOTH:

1. website/
   - index.html
   - styles.css
   - app.js
   - assets/Novotek_Logo.png

   This is the editable website prototype. You can modify the HTML,
   CSS and JavaScript directly.

2. desktop-app/
   - main.js
   - package.json
   - run_app.bat
   - build_app.bat

   This is an Electron desktop-app wrapper around the SAME website.
   The desktop app loads website/index.html, so you only need to
   modify the files in website/ to change the application UI/logic.

HOW TO TEST THE HTML:
---------------------
Double-click:
website\index.html

HOW TO RUN THE DESKTOP APP:
---------------------------
1. Install Node.js (LTS).
2. Open Command Prompt inside desktop-app.
3. Run:
   npm install
4. Run:
   npm start

Or simply double-click:
desktop-app\run_app.bat

HOW TO CREATE A WINDOWS APP:
----------------------------
Double-click:
desktop-app\build_app.bat

The portable .exe will be created under:
desktop-app\dist\

IMPORTANT:
----------
The app and HTML use the SAME source files. Therefore:
- Edit website/index.html for page structure.
- Edit website/styles.css for design.
- Edit website/app.js for buttons, navigation and prototype logic.

The current version is a prototype. PICK NOW is simulated and uses
browser localStorage. MySQL and physical Pick-to-Light hardware are
not connected yet.

NEXT STAGE:
-----------
The same website can later be connected to the Node.js + MySQL backend,
and the PICK NOW operation can be connected to physical controller/PLC/
RS232/USB hardware.
