var moment = require('moment');

module.exports = {
    getTimeStamp : function () {
        return moment().format('YYYYMMDDHHmmssSSS');
    },
    // (123)[object Number] ('123')[object String] (undefined)[object Undefined] (true)[object Boolean]
    // ({})[object Object] ([])[object Array] (function(){}) [object Function]
    is : function(target,type){
        return Object.prototype.toString.call(target).slice(8,-1) === type;
    },
    getClientIp: function (req) {
        return req.headers['x-real-ip'] ||
            req.headers['x-forwarded-for'] ||
            req.connection.remoteAddress ||
            req.socket.remoteAddress ||
            req.connection.socket.remoteAddress;
    },
    fillValue: function (strValue, length) {
        var tmpValue = strValue;
        if (!strValue) {
            tmpValue = '';
        }
        if (typeof tmpValue != 'string') {
            tmpValue = tmpValue + '';
        }

        if (tmpValue.length > length) {
            return tmpValue.slice(0, length);
        }
        else {
            for (var i = tmpValue.length; i < length; i++) {
                tmpValue = '0' + tmpValue;
            }
            return tmpValue;
        }

    },
    toBoolean: function (booleanStr) {
        return booleanStr == 'true'
    }

};