Wizard of NOS - Three.js r128 extraction

Files in this package:
- index.html
- vendor/three.r128.min.js
- validation_report.txt

Upload both index.html and the vendor folder to the same GitHub branch:
  chore/extract-threejs-r128

Expected GitHub structure:
  index.html
  vendor/
    three.r128.min.js

Important:
- Do not upload only index.html. It now depends on vendor/three.r128.min.js.
- The Three.js script reference was inserted in the same script order location where the embedded Three block used to be.
- This package was generated from the uploaded Pass 10.66 index.html.
