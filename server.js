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

var motorResponse = '';

const parser = motor.pipe(new Readline({ delimiter: '\r' }))
parser.on('data', function(data) {
  console.log(data);
  motorResponse = data;
  io.sockets.emit('response', data);
});

io.on('connection', function(socket) {
  socket.on('command', function(data) {
    console.log('ASCII command recieved!');
    motor.write(toAscii(data));
  })

  // get sequence of blocks (actions)
  socket.on('blocks', function(data) {
    console.log(editArray(data));
    run(editArray(data));
  });
});

// create array of ascii commands with 't 1' (move!) command at the end
function editArray(arr) {
  for (i = 0; i < arr.length; i++) {
    if (arr[i].name !== 'init') {
      arr[i].commands = Object.values(arr[i].parameters);
      arr[i].commands.push('t 1');
    }
  }
  return arr;
}

// get array of bytes from string
function toAscii(str) {
  var arr =[];
  for (var i = 0; i < str.length; i++) {
    arr.push(str[i].charCodeAt(0));
  }
  // push CR
  arr.push(13);
  return arr;
}

// write array of bytes to serial port
function doAscii(command) {
  return new Promise((resolve, reject) => {
    setTimeout(function() {
      motor.write(toAscii(command), function(err) {
        if (err) {
          return console.log('Error on write: ', err.message);
        }
        console.log(`${command} written`);
        resolve(true);
      });
    }, 50);
  });
}

// wait until movement finished
// ask register r0xa0 - if value = 'v 0' then movement completed
function waitUntilDone() {
  return new Promise((resolve, reject) => {
    const handler = function(data) {
      console.log(data);
      parser.removeListener('data', handler);
      if (data === 'v 0') {
        clearInterval(timer);
        resolve(true);
      }
    }
    // iterrogation
    const timer = setInterval(function() {
      motor.write(toAscii('g r0xa0'), function() {
        console.log('Completed?');
      });
      parser.on('data', handler);
    }, 30);
    // 30ms can be adjustable but cannot be equal to timeouts between commands and blocks
  });
}

// send array of ASCII commands of one block
// if block has wait until done property execute waitUntilDone()
// do timeout between blocks (50ms can be adjustable)
function doBlock(item) {
  return new Promise((resolve, reject) => {
    item.commands.reduce((previous, current, index, array) => {
      return previous
      .then(() => {
        if (index === (array.length - 1)) {
          if (item.wait) {
            setTimeout(function() {
              waitUntilDone().then(
                function() {
                  console.log('THEN===Completed');
                  resolve(true);
                }
              );
            }, 50);
            return doAscii(array[index]);
          } else {
            setTimeout(function() {
              resolve(true);
            }, 50);
            return doAscii(array[index]);
          }
        } else {
          return doAscii(array[index]);
        }
      });
    }, Promise.resolve());
  });
}

// run, do blocks
function run(arr) {
  console.log('================RUN===================')
  arr.reduce((previous, current, index, array) => {
    return previous
      .then(() => {
        return doBlock(array[index]);
      })
  }, Promise.resolve());
  
}

