'use strict';

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const replySchema = new mongoose.Schema({
  text: {
    type: String,
    required: true
  },
  created_on: {
    type: Date,
    required: true
  },
  delete_password: {
    type: String,
    required: true
  },
  reported: {
    type: Boolean,
    default: false
  }
});

const threadSchema = new mongoose.Schema(
  {
    board: {
      type: String,
      required: true,
      index: true
    },
    text: {
      type: String,
      required: true
    },
    created_on: {
      type: Date,
      required: true
    },
    bumped_on: {
      type: Date,
      required: true
    },
    delete_password: {
      type: String,
      required: true
    },
    reported: {
      type: Boolean,
      default: false
    },
    replies: {
      type: [replySchema],
      default: []
    }
  },
  {
    versionKey: false
  }
);

const Thread =
  mongoose.models.MessageBoardThread ||
  mongoose.model('MessageBoardThread', threadSchema);

function publicReply(reply) {
  const data =
    typeof reply.toObject === 'function'
      ? reply.toObject()
      : reply;

  return {
    _id: data._id,
    text: data.text,
    created_on: data.created_on
  };
}

function publicThread(thread, limitReplies = false) {
  const data =
    typeof thread.toObject === 'function'
      ? thread.toObject()
      : thread;

  let replies = Array.isArray(data.replies)
    ? [...data.replies]
    : [];

  // Orden cronológico y, para el listado del tablero,
  // solamente las tres respuestas más recientes.
  replies.sort(
    (first, second) =>
      new Date(first.created_on) -
      new Date(second.created_on)
  );

  if (limitReplies) {
    replies = replies.slice(-3);
  }

  return {
    _id: data._id,
    board: data.board,
    text: data.text,
    created_on: data.created_on,
    bumped_on: data.bumped_on,
    replies: replies.map(publicReply)
  };
}

function validId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

