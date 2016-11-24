var router = require('express').Router();
var crypto = require('crypto');
var https = require('https');
var xmlParser = require('express-xml-bodyparser');
var utils = require('../util/utils');
var config = require('../config/WXConfig');
var WXService = require('./WXService');
var WXApi = require('../lib/WXApi');
var AV = require('leanengine');
var WeiXinUser = AV.Object.extend('WeiXinUser');
var WeiXinPay = AV.Object.extend('WeiXinPay');


//获取微信用户信息
router.get('/userInfo', function (req, res, next) {
    var code = req.query.code;
    console.log('weixin auth code : ' + code);

    WXService.getWXUserInfo(code, function (error, userInfo) {
        if (userInfo) {
            //保存到数据库
            var userQuery = new AV.Query(WeiXinUser);
            userQuery.equalTo("openid", userInfo.openid);
            userQuery.first().then(function (user, error) {
                var newUserInfo;
                if (user) {
                    newUserInfo = user;
                }
                else {
                    newUserInfo = new WeiXinUser();
                    newUserInfo.set('openid', userInfo.openid);
                }
/*//取消设置name
                if (!newUserInfo.get('name')) {
                    newUserInfo.set('name', userInfo.nickname);
                }*/
                newUserInfo.set('userInfo', userInfo);
                newUserInfo.save().then(function (data, err) {
                    if (data) {
                        userInfo.objectId = data.getObjectId();
                        req.session.currentUser = userInfo;
                        res.send({
                            code: 0,
                            result: userInfo
                        });
                    }
                    else {
                        res.send({
                            code: 0,
                            result: {},
                            message: '更新用户信息失败'
                        });
                    }
                });
            });
        }
        else {
            res.send({
                code: -1,
                message: JSON.stringify(error)
            });
        }
    });
});

//微信支付初始化配置,设置jsapiTicket,进行签名
router.post('/jsapiPayConfig', function (req, res, next) {
    var applyUrl = req.body.url || '';
    console.log('request url : '+applyUrl);

    WXService.getJsapiSignature(applyUrl, function (jsapiConfig, error) {
        if (jsapiConfig) {
            res.send({
                code: 0,
                result: jsapiConfig
            });
        }
        else {
            res.send({
                code: -1,
                message: JSON.stringify(error)
            });
        }
    });
});

//微信公众号支付
/**
 * 流程：
 * 1、调用统一下单，取得code_url，生成二维码
 * 2、用户扫描二维码，进行支付
 * 3、支付完成之后，微信服务器会通知支付成功
 * 4、在支付成功通知中需要查单确认是否真正支付成功
 */

/*创建订单
 * @param projectId  //对应的项目标识
 * @param payBody //支付描述信息 "腾讯充值中心-QQ会员充值"
 * @param totalFee   //支付的金额
 * @param  attach  //附加信息
 * */

router.get('/unifiedOrder', function(req, res, next) {

    var projectId = req.query.projectId;
    var payBody = req.query.payBody;
    var totalFee = parseInt(req.query.totalFee)*100;
    var openId = req.query.openid;
    var attach = req.query.attach;
    //TODO 测试数据
    // totalFee = 1;

    var result = {
        code: 0,
        message: ""
    }
    if (!utils.is(totalFee, "Number") || totalFee <= 0) {
        result.code = -1;
        result.message = "支付金额有误";
        res.send(result);
        return;
    }
    if (!projectId || !payBody) {
        result.code = -1;
        result.message = "未知的项目标识";
        res.send(result);
        return;
    }

    //生成订单号
    var outTradeNo = utils.getTimeStamp()+utils.fillValue(projectId,15);

    var orderParams = {
        body: payBody,
        total_fee: totalFee,
        openid: openId,
        out_trade_no: outTradeNo,
        attach: attach
    }

    console.log('donate Params :'+ JSON.stringify(orderParams));

    // 创建统一订单
    WXService.unifiedOrder(orderParams, req, function (data, error) {
        if(!data || !data.prepay_id){
            res.send(error);
            return ;
        }
        else{
            //返回数据进行签名
            var jsBridgeParams = WXService.getSignedJSBridgeParams("prepay_id="+data.prepay_id);
            console.log('jsBridgeParams : '+JSON.stringify(jsBridgeParams));
            res.send({
                code: 0,
                message: "",
                result: jsBridgeParams,
                outTradeNO:outTradeNo
            });
        }
    });

});

