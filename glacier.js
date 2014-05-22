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
var MAX_NUM_REPL = 47;
var REPL_LEN = 2;
var SPLIT_CHAR = ' ';

fs.readFile('test', 'ascii', function(err, data) {
    if (err) return console.log(err);

    //get a good list of replacement strings
    var replacements = [];
    for (var ai = 0; ai < MAX_NUM_REPL; ai++) {
        var cand = 'a';
        while (data.indexOf(cand) > -1 || replacements.indexOf(cand) > -1) {
            cand = getRandStr(REPL_LEN);
        }
        replacements.push(cand);
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
        console.log('{compressed file} > out');
    });
});

function getRandStr(len, alpha) {
    alpha = alpha || 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
	var ret = '';
	while (ret.length < len) ret += alpha.charAt(getRandInt(0, alpha.length));
	return ret;
}

function getRandInt(low, high) { //output is in [low, high)
    return Math.floor(low + Math.random()*(high-low));
}
