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


exports.exec = function(params, cb) {

  if (params.signature) {
    console.log('params.signature:'+params.signature);
    checkSignature(params.signature, params.timestamp, params.nonce, params.echostr, cb);
  } else {
    console.log('receiveMessage');
    receiveMessage(params, cb)
  }
}

exports.sendMessage = function(params, res) {
  sendMessage(params, res);
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


// 验证微信公众号接入签名
var checkSignature = function(signature, timestamp, nonce, echostr, cb) {
  var oriStr = [config.TOKEN, timestamp, nonce].sort().join('')
  var code = crypto.createHash('sha1').update(oriStr).digest('hex');
  debug('code:', code)
  if (code == signature) {
    cb(null, echostr);
  } else {
    var err = new Error('Unauthorized');
    err.code = 401;
    cb(err);
  }
}
var emptyResponse = {
  xml:{
            ToUserName: '',
            FromUserName: '',
            CreateTime: new Date().getTime(),
            MsgType: 'text',
            Content: ' '
          }
}
// 接收普通消息
var receiveMessage = function (msg, cb) {

    var result;
    console.log('receiveMessage msg=' + msg);
    console.log('msg.xml=' + msg.xml);
    console.log('msg.xml=' + msg.xml.MsgType);

    var MsgType = msg.xml.MsgType;
    console.log('MsgType = ' + MsgType);

    if (MsgType === 'event') {
        var wxEvent = msg.xml.Event;
        if (wxEvent === 'subscribe') {
            //如果是订阅消息，发送欢迎信息
            console.log(msg.xml.FromUserName + "关注了");
            result = {
                xml: {
                    ToUserName: msg.xml.FromUserName,
                    FromUserName: '' + msg.xml.ToUserName + '',
                    CreateTime: new Date().getTime(),
                    MsgType: 'text',
                    Content: '欢迎关注华狮奖公众号\n\n' +
                    '免责声明 \n' +
                    '在接受本公众号服务前，请仔细阅读并同意下面条款： \n\n' +
                    '1.任何单位或个人因使用公众号中的信息（服务、产品等内容），或据此进行工商行为，而造成损害后果的，本公众号概不负责，亦不会也不能承担任何法律责任。狮友企业间商业行为务必遵循商业规则，自愿独立承担法律责任。\n\n' +
                    '2.凡以任何方式直接、间接使用本公众号资料者，视为自愿接受本公众号声明的约束。'
                }
            }
            //获取用户信息,保存
            getSubscribeUserInfo(msg.xml.FromUserName, function (error, data) {
                if (data) {
/*
                    var userQuery = new AV.Query(WeiXinUser);
                    userQuery.equalTo("openid", data.openid);
                    userQuery.first().then(function (user, error) {
                        if (user) {
                            console.log('resubscribe user...');
                            user.set('status', 'focused');
                            user.set('userInfo', data);
                            user.save();
                        }
                        else {
                            var userInfo = new WeiXinUser();
                            userInfo.set('openid', data.openid);
                            userInfo.set('status', 'focused');
                            userInfo.set('userInfo', data);
                            userInfo.save();
                        }

                    });
*/

                }
                else {
                    console.log(error);
                }
            });

        } else if (wxEvent === 'unsubscribe') {
            //用户取消了关注，从数据库中删除
            console.log(msg.xml.FromUserName + "取消了关注");
            deleteUserInfo(msg.xml.FromUserName);
            result = emptyResponse;

        } else {
            result = emptyResponse;
        }
    }

    else {
        result = {
            xml: {
                ToUserName: msg.xml.FromUserName,
                FromUserName: '' + msg.xml.ToUserName + '',
                CreateTime: new Date().getTime(),
                MsgType: 'text',
                Content: '欢迎来到华狮奖公众号！'
            }
        }
    }

    cb(null, result);
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


function sendMessage(req, res) {
  var reqData = req.body.data;
  getAccessToken(function (error, data) {
    if (!error) {
      var accessToken = config.ACCESS_TOKEN.value;
      var opt = {
        method: "POST",
        hostname: "api.weixin.qq.com",
        path: "/cgi-bin/message/custom/send?access_token=" + accessToken,
        headers: {
          "Content-Type": 'application/json'
        }
      };
      var req = https.request(opt, function (serverFeedback) {
        if (serverFeedback.statusCode == 200) {
          var body = "";
          serverFeedback
              .on('data', function (data) {
                body += data;
              })
              .on('end', function () {
                res.status(200).send(body)
              });
        }
        else {
          console.log('fail to send message.' + reqData);
          res.send(500, "error");
        }
      });
      req.write(reqData);
      req.end();
    } else {
      console.log('can not get accesstoken.');
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

function deleteUserInfo(openId){
/*
  var query = new AV.Query(WeiXinUser);
  console.log('准备删除：'+openId);
  query.equalTo("openid", openId);
  query.first({
    success: function(object) {
      if(!object){
        console.log('未找到当前的关注的用户数据');
        return;
      }
       object.save({
           status: 'unfocused'
       }).then(function () {
           console.log('更新取消关注的用户'+openId+'成功');
       });
    },
    error: function(error) {
      alert("Error: " + error.code + " " + error.message);
    }
  });
*/

}

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

