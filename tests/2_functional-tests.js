const chaiHttp = require('chai-http');
const chai = require('chai');
const assert = chai.assert;
const server = require('../server');

chai.use(chaiHttp);

suite('Functional Tests', function () {
  this.timeout(60000);

  const board = `fcc-test-${Date.now()}`;
  const threadPassword = 'thread-password';
  const replyPassword = 'reply-password';

  let mainThreadId;
  let mainReplyId;

  function request(method, path, data) {
    return new Promise(function (resolve, reject) {
      let testRequest = chai.request(server)[method](path);

      if (data) {
        testRequest = testRequest.send(data);
      }

      testRequest.end(function (error, response) {
        if (error && !response) {
          reject(error);
          return;
        }

        resolve(response);
      });
    });
  }

  async function createThread(
    targetBoard,
    text,
    password = threadPassword
  ) {
    const response = await request(
      'post',
      `/api/threads/${encodeURIComponent(targetBoard)}`,
      {
        text,
        delete_password: password
      }
    );

    assert.equal(response.status, 200);

    return {
      response,
      id: String(response.body._id || response.body.id)
    };
  }

  async function createReply(
    targetBoard,
    threadId,
    text,
    password = replyPassword
  ) {
    const postResponse = await request(
      'post',
      `/api/replies/${encodeURIComponent(targetBoard)}`,
      {
        thread_id: threadId,
        text,
        delete_password: password
      }
    );

    assert.equal(postResponse.status, 200);
    assert.equal(postResponse.text, 'success');

    const getResponse = await request(
      'get',
      `/api/replies/${encodeURIComponent(targetBoard)}` +
        `?thread_id=${encodeURIComponent(threadId)}`
    );

    assert.equal(getResponse.status, 200);

    const reply = getResponse.body.replies.find(
      (item) => item.text === text
    );

    assert.exists(reply);

    return String(reply._id);
  }

  test(
    'Creating a new thread: POST request to /api/threads/{board}',
    async function () {
      const result = await createThread(
        board,
        'Hilo principal para las pruebas'
      );

      mainThreadId = result.id;

      assert.isString(mainThreadId);
      assert.equal(result.response.body.text, 'Hilo principal para las pruebas');
      assert.equal(result.response.body.board, board);
      assert.property(result.response.body, 'created_on');
      assert.property(result.response.body, 'bumped_on');
      assert.isArray(result.response.body.replies);
    }
  );

  test(
    'Viewing the 10 most recent threads with 3 replies each: GET request to /api/threads/{board}',
    async function () {
      const limitBoard = `${board}-limits`;
      let newestThreadId;

      for (let index = 1; index <= 11; index += 1) {
        const created = await createThread(
          limitBoard,
          `Hilo número ${index}`
        );

        newestThreadId = created.id;
      }

      for (let index = 1; index <= 4; index += 1) {
        await createReply(
          limitBoard,
          newestThreadId,
          `Respuesta número ${index}`
        );
      }

      const response = await request(
        'get',
        `/api/threads/${encodeURIComponent(limitBoard)}`
      );

      assert.equal(response.status, 200);
      assert.isArray(response.body);
      assert.lengthOf(response.body, 10);

      const newestThread = response.body.find(
        (thread) => String(thread._id) === newestThreadId
      );

      assert.exists(newestThread);
      assert.lengthOf(newestThread.replies, 3);

      response.body.forEach(function (thread) {
        assert.notProperty(thread, 'delete_password');
        assert.notProperty(thread, 'reported');

        thread.replies.forEach(function (reply) {
          assert.notProperty(reply, 'delete_password');
          assert.notProperty(reply, 'reported');
        });
      });
    }
  );

  test(
    'Deleting a thread with the incorrect password: DELETE request to /api/threads/{board}',
    async function () {
      const created = await createThread(
        board,
        'Hilo que no debe eliminarse',
        'correct-thread-password'
      );

      const response = await request(
        'delete',
        `/api/threads/${encodeURIComponent(board)}`,
        {
          thread_id: created.id,
          delete_password: 'incorrect-password'
        }
      );

      assert.equal(response.status, 200);
      assert.equal(response.text, 'incorrect password');
    }
  );

  test(
    'Deleting a thread with the correct password: DELETE request to /api/threads/{board}',
    async function () {
      const password = 'delete-this-thread';

      const created = await createThread(
        board,
        'Hilo que será eliminado',
        password
      );

      const response = await request(
        'delete',
        `/api/threads/${encodeURIComponent(board)}`,
        {
          thread_id: created.id,
          delete_password: password
        }
      );

      assert.equal(response.status, 200);
      assert.equal(response.text, 'success');
    }
  );

  test(
    'Reporting a thread: PUT request to /api/threads/{board}',
    async function () {
      const response = await request(
        'put',
        `/api/threads/${encodeURIComponent(board)}`,
        {
          thread_id: mainThreadId
        }
      );

      assert.equal(response.status, 200);
      assert.equal(response.text, 'reported');
    }
  );

  test(
    'Creating a new reply: POST request to /api/replies/{board}',
    async function () {
      const text = 'Respuesta principal para las pruebas';

      mainReplyId = await createReply(
        board,
        mainThreadId,
        text,
        replyPassword
      );

      assert.isString(mainReplyId);
    }
  );

  test(
    'Viewing a single thread with all replies: GET request to /api/replies/{board}',
    async function () {
      const response = await request(
        'get',
        `/api/replies/${encodeURIComponent(board)}` +
          `?thread_id=${encodeURIComponent(mainThreadId)}`
      );

      assert.equal(response.status, 200);
      assert.equal(String(response.body._id), mainThreadId);
      assert.isArray(response.body.replies);
      assert.isAtLeast(response.body.replies.length, 1);

      assert.notProperty(response.body, 'delete_password');
      assert.notProperty(response.body, 'reported');

      response.body.replies.forEach(function (reply) {
        assert.notProperty(reply, 'delete_password');
        assert.notProperty(reply, 'reported');
      });
    }
  );

  test(
    'Deleting a reply with the incorrect password: DELETE request to /api/replies/{board}',
    async function () {
      const response = await request(
        'delete',
        `/api/replies/${encodeURIComponent(board)}`,
        {
          thread_id: mainThreadId,
          reply_id: mainReplyId,
          delete_password: 'incorrect-password'
        }
      );

      assert.equal(response.status, 200);
      assert.equal(response.text, 'incorrect password');
    }
  );

  test(
    'Deleting a reply with the correct password: DELETE request to /api/replies/{board}',
    async function () {
      const response = await request(
        'delete',
        `/api/replies/${encodeURIComponent(board)}`,
        {
          thread_id: mainThreadId,
          reply_id: mainReplyId,
          delete_password: replyPassword
        }
      );

      assert.equal(response.status, 200);
      assert.equal(response.text, 'success');

      const getResponse = await request(
        'get',
        `/api/replies/${encodeURIComponent(board)}` +
          `?thread_id=${encodeURIComponent(mainThreadId)}`
      );

      const deletedReply = getResponse.body.replies.find(
        (reply) => String(reply._id) === mainReplyId
      );

      assert.exists(deletedReply);
      assert.equal(deletedReply.text, '[deleted]');
    }
  );

  test(
    'Reporting a reply: PUT request to /api/replies/{board}',
    async function () {
      const reportReplyId = await createReply(
        board,
        mainThreadId,
        'Respuesta que será reportada',
        'report-password'
      );

      const response = await request(
        'put',
        `/api/replies/${encodeURIComponent(board)}`,
        {
          thread_id: mainThreadId,
          reply_id: reportReplyId
        }
      );

      assert.equal(response.status, 200);
      assert.equal(response.text, 'reported');
    }
  );
});