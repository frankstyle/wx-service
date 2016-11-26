var crypto = require('crypto');
var moment = require('moment');
var utils = require('../util/utils');
var WXPayData = require('../lib/WXPayData');
var WXApi = require('../lib/WXApi');
var config = require('../config/WXConfig');
var debug = require('debug')('WXService');

//Redis 缓存access_token
var redisClient = require('../redis').redisClient;
var https = require('https');

// 验证微信公众号接入签名
function checkSignature(signature, timestamp, nonce, echostr, callback) {
    var oriStr = [config.TOKEN, timestamp, nonce].sort().join('');
    var code = crypto.createHash('sha1').update(oriStr).digest('hex');
    debug('signature code:', code);
    if (code == signature) {
        callback(null, echostr);
    } else {
        callback('signature invalid to access', null);
    }
}

// 获取access_token (已考虑过期问题)用于接口鉴权
function getAccessToken(callback) {
    redisClient.getAsync(config.ACCESS_TOKEN_NAME).then(function (accessToken) {
        if (accessToken) {
            debug('get access token from redis store...');
            callback(null, accessToken);
        }
        else {
            debug('access token not in redis, refresh access token.');
            WXApi.getAccessToken(function (data, err) {
                if (!data || !data.access_token) {
                    callback('refresh token failed', null);
                } else {
                    debug('get access token from server success');
                    redisClient.msetAsync(config.ACCESS_TOKEN_NAME, data.access_token).catch(console.error);
                    //设置过期时间比微信的过期时间早1分钟,考虑延迟
                    redisClient.expire(config.ACCESS_TOKEN_NAME, parseInt(data.expires_in) - 60);
                    callback(null, data.access_token);
                }
            });
        }
    });
};

// 获取jsapiTicket (已考虑过期问题)用于公众号调取支付接口
function getJsapiTicket(callback) {
    redisClient.getAsync(config.JSAPI_TICKET_NAME).then(function (accessToken) {
        if (accessToken) {
            debug('get jsapi ticket from redis store...');
            callback(null, accessToken);
        }
        else {
            debug('jsapi ticket not in redis, refresh jsapi ticket.');
            getAccessToken(function (error, accesstoken) {
                if (!accesstoken) {
                    callback('get access token faild', null);
                }
                else {
                    //已经全局缓存access_token
                    WXApi.getJsapiTicket(accesstoken, function (data, err) {
                        if (!data || !data.ticket) {
                            callback('get jsapi ticket from server faild', null);
                        }
                        else {
                            debug('get jsapi ticket from server success');
                            redisClient.msetAsync(config.JSAPI_TICKET_NAME, data.ticket).catch(console.error);
                            //设置过期时间比微信的过期时间早1分钟,考虑延迟
                            redisClient.expire(config.JSAPI_TICKET_NAME, parseInt(data.expires_in) - 60);
                            callback(null, data.ticket);
                        }
                    });
                }
            });
        }
    });
};

//微信公众号接入
 function receiveMessage (request, response, callback) {
    var params = request.body;
        debug('receive message from official account');
        if (params && params.xml) {
            if (params.xml.MsgType == 'event') {
                callback(params.xml.Event, params.xml);
            }
            else {
                callback(params.xml.MsgType, params.xml);
            }
        }
        else {
            response.send('unknown message received');
        }
};

//通过scope = snsapi_userinfo 获取用户信息
function getWXUserInfo(code, callback) {
    WXApi.getUserInfoAccessToken(code, function (tokenData, err) {
        if (tokenData) {
            if (tokenData.openid && tokenData.access_token) {
                WXApi.getUserInfo(tokenData, function (userData, error) {
                    if (userData) {
                        //获取用户信息成功
                        if (userData.openid) {
                            callback(null, userData);
                        }
                        else {
                            callback(userData.errmsg, null);
                        }
                    }
                    else {
                        callback(error, null);
                    }

                });
            }
            else {
                callback(tokenData.errmsg, null);
            }
        }
        else {
            callback(err, null);
        }

    });
}