module.exports = function (app) {
  app
    .route('/api/threads/:board')

    // Crear un hilo
    .post(async function (req, res) {
      try {
        const board = req.params.board;
        const { text, delete_password } = req.body;

        if (!text || !delete_password) {
          return res
            .status(400)
            .send('missing required fields');
        }

        const now = new Date();

        const passwordHash = await bcrypt.hash(
          String(delete_password),
          10
        );

        const thread = await Thread.create({
          board,
          text,
          created_on: now,
          bumped_on: now,
          delete_password: passwordHash,
          reported: false,
          replies: []
        });

        const response = publicThread(thread);

        // "id" ayuda a las pruebas locales y "_id" sigue
        // disponible como exige el proyecto.
        return res.status(200).json({
          ...response,
          id: thread._id.toString()
        });
      } catch (error) {
        console.error('Error creando hilo:', error);
        return res.status(500).send('server error');
      }
    })

    // Ver los diez hilos más recientes
    .get(async function (req, res) {
      try {
        const board = req.params.board;

        const threads = await Thread.find({ board })
          .sort({ bumped_on: -1 })
          .limit(10)
          .lean();

        return res.json(
          threads.map((thread) =>
            publicThread(thread, true)
          )
        );
      } catch (error) {
        console.error('Error obteniendo hilos:', error);
        return res.status(500).send('server error');
      }
    })

    // Eliminar un hilo
    .delete(async function (req, res) {
      try {
        const board = req.params.board;
        const { thread_id, delete_password } = req.body;

        if (!validId(thread_id)) {
          return res.send('incorrect password');
        }

        const thread = await Thread.findOne({
          _id: thread_id,
          board
        });

        if (!thread) {
          return res.send('incorrect password');
        }

        const correctPassword = await bcrypt.compare(
          String(delete_password || ''),
          thread.delete_password
        );

        if (!correctPassword) {
          return res.send('incorrect password');
        }

        await Thread.deleteOne({
          _id: thread_id,
          board
        });

        return res.send('success');
      } catch (error) {
        console.error('Error eliminando hilo:', error);
        return res.status(500).send('server error');
      }
    })

    // Reportar un hilo
    .put(async function (req, res) {
      try {
        const board = req.params.board;
        const { thread_id } = req.body;

        if (!validId(thread_id)) {
          return res.status(404).send('thread not found');
        }

        const thread = await Thread.findOneAndUpdate(
          {
            _id: thread_id,
            board
          },
          {
            reported: true
          },
          {
            new: true
          }
        );

        if (!thread) {
          return res.status(404).send('thread not found');
        }

        return res.send('reported');
      } catch (error) {
        console.error('Error reportando hilo:', error);
        return res.status(500).send('server error');
      }
    });

  app
    .route('/api/replies/:board')

    // Crear una respuesta
    .post(async function (req, res) {
      try {
        const board = req.params.board;
        const {
          thread_id,
          text,
          delete_password
        } = req.body;

        if (
          !validId(thread_id) ||
          !text ||
          !delete_password
        ) {
          return res
            .status(400)
            .send('missing or invalid fields');
        }

        const thread = await Thread.findOne({
          _id: thread_id,
          board
        });

        if (!thread) {
          return res.status(404).send('thread not found');
        }

        const now = new Date();

        const passwordHash = await bcrypt.hash(
          String(delete_password),
          10
        );

        thread.replies.push({
          text,
          created_on: now,
          delete_password: passwordHash,
          reported: false
        });

        thread.bumped_on = now;

        await thread.save();

        return res.send('success');
      } catch (error) {
        console.error('Error creando respuesta:', error);
        return res.status(500).send('server error');
      }
    })

    // Ver un hilo completo con todas sus respuestas
    .get(async function (req, res) {
      try {
        const board = req.params.board;
        const { thread_id } = req.query;

        if (!validId(thread_id)) {
          return res.status(404).send('thread not found');
        }

        const thread = await Thread.findOne({
          _id: thread_id,
          board
        }).lean();

        if (!thread) {
          return res.status(404).send('thread not found');
        }

        return res.json(publicThread(thread));
      } catch (error) {
        console.error('Error obteniendo respuestas:', error);
        return res.status(500).send('server error');
      }
    })

    // Eliminar el contenido de una respuesta
    .delete(async function (req, res) {
      try {
        const board = req.params.board;
        const {
          thread_id,
          reply_id,
          delete_password
        } = req.body;

        if (
          !validId(thread_id) ||
          !validId(reply_id)
        ) {
          return res.send('incorrect password');
        }

        const thread = await Thread.findOne({
          _id: thread_id,
          board
        });

        if (!thread) {
          return res.send('incorrect password');
        }

        const reply = thread.replies.id(reply_id);

        if (!reply) {
          return res.send('incorrect password');
        }

        const correctPassword = await bcrypt.compare(
          String(delete_password || ''),
          reply.delete_password
        );

        if (!correctPassword) {
          return res.send('incorrect password');
        }

        reply.text = '[deleted]';

        await thread.save();

        return res.send('success');
      } catch (error) {
        console.error('Error eliminando respuesta:', error);
        return res.status(500).send('server error');
      }
    })

    // Reportar una respuesta
    .put(async function (req, res) {
      try {
        const board = req.params.board;
        const { thread_id, reply_id } = req.body;

        if (
          !validId(thread_id) ||
          !validId(reply_id)
        ) {
          return res.status(404).send('reply not found');
        }

        const thread = await Thread.findOne({
          _id: thread_id,
          board
        });

        if (!thread) {
          return res.status(404).send('reply not found');
        }

        const reply = thread.replies.id(reply_id);

        if (!reply) {
          return res.status(404).send('reply not found');
        }

        reply.reported = true;

        await thread.save();

        return res.send('reported');
      } catch (error) {
        console.error('Error reportando respuesta:', error);
        return res.status(500).send('server error');
      }
    });
};