/*
 {
 "xml":
 {
 "appid": "wx854299a3c0e1b0dd",
 "attach": "attach",
 "bank_type": "CMB_DEBIT",
 "cash_fee": "1",
 "fee_type": "CNY",
 "is_subscribe": "Y",
 "mch_id": "1351290801",
 "nonce_str": "201611071641378824ihbo2kt021brzf",
 "openid": "oRRb_vq3pItrWBRJ2lXWGNaUEHdU",
 "out_trade_no": "20161107164137879000000000520123",
 "result_code": "SUCCESS",
 "return_code": "SUCCESS",
 "sign": "DD7B90848AD8F539986A7907CA7DC11A",
 "time_end": "20161107164205",
 "total_fee": "1",
 "trade_type": "JSAPI",
 "transaction_id": "4002832001201611079028076611"
 }
 }
 */

/* GET notify listing. */
router.post('/notify', xmlParser({trim: true, explicitArray: false}), function (req, res, next) {
    console.log('post req : ' + JSON.stringify(req.body));

    var data = req.body.xml;

    if (data && data.return_code == 'SUCCESS') {

        var query = new AV.Query("WeiXinPay");
        console.log(data.out_trade_no)
        query.equalTo('outTradeNO', data.out_trade_no);
        query.first().then(function (tmpData) {

            var weiXinPay;
            if (tmpData) {
                console.log('weixinpay exist');
                weiXinPay = tmpData;
            } else {
                console.log('create new weixinpay');
                weiXinPay = new WeiXinPay();
            }
            weiXinPay.set('totalFee', data.total_fee + '');
            weiXinPay.set('openId', data.openid);
            weiXinPay.set('outTradeNO', data.out_trade_no);
            weiXinPay.set('attach', data.attach);
            var year = parseInt(data.time_end.substr(0, 4));
            var month = parseInt(data.time_end.substr(4, 2)) - 1;
            var day = parseInt(data.time_end.substr(6, 2));
            var hour = parseInt(data.time_end.substr(8, 2));
            var minute = parseInt(data.time_end.substr(10, 2));
            var second = parseInt(data.time_end.substr(12, 2));
            var endDate = new Date(year, month, day, hour, minute, second);
            weiXinPay.set('endDate', endDate);
            //交易成功
            if (data.result_code == 'SUCCESS') {
                weiXinPay.set('status', 'success');
                weiXinPay.set('errDesc', '');
            }
            else {
                weiXinPay.set('status', 'fail');
                weiXinPay.set('errDesc', data.err_code_des);
            }

            weiXinPay.save().then(function (weixinPayData) {
                if (weixinPayData.get('status') == 'success' && weixinPayData.get('attach')) {
                    var query = new AV.Query('Donation');
                    query.get(weixinPayData.get('attach')).then(function (donation) {
                        donation.set('donateStatus', true);
                        donation.set('WXPay', weixinPayData);
                        donation.save();

                        //返回成功请求
                        var resXML = '<xml><return_code><![CDATA[SUCCESS]]></return_code><return_msg><![CDATA[OK]]></return_msg></xml>';
                        res.send(resXML);

                    }, function (error) {
                        // 异常处理
                    });
                }


            }, function (error) {
                console.log('system error : ' + JSON.stringify(error));
                if (weiXinPay.get('status') == 'success' && weiXinPay.get('attach')) {
                    var query = new AV.Query('Donation');
                    query.get(weiXinPay.get('attach')).then(function (donation) {

                        donation.set('donateStatus', true);
                        donation.save();

                        //返回成功请求
                        var resXML = '<xml><return_code><![CDATA[SUCCESS]]></return_code><return_msg><![CDATA[OK]]></return_msg></xml>';
                        res.send(resXML);

                    }, function (error) {
                        // 异常处理
                    });

                }

            });

        }, function (err) {
            console.log('query WinXinPay error'+JSON.stringify(err));
        })

    }
});

