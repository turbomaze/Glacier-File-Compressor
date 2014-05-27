/******************\
|   Glacier File   |
|    Compressor    |
| @author Anthony  |
| @version 0.1     |
| @date 2014/05/21 |
| @edit 2014/05/21 |
\******************/

var fs = require('fs');
var crypto = require('crypto');

/**********
 * config */
var MAX_NUM_REPL = 14000;
var MAX_N_GRAM = 2;
var SPLIT_CHAR = ' ';

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
    fs.readFile(fileName, 'utf-8', function(err, data) {
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
            var score = token.length*countsObj[token]; //number of characters saved
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
        var compFileName = glacierDir + fileName.substring(
            inputDir.length
        ) + COMP_SUFFIX;
        var time = +new Date() - start;
        fs.writeFile(compFileName, ret, function (err) {
            if (err) return callback(err);

            var hash = crypto.createHash('md5')
                             .update(data)
                             .digest('hex');
            callback(false, time, hash, ret.length, data.length);
        });
    });
}

function decompress(fileName, callback) {
    fs.readFile(fileName, 'utf-8', function(err, data) {
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
        var decompFileName = outputDir + fileName.substring(
            glacierDir.length, fileName.length - COMP_SUFFIX.length
        );
        var time = +new Date() - start;
        fs.writeFile(decompFileName, ret, function (err) {
            if (err) return callback(err);

            var hash = crypto.createHash('md5')
                             .update(ret)
                             .digest('hex');
            callback(false, time, hash, ret.length, data.length);
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

/* 
stolen from https://developer.mozilla.org/en-US/docs/Web/JavaScript/
            Guide/Regular_Expressions#Using_Special_Characters
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

fs.readdir(inputDir, function(err, files) {
    if (err) return console.log(err);

    files.forEach(function(fileName) {
        if (fileName.indexOf('~') === 0) return; //skip these files

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
                        var prefix = success ? 'S' : '--- Uns';

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

