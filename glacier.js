/******************\
|   Glacier File   |
|    Compressor    |
| @author Anthony  |
| @version 0.1     |
| @date 2014/05/21 |
| @edit 2014/06/02 |
\******************/

var fs = require('fs');
var crypto = require('crypto');

/**********
 * config */
//Txt Spk
var MAX_NUM_REPL = 10*1000;
var MAX_N_GRAM = 2;
var SPLIT_CHAR = ' ';

//Huffman
var SYMBOL_SIZE = 8;

//LZW
var CHUNK_SIZE = 16;

var inputDir = './tests/inputs/';
var glacierDir = './tests/glaciers/';
var tmpDir = './tests/tmp/';
var outputDir = './tests/outputs/';

/*************
 * constants */
var CMPR_SFX = '.ice'; //file extension for compressed files

/*********************
 * working variables */

/******************
 * work functions */
function compress(inName, outName, cb) {
    /*compressTxtSpk(inName, outName, 0, -1, -1,
        function(err, t, h, newSize, oldSize) {
            compressHighHuff(
                outName, outName, t, h, oldSize, cb
            );
        }
    );*/
    compressHighHuff(inName, outName, 0, -1, -1, cb);
}

function decompress(inName, medName, outName, cb) {
    //decompressHuff(inName, outName, 0, cb);
    cb(false, -1, 'N/A');
}

function compressTxtSpk(inName, outName, prTime, prHash, origSize, cb) {
    fs.readFile(inName, 'utf-8', function(err, data) {
        if (err) return console.log(err);

        var start = +new Date();

        //get a good list of replacement strings
        var gen = StringIteratorMonad();
        var replacements = [];
        for (var ai = 0; ai < MAX_NUM_REPL; ai++) {
            while (data.indexOf(gen()) > -1) gen = mb(mIncrString, gen);
            replacements.push(gen());
            gen = mb(mIncrString, gen);
        }

        //count the ngrams
        var tokens = tokenize(data);
        var countsObj = {};
        for (var ni = 0; ni < MAX_N_GRAM; ni++) {
            for (var ai = 0; ai < tokens.length; ai++) {
                var t = tokens[ai];
                for (var ti = 1; ti <= ni; ti++) t += SPLIT_CHAR+tokens[ai+ti];
                if (countsObj.hasOwnProperty(t)) countsObj[t] += 1;
                else countsObj[t] = 1;
            }
        }

        //turn those counts into scores
        var scores = [];
        for (var token in countsObj) {
            var score = token.length*countsObj[token]; //# of characters saved
            score -= 6; //punctuation in the JSON
            score -= token.length; //length of the token in the JSON
            //the length of the replace string will be subtracted later
            scores.push([token, score]);
        }

        //sort the ngrams
        scores.sort(function(a, b) {
            return b[1] - a[1]; //by their score
        });

        //map the most repeated words to the replacement strings
        var encodeMap = [];
        var idxsOfEncodings = {};
        var decodeMap = {};
        var idx = 0;
        for (var ai = 0; ai < scores.length && idx < MAX_NUM_REPL; ai++) {
            var t = scores[ai][0], repl = replacements[idx];
            var adjScore = scores[ai][1] - countsObj[t]*repl.length;
            if (adjScore > 0) {
                //enables quick access to each replacement's index later on
                idxsOfEncodings[t] = encodeMap.length-1;
                encodeMap.push([t, repl]); //an array because order matters
                decodeMap[repl] = t;
                idx++;
            }
        }

        //remove unreachable mappings (bi/tri grams preceded by unigrams)
        var smallEncMap = [];
        for (var ai = 0; ai < encodeMap.length; ai++) {
            var parts = tokenize(encodeMap[ai][0]);
            if (parts.length > 1) { //bigram or above
                var reachable = true;
                //for each feasible sub-ngrams size
                for (var ni = 1; ni < parts.length; ni++) {
                    //iterate through the possible ngrams
                    for (var bi = 0; bi < parts.length-ni+1; bi++) {
                        var subngram = parts[bi];
                        for (var ti = 1; ti < ni; ti++) {
                            t += SPLIT_CHAR+parts[bi+ti];
                        }
                        //if this encoding is broken up by a sub-ngram
                        if (idxsOfEncodings.hasOwnProperty(subngram) &&
                            idxsOfEncodings[subngram] < ai) {
                            reachable = false; //then it isn't reachable!
                            break;
                        }
                    }
                    if (!reachable) break;
                }
                if (reachable) smallEncMap.push(encodeMap[ai]);
            } else {
                smallEncMap.push(encodeMap[ai]);
            }
        }

        //only include necessary mappings
        var smallDecMap = {};

        //step through the replacements
        for (var ai = 0; ai < smallEncMap.length; ai++) {
            var ngram = getOrder(smallEncMap[ai][0]);
            var tmp = [];
            var lastIdx = tokens.length-(ngram+1);
            var replacedLastRound = false;
            for (var bi = 0; bi < tokens.length-ngram; bi++) {
                var t = tokens[bi];
                for (var ti = 1; ti <= ngram; ti++) {
                    t += SPLIT_CHAR+tokens[bi+ti];
                }
                if (t === smallEncMap[ai][0]) {
                    if (bi === lastIdx) replacedLastRound = true;

                    tmp.push(smallEncMap[ai][1]);
                    if (!smallDecMap.hasOwnProperty(smallEncMap[ai][1])) {
                        smallDecMap[smallEncMap[ai][1]] = t;
                    }
                    bi += ngram;
                } else tmp.push(tokens[bi]);
            }

            //larger ngrams cut off the last few tokens, so add them
            if (!replacedLastRound) { //if they aren't already accounted for
                var lastFewTokens = tokens.splice(tokens.length-ngram, ngram);
                tmp.push.apply(tmp, lastFewTokens);
            }
            tokens = tmp;
        }

        //assemble the output
        var ret = JSON.stringify(smallDecMap)+'\n'+tokens.join(SPLIT_CHAR);

        //write it to a file
        var time = +new Date() - start;
        fs.writeFile(outName, ret, function (err) {
            if (err) return cb(err);

            var hash = prHash;
            if (hash === -1) {
                hash = crypto.createHash('md5').update(data).digest('hex');
            }
            origSize = origSize < 0 ? data.length : origSize;
            cb(false, time+prTime, hash, ret.length, origSize);
        });
    });
}

