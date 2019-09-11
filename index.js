var express = require('express');
var app = express();

var port = process.env.PORT || 3000;

app.use(express.static(__dirname +'/client/build/index.html')); //serves the index.html

app.get('/', function (req, res) {
    res.sendFile(__dirname +'/client/build/index.html');
  });

app.listen(port); //listens on port 3000 -> http://localhost:3000/