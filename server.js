const http = require('http').createServer(handler);

const io = require('socket.io')(http);
const fs = require('fs');

const SerialPort = require('serialport');
const Readline = SerialPort.parsers.Readline;

const motor = new SerialPort(
  '/dev/ttyUSB0',
  {
    baudRate: 9600
  },
  function(error) {
    if (error) {
      return console.log('Error: ', error.message);
    }
  }
);

http.listen(8080);

function handler (req, res) { //create server
  fs.readFile(__dirname + '/public/index.html', function(err, data) { //read file index.html in public folder
    if (err) {
      res.writeHead(404, {'Content-Type': 'text/html'}); //display 404 on error
      return res.end("404 Not Found");
    } 
    res.writeHead(200, {'Content-Type': 'text/html'}); //write HTML
    res.write(data); //write data from index.html
    return res.end();
  });
}

const parser = motor.pipe(new Readline({ delimiter: '\r' }))
parser.on('data', function(data) {
  console.log(data);
  io.sockets.emit('response', data);
});

io.on('connection', function(socket) {
  socket.on('command', function(data) {
    console.log('ASCII command recieved!');
    motor.write(toAscii(data));
  })
  socket.on('blocks', function(data) {
    console.log('blocks: ', data);
  });
});

function toAscii(str) {
  var arr =[];
  for (var i = 0; i < str.length; i++) {
    arr.push(str[i].charCodeAt(0));
  }
  arr.push(13);
  return arr;
}