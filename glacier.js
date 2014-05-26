/******************\
|   Glacier File   |
|    Compressor    |
| @author Anthony  |
| @version 0.1     |
| @date 2014/05/21 |
| @edit 2014/05/25 |
\******************/

var fs = require('fs');

/**********
 * config */
var IN_FILE = 'in.dat'; //input file for compression
var OUT_FILE = 'file.ice'; //output file for compression
var ENC_FILE = 'file.ice'; //input file for decompression
var DEC_FILE = 'out.dat'; //output file decompression

/*************
 * constants */

/*********************
 * working variables */

/******************
 * work functions */
function compress() {
    fs.open(IN_FILE, 'r', function(err, fd) {
        if (err) return console.log(err);

        var fileLen = fs.statSync(IN_FILE)['size'];
        var buffer = new Buffer(fileLen);
        fs.read(fd, buffer, 0, fileLen, 0, function(err, num) {
            if (err) return console.log(err);

            //count the occurences of all the bytes
            var countsObj = {};
            var total = 0;
            for (var ai = 0; ai < fileLen; ai++) {
                total += 1;
                if (countsObj.hasOwnProperty(buffer[ai])) {
                    countsObj[buffer[ai]] += 1;
                } else countsObj[buffer[ai]] = 1;
            }
            
            //turn each byte into a leaf HuffNode
            var stack = [];
            for (var k in countsObj) {
                var node = new HuffNode(countsObj[k]/total, k);
                stack.push(node);
            }

            //load up all the HuffNodes in a Huffman tree
            var root = new HuffNode();
            while (stack.length > 2) {
                stack.sort(function(a, b) { return a.freq - b.freq; });
                var merge = new HuffNode();
                merge.setLeft(stack[0]);
                merge.setRight(stack[1]);
                stack.shift(), stack.shift();
                stack.push(merge);
            }
            root.setLeft(stack[0]);
            root.setRight(stack[1]);

            //map each byte to its traversal path
            var listOfEncodings = {};
            root.traverse(listOfEncodings, '');

            //assemble the file preamble
            var preamble = '';
            //6 bits: the # of bits to describe the # bytes in the file
            var bitsInFileLen = bitsIn(fileLen);
            preamble += byteToBinString(bitsInFileLen).substring(2, 8);
            //n bits: how many bytes are in the uncompressed file
            preamble += fileLen.toString(2);
            //4 bits: the # bits needed to describe the # encodings
            var numEncs = Object.keys(listOfEncodings).length;
            var bitsInNumEncs = bitsIn(numEncs);
            preamble += byteToBinString(bitsInNumEncs).substring(4, 8);
            //n bits: the # of encodings
            preamble += numEncs.toString(2);
            //all the encodings
            for (var k in listOfEncodings) {
                //5 bits: # bits in the encoded version
                var bitsInEnc = listOfEncodings[k].length;
                preamble += byteToBinString(bitsInEnc).substring(3, 8);
                //n bits: the encoded version
                preamble += listOfEncodings[k];
                //8 bits: the normal, decoded byte
                preamble += byteToBinString(parseInt(k));
            }

            //form a bin string by applying the encodings to the input file
            var encodedFile = '';
            for (var ai = 0; ai < fileLen; ai++) {
                encodedFile += listOfEncodings[buffer[ai]];
            }

            //turn those strings of 1s and 0s into a byte array
            var entireFile = preamble + encodedFile;
            var outputBytes = entireFile.match(/.{1,8}/g).map(function(a) {
                return parseInt(a, 2);
            });

            //construct the output buffer
            var outputBuffer = new Buffer(outputBytes);

            //write the file to disk
            fs.writeFile(OUT_FILE, outputBuffer, 'binary', function(err) {
                if (err) return console.log(err);

                var pct = Math.round(10000*outputBytes.length/fileLen)/100;
                console.log(OUT_FILE+' is '+pct+'% the size of '+IN_FILE);
            });
        });
    });
}

/********************
 * helper functions */
function getBits(byteArr, s, e) { //returns bits with indices [s, e]
    var idx1 = Math.floor(s/8);
    var idx2 = Math.floor(e/8);
    var ret = '';
    for (var ai = idx1; ai <= idx2; ai++) {
        ret += byteToBinString(byteArr[ai]);
    }
    return ret.substring(s%8, e);
}

function byteToBinString(b) {
    return numToBinString(b, 1);
}

function numToBinString(n, numBytes) {
    var numBits = arguments.length > 1 ? 8*numBytes : Math.ceil(
        Math.log(n)/Math.log(2)
    );
    var ret = '';
    for (var ai = numBits-1; ai >= 0; ai--) {
        var f = Math.pow(2, ai);
        if (n >= f) {
            ret += '1';
            n -= f;
        } else ret += '0';
    }
    return ret;
}

function bitsIn(n) {
    return Math.ceil(Math.log(n)/Math.log(2));
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

compress();
