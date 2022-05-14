#!/bin/bash

set -e


BUILD_DIR="./build"
BUILD_TIME=$(date +"%H-%M_%m%d")
COMMIT_ID=$(git log | head -1 | cut -d ' ' -f2)
COMMIT_ID_SHORT=${COMMIT_ID:0:7}
APP_VERSION=$(grep APP_VERSION ./app.py | cut -f2 | cut -d \" -f2)

#echo "$COMMIT_ID_SHORT"
#echo "$BUILD_TIME"
#echo "$APP_VERSION"
#return 0

if [ -d "$BUILD_DIR" ]; then
	rm -rf "$BUILD_DIR"
fi

mkdir -vp "$BUILD_DIR"
mkdir -vp "$BUILD_DIR"/static
mkdir -vp "$BUILD_DIR"/static/img
mkdir -vp "$BUILD_DIR"/static/js
mkdir -vp "$BUILD_DIR"/templates

cp app.config "$BUILD_DIR"
cp app.py "$BUILD_DIR"
cp app_conf.py "$BUILD_DIR"
cp app_db.py "$BUILD_DIR"
cp cnc_agent.py "$BUILD_DIR"
cp logger.py "$BUILD_DIR"
cp utils.py "$BUILD_DIR"

cp ./templates/cnc_login.html "$BUILD_DIR"/templates/
cp ./templates/cnc_main.html "$BUILD_DIR"/templates/
cp ./templates/cnc_template.html "$BUILD_DIR"/templates/

cp ./static/img/favicon.ico "$BUILD_DIR"/static/img/
cp ./static/cnc_common.css "$BUILD_DIR"/static/
cp ./static/cnc_login.css "$BUILD_DIR"/static/
cp ./static/cnc_main.css "$BUILD_DIR"/static/
cp ./static/cnc_navi.css "$BUILD_DIR"/static/
cp ./static/*.json "$BUILD_DIR"/static/

cp -r ./static/js/threejs/ "$BUILD_DIR"/static/js
cp ./static/js/cnc_api.js "$BUILD_DIR"/static/js
cp ./static/js/cnc_api.module.js "$BUILD_DIR"/static/js
cp ./static/js/cnc_main.js "$BUILD_DIR"/static/js
cp ./static/js/cnc_gcode_loader.js "$BUILD_DIR"/static/js
cp ./static/js/common.module.js "$BUILD_DIR"/static/js


BUILD_NAME="../web_linuxcnc_"$APP_VERSION"_"$COMMIT_ID_SHORT"_"$BUILD_TIME".tar.gz"

cd "$BUILD_DIR" && tar -czf "$BUILD_NAME" --owner=root --group=root ./*
