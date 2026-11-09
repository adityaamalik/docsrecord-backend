const expressJwt = require("express-jwt");

function authJwt() {
  const secret = process.env.secret;
  // const api = process.env.API_URL;
  return expressJwt({
    secret,
    algorithms: ["HS256"],
    // isRevoked: isRevoked
  }).unless({
    path: [
      `/doctors/google`,
      `/`,
      `/payments/orders`,
      `/payments/success`,
    ],
  });
}

async function isRevoked(req, payload, done) {
  if (!payload.isAdmin) {
    done(null, true);
  }

  done();
}

module.exports = authJwt;
