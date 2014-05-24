/******************\
|   Glacier File   |
|    Compressor    |
| @author Anthony  |
| @version 0.1     |
| @date 2014/05/21 |
| @edit 2014/05/24 |
\******************/

var fs = require('fs');

/**********
 * config */
var IN_FILE = 'in.dat';
var OUT_FILE = 'out.dat';

/*************
 * constants */

/*********************
 * working variables */

/******************
 * work functions */
fs.open(IN_FILE, 'r', function(err, fd) {
    if (err) return console.log(err);
    
    var buffer = new Buffer(30);
    fs.read(fd, buffer, 0, 30, 0, function(err, num) {
        var countsObj = {};
        for (var ai = 0; ai < 30; ai++) {
            if (countsObj.hasOwnProperty(buffer[ai])) {
                countsObj[buffer[ai]] += 1;
            } else countsObj[buffer[ai]] = 1;
        }
        
        var counts = [];
        for (var k in countsObj) counts.push([k, countsObj[k]]);
        counts.sort(function(a, b) {
            return b[1] - a[1];
        });

        for (var ai = 0; ai < 30; ai++) {
            console.log(buffer[ai]+': '+byteToString(buffer[ai]));
        }
    });
});

/********************
 * helper functions */
function getBits(byteArr, s, e) { //returns bits with indices [s, e]
    var idx1 = Math.floor(s/8);
    var idx2 = Math.floor(e/8);
    var ret = '';
    for (var ai = idx1; ai <= idx2; ai++) {
        ret += byteToString(byteArr[ai]);
    }
    return ret.substring(s%8, e);
}

function byteToString(b) {
    var ret = '';
    for (var ai = 7; ai >= 0; ai--) {
        var f = Math.pow(2, ai);
        if (b >= f) {
            ret += '1';
            b -= f;
        } else ret += '0';
    }
    return ret;
}

/***********
 * objects */
