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

    var fileLen = 561061;
    var buffer = new Buffer(fileLen);
    fs.read(fd, buffer, 0, fileLen, 0, function(err, num) {
        var countsObj = {};
        var total = 0;
        for (var ai = 0; ai < fileLen; ai++) {
            total += 1;
            if (countsObj.hasOwnProperty(buffer[ai])) {
                countsObj[buffer[ai]] += 1;
            } else countsObj[buffer[ai]] = 1;
        }
        
        var counts = [];
        for (var k in countsObj) counts.push([k, countsObj[k]/total]);
        counts.sort(function(a, b) {
            return a[1] - b[1];
        });

        var stack = [];
        for (var ai = 0; ai < counts.length; ai++) {
            var node = new HuffNode(counts[ai][1], counts[ai][0]);
            stack.push(node);
        }

        while (stack.length > 2) {
            stack.sort(function(a, b) { return a.freq - b.freq; });
            var merge = new HuffNode();
            merge.setLeft(stack[0]);
            merge.setRight(stack[1]);
            stack.shift(), stack.shift();
            stack.push(merge);
        }
        var root = new HuffNode();
        root.setLeft(stack[0]);
        root.setRight(stack[1]);

        var listOfCodings = {};
        root.traverse(listOfCodings, '');
        console.log(listOfCodings);

        var ret = '';
        for (var ai = 0; ai < fileLen; ai++) {
            ret += listOfCodings[buffer[ai]];
        }

        var outputBytes = ret.match(/.{1,8}/g).map(function(a) {
            return parseInt(a, 2);
        });
        fs.writeFile(OUT_FILE, new Buffer(outputBytes), 'binary');
        console.log(Math.round(10000*outputBytes.length/fileLen)/100+'%');
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
function HuffNode(freq, value) {
    this.freq = arguments.length > 0 ? freq : 0;
    this.value = arguments.length > 1 ? value : undefined;
    this.left = undefined;
    this.right = undefined;
    this.bit = undefined;
}
HuffNode.prototype.setBit = function(bit) {
    this.bit = bit;
};
HuffNode.prototype.setLeft = function(node) {
    node.setBit(0);
    this.left = node;
    this.freq += node.freq;
};
HuffNode.prototype.setRight = function(node) {
    node.setBit(1);
    this.right = node;
    this.freq += node.freq;
};
HuffNode.prototype.traverse = function (bucket, prev) {
    if (this.value !== undefined) {
        bucket[this.value] = prev;
    } else {
        this.left.traverse(bucket, prev+'0');
        this.right.traverse(bucket, prev+'1');
    }
};
HuffNode.prototype.traversePath = function(path) {
    if (this.value !== undefined) { //leaf
        return [this.value, path.substring(1)];
    } else { //go left or right and recurse
        var steps = path.split('').map(function(a){return parseInt(a)});
        if (steps[0] === 0) {
            return this.left.traversePath(path.substring(1));
        } else {
            return this.right.traversePath(path.substring(1));
        }
    }
};









