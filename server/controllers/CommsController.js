var WebSocket = require("ws");
var CommsController = (function () {
    function CommsController() {
        new WebSocket.Server("");
    }
    return CommsController;
})();
exports.CommsController = CommsController;