/*
 {
 "return_code": "SUCCESS",
 "return_msg": "OK",
 "appid": "wxb001c01676df09bf",
 "mch_id": "1411928902",
 "nonce_str": "PdCAMATVDH29zKgE",
 "sign": "05FBCC9AF6450AB05ABBB87069EDE63B",
 "result_code": "SUCCESS",
 "openid": "omc5XwnsoTz8lA1mPr979rnzdOjc",
 "is_subscribe": "Y",
 "trade_type": "JSAPI",
 "bank_type": "ICBC_DEBIT",
 "total_fee": "500000",
 "fee_type": "CNY",
 "transaction_id": "4002882001201611179980037229",
 "out_trade_no": "20161117113726598582d25f6da2f600",
 "attach": "582d25f6da2f600063de4501",
 "time_end": "20161117113733",
 "trade_state": "SUCCESS",
 "cash_fee": "500000"
 }
*/
router.post('/recheckWXTrade', function (req, res, next) {
    console.log('post req : ' + JSON.stringify(req.body));

    var outTradeNO = req.body.outTradeNO;
    if (!outTradeNO) {
        res.send({code: -1, message: '参数不完整'});
        return;
    }
    WXService.queryOrderByOutTradeNO(outTradeNO, function (data, error) {
        if (data) {

            console.log('###DATA###:'+JSON.stringify(data));

            var query = new AV.Query("WeiXinPay");
            console.log(data.out_trade_no)
            query.equalTo('outTradeNO', data.out_trade_no);
            query.first().then(function (tmpData) {

                var weiXinPay;
                if (tmpData) {
                    weiXinPay = tmpData;
                } else {
                    console.log('create new weixinpay');
                    weiXinPay = new WeiXinPay();
                }
                weiXinPay.set('totalFee', data.total_fee + '');
                weiXinPay.set('openId', data.openid);
                weiXinPay.set('outTradeNO', data.out_trade_no);
                weiXinPay.set('attach', data.attach);
                if(data.time_end){
                    var year = parseInt(data.time_end.substr(0, 4));
                    var month = parseInt(data.time_end.substr(4, 2)) - 1;
                    var day = parseInt(data.time_end.substr(6, 2));
                    var hour = parseInt(data.time_end.substr(8, 2));
                    var minute = parseInt(data.time_end.substr(10, 2));
                    var second = parseInt(data.time_end.substr(12, 2));
                    var endDate = new Date(year, month, day, hour, minute, second);
                    weiXinPay.set('endDate', endDate);
                }

                //通知时,设置的成功交易
                if (data.trade_state == 'SUCCESS') {
                    weiXinPay.set('status', 'success');
                }
                else {
                    if ('success' !== weiXinPay.get('status')) {
                        weiXinPay.set('status', data.trade_state.toLowerCase());
                        weiXinPay.set('errDesc', data.trade_state_desc);
                    }
                }

                weiXinPay.save().then(function (weixinPayData) {
                    if (weixinPayData.get('attach')) {
                        console.log('donation objectId : '+ weixinPayData.get('attach'));

                        var query = new AV.Query('Donation');
                        query.get(weixinPayData.get('attach')).then(function (donation) {
                            if(weixinPayData.get('status') == 'success'){
                                donation.set('donateStatus', true);
                            }
                            else {
                                donation.set('donateStatus', false);
                            }
                            donation.set('WXPay', weixinPayData);
                            donation.save();

                            res.send({code: 0, message: 'success'});

                        }, function (error) {
                            next({code: -1, message: '保存 weiXinPay 失败'})
                        });
                    }

                }, function (error) {
                    console.log('system error : ' + JSON.stringify(error));
                    if (weiXinPay.get('status') == 'success' && weiXinPay.get('attach')) {
                        var query = new AV.Query('Donation');
                        query.get(weiXinPay.get('attach')).then(function (donation) {

                            donation.set('donateStatus', true);
                            donation.save();

                            res.send({code: 0, message: 'success'});

                        }, function (error) {
                            next({code: -1, message: '保存 Donation 失败'})
                        });
                    }

                });

            }, function (err) {
                console.log('query WinXinPay error' + JSON.stringify(err));
                next({code: -1, message: '查询 WinXinPay 失败'})
            })
        }
        else {
            res.send(error);
        }
        ;
    });

});

module.exports = router;