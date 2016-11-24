/**
 * Created by chenchangyu on 2016/9/9 0009.
 * @author chenchangyu
 */
var CFG = require('../config/WXConfig');
var utils = require('../util/utils');
var crypto = require('crypto');
var _ = require('underscore');
var moment = require('moment');

function WxPayDataBase() {
    this.params = {};
}
WxPayDataBase.prototype = {

    /**
     * 输出xml字符
     * @throws WxPayException
     **/
    paramsToXml: function () {
        var xml = "<xml>";
        for (var key in this.params) {
            var val = this.params[key];
            if (typeof val == "number") {
                xml += "<" + key+ ">" + val + "</" + key + ">";
            }
            else {
                xml += "<" + key + "><![CDATA[" + val + "]]></" + key + ">";
            }
        }
        xml += "</xml>";

        return xml;
    },

    /**
     * 将xml转为json
     * npm install xml2js
     * @param string xml
     */
    fromXml: function (xml) {
        var str = {};
        if (!xml) {
            throw "xml数据异常";
        }
        var parseString = require('xml2js').parseString;
        parseString(xml, {explicitArray : false},function (err, res) {
            str = res;
        });
        this.params = str.xml;
        return this.params;
    },

    /**
     * 将参数转换为url形式:'k=3&p=4.....'
     */
    toSortedUrlParams: function () {
        var paramsToUse = this.params, keys = Object.keys(paramsToUse).sort(), newArgs = {}, stringA = '';
        keys.forEach(function (key) {

            if (!utils.is(paramsToUse[key], 'Undefined') && paramsToUse[key] != 'sign' && !utils.is(paramsToUse[key], 'Object') && paramsToUse[key] != '') {
                newArgs[key] = paramsToUse[key];
            }
        });
        for (var k in newArgs) {
            stringA += '&' + k + '=' + newArgs[k];
        }
        return stringA.substr(1);

    },


    /**
     * 生成签名
     * @return string，本函数不覆盖sign成员变量
     */
    makeSign: function () {
        //签名步骤一： 将数组转换成url键值对
        var string = "";
        string = this.toSortedUrlParams(this.params);
        //签名步骤二：在string后加入KEY
        string = string + "&key=" + CFG.KEY;
        //签名步骤三：MD5加密
        string = crypto.createHash("md5").update(string,'utf-8').digest("hex").toUpperCase();
        //签名步骤四：所有字符转为大写
        return string;
    },

    /*
     * 设置参数
     * */
    setParam: function (key, value) {
        this.params[key] = value;
    },
    /*
     * 返回参数
     * */
    getParams: function (key, value) {
        return this.params;
    },
    /*
    * 初始化配置的固定参数
    * */
    initParam :function (tradeType) {
        this.params['appid'] = CFG.APP_ID;
        this.params['mch_id'] = CFG.MCH_ID;
        this.params['trade_type'] = CFG.TRADE_TYPE[tradeType] || CFG.TRADE_TYPE.JSAPI;
        this.params['notify_url'] = CFG.NOTIFY_URL;
        var timestamp = moment().format('YYYYMMDDHHmmssSSS');
        this.params['nonce_str'] =  timestamp + Math.random().toString(36).substr(2, 15);
    },
    checkParams : function () {
        var resultData = {result:true, message:''};
        if(!this.params['appid']){
            resultData.result = false;
            resultData.message = '公众号appId不存在';
        }

        return resultData;
    }
};

module.exports = WxPayDataBase;