function compressHuff(inName, outName, prTime, prHash, origSize, cb) {
    fs.open(inName, 'r', function(err, fd) {
        if (err) return console.log(err);

        var fileLen = fs.statSync(inName)['size'];
        var buffer = new Buffer(fileLen);
        fs.read(fd, buffer, 0, fileLen, 0, function(err, num) {
            if (err) return console.log(err);

            var start = +new Date();

            //remove the trailing bits that don't do anything
            var binStr = getBits(buffer, 0, 8*fileLen);
            var numToRemove = (8*fileLen)%SYMBOL_SIZE;
            binStr = binStr.substring(0, (8*fileLen)-numToRemove);

            //turn the string of bits into chunks
            var rgx = new RegExp('.{'+SYMBOL_SIZE+'}', 'g');
            var inputSymbols = binStr.match(rgx).map(function(a) {
                return parseInt(a, 2);
            });

            //count the occurences of all the bytes
            var countsObj = {};
            var total = 0;
            for (var ai = 0; ai < fileLen; ai++) {
                total += 1;
                if (countsObj.hasOwnProperty(inputSymbols[ai])) {
                    countsObj[inputSymbols[ai]] += 1;
                } else countsObj[inputSymbols[ai]] = 1;
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
            //6 bits: the # of bits to describe the # symbols in the file
            var bitsInFileLen = bitsIn(inputSymbols.length);
            preamble += byteToBinString(bitsInFileLen).substring(2, 8);
            //n bits: how many symbols are in the uncompressed file
            preamble += inputSymbols.length.toString(2);
            //16 bits: number of bits in the serialized Huffman tree
            var huffTree = root.serialize();
            var bitsInHuffTree = huffTree.length;
            preamble += numToBinString(bitsInHuffTree, 2);
            //n bits: the Huffman tree
            preamble += huffTree;

            //form a bin string by applying the encodings to the input file
            var encodedFile = '';
            for (var ai = 0; ai < inputSymbols.length; ai++) {
                encodedFile += encoder[inputSymbols[ai]];
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
            var time = +new Date() - start;
            fs.writeFile(outName, outBuffer, 'binary', function(err) {
                if (err) return cb(err);

                var hash = prHash;
                if (hash === -1) {
                    hash = crypto.createHash('md5')
                                 .update(buffer)
                                 .digest('hex');
                }
                origSize = origSize < 0 ? fileLen : origSize;
                cb(
                    false, time+prTime, hash, outputBytes.length, origSize
                );
            });
        });
    });
}

function compressLZW(inName, outName, prTime, prHash, origSize, cb) {
    fs.open(inName, 'r', function(err, fd) {
        if (err) return console.log(err);

        var fileLen = fs.statSync(inName)['size'];
        var buffer = new Buffer(fileLen);
        fs.read(fd, buffer, 0, fileLen, 0, function(err, num) {
            if (err) return console.log(err);

            var start = +new Date();

            //construct the dictionary
            var maxIdx = Math.pow(2, CHUNK_SIZE);
            var nextIdx = 256;
            var dictionary = {};
            for (var ai = 0; ai < nextIdx; ai++) dictionary[ai] = ai;
            var outputChunks = [];
            var prev = -1;
            var current = buffer[0];
            for (var ai = 0; ai <= buffer.length; ai++)  {
                if (!dictionary.hasOwnProperty(current)) {
                    outputChunks.push(dictionary[prev]);
                    if (nextIdx < maxIdx) {
                        dictionary[current] = nextIdx, nextIdx++;
                    }
                    prev = buffer[ai];
                    current = buffer[ai]+','+buffer[ai+1];
                } else {
                    if (prev === -1) prev = buffer[ai];
                    else prev += ','+buffer[ai];
                    current += ','+buffer[ai+1];
                }
            }

            //turn the chunks into a string of bits
            var outputStr = ''
            for (var ai = 0; ai < outputChunks.length; ai++) {
                outputStr += numToBinString(outputChunks[ai], CHUNK_SIZE/8);
            }

            //turn those strings of 1s and 0s into a byte array
            //the number of bits must be divisible by 8, so append some
            var numToAppend = (8 - outputStr.length%8)%8;
            for (var ai = 0; ai < numToAppend; ai++) outputStr += '0';
            var outputBytes = outputStr.match(/.{1,8}/g).map(function(a) {
                return parseInt(a, 2);
            });

            //construct the output buffer
            var outBuffer = new Buffer(outputBytes);

            //write the file to disk
            var time = +new Date() - start;
            fs.writeFile(outName, outBuffer, 'binary', function(err) {
                if (err) return cb(err);

                var hash = prHash;
                if (hash === -1) {
                    hash = crypto.createHash('md5')
                                 .update(buffer)
                                 .digest('hex');
                }
                origSize = origSize < 0 ? fileLen : origSize;
                cb(
                    false, time+prTime, hash, outputBytes.length, origSize
                );
            });
        });
    });
}

function compressHighHuff(inName, outName, prTime, prHash, origSize, cb) {
    /* High Huffman Encoding
     *
     * This scheme of mine creates separate Huffman trees for each byte in the
     * file. It assumes that certain characters are more likely to be followed
     * by certain other characters. If true, then separate trees for each byte
     * should aid the encoder in using as few bits as possible to specify each
     * character. The knowledge of which tree to use is contained in the prior
     * characters, so the decoder should still be able to decompress the file.
     *
     */

    fs.open(inName, 'r', function(err, fd) {
        if (err) return console.log(err);

        var fileLen = fs.statSync(inName)['size'];
        var buffer = new Buffer(fileLen);
        fs.read(fd, buffer, 0, fileLen, 0, function(err, num) {
            if (err) return console.log(err);

            var start = +new Date();

            //count the occurences of all the bytes
            var countsObjs = {}; //a bunch of individual byte counters
            var totals = {};
            for (var ai = 1; ai < fileLen; ai++) { //skip the first byte
                //tally up the totals in the correct spot
                var prevByte = buffer[ai-1];
                if (totals.hasOwnProperty(prevByte)) {
                    totals[prevByte] += 1;
                } else totals[prevByte] = 1;

                //ensure the previous byte has a spot in the counter
                if (!countsObjs.hasOwnProperty(prevByte)) {
                    countsObjs[prevByte] = {};
                }

                //add the current character to the relevant counter
                var relevCounts = countsObjs[prevByte];
                if (relevCounts.hasOwnProperty(buffer[ai])) {
                    relevCounts[buffer[ai]] += 1;
                } else relevCounts[buffer[ai]] = 1;
            }

            //construct the high encoder
            var highEncoder = {};
            var huffTrees = ''; //serialized trees
            for (var b in countsObjs) {
                var currCounts = countsObjs[b];
                var total = totals[b];

                //turn each byte into a leaf HuffNode
                var stack = [];
                for (var k in currCounts) {
                    var node = new HuffNode(currCounts[k]/total, k);
                    stack.push(node);
                }

                //load up all the HuffNodes in a Huffman tree
                var root = new HuffNode();
                if (stack.length > 1) {
                    root = new HuffNode();
                    while (stack.length > 2) {
                        stack.sort(function(a, b) {return a.freq - b.freq;});
                        var merge = new HuffNode();
                        merge.setLeft(stack[0]);
                        merge.setRight(stack[1]);
                        stack.shift(), stack.shift();
                        stack.push(merge);
                    }
                    root.setLeft(stack[0]);
                    root.setRight(stack[1]);
                } else {
                    stack[0].setBit(0);
                    root = stack[0];
                }

                //map each byte to its traversal path
                var encoder = {};
                root.traverse(encoder, '');

                //connect the encoder to the high encoder
                highEncoder[b] = encoder;

                //serialize the trees
                huffTrees += byteToBinString(parseInt(b)); //the previous byte
                huffTrees += root.serialize(); //the corresponding tree
            }

            //assemble the file preamble
            var preamble = '';
            //6 bits: the # of bits to describe the # bytes in the file
            var bitsInFileLen = bitsIn(buffer.length);
            preamble += byteToBinString(bitsInFileLen).substring(2, 8);
            //n bits: how many bytes are in the uncompressed file
            preamble += buffer.length.toString(2);
            //17 bits: number of bits in the serialized Huffman trees
            var bitsInHuffTrees = huffTrees.length;
            preamble += numToBinString(bitsInHuffTrees, 17/8);
            //n bits: the Huffman trees
            preamble += huffTrees;

            //form a bin string by applying the encodings to the input file
            var encodedFile = byteToBinString(buffer[0]); //1st byte is normal
            for (var ai = 1; ai < buffer.length; ai++) {
                //highEncoder is an array of encoders
                encodedFile += highEncoder[buffer[ai-1]][buffer[ai]];
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
            var time = +new Date() - start;
            fs.writeFile(outName, outBuffer, 'binary', function(err) {
                if (err) return cb(err);

                var hash = prHash;
                if (hash === -1) {
                    hash = crypto.createHash('md5')
                                 .update(buffer)
                                 .digest('hex');
                }
                origSize = origSize < 0 ? fileLen : origSize;
                cb(
                    false, time+prTime, hash, outputBytes.length, origSize
                );
            });
        });
    });
}

function decompressTxtSpk(inName, outName, prTime, cb) {
    fs.readFile(inName, 'utf-8', function(err, data) {
        if (err) return console.log(err);

        var start = +new Date();

        //get the replacement mappings
        var idx = data.indexOf('\n');
        var raw = data.substring(0, idx);
        var decoder = JSON.parse(raw);

        //apply the mappings
        var ret = data.substring(idx+1);
        for (var k in decoder) {
            var rgx1 = new RegExp('^'+escapeRegEx(k)+SPLIT_CHAR, 'g');
            var rgx2 = new RegExp(SPLIT_CHAR+escapeRegEx(k)+SPLIT_CHAR, 'g');
            var rgx3 = new RegExp(SPLIT_CHAR+escapeRegEx(k)+'$', 'g');
            while (ret.match(rgx1) || ret.match(rgx2) || ret.match(rgx3)) {
                if (ret.match(rgx2)) {
                    ret = ret.replace(
                        rgx2, SPLIT_CHAR+decoder[k]+SPLIT_CHAR
                    );
                } else if (ret.match(rgx1)) {
                    ret = ret.replace(rgx1, decoder[k]+SPLIT_CHAR);
                } else if (ret.match(rgx3)) {
                    ret = ret.replace(rgx3, SPLIT_CHAR+decoder[k]);
                }
            }
        }

        //write the file to disk
        var time = +new Date() - start;
        fs.writeFile(outName, ret, function (err) {
            if (err) return cb(err);

            var hash = crypto.createHash('md5')
                             .update(ret)
                             .digest('hex');
            cb(false, time+prTime, hash);
        });
    });
}

function decompressHuff(inName, outName, prTime, cb) {
    fs.open(inName, 'r', function(err, fd) {
        if (err) return console.log(err);

        var fileLen = fs.statSync(inName)['size'];
        var buffer = new Buffer(fileLen);
        fs.read(fd, buffer, 0, fileLen, 0, function(err, num) {
            if (err) return console.log(err);

            var start = +new Date();

            //collect the information in the preamble
            var ptr = 0;
            var bitsInOrigFileLen = parseInt(getBits(buffer, ptr, ptr+=6), 2);
            var numSymbolsToDecode = parseInt(
                getBits(buffer, ptr, ptr+=bitsInOrigFileLen), 2
            );
            var bitsInHuffTree = parseInt(getBits(buffer, ptr, ptr+=16), 2);
            var serializedTree = getBits(buffer, ptr, ptr+=bitsInHuffTree);
            var decoder = parseHuffTree(serializedTree);

            //decode the file
            var outputSymbols = [];
            var allPaths = getBits(buffer, ptr, 8*fileLen);
            for (var ai = 0; ai < numSymbolsToDecode; ai++) {
                var result = decoder.traversePath(allPaths, ai);
                outputSymbols.push(result[0]);
                allPaths = result[1];
            }

            //turn the symbols into a bit string
            var decodedFile = '';
            for (var ai = 0; ai < outputSymbols.length; ai++) {
                decodedFile += numToBinString(
                    outputSymbols[ai], SYMBOL_SIZE/8
                );
            }

            //turn those strings of 1s and 0s into a byte array
            //the number of bits must be divisible by 8, so append some
            var numToAppend = (8 - decodedFile.length%8)%8;
            for (var ai = 0; ai < numToAppend; ai++) decodedFile += '0';
            var outputBytes = decodedFile.match(/.{1,8}/g).map(function(a) {
                return parseInt(a, 2);
            });

            //construct the output buffer
            var outBuffer = new Buffer(outputBytes);

            //write the file to disk
            var time = +new Date() - start;
            fs.writeFile(outName, outBuffer, 'binary', function(err) {
                if (err) return cb(err);

                var hash = crypto.createHash('md5')
                                 .update(outBuffer)
                                 .digest('hex');
                cb(false, time+prTime, hash);
            });
        });
    });
}

function decompressLZW(inName, outName, prTime, cb) {
    fs.open(inName, 'r', function(err, fd) {
        if (err) return console.log(err);

        var fileLen = fs.statSync(inName)['size'];
        var buffer = new Buffer(fileLen);
        fs.read(fd, buffer, 0, fileLen, 0, function(err, num) {
            if (err) return console.log(err);

            var start = +new Date();

            //remove the trailing bits that don't do anything
            var binStr = getBits(buffer, 0, 8*fileLen);
            var numToRemove = (8*fileLen)%CHUNK_SIZE;
            binStr = binStr.substring(0, (8*fileLen)-numToRemove);

            //turn the string of bits into chunks
            var rgx = new RegExp('.{'+CHUNK_SIZE+'}', 'g');
            var inputChunks = binStr.match(rgx).map(function(a) {
                return parseInt(a, 2);
            });

            //helper functions for building the dictionary
            var idx = 0;
            function readCode() {
                if (idx >= inputChunks.length) return false;
                else {
                    idx++;
                    return inputChunks[idx-1];
                }
            }
            var outputBytes = [];
            function output(arr) { //outputs each byte in arr
                for (var ai = 0; ai < arr.length; ai++) {
                    outputBytes.push(arr[ai]);
                }
            }

            //construct the dictionary
            var maxIdx = Math.pow(2, CHUNK_SIZE);
            var nextIdx = 256;
            var rdict = []; //reverse dictionary
            for (var ai = 0; ai < nextIdx; ai++) rdict[ai] = [ai]; //load it ip

            var entry;
            var c = inputChunks[0]; //current code
            var p = [c]; //previous string
            output(p);
            for (var ai = 1; ai < inputChunks.length; ai++) {
                c = inputChunks[ai];
                if (rdict[c]) {
                    entry = rdict[c];
                    output(entry);
                    if (nextIdx < maxIdx) {
                        var newEntry = p.slice(0);
                        newEntry.push(entry[0]);
                        rdict[nextIdx] = newEntry, nextIdx++;
                    }
                    p = entry.slice(0);
                } else {
                    entry = p.slice(0), entry.push(p[0]);
                    output(entry);
                    if (nextIdx < maxIdx) {
                        rdict[nextIdx] = entry, nextIdx++;
                    }
                    p = entry.slice(0);
                }
            }

            //construct the output buffer
            var outBuffer = new Buffer(outputBytes);

            //write the file to disk
            var time = +new Date() - start;
            fs.writeFile(outName, outBuffer, 'binary', function(err) {
                if (err) return cb(err);

                var hash = crypto.createHash('md5')
                                 .update(outBuffer)
                                 .digest('hex');
                cb(false, time+prTime, hash);
            });
        });
    });
}

/********************
 * helper functions */
function tokenize(str) {
    var ret = str.split(new RegExp('('+SPLIT_CHAR+'+)', 'g'));
    for (var ai = 0; ai < ret.length; ai++) {
        if (ret[ai].match(new RegExp('[^'+SPLIT_CHAR+']', 'g'))) continue;

        if (ai === 0)ret[ai+1] = ret[ai]+ret[ai+1];
        else ret[ai-1] += ret[ai].substring(1);

        ret.splice(ai, 1), ai--;
    }
    return ret;
}

function getOrder(str) { //unigram, bigram, trigram, etc...
    var ret = str.replace(
        new RegExp('^'+SPLIT_CHAR+'+|'+SPLIT_CHAR+'+$', 'g'), ''
    );
    var search = ret.match(new RegExp(SPLIT_CHAR+'+', 'g'));
    return search ? search.length : 0;
}

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
            var value = parseInt(tree.substring(1, SYMBOL_SIZE+1), 2);
            node = new HuffNode(0, value); //freq doesn't matter
            tree = tree.substring(SYMBOL_SIZE+1);
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

/* 
| stolen from https://developer.mozilla.org/en-US/docs/Web/JavaScript/
|   Guide/Regular_Expressions#Using_Special_Characters
*/
function escapeRegEx(str) {
    return str.replace(/([.*+?^=!:${}()|\[\]\/\\])/g, "\\$1");
}

function toPercent(percentage, places) {
    return round(100*percentage, places)+'%';
}

function round(n, p) {
    var f = Math.pow(10, p);
    return Math.round(f*n)/f;
}

/***********
 * objects */
function StringIteratorMonad(s) {
    var ret = arguments.length > 0 ? s : incrString('');
    return function() {
        return ret;
    };
}
function mb(f, mv) { //monad bind
    return StringIteratorMonad(f(mv));
}
function mIncrString(mv) {
    return incrString(mv());
}
function incrString(str) {
    var low = 33, high = 126; //both inclusive
    var l = str.length;
    
    if (l === 0) return String.fromCharCode(low);

    var lastCharsCharCode = str.charCodeAt(l-1);
    if (lastCharsCharCode < high) { //then you can just increment it
        return str.substring(0, l-1)+String.fromCharCode(lastCharsCharCode+1);
    } else if (l === 1) { 
        return new Array(l+2).join(String.fromCharCode(low));
    } else {
        return incrString(str.substring(0,l-1))+String.fromCharCode(low);
    }
}

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
    if (this.value !== undefined) { //leaf nodes are easy peasy
        return '1'+numToBinString(this.value, SYMBOL_SIZE/8);
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
        if (fileName.indexOf('~') === 0) return; //skip these files

        //compress the file
        compress(
            inputDir+fileName,
            glacierDir+fileName+CMPR_SFX,
            function(err, compTime, hashOfInput, newSize, oldSize) {
                if (err) return console.log(err);

                //report the results of the compression
                var pct = toPercent(newSize/oldSize, 2);
                console.log(
                    'Compressed '+fileName+' '+
                    'to '+pct+'% its original size '+
                    'in '+compTime+'ms'
                );

                //decompress the file
                decompress(
                    glacierDir+fileName+CMPR_SFX,
                    tmpDir+fileName+CMPR_SFX,
                    outputDir+fileName,
                    function(err, decompTime, hashOfDec) {
                        if (err) return console.log(err);

                        //compare the hashes
                        var success = hashOfInput === hashOfDec;
                        var prefix = success ? 'S' : '--- Uns';

                        //report the results of the decompression
                        console.log(
                            prefix+'uccessfully '+
                            'decompressed '+fileName+CMPR_SFX+' '+
                            'in '+decompTime+'ms'
                        );
                    }
                );
            }
        );
    });
});
