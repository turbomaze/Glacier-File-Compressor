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
var MAX_NUM_REPL = 13750
var SPLIT_CHAR = ' ';
var IN_FILE = 'test.txt';
var OUT_FILE = 'out.txt';

/*************
 * constants */
var splitCharsPatn = new RegExp(SPLIT_CHAR, 'g');

/*********************
 * working variables */
var startTime = +new Date();

/******************
 * work functions */
fs.readFile(IN_FILE, 'ascii', function(err, data) {
    if (err) return console.log(err);

    //get a good list of replacement strings
    var gen = StringIteratorMonad();
    var replacements = [];
    for (var ai = 0; ai < MAX_NUM_REPL; ai++) {
        while (data.indexOf(gen()) > -1) gen = mb(mIncrString, gen);
        replacements.push(gen());
        gen = mb(mIncrString, gen);
    }

    //count the unigrams
    var tokens = data.split(SPLIT_CHAR);
    var countsObj = {};
    for (var ai = 0; ai < tokens.length; ai++) {
        var t = tokens[ai];
        if (countsObj.hasOwnProperty(t)) countsObj[t] += 1;
        else countsObj[t] = 1;
    }

    //count the bigrams
    for (var ai = 0; ai < tokens.length-1; ai++) {
        var t = tokens[ai]+SPLIT_CHAR+tokens[ai+1];
        if (countsObj.hasOwnProperty(t)) countsObj[t] += 1;
        else countsObj[t] = 1;
    }

    //count the trigrams
    for (var ai = 0; ai < tokens.length-2; ai++) {
        var t = tokens[ai]+SPLIT_CHAR+tokens[ai+1]+SPLIT_CHAR+tokens[ai+2];
        if (countsObj.hasOwnProperty(t)) countsObj[t] += 1;
        else countsObj[t] = 1;
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

    //sort them
    scores.sort(function(a, b) {
        return b[1] - a[1]; //by their score
    });

    //map the most repeated words to the replacement strings
    var encodeMap = [];
    var decodeMap = {};
    var idx = 0;
    for (var ai = 0; ai < scores.length && ai < MAX_NUM_REPL; ai++) {
        var t = scores[ai][0], repl = replacements[idx];
        var adjScore = scores[ai][1] - countsObj[t]*repl.length;
        if (adjScore > 0) {
            encodeMap.push([t, repl]); //an array because order matters
            decodeMap[repl] = t;
            idx++;
        }
    }

    //only include necessary mappings
    var smallDecodeMap = {};

    //step through the replacements
    for (var ai = 0; ai < encodeMap.length; ai++) {
        var search = encodeMap[ai][0].match(splitCharsPatn);
        var ngram = search ? search.length : 0;
        var tmp = [];
        for (var bi = 0; bi < tokens.length-ngram; bi++) {
            var t = tokens[bi];
            for (var ti = 1; ti <= ngram; ti++) t += SPLIT_CHAR+tokens[bi+ti];
            if (t === encodeMap[ai][0]) {
                tmp.push(encodeMap[ai][1]);
                if (!smallDecodeMap.hasOwnProperty(encodeMap[ai][1])) {
                    smallDecodeMap[encodeMap[ai][1]] = t;
                }
                bi += ngram;
            } else tmp.push(tokens[bi]);
        }
        tokens = tmp;
    }

/*
    //replace the trigrams
    var trigramTmp = [];
    for (var ai = 0; ai < tokens.length-2; ai++) {
        var t = tokens[ai]+SPLIT_CHAR+tokens[ai+1]+SPLIT_CHAR+tokens[ai+2];
        if (encodeMap.hasOwnProperty(t)) {
            trigramTmp.push(encodeMap[t]);
            if (!smallDecodeMap.hasOwnProperty(encodeMap[t])) {
                smallDecodeMap[encodeMap[t]] = t;
            }
            ai += 2;
        } else trigramTmp.push(tokens[ai]);
    }
    tokens = trigramTmp;

    //replace the bigrams
    var bigramTmp = [];
    for (var ai = 0; ai < tokens.length-1; ai++) {
        var t = tokens[ai]+SPLIT_CHAR+tokens[ai+1];
        if (encodeMap.hasOwnProperty(t)) {
            bigramTmp.push(encodeMap[t]);
            if (!smallDecodeMap.hasOwnProperty(encodeMap[t])) {
                smallDecodeMap[encodeMap[t]] = t;
            }
            ai += 1;
        } else bigramTmp.push(tokens[ai]);
    }
    tokens = bigramTmp;

    //replace the unigrams
    for (var ai = 0; ai < tokens.length; ai++) {
        var t = tokens[ai];
        if (encodeMap.hasOwnProperty(t) && encodeMap[t].length < t.length) {
            tokens[ai] = encodeMap[t];
            if (!smallDecodeMap.hasOwnProperty(encodeMap[t])) {
                smallDecodeMap[encodeMap[t]] = t;
            }
        }
    }
*/
    
    //assemble the output
    var ret = JSON.stringify(smallDecodeMap)+'\n'+tokens.join(SPLIT_CHAR);
    
    //write it to a file
    fs.writeFile(OUT_FILE, ret, function (err) {
        if (err) return console.log(err);
        
        var duration = (+new Date() - startTime)+'ms';
        console.log(
            'Compressed '+IN_FILE+' into '+OUT_FILE+' in '+duration
        );
        console.log(
            'Compression ratio: '+toPercent(ret.length/data.length, 2)
        );
        console.log('\twith '+MAX_NUM_REPL+' replacement mappings at most');
    });
});

/********************
 * helper functions */
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



