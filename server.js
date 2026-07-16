'use strict';

require('dotenv').config();

const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const mongoose = require('mongoose');

const apiRoutes = require('./routes/api.js');
const fccTestingRoutes = require('./routes/fcctesting.js');
const runner = require('./test-runner');

const app = express();

// Encabezados de seguridad requeridos por freeCodeCamp
app.use(function (req, res, next) {
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-DNS-Prefetch-Control', 'off');
  res.setHeader('Referrer-Policy', 'same-origin');
  next();
});

app.use(
  '/public',
  express.static(process.cwd() + '/public')
);

app.use(cors({ origin: '*' })); // Solo para las pruebas de FCC

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Front-end de ejemplo
app
  .route('/b/:board/')
  .get(function (req, res) {
    res.sendFile(process.cwd() + '/views/board.html');
  });

app
  .route('/b/:board/:threadid')
  .get(function (req, res) {
    res.sendFile(process.cwd() + '/views/thread.html');
  });

// Página principal
app
  .route('/')
  .get(function (req, res) {
    res.sendFile(process.cwd() + '/views/index.html');
  });

// Rutas utilizadas por las pruebas de freeCodeCamp
fccTestingRoutes(app);

// Rutas de la API
apiRoutes(app);

// Middleware 404
app.use(function (req, res) {
  res
    .status(404)
    .type('text')
    .send('Not Found');
});

// Conectar primero a MongoDB y luego iniciar el servidor
async function startServer() {
  try {
    if (!process.env.MONGO_URI) {
      throw new Error(
        'La variable de entorno MONGO_URI no está configurada'
      );
    }

    await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 30000
    });

    console.log('MongoDB conectado correctamente');

    const listener = app.listen(
      process.env.PORT || 3000,
      function () {
        console.log(
          'Your app is listening on port ' +
            listener.address().port
        );

        if (process.env.NODE_ENV === 'test') {
          console.log('Running Tests...');

          setTimeout(function () {
            try {
              runner.run();
            } catch (error) {
              console.log('Tests are not valid:');
              console.error(error);
            }
          }, 1500);
        }
      }
    );
  } catch (error) {
    console.error(
      'No fue posible conectar con MongoDB:',
      error.message
    );

    process.exit(1);
  }
}

startServer();

module.exports = app;