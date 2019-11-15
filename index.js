const http = require("http");
const createHandler = require("github-webhook-handler");
const config = require("./config.js");
const fetch = require("node-fetch");
const { spawn } = require("child_process");

const handler = createHandler({ path: "/webhook", secret: config.secret });

http
  .createServer(function(req, res) {
    handler(req, res, function(err) {
      res.statusCode = 404;
      res.end(req.url);
    });
  })
  .listen(7777);

handler.on("error", function(err) {
  console.error("Error:", err.message);
});

handler.on("push", async function(event) {
  const app = await fetch(
    `https://github.penalosa.dev/get/token/${event.payload.repository.owner.login}/${event.payload.repository.name}`,
    {
      headers: {
        "X-Auth-Token": config.worker_auth
      }
    }
  ).then(r => r.json());
  const publish = app.app.publishDirectory.replace(/[^a-zA-Z_\-]/g, "-");
  const buildCommand =
    app.app.buildCommand != ""
      ? ` && npm install && ${app.app.buildCommand} && `
      : "";
  const build = spawn(
    `docker build -t build-env . && docker run build-env /bin/bash -c "git clone https://${app.user}:${app.token}@github.com/${app.app.org}/${app.app.name} . ${buildCommand} AWS_ACCESS_KEY_ID=${config.access_key} AWS_SECRET_ACCESS_KEY=${config.secret_key} aws2 s3 sync ./${publish} s3://prospectus/sites/${app.app.id} --endpoint=https://nyc3.digitaloceanspaces.com"`,
    { shell: true }
  );

  build.stdout.pipe(process.stdout);
  build.stderr.pipe(process.stderr);
});
