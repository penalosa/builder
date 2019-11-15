from node:latest

run curl "https://d1vvhvl2y92vvt.cloudfront.net/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
run unzip awscliv2.zip
run ./aws/install

WORKDIR /usr/src/deploy