//获取jsapi签名信息
// param 调用jsapi支付请求的url
function getJsapiSignature(url, callback) {
    var noncestr = getNonceStr();
    var timestamp = parseInt(new Date().getTime() / 1000) + '';
    getJsapiTicket(function (err, jsapiTicket) {
        if (!jsapiTicket) {
            callback(null, 'get jsapi ticket failed');
        }
        else {
            var tmpStr = 'jsapi_ticket=' + jsapiTicket + '&noncestr=' + noncestr
                + '&timestamp=' + timestamp + '&url=' + url;
            var signature = crypto.createHash('sha1').update(tmpStr).digest('hex');
            var jsapiConfig = {
                appId: config.APP_ID,
                timestamp: timestamp,
                noncestr: noncestr,
                signature: signature,
                url: url
            }
            callback(jsapiConfig, null);
        }
    });
};

//通过openid 获取用户信息
function getSubscribeUserInfo(openId, callback) {
    getAccessToken(function (error, token) {
        if (token) {
            WXApi.getSubscribeUserInfo(token, openId, function (userInfo, err) {
                if (userInfo) {
                    callback(null, userInfo);
                }
                else {
                    callback(err, null);
                }
            })
        } else {
            callback(error, null);
        }
    });
};

//创建订单号
function unifiedOrder(params, req, callback) {

    var orderParams = new WXPayData();
    //设置request传入的参数
    for (var param  in params) {
        orderParams.setParam(param, params[param]);
    }
    orderParams.initParam(params['trade_type']);
    orderParams.setParam("spbill_create_ip", utils.getClientIp(req));
    //TODO 本地测试IP
    debug('spbill_ip :'+utils.getClientIp(req));
    orderParams.setParam("spbill_create_ip", '10.11.21.33');
    var result = orderParams.checkParams();
    var sign = orderParams.makeSign();
    orderParams.setParam('sign', sign);
    WXApi.unifiedOrder(orderParams.paramsToXml(), function (data, err) {
        if (data) {
            if (data.xml.return_code === 'SUCCESS') {
                if (data.xml.result_code === 'SUCCESS') {
                    debug('unifiedOrder : '+JSON.stringify(data.xml));
                    callback(data.xml, null);
                }
                else {
                    result.code = -1;
                    result.message = data.xml.err_code_des;
                    callback(null, result);
                    return;
                }
            }
            else {
                result.code = -1;
                result.message = data.xml.return_msg;
                callback(null, result);
                return;
            }
        }
        else {
            result.code = -1;
            result.message = err;
            callback(null, result);
        }

    });
};
/*
 {
    out_trade_no:'xxx'
 }
 或
 {
    transaction_id:'xxx'
 }
*
* */
function queryOrder(orderParam, callback) {

    var paramData = new WXPayData();
    var nonceStr = getNonceStr();
    paramData.setParam("appid", config.APP_ID);
    paramData.setParam("mch_id", config.MCH_ID);
    //商户订单号和微信订单号传入一个即可
    if (orderParam['out_trade_no']) {
        paramData.setParam("out_trade_no", orderParam['out_trade_no']);
    }
    else if (orderParam['transaction_id']) {
        paramData.setParam("transaction_id", orderParam['transaction_id']);
    }
    paramData.setParam("nonce_str", nonceStr);
    paramData.setParam("sign_type", "MD5");
    var sign = paramData.makeSign();
    paramData.setParam('sign', sign);

    WXApi.queryOrder(paramData.paramsToXml(), function (data, err) {
        var result = {};
        if (data) {
            if (data.xml.return_code === 'SUCCESS') {
                if (data.xml.result_code === 'SUCCESS') {
                    callback(data.xml, null);
                }
                else {
                    result.code = -1;
                    result.message = data.xml.err_code_des;
                    callback(null, result);
                    return;
                }
            }
            else {
                result.code = -1;
                result.message = data.xml.return_msg;
                callback(null, result);
                return;
            }
        }
        else {
            result.code = -1;
            result.message = err;
            callback(null, result);
        }
    });
}

