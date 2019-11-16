const fs = require("fs").promises;
const path = require("path");
const md5File = require("md5-file/promise");
const mime = require("mime-types");
const [
  zone_id,
  account_id,
  api_key,
  email,
  app_id,
  domain,
  bucket,
  access_key,
  secret_key
] = process.env.CF_TOKEN.split("::");
const { spawn } = require("child_process");
const fetch = require("node-fetch");

const AWS = require("aws-sdk");
const EP = new AWS.Endpoint("nyc3.digitaloceanspaces.com");
const s3 = new AWS.S3({
  endpoint: EP,
  accessKeyId: access_key,
  secretAccessKey: secret_key,
  region: "nyc3",
  signatureVersion: "v4"
});

const myBucket = "prospectus";

const apiBase = "https://api.cloudflare.com/client/v4/";

const cloudflare = (api_key, auth_email) => {
  const req = ({ headers, ...rest }, path) =>
    fetch(`${apiBase}${path}`, {
      headers: {
        "X-Auth-Key": api_key,
        "X-Auth-Email": auth_email,
        "Content-Type": "application/json",
        ...(headers || {})
      },
      ...rest
    }).then(r => r.json());
  const request = {
    get: path => req({}, path),
    post: (path, body) =>
      req({ body: JSON.stringify(body), method: "POST" }, path),
    put_plain: (path, body) =>
      req(
        {
          body: body,
          method: "PUT",
          "Content-Type": "text/plain"
        },
        path
      )
  };
  return {
    user: () => request.get(`user`),

    accounts: account_id => ({
      create_namespace: async name => {
        await request.post(`accounts/${account_id}/storage/kv/namespaces`, {
          title: name
        });
        let ret = await request.get(
          `accounts/${account_id}/storage/kv/namespaces`
        );
        console.log(ret);
        return ret.result.find(ns => ns.title == name);
      },
      put: async (namespace, key, value) => {
        await request.put_plain(
          `accounts/${account_id}/storage/kv/namespaces/${namespace}/values/${key}`,
          value
        );
      }
    }),
    zone: zone_id => ({
      dns_records: async () =>
        await request.get(`zones/${zone_id}/dns_records`),
      has: async domain =>
        await request.get(`zones/${zone_id}/dns_records?name=${domain}&type=A`),
      create: async domain =>
        await request.post(`zones/${zone_id}/dns_records`, {
          type: "A",
          name: domain,
          content: "93.184.216.34",
          proxied: true
        })
    })
  };
};
(async () => {
  const api = cloudflare(api_key, email);

  let hasRecord = await api
    .zone(zone_id)
    .has(`${app_id.toLowerCase()}.${domain}`);
  if (!hasRecord.result.length) {
    console.error(
      `DNS record does not exist for ${app_id.toLowerCase()}.${domain}`
    );
    console.error(`Creating...`);
    await api.zone(zone_id).create(`${app_id.toLowerCase()}.${domain}`);
    console.log(`Created`);
  }
  async function spider(dir, root) {
    let files = await fs.readdir(dir);
    await Promise.all(
      files.map(async file => {
        const filePath = path.join(dir, file);
        const stats = await fs.stat(filePath);
        if (stats.isDirectory()) return spider(filePath, path.join(root, file));
        else if (stats.isFile()) {
          const webPath = path.join(root, file);
          const hash = await md5File(filePath);

          const fileContent = await fs.readFile(filePath);

          const params = {
            Bucket: myBucket,
            Key: `app-asset/${hash}`,
            Body: fileContent,
            ContentType: mime.lookup(filePath) || "application/octet-stream"
          };

          const upload = params =>
            new Promise((yes, no) => {
              s3.upload(params, function(err, data) {
                if (err) {
                  no(err);
                }
                yes(data);
              });
            });
          await upload(params);

          const manifestNamespace = `059c2d670d6e49b8b32978ace0df869e`;

          await api
            .accounts(account_id)
            .put(manifestNamespace, `${app_id}:${webPath}`, hash);
        }
      })
    );
  }
  await spider(`./site${bucket ? "/" + bucket : ""}`, `/`);
  console.log(`Updated site ${app_id}.${domain}`);
})();
