/******************\
|   Glacier File   |
|    Compressor    |
| @author Anthony  |
| @version 0.1     |
| @date 2014/05/21 |
| @edit 2014/05/25 |
\******************/

/* problems with the end of the file */


var fs = require('fs');
var crypto = require('crypto');

/**********
 * config */
var inputDir = './tests/inputs/';
var glacierDir = './tests/glaciers/';
var outputDir = './tests/outputs/';

/*************
 * constants */
var COMP_SUFFIX = '.ice'; //file extension for compressed files

/*********************
 * working variables */

/******************
 * work functions */
function compress(fileName, callback) {
    fs.open(fileName, 'r', function(err, fd) {
        if (err) return console.log(err);

        var fileLen = fs.statSync(fileName)['size'];
        var buffer = new Buffer(fileLen);
        fs.read(fd, buffer, 0, fileLen, 0, function(err, num) {
            if (err) return console.log(err);

            var start = +new Date();

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
            var encoder = {};
            root.traverse(encoder, '');

            //assemble the file preamble
            var preamble = '';
            //6 bits: the # of bits to describe the # bytes in the file
            var bitsInFileLen = bitsIn(fileLen);
            preamble += byteToBinString(bitsInFileLen).substring(2, 8);
            //n bits: how many bytes are in the uncompressed file
            preamble += fileLen.toString(2);
            //16 bits: number of bits in the serialized Huffman tree
            var huffTree = root.serialize();
            var bitsInHuffTree = huffTree.length;
            preamble += numToBinString(bitsInHuffTree, 2);
            //n bits: the Huffman tree
            preamble += huffTree;

            //form a bin string by applying the encodings to the input file
            var encodedFile = '';
            for (var ai = 0; ai < fileLen; ai++) {
                encodedFile += encoder[buffer[ai]];
            }

            //turn those strings of 1s and 0s into a byte array
            var entireFile = preamble + encodedFile;
            //the number of bits must be divisible by 8, so append some
            var numToAppend = (8 - entireFile.length%8)%8;
            for (var ai = 0; ai < numToAppend; ai++) entireFile += '0';
            var outputBytes = entireFile.match(/.{1,8}/g).map(function(a) {
                return parseInt(a, 2);
            });

            //construct the output buffer
            var outBuffer = new Buffer(outputBytes);

            //write the file to disk
            var compFileName = glacierDir + fileName.substring(
                inputDir.length
            ) + COMP_SUFFIX;
            var time = +new Date() - start;
            fs.writeFile(compFileName, outBuffer, 'binary', function(err) {
                if (err) return callback(err);

                
                var hash = crypto.createHash('md5')
                                 .update(buffer)
                                 .digest('hex');
                callback(false, time, hash, outputBytes.length, fileLen);
            });
        });
    });
}

function decompress(fileName, callback) {
    fs.open(fileName, 'r', function(err, fd) {
        if (err) return console.log(err);

        var fileLen = fs.statSync(fileName)['size'];
        var buffer = new Buffer(fileLen);
        fs.read(fd, buffer, 0, fileLen, 0, function(err, num) {
            if (err) return console.log(err);

            var start = +new Date();

            //collect the information in the preamble
            var ptr = 0;
            var bitsInOrigFileLen = parseInt(getBits(buffer, ptr, ptr+=6), 2);
            var numBytesToDecode = parseInt(
                getBits(buffer, ptr, ptr+=bitsInOrigFileLen), 2
            );
            var bitsInHuffTree = parseInt(getBits(buffer, ptr, ptr+=16), 2);
            var serializedTree = getBits(buffer, ptr, ptr+=bitsInHuffTree);
            var decoder = parseHuffTree(serializedTree);

            //decode the file
            var outputBytes = [];
            var allPaths = getBits(buffer, ptr, 8*fileLen);
            for (var ai = 0; ai < numBytesToDecode; ai++) {
                var result = decoder.traversePath(allPaths, ai);
                outputBytes.push(result[0]);
                allPaths = result[1];
            }

            //construct the output buffer
            var outBuffer = new Buffer(outputBytes);

            //write the file to disk
            var decompFileName = outputDir + fileName.substring(
                glacierDir.length, fileName.length - COMP_SUFFIX.length
            );
            var time = +new Date() - start;
            fs.writeFile(decompFileName, outBuffer, 'binary', function(err) {
                if (err) return callback(err);

                
                var hash = crypto.createHash('md5')
                                 .update(outBuffer)
                                 .digest('hex');
                callback(false, time, hash, outputBytes.length, fileLen);
            });
        });
    });
}

