module.exports = {
    random(min, max, precision = 0) {
        precision = Math.pow(10, precision);
    
        min = min * precision;
        max = max * precision;
        return (Math.floor(Math.random() * (max - min + 1)) + min) / precision;
    },
    generateHexID(leng) {
        let hashTable = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "a", "b", "c", "d", "e", "f"];
        let str = "";
        while (leng--) {
            str += hashTable[this.random(0, 15)];
        }
        return str;
    }
};