var moment = require('moment');
var CFG = require('../config/WXConfig');
var utils = require('../util/utils');
var request = require('superagent');
var xml2js = require('xml2js');

/**
 *
 * 微信扫码支付API列表的封装
 params = {
 access_token:'xxx',
 openid :'xxxxxx'
  ...//不需要refreshtoken
 }
 */

module.exports = {

    //关闭订单
    closeOrder: function (xmlData, Callback) {
        request.post(CFG.ORDER_CLOSE_URL)
            .set('Content-Type', 'application/xml;charset=utf-8')
            .send(xmlData)
            .end(function (error, httpResponse) {
                if (httpResponse.ok) {
                    var parser = new xml2js.Parser({explicitArray: false});
                    parser.parseString(httpResponse.text, function (error, result) {
                        Callback(result, null);
                    });
                }
                else {
                    Callback(null, "网络请求异常");
                }
            });
    },
    //获取订单信息
    queryOrder: function (xmlData, Callback) {
    request.post(CFG.ORDER_QUERY_URL)
        .set('Content-Type', 'application/xml;charset=utf-8')
        .send(xmlData)
        .end(function (error, httpResponse) {
            if (httpResponse.ok) {
                var parser = new xml2js.Parser({explicitArray: false});
                parser.parseString(httpResponse.text, function (error, result) {
                    Callback(result, null);
                });
            }
            else {
                Callback(null, "网络请求异常");
            }
        });
    },

    //通过scope = snsapi_userinfo 获取用户信息
    getUserInfo: function (params, callback) {
        var userInfoUrl = 'https://api.weixin.qq.com/sns/userinfo?access_token='+params.access_token+'&openid='+params.openid+'&lang=zh_CN';
        request.get(userInfoUrl)
            .set('Accept', 'application/json')
            .end(function (err, httpResponse) {
                if (httpResponse && httpResponse.status === 200) {
                    callback(JSON.parse(httpResponse.text));
                }
                else {
                    callback(null, "failed to get weixin userInfo");
                }
            });
    },

    //通过订阅获取用户信息
    getSubscribeUserInfo: function (accessToken, openId, callback) {
        var userInfoUrl = 'https://api.weixin.qq.com/cgi-bin/user/info?access_token=' + accessToken + '&openid=' + openId + '&lang=zh_CN'
        request.get(userInfoUrl)
            .set('Accept', 'application/json')
            .end(function (err, httpResponse) {
                if (httpResponse && httpResponse.status === 200) {
                    callback(JSON.parse(httpResponse.text));
                }
                else {
                    callback(null, "failed to get Subscribe userInfo");
                }
            });
    },
/*
* 返回格式:
* { "access_token":"ACCESS_TOKEN",
    "expires_in":7200,
    "refresh_token":"REFRESH_TOKEN",
    "openid":"OPENID",
    "scope":"SCOPE"
    }
*
* */
    getUserInfoAccessToken : function(code, callback){
        var tokenUrl = 'https://api.weixin.qq.com/sns/oauth2/access_token?appid='+CFG.APP_ID+'&secret='+CFG.APP_SECRET+'&code='+code+'&grant_type=authorization_code';
        request.get(tokenUrl)
            .set('Accept', 'application/json')
            .end(function (err, httpResponse) {
                if (httpResponse && httpResponse.status === 200) {
                    callback(JSON.parse(httpResponse.text));
                }
                else {
                    callback(null, "failed to get userInfo access_token failed");
                }
            });

    },

    unifiedOrder: function (xmlData, Callback) {
        request.post(CFG.UNIFIED_ORDER_URL)
            .set('Content-Type', 'application/xml;charset=utf-8')
            .send(xmlData)
            .end(function (error, httpResponse) {
                if (httpResponse.ok) {
                    var parser = new xml2js.Parser({explicitArray: false});
                    parser.parseString(httpResponse.text, function (error, result) {
                        Callback(result, null);
                    });
                }
                else {
                    Callback(null, "网络请求异常");
                }
            });
    },
    getAccessToken: function (callback) {
        var accessTokenTokenUrl = 'https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=' + CFG.APP_ID + '&secret=' + CFG.APP_SECRET;
        request.get(accessTokenTokenUrl)
            .set('Accept', 'application/json')
            .end(function (err, httpResponse) {
                if (httpResponse && httpResponse.status === 200) {
                    callback(JSON.parse(httpResponse.text));
                }
                else {
                    callback(null, "failed to refresh access token");
                }
            });

    },
    getJsapiTicket: function (accessToken, callback) {
        var jsapiTicketUrl = 'https://api.weixin.qq.com/cgi-bin/ticket/getticket?access_token='+accessToken+'&type=jsapi';
        request.get(jsapiTicketUrl)
            .set('Accept', 'application/json')
            .end(function (err, httpResponse) {
                if (httpResponse && httpResponse.status === 200) {
                    callback(JSON.parse(httpResponse.text));
                }
                else {
                    callback(null, "failed to get jsapi ticket");
                }
            });
    }


}

