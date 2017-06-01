const port = 9999;
// C:\windows\system32>mklink D:\log.txt "C:\Users\simon\Application Data\Macromedia\Flash Player\Logs\flashlog.txt"

// 建立http server
var server = require('http').createServer(function (req, res) {
    require('fs').createReadStream('index.html').pipe(res);
}).listen(port);

// 建立webSocket
const WebSocket = require('ws');
const wss = new WebSocket.Server({ server });
wss.broadcast = function (data) {
    this.clients.forEach(function (client) {
        if (client.readyState === WebSocket.OPEN) {
            data.ts = new Date();
            client.send(JSON.stringify(data));
        }
    });
};

// 決定flash log位置
var userProfile = process.env.USERPROFILE; // C:\Users\simon
var file = 'Application Data\\Macromedia\\Flash Player\\Logs\\flashlog.txt';
var path = require('path').join(userProfile, file);

console.log('flash log=>', path);
console.log('open http://localhost:' + port);

// regexp如果搬到client 做就可以通用每個project了 (握拳)
// key跟value中間必須要有一個空白的*可能*, 因為如果沒有value, 就不會有那個空白
var big2Send = /^C → S:\d(\S*)\s?(.*)/;     // C → S:7send 9 4434 (client送出的東西有多帶一個流水號\d)
var big2Receive = /^S → C:(\S*)\s?(.*)/;    // S → C:play 0 1 0!1!2!3!4!5!6!7 24494J4K25182K

var texasSend = /^CLIENT:\s{2}(\S*)\s?(.*)/;        // CLIENT:  sit 7 3029080
var texasReceive = /^SERVER : (\S*) DATA :\s?(.*)/; // SERVER : last_cmd DATA : ["[\"\",\"\",\"\",\"\",\"\",\"\",[\"plnext\"],\"\",\"\"]"]

var send = [big2Send, texasSend];
var receive = [big2Receive, texasReceive];

var includes = [...send, ...receive];
var excludes = [
    /C → S:\d(_ping|_PONG|LOG)/,
    /S → C:_pong/,
];

// 開始tail
var Tail = require('tail').Tail;
var tail = new Tail(path, { fsWatchOptions: { interval: 10 }, useWatchFile: true });
tail.on('line', function (data) {
    if (includes.every(re => !data.match(re))) return;
    if (excludes.some(re => data.match(re))) return;

    var match;
    if (match = getMatch(data, send)) {
        console.log('\x1b[47m\x1b[34m%s\x1b[0m', data);  // BgWhite, FgBlue, Reset
        var key = match[1];
        var value = match[2];

        wss.broadcast({
            key: key,
            value: value,
            type: 'send',
            log: key + ' ' + value,
        });

    } else if (match = getMatch(data, receive)) {
        console.log('\x1b[47m\x1b[32m%s\x1b[0m', data);  // BgWhite, FgGreen, Reset
        var key = match[1];
        var value = match[2];

        // 9t的都多包一層, 這邊要把他解開
        if (texasReceive.test(match[0])) {
            value = JSON.parse(value).join(' ');
        }

        wss.broadcast({
            key: key,
            value: value,
            type: 'receive',
            log: key + ' ' + value,
        });
    }
});

tail.on('error', function (error) {
    console.error('ERROR:', error);
});



/**
 * 找出符合的那筆match資料
 * @param {string} str 
 * @param {[regExp]} regExps 
 */
function getMatch(str, regExps) {
    for (var i = 0; i < regExps.length; i++) {
        var match = str.match(regExps[i]);
        if (match) { return match; }
    }
    return null;

    // return regExps.reduce((match, cur) => {
    //     if (match) { return match; }
    //     return str.match(cur);
    // }, null);
}