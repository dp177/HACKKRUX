let socketServer = null;

function setSocketServer(io) {
  socketServer = io;
}

function getSocketServer() {
  return socketServer;
}

module.exports = {
  setSocketServer,
  getSocketServer
};