function closeOrder(outTradeNO, callback) {
    var paramData = new WXPayData();
    var nonceStr = getNonceStr();
    paramData.setParam("appid", config.APP_ID);
    paramData.setParam("mch_id", config.MCH_ID);
    paramData.setParam("out_trade_no", outTradeNO);
    paramData.setParam("nonce_str", nonceStr);
    paramData.setParam("sign_type", "MD5");
    var sign = paramData.makeSign();
    paramData.setParam('sign', sign);

    WXApi.closeOrder(paramData.paramsToXml(), function (data, err) {
        var result = {};
        if (data) {
            if (data.xml.return_code === 'SUCCESS') {
                if (data.xml.result_code === 'SUCCESS') {
                    callback(data.xml, null);
                }
                else {
                    debug(data.xml);
                    result.code = -1;
                    result.message = data.xml.err_code_des;
                    callback(null, result);
                    return;
                }
            }
            else {
                result.code = -1;
                result.message = data.xml.return_msg;
                callback(null, result);
                return;
            }
        }
        else {
            result.code = -1;
            result.message = err;
            callback(null, result);
        }
    });
}

//创建订单后,进行参数签名,用于公众号前台调用
function getSignedJSBridgeParams(package) {
    var paramData = new WXPayData();
    var timeStamp = parseInt(new Date().getTime() / 1000) + '';
    var nonceStr = getNonceStr();
    var signType = "MD5";
    paramData.setParam("appId",config.APP_ID);
    paramData.setParam("timeStamp",timeStamp);
    paramData.setParam("nonceStr",nonceStr);
    paramData.setParam("signType",signType);
    paramData.setParam("package",package);

    var paySign = paramData.makeSign();
    paramData.setParam("paySign",paySign);

    return paramData.getParams();
}

//32位随机字符串
function getNonceStr() {
    var timestamp = moment().format('YYYYMMDDHHmmssSSS');
    return timestamp + Math.random().toString(36).substr(2, 15);
};



var emptyResponse = {
  xml:{
            ToUserName: '',
            FromUserName: '',
            CreateTime: new Date().getTime(),
            MsgType: 'text',
            Content: ' '
          }
}

function saveWeiXinToken(accesTokenResponse,cb){
  var wx = new WeiXinToken();
  wx.set('token', accesTokenResponse);

  wx.save().then(function(t){
    console.log('保存Token到数据库成功：'+accesTokenResponse.access_token);
    cb(null,t.token);
  },function(error){
    console.log('保存Token到数据库失败');
    cb('save error',null);
  })

}

// 发送客服消息
/*
 {
 "touser":"OPENID",
 "msgtype":"text",
 "text":
 {
 "content":"Hello World"
 }
 }
 */
function sendMessage(messageData, callback) {
    getAccessToken(function (error, accessToken) {
        if (accessToken) {
            WXApi.sendMessage(accessToken, messageData, function (resData, error) {
                callback(error, resData);
            });

        } else {
            console.log('can not get access token.', null);
        }
    });
}

function saveUserInfo(userInfoResponse,cb){
/*    var aquery = new AV.Query('WeiXinUser');
    aquery.equalTo('openId', userInfoResponse.openid);
    aquery.first().then(function (data) {
        if (data) {
            data.save({
                userInfo: userInfoResponse,
                status: 'focused'
            }).then(function () {
                    console.log('保存用户到数据库成功：'+userInfoResponse.openid);
                    cb(null,userInfoResponse.openid);
            }, function () {
                console.log('保存用户到数据库失败');
                cb('save userinfo error',null);
            });
        } else {
            var user = new WeiXinUser();
            user.set('userInfo', userInfoResponse);
            user.set('openId', userInfoResponse.openid);
            user.save({
                status: 'focused'
            }).then(function(t){
                console.log('保存用户到数据库成功：'+userInfoResponse.openid);
                cb(null,userInfoResponse.openid);
            },function(error){
                console.log('保存用户到数据库失败');
                cb('save userinfo error',null);
            });
        };
    });*/
}

exports.checkSignature = checkSignature;
exports.sendMessage = sendMessage;
exports.receiveMessage = receiveMessage;
exports.getNonceStr = getNonceStr;
exports.getAccessToken = getAccessToken;
exports.getJsapiTicket = getJsapiTicket;
exports.getJsapiSignature = getJsapiSignature;
exports.unifiedOrder = unifiedOrder;
exports.getSignedJSBridgeParams = getSignedJSBridgeParams;
exports.getWXUserInfo = getWXUserInfo;
exports.getSubscribeUserInfo = getSubscribeUserInfo;
exports.queryOrder = queryOrder;
exports.closeOrder = closeOrder;

