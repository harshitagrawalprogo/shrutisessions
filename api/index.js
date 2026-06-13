'use strict';
// Vercel serverless entry point — just re-export the Express app.
// The ensureReady() middleware in server/index.js handles lazy DB init.
require('dotenv').config();
module.exports = require('../server/index');
