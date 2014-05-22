/******************\
|   Glacier File   |
|    Compressor    |
| @author Anthony  |
| @version 0.1     |
| @date 2014/05/21 |
| @edit 2014/05/21 |
\******************/

var fs = require('fs');

/**********
 * config */
var MAX_NUM_REPL = 10000;
var SPLIT_CHAR = ' ';

/******************
 * work functions */
fs.readFile('test', 'ascii', function(err, data) {
    if (err) return console.log(err);

    //for statistics
    startSize = data.length;

    //get a good list of replacement strings
    var gen = StringIteratorMonad();
    var replacements = [];
    for (var ai = 0; ai < MAX_NUM_REPL; ai++) {
        while (data.indexOf(gen()) > -1) gen = mb(mIncrString, gen);
        replacements.push(gen());
        gen = mb(mIncrString, gen);
    }
    
    //count all the individual words
    var tokens = data.split(SPLIT_CHAR);
    var countsObj = {};
    for (var ai = 0; ai < tokens.length; ai++) {
        var t = tokens[ai];
        if (countsObj.hasOwnProperty(t)) countsObj[t] += 1;
        else countsObj[t] = 1;
    }

    //load those counts into an array and sort them
    var counts = [];
    for (var token in countsObj) counts.push([token, countsObj[token]]);
    counts.sort(function(a, b) {
        return b[1] - a[1];
    });

    //map the most repeated words to the replacement strings
    var encodeMap = {};
    var decodeMap = {};
    var idx = 0;
    for (var ai = 0; ai < counts.length, ai < MAX_NUM_REPL; ai++) {
        var t = counts[ai][0], repl = replacements[idx];
        if (repl.length < t.length && counts[ai][1] > 1) {
            encodeMap[t] = repl, decodeMap[repl] = t;
            idx++;
        }
    }

    //go through the tokens and replace each token with its mapping
    for (var ai = 0; ai < tokens.length; ai++) {
        var t = tokens[ai];
        if (encodeMap.hasOwnProperty(t) && encodeMap[t].length < t.length) {
            tokens[ai] = encodeMap[t];
        }
    }
    
    //assemble the output
    var ret = JSON.stringify(decodeMap)+'\n'+tokens.join(SPLIT_CHAR);
    
    //write it to a file
    fs.writeFile('out', ret, function (err) {
        if (err) return console.log(err);
        console.log('Loaded compress file into out.');
        console.log(
            'Compression ratio: '+(''+100*ret.length/startSize).substring(0,5)+'%'
        );
    });
});

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
    var lastCharsCharCode = str.charCodeAt(l-1);
    if (lastCharsCharCode < high) { //then you can just increment it
        return str.substring(0, l-1)+String.fromCharCode(lastCharsCharCode+1);
    } else { //this means it equals the maximum value -> add a new char
        return new Array(l+2).join(String.fromCharCode(low));
    }
}
