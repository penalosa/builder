from node:10
WORKDIR /usr/bin
run npm i node-fetch
run npm i aws-sdk
run npm i md5-file
run npm i mime-types
COPY route.js /usr/bin/route.js

WORKDIR /usr/src/deploy