/********************
 * helper functions */
function parseHuffTree(tree) {
    var root = new HuffNode();
    tree = tree.substring(1);
    var queue = [root];
    while (tree.length > 0) {
        var type = tree.charAt(0);
        var node = null;
        if (type === '0') { //normal node
            node = new HuffNode();
            tree = tree.substring(1);
            queue.push(node);
        } else { //leaf node
            var value = parseInt(tree.substring(1, 9), 2);
            node = new HuffNode(0, value); //freq doesn't matter
            tree = tree.substring(9);
        }
        if (queue[0].left === undefined) queue[0].left = node;
        else if (queue[0].right === undefined) {
            queue[0].right = node;
            queue.shift();
        }
    }
    return root;
}

function getBits(byteArr, s, e) { //returns bits with indices [s, e]
    var idx1 = Math.floor(s/8);
    var idx2 = Math.floor(e/8);
    var ret = '';
    for (var ai = idx1; ai <= idx2; ai++) {
        ret += byteToBinString(byteArr[ai]);
    }
    return ret.substring(s%8, (s%8)+(e-s));
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
HuffNode.prototype.serialize = function() {
    if (this.value !== undefined) { //leaf node?
        return '1'+byteToBinString(this.value); //then it's easy peasy
    } else { //normal node with a left part and a right part
        var ret = '0';
        var stack = [this.left, this.right];
        while (stack.length > 0) {
            if (stack[0].value === undefined) {
                ret += '0';
                stack.push(stack[0].left);
                stack.push(stack[0].right);
                stack.shift();
            } else {
                ret += stack[0].serialize();
                stack.shift();
            }
        }
        return ret;
    }
};
HuffNode.prototype.traverse = function (bucket, prev) {
    if (this.value !== undefined) {
        bucket[this.value] = prev;
    } else {
        this.left.traverse(bucket, prev+'0');
        this.right.traverse(bucket, prev+'1');
    }
};
HuffNode.prototype.traversePath = function(path, fuck) {
    if (this.value !== undefined) { //leaf
        return [this.value, path];
    } else { //go left or right and recurse
        var step = parseInt(path.charAt(0));
        if (step === 0) {
            return this.left.traversePath(path.substring(1), fuck);
        } else {
            return this.right.traversePath(path.substring(1), fuck);
        }
    }
};

fs.readdir(inputDir, function(err, files) {
    if (err) return console.log(err);

    files.forEach(function(fileName) {
        //compress the file
        compress(
            inputDir+fileName,
            function(err, compTime, hashOfInput, newSize, oldSize) {
                if (err) return console.log(err);

                //report the results of the compression
                var pct = Math.round(10000*newSize/oldSize)/100;
                console.log(
                    'Compressed '+fileName+' '+
                    'to '+pct+'% its original size '+
                    'in '+compTime+'ms'
                );

                //decompress the file
                decompress(
                    glacierDir+fileName+COMP_SUFFIX,
                    function(err, decompTime, hashOfDec) {
                        if (err) return console.log(err);

                        //compare the hashes
                        var success = hashOfInput === hashOfDec;
                        var prefix = success ? 'S' : 'Uns';

                        //report the results of the decompression
                        console.log(
                            prefix+'uccessfully '+
                            'decompressed '+fileName+COMP_SUFFIX+' '+
                            'in '+decompTime+'ms'
                        );
                    }
                );
            }
        );
    });
});
