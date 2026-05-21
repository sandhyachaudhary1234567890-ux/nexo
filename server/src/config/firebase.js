'use strict';

const admin = require('firebase-admin');
const logger = require('./logger');

let firebaseAdmin = null;

try {
  const serviceAccount = require('./firebase-service-account.json');
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
  firebaseAdmin = admin;
  logger.info('Firebase Admin SDK initialized successfully');
} catch (err) {
  logger.error('Failed to initialize Firebase Admin SDK: ' + err.message);
}

module.exports = firebaseAdmin;
